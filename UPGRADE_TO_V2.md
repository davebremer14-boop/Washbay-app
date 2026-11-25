# Upgrading to CKI MOF Checks (v2)

There are three steps: update the Google script, update GitHub, then refresh the phones. Allow about 15 minutes.

## 1. Update the Google script

1. Open your **washbay checks** Google Sheet and go to **Extensions → Apps Script**.
2. Select everything in `Code.gs` and delete it. Paste in the new `google-apps-script/Code.gs`, then click **Save** 💾.
3. Choose **setup** in the function dropdown, then click **Run**. If Google asks for permission again, allow it the same way as last time (**Advanced → Go to … → Allow**).
4. Check the sheet. You should now see:
   - **Status**: rebuilt to cover all 8 forms.
   - **Submissions**: one row per completed form, with links to the PDF and signature.
   - **Items**: one row per checklist item, including Form and Section columns.
   - **Checks**: your old data, untouched.

   Two Drive folders also appear next to the sheet: **CKI MOF Check PDFs**, and **CKI MOF Check Photos** if you didn't already have the earlier photos folder.
5. Go to **Deploy → Manage deployments**, click ✏️ **Edit**, set **Version: New version**, then click **Deploy**. Your web app URL stays the same, so `config.js` doesn't change.
   **Don't** use "New deployment". That creates a different URL.

## 2. Update GitHub

In your Washbay-app repo, click **Add file → Upload files** and drag in all of the following, then **Commit changes**:

- `index.html`, `app.js`, `app.css`, `config.js`, `forms.js`, `sw.js`, `manifest.webmanifest`
- the `img` folder (the splash picture and logo)
- the `icons` folder (new app icons)

The old `checklist.js` and `lib` folder aren't used any more. You can delete them from the repo, or leave them.

## 3. Phones

1. **Before updating, make sure each phone has synced.** Open the old app with signal and check it says "Everything synced".
2. Open the app with signal, close it, then open it again. You should see the splash screen and the new home screen. The bottom line should read **v2.0.0**.
3. The icon on the home screen keeps its old name and picture until it's re-added. To get the new "CKI MOF" icon, delete the home-screen icon and add it again from the link (Safari: **Share → Add to Home Screen**; Chrome: **⋮ → Install app**).
   ⚠️ On iPhone, deleting the icon also deletes anything that hasn't synced yet. **Only do this after the app says "Everything synced".**

## What's new

- **8 forms**:
  - Washbay: Washbay Daily, Washbay Prestart, Washbay Operator Checklist (weekly operational / monthly standby), Monthly – FPOE & Washbay, Annual – FPOE & Washbay.
  - HPU Prestart, in English with Malay.
  - Plant maintenance: Service Record (sections are added by service type) and Maintenance Record (you add each task).
- **Signature** on every form, saved to Drive.
- **PDF copy** of every completed form, saved to the "CKI MOF Check PDFs" folder and linked from the Submissions tab.
- **Drafts**: if you leave a form part-way through, it's kept, and **Resume** picks it up again. **Start fresh** clears it.
- **Readings** (polishing pump kPa) and **IBC levels**. An IBC below ½ is recorded as a Fault automatically.
- A comment is still required for every Fault, "Action required" or "Not done".

## Changing forms later

All wording lives in `forms.js`. To add an item, put it at the **end** of its section so existing item numbers don't change. After any edit:

1. Bump `CACHE_VERSION` in `sw.js` (e.g. `cki-v2.0.1`).
2. Upload both files to GitHub.

If you rename a form, update its name in `STATUS_ROWS` at the top of `Code.gs` too, then run **setup** again and deploy a new version.
