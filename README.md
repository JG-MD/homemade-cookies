# 🍃 Cookie Corner

A cookie ordering site for friends — no accounts, no money, just cookies. Static frontend, Supabase backend, installable as a PWA with push notifications.

---

## Features

| Who | Can do |
|-----|--------|
| Anyone | Browse available cookies, read reviews |
| Anyone | Place an order (name, size, amount, note) — no account needed |
| Anyone | Track an order by its 6-character order code |
| Anyone | Leave a review (name, rating, comment) — filtered for inappropriate language |
| Anyone | Install as a PWA and opt in to push notifications for new batches |
| Admin | See all orders in real-time, filter by status, export to CSV |
| Admin | Edit or delete orders |
| Admin | Change order status (pending → confirmed → ready → done) |
| Admin | Add / show / hide / delete cookies, with photo upload |
| Admin | Open/close the ordering window, set a deadline + banner text, send push reminders |
| Admin | Delete reviews |

---

## File structure

```
homemade-cookies/
├── index.html                        ← Customer-facing page
├── admin.html                        ← Admin login + dashboard
├── privacy.html                      ← Privacy policy
├── manifest.json, sw.js              ← PWA manifest + service worker (push notifications)
├── css/
│   └── style.css                     ← Shared design system
├── js/
│   ├── config.js                     ← Supabase credentials
│   ├── main.js                       ← Customer page logic
│   ├── admin.js                      ← Admin dashboard logic
│   └── moderation.js                 ← Review text filter (slurs/profanity, non-Latin scripts)
├── supabase/
│   └── functions/send-push/index.ts  ← Edge function that sends web-push notifications (admin-only)
└── assets/                           ← Icons, images, app icons
```

---

## Setup

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com), and set up these tables:

- `cookies` — `name`, `description`, `image_url`, `available`
- `orders` — `customer_name`, `cookie_id`, `cookie_name`, `size`, `amount`, `note`, `status`, `lookup_code`, `created_at`
- `reviews` — `cookie_id`, `reviewer_name`, `rating`, `comment`, `created_at`
- `batch_settings` — single row (`id = 1`): `active`, `deadline`, `label`
- `push_subscriptions` — `endpoint`, `p256dh`, `auth`

Add Row Level Security policies so visitors can read/insert but not update/delete, and an `get_order_by_code(p_code)` RPC for order lookup. Add a storage bucket named `cookie-images` for cookie photos.

Create an admin user under **Authentication → Users** — that's what logs into `/admin.html`.

### 2. Fill in `js/config.js`

```js
const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'your anon/publishable key';
```

The anon key is safe to expose in frontend code — Supabase's Row Level Security policies control what visitors can and can't access.

### 3. Push notifications (optional)

Generate VAPID keys (`npx web-push generate-vapid-keys`), set `VAPID_PUBLIC_KEY` in `js/main.js`, and deploy the `send-push` edge function with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, and `SUPABASE_SERVICE_ROLE_KEY` set as function secrets.

### 4. Deploy to GitHub Pages

Push this folder to a GitHub repo, then enable Pages under **Settings → Pages** (branch `main`). The site expects to live at `/homemade-cookies/` — update `manifest.json`, `sw.js`, and the push URLs if you use a different path.

---

## Order flow

1. Customer browses available cookies → clicks **Order** → enters name, size, amount, optional note
2. Order is saved with a random 6-character lookup code, shown to the customer to save
3. Order appears instantly on the admin dashboard (Supabase Realtime)
4. Admin updates status as the batch progresses; customer can re-check status anytime with their code
5. Customer picks up their cookies 🍪
