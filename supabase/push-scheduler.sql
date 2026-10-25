-- Server-side delivery continues after the administrator closes the site.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('calendar-push-worker','* * * * *', $job$
select net.http_post(
 url:='https://saeywokxwhrvfrwdrmjx.supabase.co/functions/v1/calendar-push',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZXl3b2t4d2hydmZyd2RybWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MDA4MzcsImV4cCI6MjEwODQ3NjgzN30.eB9QANA50pkDJg-AA7OJYq88ytc4o0d0Bz1e7namAPQ','x-worker-token',(select worker_token from public.push_config where id=1)),
 body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=65000
) where exists(select 1 from public.push_deliveries where state in ('pending','sending') and lease_until<=now());
$job$);
