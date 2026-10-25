drop policy admin_periods on public.periods; drop policy admin_offers on public.offers;
create policy admin_periods_insert on public.periods for insert to authenticated with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_periods_update on public.periods for update to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid()))) with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_periods_delete on public.periods for delete to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_offers_insert on public.offers for insert to authenticated with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_offers_update on public.offers for update to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid()))) with check(exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy admin_offers_delete on public.offers for delete to authenticated using(exists(select 1 from public.admins where user_id=(select auth.uid())));
drop index public.offers_period;
create function public.validate_period() returns trigger language plpgsql security invoker set search_path='' as $$begin
if exists(select 1 from public.offers where period_id=new.id and sale_date not between new.starts_on and new.ends_on) then raise exception 'В периоде есть товары вне новых дат';end if;
if new.published and not exists(select 1 from public.offers where period_id=new.id) then raise exception 'Нельзя опубликовать пустой период';end if;
return new;end;$$;
revoke execute on function public.validate_period() from public,anon,authenticated;
create trigger validate_period before update on public.periods for each row execute function public.validate_period();
