# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for Savvy so users can sign in with Google and sync data to their Google Drive.

---

## What you need to set up (once, as the developer)

| What | Why |
|---|---|
| Google Cloud Project | The container for all your API credentials |
| OAuth Consent Screen | The screen users see when signing in |
| OAuth Client ID | The key your app uses to talk to Google |
| 3 APIs enabled | Sheets, Drive, Gmail |

---

## Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. **Project name:** `Savvy Budget`
4. Click **Create**
5. Make sure the new project is selected in the top bar

---

## Step 2 — Enable the 3 required APIs

1. In the left sidebar click **APIs & Services → Library**
2. Search and enable each of these:

   | API | What it does |
   |---|---|
   | **Google Sheets API** | Read and write the user's budget spreadsheet |
   | **Google Drive API** | Find or create the spreadsheet in the user's Drive |
   | **Gmail API** | Import bank transaction emails automatically |

   For each: search the name → click the result → click **Enable**

---

## Step 3 — Configure the OAuth Consent Screen

This is the screen users see when they click "Sign in with Google".

1. Left sidebar → **APIs & Services → OAuth consent screen**  
   *(or Google Auth Platform → Branding)*
2. **User type:** External → **Create**
3. Fill in:
   - **App name:** `Savvy Budget`
   - **User support email:** your Gmail
   - **Developer contact email:** your Gmail
4. Click **Next** through Scopes and Test Users (no changes needed)
5. Click **Back to Dashboard**

> **Test Users:** While the app is in development, only accounts you add as test users can sign in.  
> Go to **Audience → Test users → + Add users** and add your Gmail address.

---

## Step 4 — Create the OAuth Client ID

1. Left sidebar → **Clients** (or Credentials → + Create Credentials → OAuth client ID)
2. **Application type:** `Web application`
3. **Name:** `Savvy Web`
4. Under **Authorized JavaScript origins** → **+ Add URI**:
   - `http://localhost:4200` ← for local development
   - `https://your-production-domain.com` ← add this when you deploy
5. Click **Create**
6. A popup shows your credentials — **copy the Client ID**

---

## Step 5 — Add credentials to .env

Open `savvy-ng/.env` and fill in your values:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_PROJECT_ID=your-project-id
```

> `.env` is gitignored — it will never be committed.  
> It is the **only** place credentials are stored.

---

## Step 6 — Run the app

```bash
cd savvy-ng
npm start
```

The build script automatically reads `.env` and injects the Client ID into the app.  
Open `http://localhost:4200` → Settings → **Sign in with Google**.

---

## What happens on first sign-in (user flow)

```
User taps "Sign in with Google"
  → Google shows consent screen (Sheets + Drive + Gmail access)
  → User approves
  → App silently creates "Savvy Budget" spreadsheet in their Drive
  → All data syncs automatically
  → No URLs, no scripts, no manual setup for the user
```

---

## Deploying to production

1. Add your production domain to **Authorized JavaScript origins** in the Google Cloud Console
2. Set `GOOGLE_CLIENT_ID` as an environment variable on your hosting platform (Vercel, Netlify, etc.)
3. Run `npm run build` — the script picks up the env var automatically

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` | Add `http://localhost:4200` to Authorized JavaScript origins in Google Cloud Console → Clients |
| `Error 400: origin_mismatch` | Same as above — the URL in your browser must exactly match an entry in Authorized JavaScript origins |
| `Error 403: access_denied` — "app not completed verification" | Add your Gmail address as a test user: Google Auth Platform → Audience → Test users → + Add users |
| `Drive GET 403: Google Drive API has not been used` | Go to APIs & Services → Library → search **Google Drive API** → Enable |
| `Sheets 403: Google Sheets API has not been used` | Go to APIs & Services → Library → search **Google Sheets API** → Enable |
| `Gmail 403: Gmail API has not been used` | Go to APIs & Services → Library → search **Gmail API** → Enable |
| Spreadsheet not created in Drive after sign-in | All 3 APIs must be enabled — check each one in the Library |
| `GOOGLE_CLIENT_ID is missing` | Check your `.env` file exists and has `GOOGLE_CLIENT_ID=...` |
| Sign-in popup doesn't appear | Run `npm start` (not `ng serve`) so the Client ID is injected first |
| `401 Unauthorized` on userinfo | Token expired — sign out and sign in again |

---

## Files involved

```
savvy-ng/
├── .env                          ← YOUR CREDENTIALS (never commit)
├── scripts/
│   └── set-env.js                ← reads .env → writes environment.ts
└── src/
    └── environments/
        └── environment.ts        ← auto-generated (gitignored)
```

```
src/app/core/services/
├── google-auth.service.ts        ← handles sign-in / token
├── drive.service.ts              ← finds or creates the spreadsheet
└── sheets.service.ts             ← reads and writes data via Sheets API
```
