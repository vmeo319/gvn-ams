-- The existing hawkins cron job (id 1) has never worked — its command contains literal
-- unsubstituted placeholder text ("YOUR_SUPABASE_PROJECT_REF", "YOUR_SERVICE_ROLE_KEY"),
-- confirmed failing nightly with "Couldn't resolve host name" in net._http_response.
-- There was no cron job at all for sync-1080, which is why 2600+ queued sessions sat
-- pending forever. Both are fixed here, using the service_role_key stored in Vault
-- (via a prior one-off `select vault.create_secret(...)` call) rather than embedding the
-- raw key in a migration file that gets committed to git.

select cron.unschedule(1);

select cron.schedule(
  'sync-hawkins-nightly',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://dkktetlxvpareyuthnpf.supabase.co/functions/v1/sync-hawkins',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Daily discovery of new/older sessions belonging to known GVN athletes.
select cron.schedule(
  'sync-1080-enqueue-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://dkktetlxvpareyuthnpf.supabase.co/functions/v1/sync-1080',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('mode', 'enqueue', 'lookbackDays', 14)
  ) as request_id;
  $$
);

-- Frequent draining of the queue so newly-enqueued sessions (and any backlog) turn into
-- real metrics promptly rather than sitting pending indefinitely.
select cron.schedule(
  'sync-1080-process-frequent',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://dkktetlxvpareyuthnpf.supabase.co/functions/v1/sync-1080',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('mode', 'process_batch', 'batchSize', 50)
  ) as request_id;
  $$
);
