# Petal Notes — full-screen illustrated couples reminder app

Petal Notes is the **actual interactive app**, not a mockup. Its graphic elements are extracted from the exact approved AI-art concept: the bunny-and-bear header with the Petal Notes title, illustrated book/snack/vitamin/letter/character stickers, the glowing letter-and-quill editor art, flowers, and illustrated full-screen world. Cards, fields, navigation and controls are real HTML elements, not text baked into the illustration.

## What you can do in the app

- Add, edit and delete your own note or reminder. No sample notes, diary sections, fake activity, calendar, or due dates.
- Select a recipient: Wife, Husband or Both.
- Set notifications to Off, Morning (9:00 AM), Afternoon (2:00 PM), Evening (7:00 PM), or **My time** (choose any daily time on a clock; no dates).
- Select an illustrated sticker using artwork from the approved concept.
- Filter to All, For both, For me or Reminders.
- Install on iPhone as a standalone Home Screen web app. The background extends edge-to-edge behind safe areas; the operating system may still show its own status indicators.
- With a *separate* configured backend, sign in on two different phones, join with an invitation code, sync notes, and subscribe to actual server-delivered Web Push.

## Run the app

Open `index.html` to explore locally, or serve the folder over HTTP for development:

```sh
cd petal-notes
python3 -m http.server 8000
# Visit http://localhost:8000
```

For installation on a phone and push notifications, publish all files in this folder to an **HTTPS** address. A local file cannot install a service worker or deliver remote push notifications.

You can also open `petal-notes-try-it.html` from the parent download folder for a self-contained local interactive demo that includes the same artwork. This demo saves notes locally only; it is not the deployed shared version.

## Important: current push status

**The push infrastructure is implemented in the project, but is not live yet.** The user account currently has the Wifey & Hubby and Tulip & Honey Closet Supabase projects; no independent Petal Notes project was available. We intentionally did **not** overwrite either project or create a potentially chargeable new database on your behalf. This means no live Web Push has been delivered or tested on two real phones yet. A successful local notification test after deployment checks notification display only; the recurring delivery test requires the backend and scheduler.

## Deploy a new, separate cloud backend

1. In Supabase create a **new project** called `Petal Notes`. Check any organization/project charges first. Do not reuse the Wifey & Hubby app's Supabase keys or database.
2. In the **new project's** SQL Editor, run `supabase/schema.sql` once. It creates two-member private rooms, access-controlled notes, per-user push subscriptions, a delivery deduplication ledger, and the `create_couple_room` / `join_couple_room` RPCs.
3. Enable email/password authentication, configure email confirmation, set Auth Site URL and allowed redirect URLs to match your hosted HTTPS URL.
4. Copy the new project's URL and public publishable key into `cloud-config.js` (never put server secrets in a browser file).
5. Generate a new VAPID key pair with a command such as `npx web-push generate-vapid-keys`. Put **only the public** key into `cloud-config.js`.
6. Store the following secrets in the new project's Edge Functions settings: `PETAL_CRON_TOKEN` (a long random private token), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (e.g., `mailto:your-email@example.com`). Supabase additionally provides its server URL and secret/service-role credentials to its Edge environment. Never commit private values.
7. Deploy `supabase/functions/send-nudges/index.ts` as the `send-nudges` Edge Function. The function deliberately accepts calls without a user JWT **only because it validates** the private `x-petal-secret` request header; unauthenticated or incorrect calls get 401. Use current Supabase CLI help for exact deployment syntax; a typical command is `supabase functions deploy send-nudges --no-verify-jwt` after project linking.
8. Enable `pg_cron`, `pg_net`, and Vault in that project. Edit the placeholder project URL and private token in `supabase/cron-example.sql` and run it **once** to invoke the function every minute. Never upload real tokens into GitHub. For repeated setup, first review or unschedule any existing `petal-nudges-every-minute` job.
9. Publish the entire `petal-notes/` folder over HTTPS (GitHub Pages, Netlify, Cloudflare Pages or equivalent). The `sw.js` service worker and all assets must be at the same site origin and path scope. The manifest lets supported devices install the site.
10. On each phone, create a *different* account. One person creates a room and copies the private invite code; the other joins via the code. Both devices should display synced notes.
11. **iPhone / iOS 16.4+:** Open the HTTPS site in Safari, use Share → Add to Home Screen, then open Petal Notes from the Home Screen icon. In **Together**, press **Enable notifications** and allow system notifications on **both phones**. Web Push is not available to ordinary Safari-tab websites on iPhone.
12. Test a reminder due shortly on both locked phones; check Supabase Edge logs and `push_deliveries` records for actual server delivery. Check deleted notes, edited reminder times, bad network and notification denial. Do not rely on an untested build for critical reminders.

## App behavior and privacy

- Morning = 9:00 AM, Afternoon = 2:00 PM, Evening = 7:00 PM, and My time = the chosen 24-hour clock time **every day in each subscribed phone's timezone**. No calendar dates are entered or displayed. Internal daily keys are used only to avoid duplicate notifications. The cron sender allows a ten-minute delivery window for scheduling drift and uses a once-per-day ledger.
- The **note audience** selects who is notified, not who may read the note. Both members of the private room can view and edit shared notes regardless of recipient.
- Local notes remain on the current device until sharing is configured; locally created notes are imported to a new shared room once after connecting.
- Internet outages, DND/Focus, OS restrictions, changing permissions, expired subscriptions or untested server configuration can delay or prevent push deliveries. Real-time sync has no durable offline write queue; failed cloud writes report an error.
- The app uses custom AI-derived PNG illustrations instead of emoji or stock Apple UI icons. It has CSS petal/sparkle/floating animation, 3D shadows, glowing surfaces and reduced-motion support.
- This project is completely separate from `ME-AND-MY-BABY-HEALTHY`; it does not modify your existing GitHub app or its database.

## Files

`index.html` interactive screens; `styles.css` glossy responsive layout and CSS animation; `app.js` functional CRUD, filters, cloud auth, invitations and push subscription; `assets/*` **actual concept artwork** and Home Screen icons; `manifest.webmanifest` standalone install; `sw.js` actual push notification display/click handler; `cloud-config.js` empty public configuration; `supabase/schema.sql` secure database schema; `supabase/functions/send-nudges/index.ts` server-side recurring push worker; `supabase/cron-example.sql` example one-minute job.

### Verification

- JavaScript syntax checked with `node --check`.
- Local fake-DOM smoke test exercised initialization, opening the editor, adding a note, choosing a custom reminder time, saving to local storage, editing, filtering, and deleting successfully.
- Automated browser screenshot verification was **not** available: the runner's managed browser blocked navigation to both localhost and local files. The app should be manually opened on actual iPhone Safari / installed Home Screen before claiming device layout or push delivery verified.
