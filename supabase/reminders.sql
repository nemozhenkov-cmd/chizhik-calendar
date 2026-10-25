-- Device-owned reminders, delivered on the preceding day at 18:30 Moscow.
create table public.push_reminders(
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 offer_id uuid not null references public.offers(id) on delete cascade,
 due_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','expired','cancelled')),
 attempts integer not null default 0,
 lease_until timestamptz not null default now(),
 last_error text,
 created_at timestamptz not null default now(),
 unique(subscription_id,offer_id)
);
create index push_reminder_queue on public.push_reminders(due_at,lease_until) where state in ('pending','sending');
create index push_reminder_offer on public.push_reminders(offer_id);
alter table public.push_reminders enable row level security;
revoke all on public.push_reminders from public,anon,authenticated;
grant all on public.push_reminders to service_role;
create policy service_reminders on public.push_reminders for all to service_role using(true) with check(true);
create function public.push_set_reminder(p_subscription uuid,p_offer uuid,p_enabled boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare due timestamptz; begin
perform pg_advisory_xact_lock(hashtextextended('reminder-'||p_subscription::text,0));
if not exists(select 1 from public.push_subscriptions where id=p_subscription) then raise exception 'SUBSCRIPTION_REQUIRED';end if;
if not p_enabled then
 update public.push_reminders set state='cancelled' where subscription_id=p_subscription and offer_id=p_offer and state in ('pending','sending');return false;
end if;
select ((o.sale_date-1)+time '18:30') at time zone 'Europe/Moscow' into due from public.offers o join public.periods p on p.id=o.period_id where o.id=p_offer and p.published;
if due is null or due<=now() then raise exception 'REMINDER_TIME_PASSED';end if;
if (select count(*) from public.push_reminders where subscription_id=p_subscription and state in ('pending','sending'))>=100 and not exists(select 1 from public.push_reminders where subscription_id=p_subscription and offer_id=p_offer and state in ('pending','sending')) then raise exception 'REMINDER_LIMIT';end if;
insert into public.push_reminders(subscription_id,offer_id,due_at) values(p_subscription,p_offer,due)
on conflict(subscription_id,offer_id) do update set state='pending',due_at=excluded.due_at,attempts=0,lease_until=now(),last_error=null where push_reminders.state not in ('pending','sending','sent');
return exists(select 1 from public.push_reminders where subscription_id=p_subscription and offer_id=p_offer and state in ('pending','sending','sent'));
end;$$;
create function public.push_claim_reminders(p_limit integer default 12) returns table(reminder_id uuid,subscription_id uuid,offer_id uuid,period_id uuid,endpoint text,keys jsonb,name text,detail text,discount integer,image_path text,sale_date date,attempts integer) language plpgsql security invoker set search_path='' as $$begin
-- Recalculate pending reminders if an administrator reschedules an offer.
update public.push_reminders r set due_at=((o.sale_date-1)+time '18:30') at time zone 'Europe/Moscow' from public.offers o where r.offer_id=o.id and r.state='pending' and r.due_at is distinct from (((o.sale_date-1)+time '18:30') at time zone 'Europe/Moscow');
update public.push_reminders r set state='expired',last_error='offer_unavailable' from public.offers o join public.periods p on p.id=o.period_id where r.offer_id=o.id and r.state in ('pending','sending') and (not p.published or o.sale_date<=(now() at time zone 'Europe/Moscow')::date);
update public.push_reminders r set state='failed',last_error='retry_limit' where r.state in ('pending','sending') and r.attempts>=3 and r.lease_until<=now();
return query with picked as (
 select r.id from public.push_reminders r join public.offers o on o.id=r.offer_id join public.periods p on p.id=o.period_id where r.state in ('pending','sending') and r.due_at<=now() and r.lease_until<=now() and r.attempts<3 and p.published and o.sale_date=(now() at time zone 'Europe/Moscow')::date+1 order by r.due_at,r.id for update of r skip locked limit least(greatest(p_limit,1),24)
),claimed as (
 update public.push_reminders r set state='sending',attempts=r.attempts+1,lease_until=now()+interval '2 minutes' from picked where r.id=picked.id returning r.*
) select r.id,s.id,o.id,o.period_id,s.endpoint,s.keys,o.name,o.detail,o.discount,o.image_path,o.sale_date,r.attempts from claimed r join public.push_subscriptions s on s.id=r.subscription_id join public.offers o on o.id=r.offer_id;
end;$$;
revoke execute on function public.push_set_reminder(uuid,uuid,boolean),public.push_claim_reminders(integer) from public,anon,authenticated;
grant execute on function public.push_set_reminder(uuid,uuid,boolean),public.push_claim_reminders(integer) to service_role;

create or replace function public.push_enqueue(p_period uuid,p_actor uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare campaign uuid; p public.periods; begin
if not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'FORBIDDEN';end if;
perform pg_advisory_xact_lock(hashtextextended('push-broadcast',0));
select * into p from public.periods where id=p_period and published;
if not found or not exists(select 1 from public.offers where period_id=p_period) then raise exception 'PUBLISH_FIRST';end if;
select id into campaign from public.push_broadcasts where period_id=p_period;
if found then return campaign;end if;
insert into public.push_broadcasts(period_id,created_by,title,body,total) values(p_period,p_actor,'Чижик принёс новые скидки!',p.title||' · Выбирайте товары и планируйте покупки на Видова, 163В.',(select count(*) from public.push_subscriptions)) returning id into campaign;
insert into public.push_deliveries(broadcast_id,subscription_id) select campaign,id from public.push_subscriptions;
return campaign;end;$$;

-- Wake the existing worker only when there is queued work. No extra always-on function.
do $schedule$ declare command_text text;begin
select command into command_text from cron.job where jobname='calendar-push-worker';
if command_text is null then raise exception 'Missing push worker';end if;
command_text:=replace(command_text,'lease_until<=now());','lease_until<=now()) or exists(select 1 from public.push_reminders r join public.offers o on o.id=r.offer_id where r.state in (''pending'',''sending'') and r.lease_until<=now() and (r.due_at<=now() or (((o.sale_date-1)+time ''18:30'') at time zone ''Europe/Moscow'')<=now()));');
perform cron.schedule('calendar-push-worker','* * * * *',command_text);
end $schedule$;
