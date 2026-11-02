-- Additive upgrade: preserve products, catalogue URLs and existing subscriptions.
alter table public.push_subscriptions add column notify_calendar boolean not null default true;
alter table public.push_subscriptions add column notify_favorites boolean not null default true;
alter table public.push_subscriptions add column notify_new boolean not null default true;

create table public.customer_feedback(
 id uuid primary key, kind text not null check(kind in ('offer','new')),
 item_id uuid not null,item_name text not null,item_date date,
 reason text not null check(reason in ('photo','description','link','other')),
 comment text not null default '' check(char_length(comment)<=1000),
 status text not null default 'new' check(status in ('new','reviewing','resolved','closed')),
 ip_hash text not null check(length(ip_hash)=64),created_at timestamptz not null default now()
);
create index feedback_rate on public.customer_feedback(ip_hash,created_at);
create index feedback_status on public.customer_feedback(status,created_at desc);
alter table public.customer_feedback enable row level security;
revoke all on public.customer_feedback from public,anon,authenticated;
grant all on public.customer_feedback to service_role;
grant select(id,kind,item_id,item_name,item_date,reason,comment,status,created_at),update(status) on public.customer_feedback to authenticated;
create policy admin_feedback_read on public.customer_feedback for select to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_feedback_update on public.customer_feedback for update to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid()))) with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create function public.submit_customer_feedback(p_id uuid,p_kind text,p_item uuid,p_reason text,p_comment text,p_ip text) returns boolean language plpgsql security invoker set search_path='' as $$
declare item_title text;item_day date;
begin
if p_id is null or p_item is null or p_kind is null or p_kind not in ('offer','new') or p_reason is null or p_reason not in ('photo','description','link','other') or p_comment is null or char_length(p_comment)>1000 or p_ip is null or length(p_ip)<>64 then raise exception 'INVALID_FEEDBACK';end if;
perform pg_advisory_xact_lock(hashtextextended('feedback:'||p_ip,0));
if exists(select 1 from public.customer_feedback where id=p_id) then return true;end if;
if (select count(*) from public.customer_feedback where ip_hash=p_ip and created_at>now()-interval '24 hours')>=5 then raise exception 'FEEDBACK_LIMIT';end if;
if p_kind='offer' then select o.name,o.sale_date into item_title,item_day from public.offers o join public.periods p on p.id=o.period_id where o.id=p_item and p.published;
else select i.name,c.starts_on into item_title,item_day from public.new_items i join public.new_collections c on c.id=i.collection_id where i.id=p_item and c.published;end if;
if item_title is null then raise exception 'UNKNOWN_ITEM';end if;
insert into public.customer_feedback(id,kind,item_id,item_name,item_date,reason,comment,ip_hash) values(p_id,p_kind,p_item,item_title,item_day,p_reason,trim(p_comment),p_ip);
return true;
end;$$;
revoke execute on function public.submit_customer_feedback(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_customer_feedback(uuid,text,uuid,text,text,text) to service_role;

create or replace function public.favorite_enqueue_publications() returns void language plpgsql security invoker set search_path='' as $$declare e record;begin
perform pg_advisory_xact_lock(hashtextextended('favorite-publications',0));
for e in select * from public.calendar_publications where not processed order by created_at limit 10 for update skip locked loop
 insert into public.favorite_deliveries(subscription_id,period_id,product_ids)
 select f.subscription_id,e.period_id,array_agg(distinct f.product_id) from public.push_favorites f join public.push_subscriptions subscription on subscription.id=f.subscription_id and subscription.notify_favorites join public.offers o on o.product_id=f.product_id join public.periods p on p.id=o.period_id where o.period_id=e.period_id and p.published and o.sale_date>=(now() at time zone 'Europe/Moscow')::date and f.created_at<=e.created_at group by f.subscription_id on conflict do nothing;
 update public.calendar_publications set processed=true where period_id=e.period_id;
end loop;end;$$;
create or replace function public.favorite_delivery_payload(p_delivery uuid,p_attempt integer) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('favorite_id',d.id,'subscription_id',d.subscription_id,'period_id',d.period_id,'attempts',d.attempts,'endpoint',s.endpoint,'keys',s.keys,'matches',(
 select jsonb_agg(to_jsonb(x) order by x.sale_date,x.name) from (
 select distinct on(o.product_id) o.product_id,o.id as offer_id,o.name,o.detail,o.discount,o.sale_date,o.image_path from public.offers o join public.push_favorites f on f.product_id=o.product_id and f.subscription_id=d.subscription_id where o.period_id=d.period_id and o.product_id=any(d.product_ids) and o.sale_date>=(now() at time zone 'Europe/Moscow')::date order by o.product_id,o.sale_date
 ) x
)) from public.favorite_deliveries d join public.push_subscriptions s on s.id=d.subscription_id join public.periods p on p.id=d.period_id where d.id=p_delivery and d.state='sending' and d.attempts=p_attempt and p.published and s.notify_favorites;
$$;

create or replace function public.push_enqueue(p_period uuid,p_actor uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare campaign uuid; p public.periods; begin
if not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'FORBIDDEN';end if;
perform pg_advisory_xact_lock(hashtextextended('push-broadcast',0));
perform public.favorite_enqueue_publications();
select * into p from public.periods where id=p_period and published;
if not found or not exists(select 1 from public.offers where period_id=p_period) then raise exception 'PUBLISH_FIRST';end if;
select id into campaign from public.push_broadcasts where period_id=p_period;
if found then return campaign;end if;
insert into public.push_broadcasts(period_id,created_by,title,body,total) values(p_period,p_actor,'Чижик принёс новые скидки!',p.title||' · Выбирайте товары и планируйте покупки.',0) returning id into campaign;
insert into public.push_deliveries(broadcast_id,subscription_id) select campaign,id from public.push_subscriptions where notify_calendar and not (notify_favorites and exists(select 1 from public.favorite_deliveries f where f.subscription_id=push_subscriptions.id and f.period_id=p_period and f.state in ('pending','sending','sent')));
update public.push_broadcasts set total=(select count(*) from public.push_deliveries where broadcast_id=campaign) where id=campaign;
return campaign;end;$$;

create or replace function public.push_enqueue_new(p_collection uuid,p_actor uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare campaign uuid;p public.new_collections;begin
if not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'FORBIDDEN';end if;
perform pg_advisory_xact_lock(hashtextextended('push-broadcast-new',0));
select * into p from public.new_collections where id=p_collection and published;
if not found or not exists(select 1 from public.new_items where collection_id=p_collection) then raise exception 'PUBLISH_FIRST';end if;
select id into campaign from public.push_broadcasts where new_collection_id=p_collection;
if found then return campaign;end if;
insert into public.push_broadcasts(new_collection_id,created_by,title,body,total) values(p_collection,p_actor,'Чижик принёс новинки!',p.title||' · Знакомьтесь с новыми товарами в подборке.',0) returning id into campaign;
insert into public.push_deliveries(broadcast_id,subscription_id) select campaign,id from public.push_subscriptions where notify_new;
update public.push_broadcasts set total=(select count(*) from public.push_deliveries where broadcast_id=campaign) where id=campaign;
return campaign;end;$$;
