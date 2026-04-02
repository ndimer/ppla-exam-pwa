# PPL-A Prawo Lotnicze — Quiz PWA

A static Progressive Web App (no server required). Works offline after first visit. Saves answers and current page in `localStorage`.

## Quick start (local)

```bash
# From the parent ppla-questions/ directory:
node generate-json.js          # parse Prawo.md → pwa/data/questions.json

# Serve the pwa/ folder (any static server):
npx serve pwa
# or
python3 -m http.server 8080 --directory pwa
```

Open http://localhost:8080 (or 3000 with `serve`).

> **Note:** `file://` protocol does NOT work — browsers block `fetch()` for local files.
> You must use a local HTTP server.

---

## Deploy to GitHub Pages

1. Push the repo to GitHub.
2. Copy the `pwa/` folder contents to a `gh-pages` branch (or configure Pages to serve from `/pwa`).

**Option A — deploy `pwa/` as the root:**
```bash
# From repo root
git subtree push --prefix pwa origin gh-pages
```
Then in **Settings → Pages**, set source to branch `gh-pages` / root.

**Option B — serve from `/pwa` subdirectory:**
In **Settings → Pages**, set source to `main` branch, folder `/pwa`.

The app will be live at `https://<username>.github.io/<repo>/`.

> If serving from a subdirectory, open `sw.js` and change the `PRECACHE` paths
> to include the base path, e.g. `'/repo/pwa/'` instead of `'./'`.

---

## Deploy to Ubuntu server (nginx)

### 1. Install nginx
```bash
sudo apt update && sudo apt install -y nginx
```

### 2. Upload files
```bash
# Replace user@host and /var/www/ppla with your values
scp -r pwa/* user@host:/var/www/ppla/
```

### 3. Configure nginx
```nginx
# /etc/nginx/sites-available/ppla
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/ppla;
    index index.html;

    # Cache static assets aggressively
    location ~* \.(js|json|svg|png|ico)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Always serve index.html (SPA fallback)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ppla /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Enable HTTPS (required for PWA install prompt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Updating questions

Re-run `node generate-json.js` from the parent directory whenever `Prawo.md` changes,
then redeploy the updated `pwa/data/questions.json`.

---

## Project structure

```
pwa/
├── index.html          # App shell
├── app.js              # All app logic (vanilla JS, no framework)
├── sw.js               # Service worker (offline support)
├── manifest.json       # PWA manifest
├── icon.svg            # App icon
├── data/
│   └── questions.json  # Generated from Prawo.md
└── README.md
```
