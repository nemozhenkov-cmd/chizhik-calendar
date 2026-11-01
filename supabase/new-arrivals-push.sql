alter table public.push_broadcasts alter column period_id drop not null;
alter table public.push_broadcasts add column new_collection_id uuid unique references public.new_collections(id) on delete cascade;
alter table public.push_broadcasts add constraint broadcast_exactly_one_source check(num_nonnulls(period_id,new_collection_id)=1);
create function public.push_enqueue_new(p_collection uuid,p_actor uuid) returns uuid language plpgsql security invoker set search_path='' as $$declare campaign uuid;p public.new_collections;begin
if not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'FORBIDDEN';end if;
perform pg_advisory_xact_lock(hashtextextended('push-broadcast-new',0));
select * into p from public.new_collections where id=p_collection and published;
if not found or not exists(select 1 from public.new_items where collection_id=p_collection) then raise exception 'PUBLISH_FIRST';end if;
select id into campaign from public.push_broadcasts where new_collection_id=p_collection;
if found then return campaign;end if;
insert into public.push_broadcasts(new_collection_id,created_by,title,body,total) values(p_collection,p_actor,'Чижик принёс новинки!',p.title||' · Знакомьтесь с новыми товарами в подборке.',(select count(*) from public.push_subscriptions)) returning id into campaign;
insert into public.push_deliveries(broadcast_id,subscription_id) select campaign,id from public.push_subscriptions;
return campaign;end;$$;
revoke execute on function public.push_enqueue_new(uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_enqueue_new(uuid,uuid) to service_role;
