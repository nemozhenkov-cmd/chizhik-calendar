create table public.new_collection_schedules (
  collection_id uuid primary key references public.new_collections(id) on delete cascade,
  created_by uuid not null references public.admins(user_id) on delete cascade,
  publish_at timestamptz not null,
  push_at timestamptz,
  published_at timestamptz,
  queued_at timestamptz,
  error text,
  check (push_at is null or push_at >= publish_at)
);
alter table public.new_collection_schedules enable row level security;
grant select, insert, update, delete on public.new_collection_schedules to authenticated;
create policy manage_new_collection_schedule on public.new_collection_schedules
for all to authenticated
using (created_by=(select auth.uid()) and exists(select 1 from public.admins where user_id=(select auth.uid())))
with check (created_by=(select auth.uid()) and exists(select 1 from public.admins where user_id=(select auth.uid())));

create function public.run_new_collection_schedules() returns void
language plpgsql security invoker set search_path='' as $$
declare job public.new_collection_schedules;
begin
  for job in
    select * from public.new_collection_schedules
    where error is null and ((published_at is null and publish_at<=now())
      or (queued_at is null and push_at<=now()))
    order by publish_at limit 20 for update skip locked
  loop
    begin
      if job.published_at is null then
        if not exists(select 1 from public.new_items where collection_id=job.collection_id) then
          raise exception 'В подборке нет товаров';
        end if;
        update public.new_collections set published=true where id=job.collection_id;
        update public.new_collection_schedules set published_at=now() where collection_id=job.collection_id;
      end if;
      if job.queued_at is null and job.push_at<=now() then
        perform public.push_enqueue_new(job.collection_id,job.created_by);
        update public.new_collection_schedules set queued_at=now() where collection_id=job.collection_id;
      end if;
    exception when others then
      update public.new_collection_schedules set error='Не удалось выполнить расписание. Проверьте подборку и время.' where collection_id=job.collection_id;
    end;
  end loop;
end;
$$;
revoke execute on function public.run_new_collection_schedules() from public,anon,authenticated;
select cron.schedule('calendar-new-collection-schedules','* * * * *','select public.run_new_collection_schedules()');
