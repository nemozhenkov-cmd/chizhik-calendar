drop policy public_periods on public.periods; drop policy public_offers on public.offers;
create policy public_periods on public.periods for select to anon using(published);
create policy signed_periods on public.periods for select to authenticated using(published or exists(select 1 from public.admins where user_id=(select auth.uid())));
create policy public_offers on public.offers for select to anon using(exists(select 1 from public.periods p where p.id=period_id and p.published));
create policy signed_offers on public.offers for select to authenticated using(exists(select 1 from public.periods p where p.id=period_id and p.published) or exists(select 1 from public.admins where user_id=(select auth.uid())));
