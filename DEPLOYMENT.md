# Deploying PYC SmartSMS to a Webuzo VPS

Step-by-step guide for pulling this repository onto your Webuzo VPS and running it
in production. Total time: ~20–30 minutes.

**What you need**

- A VPS with Webuzo installed, and SSH access (root or a sudo user)
- Node.js 20+ (installed below if missing)
- Optional: a domain pointed at the VPS IP (you can also start with `http://SERVER_IP:3000`)

---

## 1. SSH in and install Node.js 20 + pm2

```bash
ssh root@YOUR_SERVER_IP

# Install Node.js 20 (skip if Webuzo's NodeJS manager already provides Node 20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -    # Debian/Ubuntu
apt-get install -y nodejs
# RHEL/CentOS/Alma instead:
#   curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
#   yum install -y nodejs

node -v        # must print v20.x or newer

# Process manager (keeps the app alive, auto-start on boot)
npm install -g pm2
```

## 2. Pull the code

The repo is public, so no token is needed:

```bash
cd /home          # or any directory, e.g. /home/pyc
git clone https://github.com/lilromeo2290/PYC-SmartSMS.git pyc-smartsms
cd pyc-smartsms
```

> If you later make the repo private, use a fine-grained Personal Access Token
> (repo read only): `git clone https://YOUR_TOKEN@github.com/lilromeo2290/PYC-SmartSMS.git pyc-smartsms`

## 3. Create the environment file

```bash
cp .env.example .env
openssl rand -hex 32        # copy the output — this is your APP_SECRET
nano .env
```

Set **both** values:

```ini
DATABASE_URL=file:/home/pyc-smartsms/db/custom.db   # ABSOLUTE path to where YOU cloned it
APP_SECRET=<the random hex you just generated>
```

⚠️ **APP_SECRET rules**
- It signs login cookies **and** encrypts the SMS gateway API key stored in the DB.
- Set it once and don't change it later. If you ever must change it, re-save the
  BMS API key in **Settings → SMS Provider** afterwards (the old encryption becomes unreadable).

## 4. Install dependencies, create the database, build

```bash
npm install                 # or: bun install
npx prisma db push          # creates db/custom.db with the full schema
npm run build               # compiles production bundle (~1–3 min)
```

## 5. Create the login accounts

The empty database has **no users**, so seed the accounts first:

```bash
npm run seed                # creates the 4 accounts + demo data
node scripts/wipe_for_handover.mjs   # optional: removes the demo data, KEEPS the accounts
```

> Run the wipe right after seeding if this is a production handover — you get a
> clean system with only the 4 user accounts. It also makes a timestamped backup
> of the database in `backups/` before wiping.

## 6. Start the app with pm2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                 # prints one command — copy/paste and run it
pm2 logs pyc-smartsms       # watch startup, Ctrl+C to exit
```

Verify locally on the VPS:

```bash
curl -I http://localhost:3000        # expect HTTP/1.1 200 OK
```

The app is now live on port **3000** and survives reboots.
The automation scheduler starts automatically with the app — no cron needed.

## 7. Put it on your domain (Webuzo reverse proxy)

**Option A — direct access (quickest):** open port 3000 in the Webuzo/VPS firewall
and browse to `http://SERVER_IP:3000`. Fine for testing.

**Option B — domain via Nginx (recommended):** Webuzo runs Nginx on port 80/443.
Create a proxy config (adjust `sms.yourdomain.com` and paths to your Webuzo layout):

```bash
nano /etc/nginx/conf.d/pyc-smartsms.conf
```

```nginx
server {
    listen 80;
    server_name sms.yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
nginx -t && systemctl reload nginx      # or: service nginx reload
```

Point the domain's DNS A record at the VPS IP, then in the Webuzo end-user panel
issue a **Let's Encrypt certificate** for the domain (SSL/TLS section) — the panel
adds the 443 listener for you. If your Webuzo build exposes a Node.js app manager
or a "reverse proxy" feature for a domain, you can use that instead of the manual
config above.

> Tip: to keep port 3000 private (proxy-only), set `HOSTNAME: '127.0.0.1'` in
> `ecosystem.config.cjs` env — then the app only listens on localhost and only
> Nginx can reach it. `pm2 restart pyc-smartsms` after editing.

## 8. First-login checklist (important!)

1. Log in as `admin` — default password `Admin@2026` (see README for the other 3 accounts).
2. **Change all four passwords immediately** (Users module). Defaults are public.
3. **Settings → SMS Provider**: choose BMS Africa, paste your mNotify API key,
   sender ID `PYC CLUB-HO`, and set the credit expiry date (shows on the dashboard).
4. **Import Members** (CSV) — the system ships empty.
5. Recreate automations (birthday wishes, meeting reminders, dues reminders) and
   create your groups.
6. Check **Dashboard** shows the live SMS balance — that confirms the gateway works.

## 9. Updating the app later

```bash
cd /home/pyc-smartsms
git pull
npm install              # only when dependencies changed
npx prisma db push       # only when the schema changed
npm run build
pm2 restart pyc-smartsms
```

## 10. Backups

The whole database is one file — back it up with a copy:

```bash
cp db/custom.db ~/backups/custom-$(date +%F).db
```

Add a cron (Webuzo panel → Cron Jobs) for a daily copy if you like:

```cron
0 2 * * * cp /home/pyc-smartsms/db/custom.db /home/backups/custom-$(date +\%F).db
```

`scripts/wipe_for_handover.mjs` also auto-backs-up before wiping.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Unable to acquire lock at .next/dev/lock` | A dev-mode message — in production it shouldn't appear. If seen: `pkill -f "next dev"`, `rm -f .next/dev/lock`, restart. |
| `PrismaClientInitializerError: Environment variable not found: DATABASE_URL` | `.env` missing or relative path used. Use the ABSOLUTE path, then `npm run build && pm2 restart pyc-smartsms` (`.env` is snapshotted at build time). |
| `Error: Invalid API key / decrypt failed` in Settings | `APP_SECRET` changed after the key was saved — re-enter the BMS API key. |
| Build killed / memory errors | Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Port 3000 already in use | `ss -tlnp | grep 3000` — stop the other service or change PORT in `ecosystem.config.cjs`. |
| 502 from Nginx | `pm2 status` — app not running? `pm2 logs pyc-smartsms` for the reason. |
