# Courier Hub

One website for dental labs to compare couriers (India Post, Shadowfax, more later), book packages to many
dentists and executives in one click, track every status, and handle damage returns.

```
backend/    FastAPI + SQLAlchemy + Alembic + PostgreSQL   (models / dao / services / couriers / api)
frontend/   Next.js 15 + Tailwind
```

## Roles

| id | Role      | Can do |
|----|-----------|--------|
| 1  | Doctor    | Sign up with the phone the admin registered, see packages sent to them, request returns |
| 2  | Executive | Same as Doctor |
| 3  | Admin     | Everything: labs, dentists, executives, compare prices, book, cancel, all packages |

Admins are created with a script (below). Doctors and executives sign themselves up; sign-up only works if an
admin has already added a dentist or executive with that phone number.

## First-time setup

Needs Python 3.12, Node 20+, PostgreSQL 14+.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
```

Fill in `.env`:

- `DATABASE_URL`: your PostgreSQL password and database name
- `JWT_SECRET` and `WEBHOOK_SECRET`: run `python -c "import secrets; print(secrets.token_urlsafe(48))"` for each
- `CREDENTIALS_ENCRYPTION_KEY`: run `.venv\Scripts\python -m app.scripts.set_api_key --new-encryption-key`.
  Keep it safe; if it changes, the stored courier keys can't be read.

Create the database and tables, then the first admin:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres courier_hub
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m app.scripts.create_admin --company "Your Company" --name "Admin" --phone 9876543210
```

`alembic upgrade head` creates all tables and loads the 3 roles, 2 couriers, 36 states, 733 cities and
19,300 pincodes.

Start the API (http://localhost:8000/docs lists every endpoint):

```powershell
.venv\Scripts\uvicorn app.main:app --reload
```

Start the tracking checker in a second window. It asks the couriers for updates every 30 minutes:

```powershell
.venv\Scripts\python -m app.workers.tracking
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The frontend passes `/api/v1/*` to the backend at `BACKEND_URL`
(default `http://localhost:8000`).

## Courier API keys

Keys are kept only in the database (`courier_api_keys`, encrypted) and never appear in the website. Add or change
them with the helper, which asks for the secret without showing it:

```powershell
# Shadowfax: asks for the API token
.venv\Scripts\python -m app.scripts.set_api_key --company-id 1 --courier SHADOWFAX --label main --env UAT

# India Post: asks for the password
.venv\Scripts\python -m app.scripts.set_api_key --company-id 1 --courier INDIA_POST --label main --env UAT `
  --username 9999999999 --customer-code 3000064781 `
  --contracts '{\"SP\": \"41585456\", \"BP\": \"41367422\"}' `
  --config '{\"office_id\": 21260024, \"quote_products\": [\"SP\", \"BP\"]}'
```

Run it again with the same `--label` to update a key, or add `--inactive` to switch one off. A company can have
several keys per courier; the one marked `is_default` is used.

### India Post tracking numbers

India Post expects us to issue the tracking number from a range it assigns. Add the range once in SQL:

```sql
INSERT INTO barcode_ranges (api_key_id, prefix, country_code, start_serial, end_serial, next_serial)
VALUES (1, 'ET', 'IN', 21433001, 21434000, 21433001);
```

The check digit is worked out automatically. A number is kept on retries, so a package is never booked twice.

### Shadowfax prices

Shadowfax has no price API, so its prices come from `rate_cards` (zones: `LOCAL`, `STATE`, `METRO`, `ROI`):

```sql
INSERT INTO rate_cards (company_id, provider_id, service_type, zone, weight_from_g, weight_to_g, price, cod_charge, estimated_days, effective_from)
VALUES (1, 2, 'Regular', 'LOCAL', 1, 500, 39, 0, 1, CURRENT_DATE);
```

### Webhooks

Give each courier this URL for live status updates:

```
https://<your-domain>/api/v1/webhooks/india-post/<WEBHOOK_SECRET>
https://<your-domain>/api/v1/webhooks/shadowfax/<WEBHOOK_SECRET>
```

Shadowfax doesn't resend a missed update, so the tracking checker also asks for updates regularly.

## Sessions

- Sign-in gives a 15-minute access token, kept only in the page's memory, and a refresh token in an
  httpOnly cookie that page scripts can't read.
- **Users are signed out automatically 24 hours after signing in**, however active they are. Renewing tokens
  never extends this. When the time comes, an open page signs out on its own and explains why, and the user
  returns to the same page after signing in again. Change the length with `SESSION_HOURS` in `backend/.env`.
- On every page load the site trades the cookie for a new access token, so **a browser refresh keeps you
  signed in and on the same page**. Filters, the dashboard period and each step of New package are kept in the
  URL; the unfinished New package form is kept for the browser tab.
- Tokens renew a minute before they expire. Each refresh replaces the cookie. If an old cookie is used again
  later, every session for that user is ended, which stops a copied cookie being reused.
- Signing out in one tab signs out every tab.

## Deploying to the server

Courier Hub runs on the same server as ParentVox, fully separate from it:

| | Production | Development |
|---|---|---|
| Branch | `main` | `dev` |
| Folder | `/opt/courierhub` | `/opt/courierhub-dev` |
| API / website ports | 8200 / 3200 | 8210 / 3210 |
| Services | `courierhub-api`, `courierhub-web`, `courierhub-tracking` | same names ending in `-dev` |
| Database | `courier_hub` | `courier_hub_dev` |
| Labels and photos | `/var/lib/courierhub` | `/var/lib/courierhub-dev` |

**Once per environment**, on the server (needs git, Python 3.12, Node 20, PostgreSQL and nginx, which
ParentVox already uses):

```bash
git clone https://github.com/JaiPrakashRjp/LABcourier.git /tmp/courierhub-setup
sudo bash /tmp/courierhub-setup/deploy/setup-server.sh prod courier.your-domain.com
sudo bash /tmp/courierhub-setup/deploy/setup-server.sh dev  courier-dev.your-domain.com   # optional
```

The script creates the database, `backend/.env` with new secrets, the three services and an nginx site, then
prints the remaining steps: HTTPS with certbot, the first admin, and courier keys. Running it again keeps
existing settings and data. If the repository is private, the server needs the same GitHub access that
ParentVox's folders use.

**Every deploy after that is automatic**: pushing to `main` or `dev` runs `.github/workflows/deploy.yml`. It checks
the code, then over SSH pulls the branch, installs packages, runs database migrations, builds the website,
restarts the services and fails if the API does not come back. It uses the same repository secrets as ParentVox:
`SERVER_HOST`, `SERVER_USER` and `SERVER_SSH_KEY`.

Logs: `journalctl -u courierhub-api -f` (or `-web`, `-tracking`).

## Adding a courier

1. Write `backend/app/couriers/<name>.py`, a subclass of `CourierAdapter` (quote, book, labels, track, and
   optionally cancel and webhooks).
2. Register it in `backend/app/couriers/registry.py`.
3. Insert a `courier_providers` row with the same `code`, then add its key with `set_api_key`.

Nothing else changes: price comparison, one-click booking, tracking, returns and the dashboard pick it up.

## Known gaps

- **Unverified courier details:** the India Post label and return booking, and Shadowfax's weight fields and
  webhook format, follow their docs but haven't been tested against the live courier APIs.
- **India Post returns:** there's no return API, so a return is booked as a new shipment from the recipient back
  to the lab.
- **Shadowfax returns:** these use the same approach until its reverse-pickup API is added.
- **Sign-up check:** sign-up matches the phone number only. Add an SMS OTP before going live publicly.
