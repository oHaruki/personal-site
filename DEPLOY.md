# Deploying to the VPS

Push-button deploy: **GitHub → Actions → "Deploy to VPS" → Run workflow**. The
runner SSHes into the VPS and runs [`deploy.sh`](./deploy.sh), which just
`git pull`s — this is a static site, so nginx serves the checked-out files
directly. No build step, no process to restart.

| File | Runs where | Does what |
|---|---|---|
| [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) | GitHub runner | SSHes into the VPS, runs `deploy.sh` |
| [`deploy.sh`](./deploy.sh) | VPS | `git pull` only |

Two different SSH keys are involved, same as the other AimCup apps on this box:

1. **Deploy key** — lets the *VPS* `git pull` this private repo.
2. **Actions→VPS key** — lets the *GitHub runner* log into the VPS.

If you've already set up a deploy key / actions key for aimcup-mappool or
aimcup-stats on this box, you can reuse the **actions→VPS key** (same VPS user
logging in) — you only need a fresh **deploy key** per repo, since deploy keys
are scoped to one GitHub repo each.

---

## One-time setup

### 1. Deploy key (so `git pull` works on a private repo)

On the **VPS**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/personal_site_deploy -N "" -C "personal-site deploy key"
cat ~/.ssh/personal_site_deploy.pub
```

Add that **public** key at **GitHub → personal-site repo → Settings → Deploy
keys → Add deploy key** (leave "Allow write access" unchecked).

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com-personal-site
  HostName github.com
  User git
  IdentityFile ~/.ssh/personal_site_deploy
  IdentitiesOnly yes
EOF

git clone git@github.com-personal-site:oHaruki/personal-site.git /var/www/personal-site
```

### 2. nginx vhost

```nginx
server {
    listen 80;
    server_name byharuki.dev www.byharuki.dev;
    root /var/www/personal-site;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Save as `/etc/nginx/sites-available/byharuki.dev`, then:

```bash
sudo ln -s /etc/nginx/sites-available/byharuki.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Point `byharuki.dev` and `www.byharuki.dev` A records at the VPS's IP with
your domain registrar first, and give DNS a few minutes to propagate before
the next step.

Then get a cert:

```bash
sudo certbot --nginx -d byharuki.dev -d www.byharuki.dev
```

(certbot rewrites the server block to add the 443/SSL config and a
redirect from 80 — that's expected.)

### 3. Let the GitHub runner into the VPS

Skip this if you already did it for another AimCup repo on this box — reuse
the same key and just add a second repo's secrets pointing at the same
`VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`, with a different `VPS_APP_DIR`.

Otherwise, make a keypair (on your laptop or the VPS):

```bash
ssh-keygen -t ed25519 -f vps_ci -N "" -C "github-actions -> vps"
```

- Append `vps_ci.pub` to the VPS user's `~/.ssh/authorized_keys`.
- Add the **private** key `vps_ci` as the `VPS_SSH_KEY` secret below.

### 4. GitHub repo secrets

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | the app user |
| `VPS_SSH_KEY` | **private** key from step 3 |
| `VPS_APP_DIR` | `/var/www/personal-site` |
| `VPS_PORT` | *(optional)* SSH port; defaults to `22` |

---

## Deploying

Push commits to `main`, then **Actions → Deploy to VPS → Run workflow**.

Or from the VPS directly: `cd /var/www/personal-site && bash deploy.sh`.

### Troubleshooting

- **`git merge --ff-only` fails** — the box has local commits. `git status` to
  inspect; `git reset --hard origin/main` if local state is disposable.
- **Site not updating** — check nginx is pointed at `/var/www/personal-site`
  (`nginx -T | grep -A3 byharuki.dev`), not a stale copy elsewhere.
