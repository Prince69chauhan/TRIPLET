# Deploying Triplet on Oracle Cloud Always Free (with Domain + HTTPS)

This guide walks through hosting Triplet on a **permanently free** Oracle Cloud
Ampere A1 VM (up to 4 ARM cores, 24 GB RAM) with a custom domain and
auto-renewing Let's Encrypt HTTPS via Caddy. Total cost: $0 for the VM + the
price of a domain (~$10/year, or free if you use DuckDNS).

> **You will be doing the clicks.** These instructions are for you to follow in
> the Oracle Cloud console, your domain registrar, and a terminal. The setup
> script refuses to start if DNS isn't pointing at the VM yet — this is
> deliberate, to avoid burning Let's Encrypt rate limits on failed issuance.

---

## 1. Get a domain

Options, in order of ease:

| Option | Cost | Notes |
|---|---|---|
| **DuckDNS** (e.g. `yourname.duckdns.org`) | Free | Fastest. Sign in with GitHub/Google at duckdns.org, claim a subdomain. |
| **Namecheap / Cloudflare Registrar / Porkbun** | ~$8–12/year | A real apex domain (e.g. `triplet.app`). |
| Existing domain you own | — | Just use a subdomain like `triplet.yourdomain.com`. |

Whatever you choose, note the domain name — you'll enter it as `DOMAIN` in
`.env` and point its **A record** at the VM's public IP in step 4.

## 2. Create an Oracle Cloud account

1. Go to <https://www.oracle.com/cloud/free/> → **Start for free**.
2. Sign up. Credit card is required for verification but **not charged** as
   long as you stay on Always Free resources.
3. Pick a home region close to you. Ampere A1 capacity varies by region.

## 3. Provision the Ampere A1 VM

1. In the Oracle Cloud console, open **Compute → Instances → Create instance**.
2. Configure:
   - **Name:** `triplet-prod`
   - **Image:** Canonical **Ubuntu 22.04**
   - **Shape:** *Change shape* → **Ampere** → `VM.Standard.A1.Flex`
   - **OCPUs:** 2 (up to 4 are free; 2 is enough for a few users)
   - **Memory:** 12 GB (up to 24 are free)
   - **Networking:** default VCN, **Assign public IPv4 address = Yes**
   - **SSH keys:** upload your public key (or let Oracle generate + download
     the private key — save it somewhere safe)
3. Click **Create**. *Out of host capacity* errors are common on Ampere; wait
   a few minutes and retry, or try another region.

## 4. Point DNS at the VM

Note the VM's **public IP** from the instance page, then at your registrar:

- **DuckDNS:** paste the IP in the *current ip* field for your subdomain, click *update ip*.
- **Cloudflare / Namecheap / etc.:** add an **A record**
  - Host: `@` (for apex `triplet.app`) or `triplet` (for subdomain `triplet.yourdomain.com`)
  - Value: `<VM_PUBLIC_IP>`
  - TTL: 1 min or Auto

Verify it resolves (may take 1–30 min to propagate):

```bash
dig +short triplet.yourdomain.com
# should print the VM's public IP
```

## 5. Open ports 80 + 443 in Oracle's VCN

Oracle's default VCN blocks inbound HTTP/HTTPS. Caddy needs **both**:
- port 80 for the Let's Encrypt HTTP challenge
- port 443 for serving the site

1. **Networking → Virtual cloud networks** → your VCN → **Security Lists** → default list.
2. **Add Ingress Rules** (add two):
   - Source `0.0.0.0/0`, TCP, Destination port `80`
   - Source `0.0.0.0/0`, TCP, Destination port `443`
3. Save.

## 6. SSH in and bootstrap

```bash
ssh -i ~/path/to/your_key ubuntu@<PUBLIC_IP>
```

Inside the VM:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/<your-username>/triplet.git
cd triplet

# First run: creates .env from the template and exits so you can edit it
bash deploy/oracle-setup.sh
```

The script will stop and tell you to edit `.env`:

```bash
nano .env
```

Fill in every `CHANGE_ME`. Generate strong values on the VM:

```bash
openssl rand -base64 24       # POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_PASSWORD
openssl rand -hex 32          # SECRET_KEY
```

Key entries:
- `DOMAIN=triplet.yourdomain.com` (no scheme, no slash)
- `ACME_EMAIL=you@example.com` (Let's Encrypt uses this for expiry notifications)
- Match the embedded passwords in `DATABASE_URL`, `SYNC_DATABASE_URL`,
  `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` to the
  `POSTGRES_PASSWORD` / `REDIS_PASSWORD` you just generated.

If you don't have SMTP yet, leave `SMTP_*` / `EMAIL_FROM` as non-empty
placeholders (e.g. `none@example.com`). The app will start; email features
won't work until you wire real SMTP credentials.

Then re-run:

```bash
bash deploy/oracle-setup.sh
```

This will:
1. Install Docker
2. Open firewall ports 80 + 443 on the host
3. Patch `requirements.txt` for ARM64 (torch wheel workaround)
4. Generate RSA keys
5. **Verify** that `$DOMAIN` resolves to this VM's public IP — aborts if not
6. Build images (10–15 min on ARM first time)
7. Start the stack

Caddy will then automatically request a Let's Encrypt certificate. Watch it happen:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
# look for: "certificate obtained successfully"
```

## 7. Verify

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
# all services should be "Up" / "healthy"
```

Open `https://triplet.yourdomain.com` in your browser. Green padlock = TLS is working.

## 8. Common operations

```bash
# Stop everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Deploy code changes
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Tail logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Tail just Caddy (cert issuance, HTTP traffic)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy

# Database shell
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db \
  psql -U triplet_user -d triplet
```

## 9. Known limitations of this setup

- **MinIO data lives on the VM disk.** If the VM is destroyed, uploaded
  resumes are gone. Good enough for a demo. For durability, swap MinIO for
  Oracle Object Storage (also free tier, 20 GB).
- **Single VM = single point of failure.** This is "a few users can try it"
  infrastructure, not multi-region HA.
- **First HTTP request is slow (~30 s)** while the SBERT model loads into RAM.
- **Let's Encrypt rate limits:** 5 failed issuance attempts per hour per
  domain. If you're iterating on DNS / firewall config, expect to wait an
  hour if you hit the wall. The `oracle-setup.sh` DNS pre-check exists to
  keep you from tripping this.
- **ARM64 patch to `backend/requirements.txt`** is applied locally on the VM
  only — don't commit it. x86 devs continue using `torch==2.3.0+cpu`.

## 10. Tearing it down

Oracle console → **Compute → Instances → triplet-prod → Terminate**. Tick
*permanently delete the attached boot volume* to avoid lingering storage
charges. Remove the DNS A record at your registrar. Done.
