create table public.announcements (
  id uuid primary key,
  kind text not null check (kind in ('arrival','tasting','cancel','closure','delay','reopen','hours','free')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 280),
  pin_until timestamptz,
  related_id uuid references public.announcements(id),
  replaced_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
grant select on public.announcements to anon, authenticated;
grant all on public.announcements to service_role;
create policy "Read announcements" on public.announcements for select to anon, authenticated using (true);
alter table public.push_broadcasts add column announcement_id uuid unique references public.announcements(id);
alter table public.push_broadcasts drop constraint broadcast_exactly_one_source;
alter table public.push_broadcasts add constraint broadcast_exactly_one_source check(num_nonnulls(period_id,new_collection_id,announcement_id)=1);

create function public.publish_announcement(p_id uuid,p_kind text,p_title text,p_body text,p_until timestamptz,p_related uuid,p_actor uuid,p_push boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare campaign uuid;
begin
  if not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('publish-announcement',0));
  if exists(select 1 from public.announcements where id=p_id) then return; end if;
  if p_related is not null then
    update public.announcements set replaced_at=now() where id=p_related and replaced_at is null;
    if not found then raise exception 'ALREADY_REPLACED'; end if;
  end if;
  if p_kind in ('closure','delay','reopen') then
    update public.announcements set replaced_at=now() where kind in ('closure','delay') and replaced_at is null;
  end if;
  insert into public.announcements(id,kind,title,body,pin_until,related_id)
    values(p_id,p_kind,p_title,p_body,p_until,p_related);
  if p_push then
    insert into public.push_broadcasts(announcement_id,created_by,title,body,total)
      values(p_id,p_actor,p_title,p_body,0) returning id into campaign;
    insert into public.push_deliveries(broadcast_id,subscription_id)
      select campaign,id from public.push_subscriptions;
    update public.push_broadcasts set total=(select count(*) from public.push_deliveries where broadcast_id=campaign) where id=campaign;
  end if;
end;
$$;
revoke execute on function public.publish_announcement(uuid,text,text,text,timestamptz,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.publish_announcement(uuid,text,text,text,timestamptz,uuid,uuid,boolean) to service_role;
