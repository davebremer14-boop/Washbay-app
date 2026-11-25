// ─────────────────────────────────────────────────────────────────────────────
// CKI MOF Checks – configuration. See GOOGLE_SHEETS_SETUP.md.
// After editing, bump CACHE_VERSION in sw.js so devices pick up the change.
// ─────────────────────────────────────────────────────────────────────────────
window.WASHBAY_CONFIG = {
  appTitle: "CKI MOF Checks",
  site: "CKI MOF",            // written to the "Site" column

  // "googlesheets" = send to the Google Apps Script web app; "none" = keep on device only
  syncMode: "googlesheets",

  googleSheets: {
    // The "Web app URL" (ends in /exec) from Deploy › Manage deployments in Apps Script
    url: "https://script.google.com/macros/s/AKfycbzmvgIVQOur4p94CRqQGS8-WX1UHRrOF9IWCnmUkk3GHImj9Fa7exOQrmbd6cBO4QWnag/exec",
    // Must match ACCESS_KEY at the top of Code.gs
    accessKey: "WB-B18C3967D758"
  }
};
