# Deploying a new bakery

This app is built so each bakery runs as its **own deployment** — own database,
own config, own process — even when sharing a VPS with other bakeries. No data
is ever shared between bakeries; each is fully isolated.

## Architecture on one VPS

```
VPS
├── Postgres
│   ├── database: digitalbakery_leffers
│   └── database: digitalbakery_<newbakery>
├── /opt/leffers/        (codebase copy 1, port 3000)
├── /opt/<newbakery>/     (codebase copy 2, port 3001)
└── nginx
    ├── leffers.jouwdomein.nl   → localhost:3000
    └── <newbakery>.jouwdomein.nl → localhost:3001
```

Each bakery is a separate `git clone` (or copy) of this codebase, with its
own `.env` file and its own Postgres database. Updates to the shared code
(bug fixes, new features) get applied to each copy separately — or via
`git pull` if each copy tracks the same repo.

## Steps for a new bakery

### 1. Create the database

```bash
sudo -u postgres createdb digitalbakery_<newbakery>
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'something-strong';"
```

### 2. Copy the codebase

```bash
cp -r /opt/leffers /opt/<newbakery>
cd /opt/<newbakery>
rm -rf node_modules .next
npm install
```

### 3. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` → point to `digitalbakery_<newbakery>`
- `NEXTAUTH_SECRET` → generate a NEW one with `openssl rand -base64 32` (never reuse across bakeries)
- `NEXTAUTH_URL` → `https://<newbakery>.jouwdomein.nl/digitalbakery`
- `TENANT_SLUG` → must match the `slug` you'll use in the seed script (step 5)
- `PORT` → pick an unused port, e.g. `3001`
- `CRON_SECRET` → generate a NEW one (`openssl rand -base64 32`), used by the daily reminder cron (see step 9 below)
- `RESEND_API_KEY` → your Resend account's API key (can be shared across bakeries — Resend keys aren't domain-locked)
- `RESEND_FROM` → e.g. `"<Bakery name> <noreply@<newbakery>.jouwdomein.nl>"` — **must be unique per bakery** so emails carry the right sender name/domain
- `EXACT_CLIENT_ID` / `EXACT_CLIENT_SECRET` → **same values on every bakery**, from the one Exact Online app registration (see "Exact Online: one app, many bakeries" below). Used locally for day-to-day token refresh; do not register a new Exact app per bakery.
- `EXACT_REDIRECT_URI` → **same value on every bakery**: `https://sirdough.com/api/exact/relay-callback` (the one URI actually registered in the Exact app)
- `STATE_SIGNING_SECRET` → **same value on every bakery** (generate once with `openssl rand -base64 32`, reuse it everywhere) — signs the OAuth CSRF state so the relay can verify it came from a real bakery
- `RELAY_SHARED_SECRET` → generate a NEW one per bakery (`openssl rand -base64 32`) and also add it to the relay host's `TENANT_REGISTRY` entry for this bakery (see below) — authenticates the relay's token handoff to this bakery

Missing any of `RESEND_*` or `EXACT_*` doesn't crash the app — those features just silently no-op (no emails sent / "Koppel Exact" fails) — so double-check them explicitly rather than relying on an error to catch a typo.

### Exact Online: one app, many bakeries

Exact only allows **one registered redirect URI per app**, but every bakery is its own
isolated deployment on its own subdomain. To avoid registering a separate Exact app per
bakery, all bakeries redirect through one shared relay endpoint hosted inside a single
bakery deployment (pick one live deployment — e.g. Leffers — as the "relay host"):

1. In the Exact App Store, register **one** app for the whole platform, with redirect URI
   `https://sirdough.com/api/exact/relay-callback`.
2. On the **relay host's** `.env` only, in addition to the vars above, add:
   - `TENANT_REGISTRY` → JSON mapping every bakery's `TENANT_SLUG` to where the relay
     should hand off tokens. `receiveUrl` must use that bakery's real subdomain — it
     doesn't have to match the `TENANT_SLUG` string itself (e.g. Leffers' slug is
     `leffers` but its real subdomain is `meneerleffers.sirdough.com`); the relay reads
     the bakery's real domain from `receiveUrl`, not by guessing `<slug>.sirdough.com`:
     ```json
     {"leffers":{"receiveUrl":"https://meneerleffers.sirdough.com/api/exact/relay-receive","secret":"<that bakery's RELAY_SHARED_SECRET>"},"newbakery":{"receiveUrl":"https://newbakery.sirdough.com/api/exact/relay-receive","secret":"<newbakery's RELAY_SHARED_SECRET>"}}
     ```
3. On the relay host's nginx server block for the **apex domain** (`sirdough.com`, not a
   subdomain), add one location proxying to the relay host's own port, leaving everything
   else on the apex serving the static landing page as before:
   ```nginx
   server {
       server_name sirdough.com;
       location /api/exact/relay-callback {
           proxy_pass http://localhost:3000;   # relay host's port
           proxy_set_header Host $host;
       }
       location / {
           # existing static landing page config
       }
   }
   ```

Onboarding a new bakery's Exact connection after that is just: generate a
`RELAY_SHARED_SECRET` for it, add it to `.env`, and add one entry to the relay host's
`TENANT_REGISTRY` — no new Exact app, no new redirect URI registration.

### 4. Edit `src/config/bakery.config.ts`

This is the ONE file with bakery-specific settings:

- `businessName` — shown in sidebar, login page
- `hasDelivery` — set to `false` if there are no horeca/delivery customers yet.
  This doesn't remove the Bezorgen page, but signals the deployment is shop-first.
  If small customers get added later, `hasDelivery` can stay `false` — the
  Bezorgen page will simply show their orders too once they exist.

Shops/pickup locations are **not** configured here anymore — after the app is running,
add them from the UI on the Winkel page ("+ Nieuwe winkel"), which geocodes the address
and makes the shop selectable everywhere immediately (customer pickup, Bezorgen,
invoicing). No code change or redeploy needed for a new shop.

### 5. Set up the seed script

Copy the template and fill in the bakery's products:

```bash
cp scripts/seed-template.ts scripts/seed-<newbakery>.ts
```

Edit `scripts/seed-<newbakery>.ts`:
- `BAKERY.slug` — must match `TENANT_SLUG` in `.env`
- `BAKERY.name`, owner/worker emails
- `SHOP` — name, city, address (mark it `isShop: true` in the seed, or just add it from
  the Winkel page's "+ Nieuwe winkel" after first login instead)
- `DOUGH_TYPES` — the bakery's base recipes (water%, desem%, salt%, etc.)
- `BREAD_TYPES` — their bread range, with dough weights INCLUDING the 1% residue
  (e.g. a 750g loaf → enter `758`)
- `WINKEL_TEMPLATE` — default daily production numbers per weekday

Add a script entry to `package.json`:
```json
"seed:<newbakery>": "tsx scripts/seed-<newbakery>.ts"
```

### 6. Run migrations and seed

```bash
npm run db:migrate
npm run seed:<newbakery>
```

### 7. Build and run

```bash
npm run build
npm run start:port   # uses $PORT from .env
```

For production, run this under `pm2` or `systemd` so it restarts on crash/reboot:

```bash
pm2 start npm --name "<newbakery>" -- run start:port
pm2 save
```

### 8. nginx — add the subdomain

```nginx
server {
    server_name <newbakery>.jouwdomein.nl;
    listen 443 ssl;
    # ssl_certificate ... (see certbot below)

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then get a certificate:
```bash
sudo certbot --nginx -d <newbakery>.jouwdomein.nl
```

### 9. Daily reminder cron

The order-reminder email (sent 2 days before delivery, at noon) is triggered by
a VPS cron hitting this bakery's own URL — it does **not** run automatically per
deployment, so add one crontab entry per bakery:

```bash
crontab -e
```
```
0 12 * * * curl -s -H "x-cron-secret: <this bakery's CRON_SECRET>" https://<newbakery>.jouwdomein.nl/api/cron/order-reminder
```

Runs daily at 12:00, reminding every delivery 2 days ahead (so Monday noon →
Wednesday's deliveries). Restrict to Monday only with `0 12 * * 1` if the
bakery only wants to remind about Wednesday deliveries.

Use the exact `CRON_SECRET` value from this bakery's `.env` and the exact
subdomain — hitting the wrong port/subdomain sends no reminders and fails silently.

### 10. Backups

Add the new database to the backup script (see backup notes from the main
setup) — same `pg_dump` approach, just another database name in the loop.

---

## Adding bread types, customers, categories later

None of this requires touching the seed script again — everything below is
done from the running app, per bakery, by the owner:

- New bread types → Recepten page → "+ Nieuw broodsoort" (auto-generates slug,
  can add new categories on the fly)
- New customers (horeca, small accounts) → Klanten page
- Adjust winkel daily quantities → Winkel page (per date, doesn't need a redeploy)
- New workers → Team page (sends invite link)

The seed script is only a *starting point* — a way to get a new bakery from
zero to "usable" in one step. Day-to-day changes happen in the UI.

## What stays shared / what doesn't

| | Shared across bakeries | Per-bakery |
|---|---|---|
| Codebase | ✅ same source, copied per deployment | — |
| Database | ❌ never | ✅ separate Postgres DB |
| Config (`bakery.config.ts`) | — | ✅ edited per copy |
| `NEXTAUTH_SECRET`, DB password, `CRON_SECRET`, `RELAY_SHARED_SECRET` | ❌ never reuse | ✅ unique per bakery |
| `NEXTAUTH_URL`, `RESEND_FROM` | ❌ never reuse | ✅ unique per bakery (each is tied to that bakery's own subdomain) |
| `RESEND_API_KEY` | ✅ can be shared (not domain-locked) | — |
| `EXACT_CLIENT_ID`, `EXACT_CLIENT_SECRET`, `EXACT_REDIRECT_URI`, `STATE_SIGNING_SECRET` | ✅ same value on every bakery (one shared Exact app registration, see "Exact Online: one app, many bakeries") | — |
| `TENANT_REGISTRY` | — | ✅ relay-host deployment only |
| Public folder (`public/logo.jpg`, `public/brood/`) | ❌ never | ✅ separate per deployment directory — safe automatically since each copy has its own `public/` |
| Login sessions | ❌ never | ✅ browser cookies are host-scoped to the exact subdomain; a session on one bakery's subdomain is never sent to another |
| Cron job (daily reminder) | — | ✅ one crontab entry per bakery, pointing at that bakery's own URL (step 9) |
| User accounts, orders, recipes | ❌ never | ✅ fully isolated |

If a bug fix or new feature is built for one bakery and should apply to all,
apply the same code change to each copy (or `git pull` if tracking a shared
repo) — but never share databases or secrets between them.
