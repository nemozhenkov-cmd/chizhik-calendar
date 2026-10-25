-- Apply once to the existing calendar project. No secrets are committed here.
create table public.push_config(id integer primary key check(id=1),public_key text,private_key text,worker_token text not null default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));
insert into public.push_config(id) values(1);
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),endpoint text not null unique check(length(endpoint)<2048),keys jsonb not null,token_hash text not null check(length(token_hash)=64),ip_hash text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index push_subscriptions_rate on public.push_subscriptions(ip_hash,created_at);
create table public.push_broadcasts(id uuid primary key default gen_random_uuid(),period_id uuid not null unique references public.periods(id) on delete cascade,created_by uuid not null references auth.users(id),title text not null,body text not null,total integer not null default 0,created_at timestamptz not null default now());
create index push_broadcasts_creator on public.push_broadcasts(created_by);
create table public.push_deliveries(id bigint generated always as identity primary key,broadcast_id uuid not null references public.push_broadcasts(id) on delete cascade,subscription_id uuid references public.push_subscriptions(id) on delete set null,state text not null default 'pending' check(state in ('pending','sending','sent','failed','expired')),attempts integer not null default 0,lease_until timestamptz not null default now(),last_error text,unique(broadcast_id,subscription_id));
create index push_delivery_queue on public.push_deliveries(state,lease_until) where state in ('pending','sending');
create index push_delivery_subscription on public.push_deliveries(subscription_id);
create index push_delivery_broadcast on public.push_deliveries(broadcast_id);
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_broadcasts enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_config,public.push_subscriptions,public.push_broadcasts,public.push_deliveries from anon,authenticated;
grant all on public.push_config,public.push_subscriptions,public.push_broadcasts,public.push_deliveries to service_role;
grant usage,select on sequence public.push_deliveries_id_seq to service_role;
create policy service_config on public.push_config for all to service_role using(true) with check(true);
create policy service_subscriptions on public.push_subscriptions for all to service_role using(true) with check(true);
create policy service_broadcasts on public.push_broadcasts for all to service_role using(true) with check(true);
create policy service_deliveries on public.push_deliveries for all to service_role using(true) with check(true);
create function public.push_register(p_endpoint text,p_keys jsonb,p_token text,p_ip text) returns boolean language plpgsql security invoker set search_path='' as $$declare existing public.push_subscriptions; begin
perform pg_advisory_xact_lock(hashtextextended('push-register',0));
select * into existing from public.push_subscriptions where endpoint=p_endpoint;
if found then
 if existing.token_hash<>p_token then return false;end if;
 update public.push_subscriptions set keys=p_keys,updated_at=now() where id=existing.id;return true;
end if;
if (select count(*) from public.push_subscriptions where ip_hash=p_ip and created_at>now()-interval '1 day')>=500 or (select count(*) from public.push_subscriptions)>=50000 then raise exception 'SUBSCRIPTION_LIMIT';end if;
insert into public.push_subscriptions(endpoint,keys,token_hash,ip_hash) values(p_endpoint,p_keys,p_token,p_ip);return true;end;$$;
create function public.push_enqueue(p_period uuid,p_actor uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare campaign uuid; p public.periods; begin
if not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'FORBIDDEN';end if;
perform pg_advisory_xact_lock(hashtextextended('push-broadcast',0));
select * into p from public.periods where id=p_period and published;
if not found or not exists(select 1 from public.offers where period_id=p_period) then raise exception 'PUBLISH_FIRST';end if;
select id into campaign from public.push_broadcasts where period_id=p_period;
if found then return campaign;end if;
insert into public.push_broadcasts(period_id,created_by,title,body,total) values(p_period,p_actor,'Новый календарь скидок!',p.title||' — планируйте выгодные покупки в Чижике на Видова, 163В.',(select count(*) from public.push_subscriptions)) returning id into campaign;
insert into public.push_deliveries(broadcast_id,subscription_id) select campaign,id from public.push_subscriptions;
return campaign;end;$$;
create function public.push_claim(p_limit integer default 12) returns table(delivery_id bigint,broadcast_id uuid,subscription_id uuid,period_id uuid,endpoint text,keys jsonb,title text,body text) language plpgsql security invoker set search_path='' as $$begin
update public.push_deliveries d set state='expired',last_error='subscription_removed' where d.subscription_id is null and d.state in ('pending','sending');
update public.push_deliveries d set state='failed',last_error='retry_limit' where d.attempts>=3 and d.state in ('pending','sending') and d.lease_until<=now();
return query with picked as (
 select d.id from public.push_deliveries d where d.state in ('pending','sending') and d.lease_until<=now() and d.attempts<3 order by d.id for update skip locked limit least(greatest(p_limit,1),24)
), claimed as (
 update public.push_deliveries d set state='sending',attempts=d.attempts+1,lease_until=now()+interval '2 minutes' from picked where d.id=picked.id returning d.*
) select d.id,d.broadcast_id,s.id,b.period_id,s.endpoint,s.keys,b.title,b.body from claimed d join public.push_subscriptions s on s.id=d.subscription_id join public.push_broadcasts b on b.id=d.broadcast_id;
end;$$;
revoke execute on function public.push_register(text,jsonb,text,text),public.push_enqueue(uuid,uuid),public.push_claim(integer) from public,anon,authenticated;
grant execute on function public.push_register(text,jsonb,text,text),public.push_enqueue(uuid,uuid),public.push_claim(integer) to service_role;
