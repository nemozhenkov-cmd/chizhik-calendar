alter table public.periods add constraint no_published_overlap exclude using gist(daterange(starts_on,ends_on,'[]') with &&) where (published);
create function public.register_visit(p_key text,p_ip text) returns void language plpgsql security invoker set search_path='' as $$declare d date := (now() at time zone 'Europe/Moscow')::date; begin
perform pg_advisory_xact_lock(hashtextextended(p_ip||d::text,0));
if length(p_key)<>64 or length(p_ip)<>64 then return;end if;
if (select count(*) from public.visits where day=d and ip_hash=p_ip)>=100 then return;end if;
insert into public.visits(visit_key,day,ip_hash) values(p_key,d,p_ip) on conflict do nothing;end;$$;
revoke execute on function public.register_visit(text,text) from public,anon,authenticated;
grant execute on function public.register_visit(text,text) to service_role;
