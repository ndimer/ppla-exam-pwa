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

## Forcing an update on a real device

The service worker caches all app files aggressively so the app works offline.
This means deploying new files is **not enough** — the device will keep serving the old cache
until it detects the service worker has changed.

### How updates propagate automatically

Every deploy should bump the cache version in `sw.js`:
```js
const CACHE = 'ppla-v4'; // increment on every deploy
```
When the browser fetches the new `sw.js` and sees a different cache name, it installs the new
worker and discards the old cache. This happens in the background — the user sees the update
**on the next app open** (not the current one).

### Forcing an immediate reload

#### iPhone / iPad — Safari (browser tab)
1. Open the page in Safari.
2. Pull down to refresh, or tap the address bar and press **Go**.
3. If still stale: **Settings → Safari → Clear History and Website Data** (clears all sites).
   For just one site: **Settings → Safari → Advanced → Website Data** → find the domain → swipe to delete.
4. Reopen the URL.

#### iPhone / iPad — installed PWA (home screen icon)
The PWA runs in a standalone context separate from Safari — clearing Safari data does **not** affect it.
1. **Delete the app** from the home screen (long-press → Remove App → Delete).
2. Open the URL in Safari again and reinstall via Share → Add to Home Screen.

This is the only reliable way to force a full reset of a Safari PWA cache.

#### Android — Chrome
1. Open Chrome, tap ⋮ → **Settings → Privacy and security → Clear browsing data**.
2. Tick *Cached images and files* and *Cookies and site data* for the site, then Clear.
3. Alternatively: open Chrome DevTools (via desktop remote debugging) →
   Application → Service Workers → **Unregister**, then reload.

#### Desktop (Chrome / Edge)
- Hard reload: `Cmd+Shift+R` (macOS) / `Ctrl+Shift+R` (Windows) — bypasses cache for the page but not the SW.
- Full reset: DevTools → Application → Service Workers → **Unregister** → reload the page.

#### Desktop (Safari)
- `Cmd+Option+R` for a hard reload.
- Or: Develop menu → **Empty Caches**, then reload.

---

### Why my change isn't showing up — checklist

| Symptom | Fix |
|---|---|
| New deploy, old content still visible | Bump `CACHE` version in `sw.js` and redeploy |
| Bumped version but still stale | Wait one full app close+reopen cycle |
| Installed PWA on iPhone never updates | Delete the home screen app, reinstall |
| Works on desktop but not phone | Phone is likely serving SW cache — delete and reinstall PWA |

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
