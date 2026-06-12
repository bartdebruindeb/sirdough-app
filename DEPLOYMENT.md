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

### 4. Edit `src/config/bakery.config.ts`

This is the ONE file with bakery-specific settings:

- `businessName` — shown in sidebar, login page
- `shops` — for a shop-only bakery with one location, set:
  ```ts
  shops: [
    { name: "Winkel", lat: <your lat>, lon: <your lon> },
  ],
  ```
  (Get lat/lon from Google Maps — right-click the location → copy coordinates)
- `hasDelivery` — set to `false` if there are no horeca/delivery customers yet.
  This doesn't remove the Bezorgen page, but signals the deployment is shop-first.
  If small customers get added later, `hasDelivery` can stay `false` — the
  Bezorgen page will simply show their orders too once they exist.

### 5. Set up the seed script

Copy the template and fill in the bakery's products:

```bash
cp scripts/seed-template.ts scripts/seed-<newbakery>.ts
```

Edit `scripts/seed-<newbakery>.ts`:
- `BAKERY.slug` — must match `TENANT_SLUG` in `.env`
- `BAKERY.name`, owner/worker emails
- `SHOP` — name (must match `bakery.config.ts` shops[0].name exactly), city, address
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

### 9. Backups

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
| Secrets (`NEXTAUTH_SECRET`, DB password) | ❌ never reuse | ✅ unique per bakery |
| User accounts, orders, recipes | ❌ never | ✅ fully isolated |

If a bug fix or new feature is built for one bakery and should apply to all,
apply the same code change to each copy (or `git pull` if tracking a shared
repo) — but never share databases or secrets between them.
