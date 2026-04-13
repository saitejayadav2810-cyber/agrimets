# AGRIMETS Mock Tests — Setup Guide
## Hosting on GitHub Pages + Custom Domain + Google AdSense

---

## STEP 1 — File Structure

Your repo root must contain these files:

```
/
├── index.html          ← Landing page (Phase 1)
├── mock.html           ← Mock test page
├── mock.js             ← Mock engine
├── mock-style.css      ← Mock styles
├── mock-tests.json     ← Question bank (1,972 questions)
├── sw.js               ← Service worker (offline support)
├── CNAME               ← Your custom domain (created in Step 4)
└── .github/
    └── workflows/
        └── deploy.yml  ← Auto-deploy on every push
```

---

## STEP 2 — Create GitHub Repository

1. Go to https://github.com/new
2. Name it anything, e.g. `agrimets-mock` (can be private or public)
3. **DO NOT** initialize with README (you'll push your files)
4. Click **Create repository**

Push your files:
```bash
cd your-project-folder
git init
git add .
git commit -m "Initial commit — mock test website"
git remote add origin https://github.com/YOUR_USERNAME/agrimets-mock.git
git branch -M main
git push -u origin main
```

---

## STEP 3 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages** (left sidebar)
2. Under **Source**, select: **GitHub Actions**
3. The deploy.yml will run automatically on every push
4. First deploy takes ~2 minutes. You'll see the URL:
   `https://YOUR_USERNAME.github.io/agrimets-mock/`

---

## STEP 4 — Connect Your Custom Domain

### 4a. Add CNAME file to repo root
Create a file called `CNAME` (no extension) containing only your domain:
```
yourdomain.com
```
or for subdomain:
```
mock.yourdomain.com
```

### 4b. Add DNS record at your domain registrar
Go to your domain's DNS settings (GoDaddy / Namecheap / Cloudflare / etc.)

**For apex domain (yourdomain.com) — add these A records:**
```
Type    Host    Value
A       @       185.199.108.153
A       @       185.199.109.153
A       @       185.199.110.153
A       @       185.199.111.153
```

**For subdomain (mock.yourdomain.com) — add this CNAME record:**
```
Type    Host    Value
CNAME   mock    YOUR_USERNAME.github.io
```

### 4c. Enable HTTPS in GitHub Settings
1. Repo → Settings → Pages
2. Under **Custom domain**, type your domain
3. Click **Save**
4. Wait 5-10 minutes for DNS to propagate
5. Check **Enforce HTTPS** once it appears

---

## STEP 5 — Apply for Google AdSense

### 5a. Sign up
1. Go to https://adsense.google.com
2. Sign in with Google account
3. Click **Get Started**
4. Enter your website URL (your custom domain, e.g. `https://yourdomain.com`)
5. Select your country
6. Accept terms → **Start using AdSense**

### 5b. Verify your site (add the AdSense code snippet)
AdSense gives you a snippet like this:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
```

Add it to the `<head>` of **both** `index.html` and `mock.html`:
```html
<!-- In <head> of index.html and mock.html -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ID_HERE" crossorigin="anonymous"></script>
```

Push the change to trigger a deploy. Then in AdSense:
1. Go to **Sites** → your site → **Review site**
2. Google will verify ownership (can take 1-3 days)

### 5c. AdSense eligibility requirements
Before applying, make sure your site has:
- ✅ Original content (your 1,972 questions qualify)
- ✅ A privacy policy page (add `privacy.html` — template below)
- ✅ A custom domain (not github.io)
- ✅ Some traffic history (ideally 2-4 weeks of real visitors)
- ✅ HTTPS enabled

### 5d. After approval — add ad units
Once approved, create ad units in AdSense dashboard:
1. **Ads** → **By ad unit** → **Display ads**
2. Name it (e.g. "Top Banner"), choose size "Responsive"
3. Copy the `<ins>` code snippet

Paste it into the `.ad-slot` divs already waiting in `mock.html`:
```html
<!-- Find this in mock.html and replace: -->
<div class="ad-slot" id="ad-top">
  <!-- ins class="adsbygoogle" ... goes here after AdSense approval -->
</div>

<!-- Replace with: -->
<div class="ad-slot" id="ad-top">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
       data-ad-slot="XXXXXXXXXX"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>
```

Do the same for `ad-results` (shown after each test result — high engagement spot).

---

## STEP 6 — Privacy Policy (required for AdSense)

Create `privacy.html` in your repo root. Minimum required content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Privacy Policy — AGRIMETS</title>
  <style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.7}</style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Last updated:</strong> [DATE]</p>
  <p>AGRIMETS ("we", "us") operates this mock test website.</p>

  <h2>Information We Collect</h2>
  <p>We do not collect personal information. Your test results are stored locally in your browser (localStorage) and are never sent to our servers.</p>

  <h2>Third-Party Advertising</h2>
  <p>We use Google AdSense to serve ads. Google may use cookies to serve ads based on your prior visits. You can opt out at <a href="https://www.google.com/settings/ads">Google Ad Settings</a>.</p>

  <h2>Cookies</h2>
  <p>We do not set cookies ourselves. Google AdSense may set cookies for ad personalisation.</p>

  <h2>Contact</h2>
  <p>Questions? Email: [YOUR_EMAIL]</p>
</body>
</html>
```

---

## STEP 7 — Update mock-tests.json (when you add new questions)

Just replace `mock-tests.json` in your repo and push. GitHub Actions will auto-deploy.

```bash
git add mock-tests.json
git commit -m "Add new questions — Test 28"
git push
```

The site re-deploys in ~2 minutes. The service worker will serve fresh data immediately.

---

## Quick Reference

| File | What to change |
|------|----------------|
| `CNAME` | Your custom domain |
| `index.html` | Site title, description, question counts |
| `mock.html` | AdSense `<ins>` tags after approval |
| `mock.js` | `MOCK_SCHEDULE` unlock hours |
| `mock-tests.json` | Question bank |
| `.github/workflows/deploy.yml` | Deployment config |

---

## Troubleshooting

**Site not loading after deploy:**
- Wait 5 min, then check GitHub → Actions tab for deploy status

**Custom domain not working:**
- DNS takes up to 48h to propagate globally
- Use https://dnschecker.org to verify your records

**AdSense not showing ads:**
- Ads take 24-48h to appear after approval
- Use Chrome DevTools → Network to confirm adsbygoogle.js loads

**Questions not loading (blank category screen):**
- Make sure `mock-tests.json` is in the same folder as `mock.html`
- Check browser console for 404 errors
