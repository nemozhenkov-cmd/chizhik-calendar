alter table public.visits add column visitor_hash text check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$');
create index visits_day_visitor on public.visits(day,visitor_hash) where visitor_hash is not null;
create function public.register_visit_v2(p_key text,p_ip text,p_visitor text default null) returns void language plpgsql security invoker set search_path='' as $$
begin
if p_visitor is not null and p_visitor !~ '^[0-9a-f]{64}$' then raise exception 'Invalid visitor'; end if;
perform public.register_visit(p_key,p_ip);
if p_visitor is not null then
update public.visits set visitor_hash=p_visitor where visit_key=p_key and day=(now() at time zone 'Europe/Moscow')::date and visitor_hash is null;
end if;
end; $$;
revoke all on function public.register_visit_v2(text,text,text) from public,anon,authenticated;
grant execute on function public.register_visit_v2(text,text,text) to service_role;
create function public.visit_stats_v2(p_from date,p_to date) returns table(day date,visits bigint,unique_visitors bigint,period_unique bigint)
language sql stable security invoker set search_path='' as $$
with scoped as materialized (select visit_key,day,visitor_hash from public.visits where day between p_from and p_to and p_to-p_from between 0 and 366),
total as (select count(distinct visitor_hash) n from scoped)
select d::date,count(v.visit_key),count(distinct v.visitor_hash),(select n from total)
from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
left join scoped v on v.day=d::date
where p_to-p_from between 0 and 366 group by d order by d;
$$;
revoke all on function public.visit_stats_v2(date,date) from public,anon;
grant execute on function public.visit_stats_v2(date,date) to authenticated,service_role;
