do $schedule$ declare c text;begin
select command into c from cron.job where jobname='calendar-push-worker';
c:=replace(c,'or exists(select 1 from public.push_reminders where state in (''pending'',''sending'') and due_at<=now() and lease_until<=now());','or exists(select 1 from public.push_reminders r join public.offers o on o.id=r.offer_id where r.state in (''pending'',''sending'') and r.lease_until<=now() and (r.due_at<=now() or (((o.sale_date-1)+time ''18:30'') at time zone ''Europe/Moscow'')<=now()));');
perform cron.schedule('calendar-push-worker','* * * * *',c);
end $schedule$;
