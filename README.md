# Petal Notes — Shared Reminders

Hosted at https://nmpersonal00-oss.github.io/NOTES-FOR-US-BABYYY/

This app uses **the existing Wifey & Hubby Supabase project** `gtcybnvjdcmuzegxwiic` to keep the same Supabase Auth login. It adds separately named `petal_*` tables and a separate `send-petal-reminders` Edge Function. The existing `wh_*` tables, functions, and jobs are untouched. No additional Supabase project was created.

## How to use on both iPhones

1. Open the HTTPS site in **Safari** on each phone. Tap **Share → Add to Home Screen** and launch the installed app from the Home Screen.
2. Open **Together**, then **Sign in** with **the same email/password account used by Wifey & Hubby** on each phone.
3. Tap **Enable notifications** on each phone and grant notification permission. Both devices must subscribe separately.
4. Add a reminder in either phone; both screens will show it. Choose Morning (9:00 AM), Afternoon (2:00 PM), Evening (7:00 PM), or My time; no calendar dates required.
5. Use **Test notification** to confirm this phone can show an alert. It is a *local display test only*. Verify real background push by setting a reminder time a few minutes ahead and locking both phones.

## How it works

- `petal_notes`: private user-owned reminders and time-of-day recurrence
- `petal_push_subscriptions`: separate per-phone Web Push subscriptions for Petal Notes
- `petal_push_deliveries`: prevents duplicate daily alerts per note/device
- `send-petal-reminders`: independent Supabase Edge Function, called every minute by `petal-notes-every-minute` using the project's existing **Vault-protected** cron and VAPID credentials
- `cloud-config.js`: browser-safe public Supabase URL, publishable key and public VAPID key; no private keys
- Service worker `sw.js` displays incoming push even when the app is not running.
- Existing local reminders are imported once after sign-in; reminders added offline when signed out remain local until sign-in.

## Limitations

Push requires installed Home Screen web app on compatible iOS, notification permission and an active network connection. Focus modes, app settings, network issues and device power policies can delay or suppress alerts. This is not a guarantee of exact-time delivery. The same Supabase **account** must be used on both phones for one shared list; signing into different accounts creates separate private lists. Real locked-phone delivery must be confirmed on actual devices after sign-in.

No new paid Supabase project was created.
