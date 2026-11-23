// ─────────────────────────────────────────────────────────────────────────────
// Washbay Checks – configuration. This is the ONLY file you need to edit.
// See SETUP.md for how to fill this in.
// After editing, bump CACHE_VERSION in sw.js so devices pick up the change.
// ─────────────────────────────────────────────────────────────────────────────
window.WASHBAY_CONFIG = {
  appTitle: "Washbay Checks",
  area: "Washbay",            // written to the Excel "Area" column
  site: "",                   // optional, e.g. "Henderson Yard" – written to "Site" column

  // How checks reach Excel:
  //   "none"          – store on device only (use "Export CSV" to get data out)
  //   "powerautomate" – POST to a Power Automate HTTP-trigger flow (Option A)
  //   "graph"         – write directly to SharePoint via Microsoft Graph (Option B)
  syncMode: "none",

  // ── Option A: Power Automate ──────────────────────────────────────────────
  powerAutomate: {
    // The "HTTP POST URL" from the flow's "When an HTTP request is received" trigger
    url: "",
    // Web address of the SharePoint folder the flow saves photos into, ending in "/".
    // Used to put clickable photo links in the Excel rows.
    // e.g. "https://mcgroup.sharepoint.com/sites/Operations/Shared%20Documents/Washbay/Photos/"
    photoFolderUrl: ""
  },

  // ── Option B: Microsoft Graph (Azure app registration) ────────────────────
  graph: {
    clientId: "",               // Application (client) ID of the app registration
    tenantId: "",               // Directory (tenant) ID
    sharepointHost: "",         // e.g. "mcgroup.sharepoint.com"
    sitePath: "",               // e.g. "/sites/Operations"
    // Paths below are relative to the site's default "Documents" library
    workbookPath: "/Washbay/Washbay_Checks_Database.xlsx",
    tableName: "Checks",
    photoFolder: "/Washbay/Photos"   // folder must already exist
  }
};
