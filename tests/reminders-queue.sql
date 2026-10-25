begin;
do $test$ declare p uuid; o uuid; s uuid; r uuid; n integer; due timestamptz;begin
-- Only inside this rolled-back transaction; no publication change is committed.
update public.periods set published=false where starts_on<=current_date+15 and ends_on>=current_date+1;
insert into public.periods(title,starts_on,ends_on,published) values('REMINDER TEST ROLLBACK',current_date+1,current_date+15,true) returning id into p;
insert into public.offers(period_id,name,detail,sale_date,discount,image_path) values(p,'Сырники БОН МЕНЮ','240 г',current_date+2,20,'brand/products/2026-10/26.webp') returning id into o;
insert into public.push_subscriptions(endpoint,keys,token_hash,ip_hash) values('https://fcm.googleapis.com/fcm/send/TEST-ROLLBACK-'||gen_random_uuid(),'{}',repeat('a',64),'test') returning id into s;
if not public.push_set_reminder(s,o,true) then raise exception 'not enabled';end if;
perform public.push_set_reminder(s,o,true);
select count(*),max(due_at) into n,due from public.push_reminders where subscription_id=s and offer_id=o;
if n<>1 or due is distinct from (((current_date+1)+time '18:30') at time zone 'Europe/Moscow') then raise exception 'duplicate or wrong Moscow schedule';end if;
if exists(select 1 from public.push_claim_reminders(24) where offer_id=o) then raise exception 'future reminder claimed early';end if;
perform public.push_set_reminder(s,o,false);
if exists(select 1 from public.push_reminders where subscription_id=s and state<>'cancelled') then raise exception 'cancel failed';end if;
perform public.push_set_reminder(s,o,true);
-- Simulate a timed-out sending lease; no network request is performed.
update public.offers set sale_date=current_date+1 where id=o;
update public.push_reminders set state='sending',due_at=now()-interval '1 minute',lease_until=now()-interval '1 minute' where subscription_id=s;
select reminder_id into r from public.push_claim_reminders(24) where offer_id=o;
if r is null then raise exception 'due reminder not claimed';end if;
if exists(select 1 from public.push_claim_reminders(24) where offer_id=o) then raise exception 'lease claimed twice';end if;
perform public.push_set_reminder(s,o,false);
if (select state from public.push_reminders where id=r)<>'cancelled' then raise exception 'inflight cancel failed';end if;
update public.offers set sale_date=current_date+2 where id=o;
perform public.push_set_reminder(s,o,true);
update public.periods set published=false where id=p;
perform public.push_claim_reminders(24);
if (select state from public.push_reminders where id=r)<>'expired' then raise exception 'unpublished reminder not expired';end if;
raise notice 'PASS: Moscow timing, duplicate setting, no early send, cancellation, leases, unpublished invalidation';
end $test$;
rollback;
