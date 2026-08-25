# 2027 Gartner T&E Forecast Portal

This guide walks through getting this dashboard live, step by step, with no
coding experience assumed.

---

## What you'll need before starting

- A Google Cloud API key (you already have one from your other dashboards —
  see Step 1 below to confirm)
- A GitHub account
- A Vercel account
- The unzipped project folder (unzip `te-portal-2027.zip` somewhere on your
  computer, like your Desktop or Downloads folder)

---

## Step 1: Confirm your Google API key still works

You can reuse the same Google Cloud project and API key from your other
dashboards — you don't need to create a new one.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Make sure you're in the same project you used before (check the project
   name at the top of the page)
3. In the search bar at the top, type **Credentials** and click the result
   under "APIs & Services"
4. You should see your existing API key listed — click on it and copy the
   key value somewhere handy (like a notes app), you'll need it in Step 5

**One extra thing to check for this sheet specifically:** open the actual
Google Sheet in your browser, click **Share** (top right), and make sure
"General access" is set to **"Anyone with the link"** and the role is
**Viewer**. This is what lets the API key read it.

---

## Step 2: Create a new GitHub repository

1. Go to [github.com](https://github.com) and log in
2. Click the **+** icon in the top right → **New repository**
3. Give it a name, e.g. `te-portal-2027`
4. Leave everything else as default (Public or Private both work)
5. Click **Create repository**

---

## Step 3: Upload the project files to GitHub

1. On your new repository's page, click **uploading an existing file** (or
   **Add file → Upload files** if you don't see that link)
2. On your computer, open the unzipped `te-portal-2027` folder
3. Select everything **inside** that folder — all the files and folders
   like `index.html`, `app.js`, `api`, `lib`, `package.json`, etc. — and
   drag them all into the upload box on the GitHub page
   - Important: drag what's *inside* the folder, not the folder itself
4. Scroll down, type a short message like "Initial upload," and click
   **Commit changes**

Refresh the page — you should see all your files listed there.

---

## Step 4: Import the project into Vercel

1. Go to [vercel.com](https://vercel.com) and log in (use **Continue with
   GitHub** if this is your first time, so the two are linked)
2. Click **Add New...** → **Project**
3. Find `te-portal-2027` in the list of repositories and click **Import**

You'll land on a settings page — don't click Deploy yet, there are two
things to fill in first (Step 5).

---

## Step 5: Add your environment variables

Still on that Vercel settings page, find the section called **Environment
Variables** and add these two, one at a time (type the name, type the
value, click **Add**):

| Name | Value |
|---|---|
| `GOOGLE_API_KEY` | the API key you copied in Step 1 |
| `SPREADSHEET_ID` | `1_9iyAS18fYZTlY45AcSU2AdxtkKt_axpw5DnqKg0zHM` |

Leave every other setting on the page as its default.

---

## Step 6: Deploy

Click the big **Deploy** button. This takes 30–60 seconds. When it finishes,
click **Visit** (or the link it gives you) to open your live dashboard.

**If you see real data** (regions, conferences, people) — you're done! Skip
to Step 7 if you'd like to add a password, or you're finished.

**If you see an error message on the page instead of data**, check the
Troubleshooting section near the bottom of this guide — the most common
issues are covered there.

---

## Step 7 (optional): Add a password

This puts a simple login prompt in front of the whole site, so only people
who know the password can see it.

1. In Vercel, go to your project → **Settings → Environment Variables**
2. Add two more variables:

   | Name | Value |
   |---|---|
   | `SITE_USER` | any username you want |
   | `SITE_PASSWORD` | any password you want |

3. Go to the **Deployments** tab, find the most recent deployment, click
   the **⋯** menu next to it, and click **Redeploy**

The next time anyone visits the site, their browser will show a login box
asking for that username and password.

---

## Making changes later

Any time you want to update a file:

1. On GitHub, click into the file you want to change
2. Click the pencil (✏️) icon to edit it
3. Make your change, scroll down, add a short commit message, click
   **Commit changes**
4. Vercel automatically redeploys within about a minute — no extra steps
   needed

---

## Troubleshooting

**"API key not valid"** — Double-check you copied the whole key with no
extra spaces. Also check in Google Cloud Console under **Credentials** that
the key isn't restricted to only certain websites or APIs (or set it to
"Don't restrict key" while you're testing).

**"Unable to parse range" / a tab name error** — This means a tab name in
the code doesn't exactly match a tab name in your Google Sheet. Right-click
the tab in Google Sheets, choose Rename, and copy the exact text shown
(including spelling, spacing, and capitalization), then compare it against
the tab names used in `lib/sheets.js`.

**"Cannot GET /"** — This usually means the files ended up nested inside an
extra folder when uploaded to GitHub. Open your GitHub repo and check that
`index.html` is sitting at the very top level of the file list, not inside
another folder.

**The page loads but shows no data / an error box** — Almost always the
Google Sheet's sharing setting. Make sure it's set to "Anyone with the
link — Viewer" (see Step 1).

---

## For reference: what's different from the original T&E Interface

The 2027 sheet is structured differently from the one the original portal
was built against:

- **No cross-region "home region" badge** — there's no data source for it
  this year.
- **Cost Summary is a forecast, not a year-over-year comparison** — it's
  built from the "2027 SUMMARY" tab (region totals + per-event forecasts),
  since there's no 2025/2026 actuals tab this year.
- **Clash detection reads the sheet's own live "Clashes" tab** directly,
  instead of being recalculated by the website.
- **Currency is read from each region tab's own text**, and the "Show in
  USD" toggle uses the full "Peg Rates 2027" currency table.
- **The "Hotel" column is ignored**, per your instruction — some regions
  have it, some don't, and the site doesn't use it either way.

## For reference: project files

```
te-portal-2027/
├── api/te-forecast.js      # Talks to Google Sheets and returns the data
├── lib/sheets.js            # Fetches the raw sheet data
├── lib/parse.js              # Turns the raw sheet data into something usable
├── index.html                 # The page itself
├── style.css                   # Colors, fonts, layout
├── app.js                       # Makes the page interactive
├── server.js                     # For testing on your own computer (optional)
├── middleware.js                  # Adds the password prompt (optional)
├── .env.example                    # Template for your API key settings
└── package.json                     # Lists what the project needs to run
```
