-- Stable catalogue identities: selecting an existing product in the admin editor
-- preserves its identity across periods; variants can be created separately.
create table public.products(id uuid primary key default gen_random_uuid(),canonical_key text not null unique,name text not null,detail text not null default '',image_path text not null,created_at timestamptz not null default now());
alter table public.products enable row level security;
grant select on public.products to anon,authenticated;
grant insert,update on public.products to authenticated;
grant all on public.products to service_role;
alter table public.offers add column product_id uuid references public.products(id);
create index offers_product on public.offers(product_id);
create policy visible_products on public.products for select to anon,authenticated using(exists(select 1 from public.offers o join public.periods p on p.id=o.period_id where o.product_id=products.id and p.published) or exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_products_insert on public.products for insert to authenticated with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_products_update on public.products for update to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid()))) with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create table public.product_aliases(canonical_key text primary key,product_id uuid not null references public.products(id) on delete cascade);
create index product_aliases_product on public.product_aliases(product_id);
alter table public.product_aliases enable row level security;
revoke all on public.product_aliases from public,anon,authenticated;
grant select,insert,update on public.product_aliases to authenticated;
grant all on public.product_aliases to service_role;
create policy admin_product_aliases on public.product_aliases for all to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid()))) with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create function public.offer_product_identity() returns trigger language plpgsql security invoker set search_path='' as $$declare k text;begin
k:=trim(regexp_replace(replace(lower(trim(new.name)),'ё','е'),'[^[:alnum:]]+',' ','g'))||chr(31)||trim(regexp_replace(replace(lower(trim(new.detail)),'ё','е'),'[^[:alnum:]]+',' ','g'));
if new.product_id is null then
 select product_id into new.product_id from public.product_aliases where canonical_key=k;
 if new.product_id is null then
 insert into public.products(canonical_key,name,detail,image_path) values(k,new.name,new.detail,new.image_path) on conflict(canonical_key) do update set canonical_key=excluded.canonical_key returning id into new.product_id;
 end if;
end if;
insert into public.product_aliases(canonical_key,product_id) values(k,new.product_id) on conflict do nothing;
return new;end;$$;
revoke execute on function public.offer_product_identity() from public,anon,authenticated;
create trigger offer_product_identity before insert or update on public.offers for each row execute function public.offer_product_identity();
update public.offers set product_id=null;
alter table public.offers alter column product_id set not null;
-- These two existing names are the identical TAFO Deluxe 3-ply, 100-piece pack
-- verified against the user's original October/November collages.
do $merge$ declare target uuid; old_id uuid;begin
select product_id into target from public.offers where name='Платочки TAFO Deluxe' and detail='Бумажные, трёхслойные, 100 шт.' limit 1;
if target is not null then
 for old_id in select distinct product_id from public.offers where name='Платочки TAFO' and detail='Бумажные гигиенические, 3 слоя, 100 шт.' and product_id<>target loop
 update public.product_aliases set product_id=target where product_id=old_id;
 update public.offers set product_id=target where product_id=old_id;
 delete from public.products where id=old_id;
 end loop;
end if;end $merge$;


alter table public.push_subscriptions add column favorites_revision bigint not null default 0;
create table public.push_favorites(subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,product_id uuid not null references public.products(id) on delete cascade,created_at timestamptz not null default now(),primary key(subscription_id,product_id));
create index push_favorites_product on public.push_favorites(product_id);
create table public.favorite_deliveries(id uuid primary key default gen_random_uuid(),subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,period_id uuid not null references public.periods(id) on delete cascade,product_ids uuid[] not null,state text not null default 'pending' check(state in ('pending','sending','sent','failed','expired')),attempts integer not null default 0,lease_until timestamptz not null default now(),last_error text,unique(subscription_id,period_id));
create index favorite_delivery_queue on public.favorite_deliveries(state,lease_until) where state in ('pending','sending');
create index favorite_delivery_period on public.favorite_deliveries(period_id);
create table public.calendar_publications(period_id uuid primary key references public.periods(id) on delete cascade,created_at timestamptz not null default now(),processed boolean not null default false);
create index calendar_publications_pending on public.calendar_publications(created_at) where not processed;
alter table public.push_favorites enable row level security;
alter table public.favorite_deliveries enable row level security;
alter table public.calendar_publications enable row level security;
revoke all on public.push_favorites,public.favorite_deliveries,public.calendar_publications from public,anon,authenticated;
grant all on public.push_favorites,public.favorite_deliveries,public.calendar_publications to service_role;
grant select,insert on public.calendar_publications to authenticated;
create policy service_favorites on public.push_favorites for all to service_role using(true) with check(true);
create policy service_favorite_deliveries on public.favorite_deliveries for all to service_role using(true) with check(true);
create policy service_publications on public.calendar_publications for all to service_role using(true) with check(true);
create policy admin_publications_read on public.calendar_publications for select to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_publications_insert on public.calendar_publications for insert to authenticated with check(exists(select 1 from public.admins where user_id=(select auth.uid())) and exists(select 1 from public.periods p where p.id=period_id and p.published));
create function public.record_calendar_publication() returns trigger language plpgsql security invoker set search_path='' as $$begin
if new.published and not old.published then insert into public.calendar_publications(period_id) values(new.id) on conflict do nothing;end if;return new;end;$$;
revoke execute on function public.record_calendar_publication() from public,anon,authenticated;
create trigger record_calendar_publication after update of published on public.periods for each row execute function public.record_calendar_publication();

create function public.push_sync_favorites(p_subscription uuid,p_products uuid[],p_revision bigint) returns bigint language plpgsql security invoker set search_path='' as $$declare revision bigint;begin
if p_products is null or p_revision is null or cardinality(p_products)>200 or p_revision<1 or p_revision>9007199254740991 then raise exception 'INVALID_FAVORITES';end if;
select favorites_revision into revision from public.push_subscriptions where id=p_subscription for update;
if not found then raise exception 'SUBSCRIPTION_REQUIRED';end if;
if p_revision<=revision then return revision;end if;
if exists(select 1 from unnest(p_products) as chosen(product_id) where not exists(select 1 from public.products p where p.id=chosen.product_id)) then raise exception 'UNKNOWN_PRODUCT';end if;
delete from public.push_favorites where subscription_id=p_subscription and not(product_id=any(p_products));
insert into public.push_favorites(subscription_id,product_id) select p_subscription,id from (select distinct unnest(p_products) as id) p on conflict do nothing;
update public.push_subscriptions set favorites_revision=p_revision where id=p_subscription;return p_revision;
end;$$;
create function public.favorite_enqueue_publications() returns void language plpgsql security invoker set search_path='' as $$declare e record;begin
perform pg_advisory_xact_lock(hashtextextended('favorite-publications',0));
for e in select * from public.calendar_publications where not processed order by created_at limit 10 for update skip locked loop
 insert into public.favorite_deliveries(subscription_id,period_id,product_ids)
 select f.subscription_id,e.period_id,array_agg(distinct f.product_id) from public.push_favorites f join public.offers o on o.product_id=f.product_id join public.periods p on p.id=o.period_id where o.period_id=e.period_id and p.published and o.sale_date>=(now() at time zone 'Europe/Moscow')::date and f.created_at<=e.created_at group by f.subscription_id on conflict do nothing;
 update public.calendar_publications set processed=true where period_id=e.period_id;
end loop;end;$$;
create function public.favorite_delivery_payload(p_delivery uuid,p_attempt integer) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('favorite_id',d.id,'subscription_id',d.subscription_id,'period_id',d.period_id,'attempts',d.attempts,'endpoint',s.endpoint,'keys',s.keys,'matches',(
 select jsonb_agg(to_jsonb(x) order by x.sale_date,x.name) from (
 select distinct on(o.product_id) o.product_id,o.id as offer_id,o.name,o.detail,o.discount,o.sale_date,o.image_path from public.offers o join public.push_favorites f on f.product_id=o.product_id and f.subscription_id=d.subscription_id where o.period_id=d.period_id and o.product_id=any(d.product_ids) and o.sale_date>=(now() at time zone 'Europe/Moscow')::date order by o.product_id,o.sale_date
 ) x
)) from public.favorite_deliveries d join public.push_subscriptions s on s.id=d.subscription_id join public.periods p on p.id=d.period_id where d.id=p_delivery and d.state='sending' and d.attempts=p_attempt and p.published;
$$;
create function public.favorite_claim(p_limit integer default 8) returns table(favorite_id uuid,attempts integer) language plpgsql security invoker set search_path='' as $$begin
perform public.favorite_enqueue_publications();
update public.favorite_deliveries d set state='expired',last_error='period_unavailable' from public.periods p where p.id=d.period_id and not p.published and d.state in ('pending','sending');
update public.favorite_deliveries d set state='failed',last_error='retry_limit' where d.attempts>=3 and d.state in ('pending','sending') and d.lease_until<=now();
return query with picked as(select d.id from public.favorite_deliveries d where d.state in ('pending','sending') and d.lease_until<=now() and d.attempts<3 order by d.id for update skip locked limit least(greatest(p_limit,1),24))
update public.favorite_deliveries d set state='sending',attempts=d.attempts+1,lease_until=now()+interval '2 minutes' from picked where d.id=picked.id returning d.id,d.attempts;
end;$$;
revoke execute on function public.push_sync_favorites(uuid,uuid[],bigint),public.favorite_enqueue_publications(),public.favorite_delivery_payload(uuid,integer),public.favorite_claim(integer) from public,anon,authenticated;
grant execute on function public.push_sync_favorites(uuid,uuid[],bigint),public.favorite_enqueue_publications(),public.favorite_delivery_payload(uuid,integer),public.favorite_claim(integer) to service_role;
do $schedule$ declare c text;begin
select command into c from cron.job where jobname='calendar-push-worker';
if c is null then raise exception 'Missing push worker';end if;
c:=rtrim(c);if right(c,1)=';' then c:=left(c,length(c)-1);end if;
c:=c||' or exists(select 1 from public.calendar_publications where not processed) or exists(select 1 from public.favorite_deliveries where state in (''pending'',''sending'') and lease_until<=now());';
perform cron.schedule('calendar-push-worker','* * * * *',c);
end $schedule$;
