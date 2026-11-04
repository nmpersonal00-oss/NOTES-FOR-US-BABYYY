-- Run in the Petal Notes Supabase project's SQL Editor AFTER deploying the Edge Function.
-- Enable extensions pg_cron and pg_net. Store your HTTPS URL and a long,
-- randomly generated PETAL_CRON_TOKEN in Supabase Vault.
-- Use the SAME token as the send-nudges Edge Function environment secret.
-- Replace placeholders BEFORE running. Never commit live tokens.

select vault.create_secret('https://YOUR_PROJECT.supabase.co','petal_project_url');
select vault.create_secret('YOUR_RANDOM_LONG_PRIVATE_TOKEN','petal_cron_token');

select cron.schedule(
  'petal-nudges-every-minute',
  '* * * * *',
  $$
    select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name='petal_project_url') || '/functions/v1/send-nudges',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-petal-secret',(select decrypted_secret from vault.decrypted_secrets where name='petal_cron_token')
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);
