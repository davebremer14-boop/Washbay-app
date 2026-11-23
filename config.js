// ─────────────────────────────────────────────────────────────────────────────
// Washbay Checks – configuration. This is the ONLY file you need to edit.
// See SETUP.md for how to fill this in.
// After editing, bump CACHE_VERSION in sw.js so devices pick up the change.
// ─────────────────────────────────────────────────────────────────────────────
window.WASHBAY_CONFIG = {
  appTitle: "Washbay Checks",
  area: "Washbay",            // written to the Excel "Area" column
  site: "Cocos MOF",          // optional, e.g. "Henderson Yard" – written to "Site" column

  // How checks reach Excel:
  //   "none"          – store on device only (use "Export CSV" to get data out)
  //   "googlesheets"  – POST to a Google Apps Script web app on your Google Sheet (see GOOGLE_SHEETS_SETUP.md)
  //   "powerautomate" – POST to a Power Automate HTTP-trigger flow (Option A)
  //   "graph"         – write directly to SharePoint via Microsoft Graph (Option B)
  syncMode: "googlesheets",

  // ── Google Sheets (Apps Script web app) ───────────────────────────────────
  googleSheets: {
    // The "Web app URL" (ends in /exec) from Deploy › New deployment in Apps Script
    url: "https://script.google.com/macros/s/AKfycbwkUfNR-IsccWJ0YIVCfHWs55sD7AfWfAtXKtNKrMMTh5DXa-cd1qMDFTuEcUCpUf4XyQ/exec",
    // Must match ACCESS_KEY at the top of Code.gs
    accessKey: "WB-B18C3967D758"
  },

  // ── Option A: Power Automate ──────────────────────────────────────────────
  powerAutomate: {
    // The "HTTP POST URL" from the flow's "When an HTTP request is received" trigger
    url: "",
    // Web address of the SharePoint folder the flow saves photos into, ending in "/".
    // Used to put clickable photo links in the Excel rows.
    // e.g. "https://mcgroup.sharepoint.com/sites/Operations/Shared%20Documents/Washbay/Photos/"
    photoFolderUrl: "https://maritimeconstructions.sharepoint.com/sites/MC0483CocosMOFECI/Shared%20Documents/00%20DLP%20and%20Maintenance/00%20Checklist%20app/Photos/"
  },

  // ── Option B: Microsoft Graph (Azure app registration) ────────────────────
  graph: {
    clientId: "",               // Application (client) ID of the app registration
    tenantId: "",               // Directory (tenant) ID
    sharepointHost: "maritimeconstructions.sharepoint.com",
    sitePath: "/sites/MC0483CocosMOFECI",
    // Paths below are relative to the site's default "Documents" library
    workbookPath: "/00 DLP and Maintenance/00 Checklist app/Washbay_Checks_Database.xlsx",
    tableName: "Checks",
    photoFolder: "/00 DLP and Maintenance/00 Checklist app/Photos"   // folder must already exist
  }
};
