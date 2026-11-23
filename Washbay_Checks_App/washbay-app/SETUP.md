# Washbay Checks – Setup Guide

An offline phone app for daily, weekly and monthly washbay checks. Checks are saved on the phone and sent to an Excel table in SharePoint automatically the next time the phone has signal. Everything runs on plain code and Microsoft 365. There's no Claude or other AI service involved.

## What's in the package

| File | Purpose |
|---|---|
| `index.html`, `app.js`, `app.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `lib/` | The app. Don't edit these unless you're changing how the app works. |
| `config.js` | **The settings file.** It controls where checks get synced to. |
| `checklist.js` | The checklist wording. Edit this to add or change items. |
| `Washbay_Checks_Database.xlsx` | The Excel database: a `Checks` table, a `Status` sheet (done / due / overdue) and a `Read Me` sheet. |

---

## Step 1 – Put the Excel file in SharePoint

1. Pick a SharePoint site, e.g. `https://mcgroup.sharepoint.com/sites/Operations`.
2. In that site's **Documents** library, create a folder called `Washbay`, and inside it a folder called `Photos`.
3. Upload `Washbay_Checks_Database.xlsx` into the `Washbay` folder.
4. Anyone doing checks needs **edit** access to this library. That applies to Option B; with Option A the flow writes using its owner's account.

Don't rename the `Checks` table or its column headings. The app writes to them.

## Step 2 – Host the app

The app needs to be served from an **HTTPS web address** so phones can install it. That's a browser rule. The host only serves the app files once. **No check data goes through it.** Data goes straight from the phone to Microsoft 365.

Pick one of these:

- **Azure Static Web Apps** (free tier, sits inside your Microsoft tenant). In the Azure Portal choose **Create → Static Web App → Deployment source: Other**, then upload the folder using the SWA CLI or Azure DevOps. IT will usually prefer this one.
- **GitHub Pages** (free). Push the folder to a repo and enable Pages.
- Any internal web server that has HTTPS.

SharePoint itself can't host the app, because it won't run HTML pages.

You'll end up with an address like `https://washbay-checks.azurestaticapps.net/`. You need it for Step 3 and Step 4.

## Step 3 – Connect the sync (choose A or B)

Open `config.js` and set `syncMode` to `"powerautomate"` or `"graph"`. Then fill in that option's section. **After any change to config.js, bump `CACHE_VERSION` in `sw.js`** (e.g. `washbay-v1.0.1`) so phones pick up the change.

Until you do this, leave `syncMode: "none"`. The app still works fully offline, and the **Export CSV** button gets data off the phone.

### Option A – Power Automate (recommended if you have a Premium licence)

There's no sign-in on the phones. Each check is sent to a flow, and the flow writes the rows and photos.
*This needs a Power Automate Premium licence for the flow owner, because the HTTP trigger is a premium connector.*

1. Go to make.powerautomate.com, then **Create → Instant cloud flow → "When an HTTP request is received"**.
2. In the trigger, set **Who can trigger the flow: Anyone**. Paste this into **Request Body JSON Schema**:

```json
{
  "type": "object",
  "properties": {
    "submissionId": { "type": "string" },
    "frequency":    { "type": "string" },
    "inspector":    { "type": "string" },
    "checkDate":    { "type": "string" },
    "rows":   { "type": "array", "items": { "type": "object" } },
    "photos": { "type": "array", "items": { "type": "object",
      "properties": { "fileName": {"type":"string"}, "itemNo": {"type":"string"}, "contentBase64": {"type":"string"} } } }
  }
}
```

3. Add **Apply to each**, and choose `photos` as the input. Inside it, add **SharePoint → Create file**:
   - Site Address: your site
   - Folder Path: `/Shared Documents/Washbay/Photos`
   - File Name: `items('Apply_to_each')?['fileName']`
   - File Content (expression): `base64ToBinary(items('Apply_to_each')?['contentBase64'])`
4. Add a second **Apply to each**, and choose `rows` as the input. Inside it, add **Excel Online (Business) → Add a row into a table**:
   - Location: your site. Document Library: Documents. File: `/Washbay/Washbay_Checks_Database.xlsx`. Table: `Checks`.
   - For every column, use an expression like `items('Apply_to_each_2')?['Check Date']`. The keys are exactly the column headings: `Submission ID`, `Check Date`, `Submitted At`, `Frequency`, `Site`, `Area`, `Item No`, `Check Item`, `Result`, `Comment`, `Photo`, `All Photo Links`, `Inspector`, `Device`, `Synced At`.
5. Add a **Response** action: Status code `200`, header `Access-Control-Allow-Origin` = `*`.
6. Save the flow. Copy the **HTTP POST URL** from the trigger into `config.js → powerAutomate.url`.
7. Set `powerAutomate.photoFolderUrl` to the web address of the Photos folder, ending with `/`. For example: `https://mcgroup.sharepoint.com/sites/Operations/Shared%20Documents/Washbay/Photos/`

Treat the flow URL like a password. Anyone who has it can post to the flow.

### Option B – Microsoft Graph (no extra licence, IT sets up once)

The phone writes directly to SharePoint using the inspector's own Microsoft 365 login.

1. IT goes to **Microsoft Entra admin centre → App registrations → New registration**.
   - Name: `Washbay Checks`. Supported accounts: *this organisation only*.
   - Redirect URI: choose platform **Single-page application (SPA)** and enter the app address from Step 2, e.g. `https://washbay-checks.azurestaticapps.net/`. Also add the same address with `index.html` on the end.
2. Under **API permissions**, add **Microsoft Graph → Delegated → Sites.ReadWrite.All**, then **Grant admin consent**.
3. Copy the **Application (client) ID** and **Directory (tenant) ID** into `config.js → graph`. Then fill in `sharepointHost`, `sitePath`, `workbookPath`, `tableName` and `photoFolder`.

What this means for users: when there are checks to sync, the app shows a **"Sign in to Microsoft to sync"** button. Microsoft only keeps that sign-in for a limited time (often about 24 hours), so expect to tap it roughly once a day while in signal. Checks sit safely on the phone until then.

## Step 4 – Install on phones

Open the app address **while online**, then:

- **iPhone/iPad:** open it in **Safari**, tap **Share → Add to Home Screen**.
- **Android:** open it in **Chrome**, tap **⋮ → Install app** (or Add to Home screen).

Always launch it from the home-screen icon. Once it's been opened once, it works with no signal.

---

## Day-to-day use

1. Open the app and enter your name. It's remembered after the first time.
2. Tap **Start** on Daily, Weekly or Monthly. Mark each item **Pass / Fail / N/A**, then add comments and photos. A comment is required for any Fail.
3. Tap **Submit**. The check is saved on the phone straight away.
4. **Syncing:** the app sends waiting checks when you submit, when the phone comes back online, every 2 minutes while it's open, or when you tap **Sync now**.
   - On iPhone, apps like this can't sync in the background. **Open the app once when you're back in signal** and it'll send everything.
5. In Excel, each submission becomes one row per item, plus a "General notes" row if notes were added. The **Status** sheet shows Done / Due / OVERDUE for each frequency across all devices.

## Changing the checklist

Edit `checklist.js`, keeping each `no` unique (D1, D2…). Then bump `CACHE_VERSION` in `sw.js` and upload the files again. Phones update the next time they open the app online.

The Status sheet's "Checks recorded" count uses the first item of each list (D1 / W1 / M1), so keep those numbers.

## Troubleshooting

| Symptom | Fix |
|---|---|
| History says "Retrying" | The error shows under **Sync to Excel** on the home screen. Usually it's a wrong path or table name in `config.js`, or the user lacks edit access. Checks keep retrying automatically. |
| "Find workbook failed (404)" | `workbookPath` is wrong. It's relative to the Documents library, e.g. `/Washbay/Washbay_Checks_Database.xlsx`. |
| Photo upload 404 | The `Photos` folder doesn't exist, or `photoFolder` is wrong. |
| Power Automate CORS / network error | Check the Response action includes the `Access-Control-Allow-Origin: *` header, and that the flow is turned on. |
| Changes to config don't appear | Bump `CACHE_VERSION` in `sw.js`, re-upload, then open the app online twice. |
| Phone lost, or app deleted before syncing | Unsynced checks on that phone are lost, so sync regularly. **Export CSV** is a manual backup. Don't clear Safari/Chrome website data while checks are waiting. |

Notes: synced checks stay in the phone's history for 60 days, and their photos are removed from the phone once they're uploaded. Duplicate rows can occur if the connection drops at exactly the wrong moment. The `Submission ID` column makes them easy to spot and remove.
