-- Transaction-only test: fake subscriptions are never committed or sent to a provider.
begin;
insert into public.periods(id,title,starts_on,ends_on) values('00000000-0000-4000-8000-0000000000aa','TEST PUSH QUEUE','2099-01-01','2099-01-02');
insert into public.offers(period_id,name,sale_date,discount,image_path) values('00000000-0000-4000-8000-0000000000aa','TEST','2099-01-01',20,'brand/sample-tan.jpg');
update public.periods set published=true where id='00000000-0000-4000-8000-0000000000aa';
do $test$
declare actor uuid; first_id uuid; second_id uuid; claimed integer; again integer; accepted boolean; rejected boolean;
begin
select user_id into actor from public.admins limit 1;
select public.push_register('https://fcm.googleapis.com/fcm/send/test-rollback','{"p256dh":"TEST","auth":"TEST"}'::jsonb,repeat('a',64),repeat('b',64)) into accepted;
select public.push_register('https://fcm.googleapis.com/fcm/send/test-rollback','{"p256dh":"TEST","auth":"TEST"}'::jsonb,repeat('c',64),repeat('b',64)) into rejected;
if not accepted or rejected then raise exception 'Device ownership guard failed';end if;
select public.push_enqueue('00000000-0000-4000-8000-0000000000aa',actor) into first_id;
select public.push_enqueue('00000000-0000-4000-8000-0000000000aa',actor) into second_id;
if first_id<>second_id then raise exception 'Broadcast idempotency failed';end if;
select count(*) into claimed from public.push_claim(12);
select count(*) into again from public.push_claim(12);
if claimed<1 or again<>0 then raise exception 'Delivery lease failed';end if;
end;$test$;
select 'PASS: ownership, idempotent broadcast and exclusive worker leases; all test changes rolled back' as result;
rollback;
