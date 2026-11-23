/* Washbay Checks – offline-first inspection app.
 * Checks are saved to IndexedDB on the device, then synced to an Excel table in
 * SharePoint (via Power Automate or Microsoft Graph) whenever the device is online.
 * Plain JavaScript, no build step, no external services other than Microsoft 365.
 */
(function () {
  "use strict";

  const CFG = window.WASHBAY_CONFIG;
  const LIST = window.WASHBAY_CHECKLIST;
  const FREQS = ["Daily", "Weekly", "Monthly"];
  const APP_VERSION = "1.0.0";
  const KEEP_SYNCED_DAYS = 60;            // synced records kept on device for history
  const PHOTO_MAX_PX = 1600, PHOTO_QUALITY = 0.72;

  // Excel table columns – order MUST match the "Checks" table in the workbook.
  const COLUMNS = ["Submission ID", "Check Date", "Submitted At", "Frequency", "Site", "Area",
    "Item No", "Check Item", "Result", "Comment", "Photo", "All Photo Links",
    "Inspector", "Device", "Synced At"];

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : String(k));
    return e;
  };

  // ───────────────────────── storage helpers ─────────────────────────
  const ls = {
    get(k, d) { try { const v = localStorage.getItem("wb_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("wb_" + k, JSON.stringify(v)); } catch { /* ignore */ } }
  };

  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open("washbay", 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore("submissions", { keyPath: "id" });
        s.createIndex("status", "status");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("submissions", mode);
      const store = t.objectStore("submissions");
      let out;
      Promise.resolve(fn(store)).then((v) => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const putSub = (s) => tx("readwrite", (st) => reqP(st.put(s)));
  const allSubs = () => tx("readonly", (st) => reqP(st.getAll()));
  const delSub = (id) => tx("readwrite", (st) => reqP(st.delete(id)));

  // ───────────────────────── dates ─────────────────────────
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  // Excel serial numbers (local time) so Excel stores real dates regardless of locale
  const excelDate = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 25569;
  const excelDateTime = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 864e5 + 25569;
  const fmtDate = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtDT = (d) => d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  function periodStart(freq, d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (freq === "Weekly") { const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); } // Monday
    if (freq === "Monthly") x.setDate(1);
    return x;
  }
  function prevPeriodStart(freq, d) {
    const s = periodStart(freq, d);
    if (freq === "Daily") s.setDate(s.getDate() - 1);
    if (freq === "Weekly") s.setDate(s.getDate() - 7);
    if (freq === "Monthly") s.setMonth(s.getMonth() - 1);
    return s;
  }

  // ───────────────────────── device id ─────────────────────────
  function deviceId() {
    let id = ls.get("device");
    if (!id) {
      const ua = navigator.userAgent;
      const kind = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Device";
      id = kind + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      ls.set("device", id);
    }
    return id;
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ───────────────────────── UI: home ─────────────────────────
  function toast(msg, ms = 2500) {
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
  }

  function updateNet() {
    const n = $("#netState");
    n.textContent = navigator.onLine ? "Online" : "Offline";
    n.classList.toggle("off", !navigator.onLine);
  }

  async function renderHome() {
    const subs = await allSubs();
    const now = new Date();
    const wrap = $("#freqCards"); wrap.innerHTML = "";
    for (const f of FREQS) {
      const done = subs.filter((s) => s.frequency === f).map((s) => parseYmd(s.checkDate)).sort((a, b) => b - a);
      const last = done[0];
      let cls = "due", label = f === "Daily" ? "Due today" : f === "Weekly" ? "Due this week" : "Due this month";
      if (last && last >= periodStart(f, now)) { cls = "done"; label = "Done " + (f === "Daily" ? "today" : "– " + fmtDate(last)); }
      else if (!last) { label = "Not yet done on this device"; }
      else if (last < prevPeriodStart(f, now)) { cls = "over"; label = "Overdue – last " + fmtDate(last); }
      wrap.append(el("section", { class: "card freq" },
        el("div", {}, el("div", { class: "name" }, f), el("div", { class: "muted small" }, `${LIST[f].length} items`), el("span", { class: "status " + cls }, label)),
        el("button", { class: "btn primary", onclick: () => openCheck(f) }, "Start")));
    }

    // history
    const h = $("#history"); h.innerHTML = "";
    const recent = subs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 15);
    if (!recent.length) h.append(el("li", { class: "muted" }, "No checks yet."));
    for (const s of recent) {
      const fails = s.items.filter((i) => i.result === "Fail").length;
      h.append(el("li", {},
        el("div", {}, el("strong", {}, s.frequency), " · ", fmtDT(new Date(s.submittedAt)), el("br"),
          el("span", { class: "muted" }, s.inspector + (fails ? ` · ${fails} fail${fails > 1 ? "s" : ""}` : " · all OK"))),
        el("span", { class: "pill " + s.status, title: s.error || "" }, s.status === "synced" ? "Synced" : s.status === "error" ? "Retrying" : "Waiting")));
    }

    const pending = subs.filter((s) => s.status !== "synced").length;
    const lastSync = ls.get("lastSync");
    let summary;
    if (CFG.syncMode === "none") summary = "Sync not configured – data stays on this device. Use Export CSV.";
    else summary = (pending ? `${pending} check${pending > 1 ? "s" : ""} waiting to sync` : "Everything synced") +
      (lastSync ? ` · last sync ${fmtDT(new Date(lastSync))}` : "");
    $("#syncSummary").textContent = summary;
    $("#syncBtn").disabled = CFG.syncMode === "none";
  }

  // ───────────────────────── UI: checklist ─────────────────────────
  let current = null; // { frequency, answers: {no: {result, comment, photos:[{name, blob, url}]}} }

  function openCheck(freq) {
    const name = $("#inspector").value.trim();
    if (!name) { toast("Enter your name first"); $("#inspector").focus(); return; }
    current = { frequency: freq, answers: {} };
    $("#checkTitle").textContent = `${freq} check`;
    $("#checkMeta").textContent = `${CFG.area}${CFG.site ? " · " + CFG.site : ""} · ${fmtDate(new Date())} · ${name}`;
    $("#generalNotes").value = "";
    $("#formError").classList.add("hidden");
    const box = $("#items"); box.innerHTML = "";
    for (const it of LIST[freq]) {
      const a = current.answers[it.no] = { result: null, comment: "", photos: [] };
      const reqNote = el("span", { class: "req hidden" }, " – comment required for a Fail");
      const comment = el("textarea", { rows: 2, placeholder: "Comment / action taken" });
      comment.addEventListener("input", () => { a.comment = comment.value; });
      const photos = el("div", { class: "photos" });
      const fileIn = el("input", { type: "file", accept: "image/*", capture: "environment" });
      const card = el("section", { class: "card item", "data-no": it.no });
      const segBtns = ["Pass", "Fail", "N/A"].map((v) => el("button", {
        type: "button", "data-v": v, onclick: () => {
          a.result = v; card.classList.remove("missing");
          segBtns.forEach((b) => b.classList.toggle("on", b.dataset.v === v));
          reqNote.classList.toggle("hidden", v !== "Fail");
        }
      }, v));
      const renderPhotos = () => {
        photos.querySelectorAll(".thumb").forEach((t) => t.remove());
        a.photos.forEach((p, i) => photos.insertBefore(el("div", { class: "thumb" }, el("img", { src: p.url, alt: "photo" }),
          el("button", { type: "button", "aria-label": "Remove photo", onclick: () => { URL.revokeObjectURL(p.url); a.photos.splice(i, 1); renderPhotos(); } }, "×")), addBtn));
      };
      fileIn.addEventListener("change", async () => {
        for (const f of fileIn.files) {
          try {
            const blob = await compressImage(f);
            a.photos.push({ blob, url: URL.createObjectURL(blob) });
          } catch (e) { toast("Couldn't read that photo"); }
        }
        fileIn.value = ""; renderPhotos();
      });
      const addBtn = el("label", { class: "addphoto" }, "📷 Add photo", fileIn);
      photos.append(addBtn);
      card.append(
        el("div", { class: "q" }, el("span", { class: "no" }, it.no), it.text),
        el("div", { class: "seg" }, segBtns),
        el("div", { class: "extra" }, el("label", { class: "small muted" }, "Comment", reqNote), comment, photos));
      box.append(card);
    }
    show("check");
    window.scrollTo(0, 0);
  }

  function compressImage(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? res(b) : rej(new Error("compress failed"))), "image/jpeg", PHOTO_QUALITY);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); };
      img.src = url;
    });
  }

  async function submitCheck(ev) {
    ev.preventDefault();
    const err = $("#formError"); err.classList.add("hidden");
    const missing = [], needComment = [];
    for (const it of LIST[current.frequency]) {
      const a = current.answers[it.no];
      if (!a.result) missing.push(it.no);
      else if (a.result === "Fail" && !a.comment.trim()) needComment.push(it.no);
    }
    document.querySelectorAll(".item").forEach((c) => c.classList.toggle("missing", missing.includes(c.dataset.no) || needComment.includes(c.dataset.no)));
    if (missing.length || needComment.length) {
      err.textContent = (missing.length ? `Answer every item (missing: ${missing.join(", ")}). ` : "") +
        (needComment.length ? `Add a comment for failed item(s): ${needComment.join(", ")}.` : "");
      err.classList.remove("hidden");
      document.querySelector(".item.missing").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const now = new Date();
    const id = `WB-${ymd(now).replace(/-/g, "")}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${uid().slice(0, 4).toUpperCase()}`;
    const inspector = $("#inspector").value.trim();
    const items = LIST[current.frequency].map((it) => {
      const a = current.answers[it.no];
      return {
        no: it.no, text: it.text, result: a.result, comment: a.comment.trim(),
        photos: a.photos.map((p, i) => ({ name: `${id}_${it.no}_${i + 1}.jpg`, blob: p.blob }))
      };
    });
    const notes = $("#generalNotes").value.trim();
    if (notes) items.push({ no: current.frequency[0] + "-NOTE", text: "General notes", result: "Note", comment: notes, photos: [] });
    const sub = {
      id, frequency: current.frequency, area: CFG.area, site: CFG.site || "", inspector, device: deviceId(),
      checkDate: ymd(now), submittedAt: now.toISOString(), items,
      status: "pending", error: "", attempts: 0, uploaded: {}, rowsAdded: false
    };
    await putSub(sub);
    current.frequency && Object.values(current.answers).forEach((a) => a.photos.forEach((p) => URL.revokeObjectURL(p.url)));
    current = null;
    show("home");
    await renderHome();
    toast(navigator.onLine && CFG.syncMode !== "none" ? "Saved – syncing…" : "Saved on device ✓");
    syncAll();
  }

  function show(id) {
    for (const s of ["home", "check"]) $("#" + s).classList.toggle("hidden", s !== id);
  }

  // ───────────────────────── rows for Excel ─────────────────────────
  function buildRows(sub, photoUrl, formulaLinks) {
    const submitted = new Date(sub.submittedAt);
    const synced = new Date();
    return sub.items.map((it) => {
      const urls = it.photos.map((p) => photoUrl(p.name)).filter(Boolean);
      let first = urls[0] || "";
      if (first && formulaLinks) first = `=HYPERLINK("${first.replace(/"/g, '""')}","View photo${urls.length > 1 ? "s (" + urls.length + ")" : ""}")`;
      return [sub.id, excelDate(parseYmd(sub.checkDate)), excelDateTime(submitted), sub.frequency, sub.site, sub.area,
        it.no, it.text, it.result, it.comment, first, urls.join(" "), sub.inspector, sub.device, excelDateTime(synced)];
    });
  }

  // ───────────────────────── sync engine ─────────────────────────
  let syncing = false;
  async function syncAll(manual) {
    if (CFG.syncMode === "none") { if (manual) toast("Sync isn't configured yet (see SETUP.md)"); return; }
    if (syncing) return;
    if (!navigator.onLine) { if (manual) toast("No connection – will sync later"); return; }
    syncing = true;
    const msg = $("#syncMsg"); msg.className = "small"; msg.textContent = "Syncing…";
    let ok = 0, failed = 0, lastErr = "";
    try {
      const pending = (await allSubs()).filter((s) => s.status !== "synced").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      for (const sub of pending) {
        try {
          if (CFG.syncMode === "powerautomate") await syncPowerAutomate(sub);
          else if (CFG.syncMode === "graph") await syncGraph(sub);
          else throw new Error("Unknown syncMode: " + CFG.syncMode);
          sub.status = "synced"; sub.error = ""; sub.syncedAt = new Date().toISOString();
          sub.items.forEach((i) => i.photos.forEach((p) => { delete p.blob; })); // free device storage
          await putSub(sub); ok++;
        } catch (e) {
          if (e && e.needsSignIn) { lastErr = "Sign in to Microsoft to sync."; $("#signInBtn").classList.remove("hidden"); break; }
          sub.status = "error"; sub.error = String(e && e.message || e); sub.attempts = (sub.attempts || 0) + 1;
          await putSub(sub); failed++; lastErr = sub.error;
          if (!navigator.onLine) break;
        }
      }
      if (ok) ls.set("lastSync", new Date().toISOString());
      await pruneOld();
    } finally {
      syncing = false;
    }
    msg.textContent = lastErr ? lastErr : ok ? `Synced ${ok} check${ok > 1 ? "s" : ""} to Excel ✓` : "";
    if (lastErr) msg.className = "small err";
    if (manual && !ok && !lastErr) toast("Nothing to sync");
    renderHome();
  }

  async function pruneOld() {
    const cutoff = Date.now() - KEEP_SYNCED_DAYS * 864e5;
    for (const s of await allSubs()) if (s.status === "synced" && Date.parse(s.submittedAt) < cutoff) await delSub(s.id);
  }

  async function fetchOk(url, opts, what) {
    let r;
    try { r = await fetch(url, opts); } catch (e) { throw new Error(`${what}: network error`); }
    if (!r.ok) {
      let detail = ""; try { detail = (await r.text()).slice(0, 300); } catch { }
      const e = new Error(`${what} failed (${r.status}) ${detail}`); e.status = r.status; throw e;
    }
    return r;
  }

  const blobToBase64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

  // Option A – one POST per check to a Power Automate HTTP-trigger flow
  async function syncPowerAutomate(sub) {
    const pa = CFG.powerAutomate;
    if (!pa.url) throw new Error("Power Automate URL missing in config.js");
    const base = pa.photoFolderUrl ? pa.photoFolderUrl.replace(/\/?$/, "/") : "";
    const rows = buildRows(sub, (n) => (base ? base + encodeURIComponent(n) : n), false)
      .map((r) => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]])));
    const photos = [];
    for (const it of sub.items) for (const p of it.photos) {
      if (!p.blob) continue;
      photos.push({ fileName: p.name, itemNo: it.no, contentBase64: await blobToBase64(p.blob) });
    }
    await fetchOk(pa.url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: sub.id, frequency: sub.frequency, inspector: sub.inspector, checkDate: sub.checkDate, rows, photos })
    }, "Power Automate");
  }

  // Option B – Microsoft Graph, signed in with the user's Microsoft 365 account
  let msalApp = null;
  const GRAPH = "https://graph.microsoft.com/v1.0";
  const SCOPES = ["Sites.ReadWrite.All"];

  async function initMsal() {
    if (CFG.syncMode !== "graph") return;
    const g = CFG.graph;
    if (!g.clientId || !g.tenantId || !window.msal) { $("#syncMsg").textContent = "Graph settings missing in config.js"; return; }
    msalApp = new msal.PublicClientApplication({
      auth: { clientId: g.clientId, authority: `https://login.microsoftonline.com/${g.tenantId}`, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: "localStorage" }
    });
    await msalApp.initialize();
    try {
      const r = await msalApp.handleRedirectPromise();
      if (r && r.account) msalApp.setActiveAccount(r.account);
    } catch (e) { $("#syncMsg").textContent = "Sign-in error: " + e.message; }
    const acct = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0];
    if (acct) msalApp.setActiveAccount(acct);
    $("#signInBtn").classList.toggle("hidden", !!acct);
  }

  async function graphToken() {
    if (!msalApp) { const e = new Error("Graph not initialised"); e.needsSignIn = true; throw e; }
    const account = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0];
    if (!account) { const e = new Error("Not signed in"); e.needsSignIn = true; throw e; }
    try {
      return (await msalApp.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
    } catch (err) {
      if (err instanceof msal.InteractionRequiredAuthError) { const e = new Error("Sign-in expired"); e.needsSignIn = true; throw e; }
      throw err;
    }
  }

  async function graph(path, opts = {}, what = "Graph") {
    const token = await graphToken();
    const r = await fetchOk(GRAPH + path, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } }, what);
    return r.status === 204 ? null : r.json();
  }

  const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
  async function graphTargets() {
    const g = CFG.graph;
    const key = [g.sharepointHost, g.sitePath, g.workbookPath].join("|");
    const cached = ls.get("graphTargets");
    if (cached && cached.key === key) return cached;
    const site = await graph(`/sites/${g.sharepointHost}:${encPath(g.sitePath)}`, {}, "Find SharePoint site");
    const drive = await graph(`/sites/${site.id}/drive`, {}, "Find document library");
    const wb = await graph(`/drives/${drive.id}/root:${encPath(g.workbookPath)}`, {}, "Find workbook");
    const t = { key, driveId: drive.id, workbookId: wb.id };
    ls.set("graphTargets", t);
    return t;
  }

  async function syncGraph(sub) {
    const g = CFG.graph;
    const t = await graphTargets();
    // 1. upload photos (re-uploads are safe – same file name overwrites)
    for (const it of sub.items) for (const p of it.photos) {
      if (sub.uploaded[p.name] || !p.blob) continue;
      const res = await graph(`/drives/${t.driveId}/root:${encPath(g.photoFolder.replace(/\/$/, ""))}/${encodeURIComponent(p.name)}:/content`,
        { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: p.blob }, "Upload photo");
      sub.uploaded[p.name] = res.webUrl;
      await putSub(sub);
    }
    // 2. append rows to the Excel table
    if (!sub.rowsAdded) {
      const values = buildRows(sub, (n) => sub.uploaded[n] || "", true);
      await graph(`/drives/${t.driveId}/items/${t.workbookId}/workbook/tables/${encodeURIComponent(g.tableName)}/rows`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: null, values }) }, "Add rows to Excel");
      sub.rowsAdded = true;
      await putSub(sub);
    }
  }

  // ───────────────────────── CSV export (backup) ─────────────────────────
  async function exportCsv() {
    const subs = (await allSubs()).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    if (!subs.length) { toast("Nothing to export"); return; }
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [["Submission ID", "Check Date", "Submitted At", "Frequency", "Site", "Area", "Item No", "Check Item", "Result", "Comment", "Photo Files", "Inspector", "Device", "Sync Status"].join(",")];
    for (const s of subs) for (const it of s.items) {
      lines.push([s.id, s.checkDate, new Date(s.submittedAt).toLocaleString("en-AU"), s.frequency, s.site, s.area, it.no, it.text, it.result, it.comment,
        it.photos.map((p) => p.name).join(" "), s.inspector, s.device, s.status].map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `washbay_checks_${ymd(new Date())}.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  // ───────────────────────── boot ─────────────────────────
  async function boot() {
    document.title = CFG.appTitle; $("#appTitle").textContent = CFG.appTitle;
    $("#versionInfo").textContent = `v${APP_VERSION} · ${deviceId()} · sync: ${CFG.syncMode}`;
    const insp = $("#inspector");
    insp.value = ls.get("inspector", "");
    insp.addEventListener("change", () => ls.set("inspector", insp.value.trim()));
    $("#backBtn").addEventListener("click", () => {
      if (confirm("Discard this check?")) { current = null; show("home"); }
    });
    $("#checkForm").addEventListener("submit", submitCheck);
    $("#syncBtn").addEventListener("click", () => syncAll(true));
    $("#exportBtn").addEventListener("click", exportCsv);
    $("#signInBtn").addEventListener("click", () => msalApp && msalApp.loginRedirect({ scopes: SCOPES }));
    window.addEventListener("online", () => { updateNet(); syncAll(); });
    window.addEventListener("offline", updateNet);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderHome(); syncAll(); } });
    setInterval(() => syncAll(), 2 * 60 * 1000);
    updateNet();

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

    await renderHome();
    try { await initMsal(); } catch (e) { $("#syncMsg").textContent = "Sign-in unavailable: " + e.message; }
    syncAll();
  }

  window.__washbay = { allSubs, syncAll, buildRows, COLUMNS }; // for testing
  boot();
})();
