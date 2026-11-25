/* CKI MOF Checks – offline-first inspection app.
 * Forms are defined in forms.js. Completed forms are saved to IndexedDB on the device,
 * then sent to a Google Apps Script web app (your Google Sheet) whenever the device is online.
 * Plain JavaScript, no build step, no external services other than your Google account.
 */
(function () {
  "use strict";

  const CFG = window.WASHBAY_CONFIG;
  const FORMS = window.CKI_FORMS;
  const K = window.CKI_CONST;
  const APP_VERSION = "2.0.0";
  const KEEP_SYNCED_DAYS = 60;
  const PHOTO_MAX_PX = 1600, PHOTO_QUALITY = 0.72;
  const PREFIX = { "washbay-daily": "WD", "washbay-prestart": "WP", "washbay-operator": "WO", "fpoe-monthly": "FM", "fpoe-annual": "FA", "hpu-prestart": "HPU", "service-record": "SR", "maintenance-record": "MR" };

  const SUB_COLS = ["Submission ID", "Check Date", "Submitted At", "Form", "Mode / Type", "Site", "Asset", "Location", "Hours", "Aux Hours",
    "Work Order", "Labour Hours", "Performed By", "PPE", "Items", "Faults", "Comments", "Spare Parts", "Faults Received By", "WO Issued",
    "Signature", "PDF", "Inspector", "Device", "Synced At"];
  const ITEM_COLS = ["Submission ID", "Check Date", "Submitted At", "Form", "Mode / Type", "Site", "Asset", "Section", "Item No", "Check Item",
    "Result", "Reading", "Comment", "Photo", "All Photo Links", "Inspector", "Device", "Synced At"];

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : String(k));
    return e;
  };
  const formById = (id) => FORMS.find((f) => f.id === id);
  const isFault = (r) => K.FAULT_VALUES.includes(r);

  // ───────────────────────── storage ─────────────────────────
  const ls = {
    get(k, d) { try { const v = localStorage.getItem("wb_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("wb_" + k, JSON.stringify(v)); } catch { } }
  };
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open("washbay", 2);   // same database as v1 so queued checks survive the upgrade
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("submissions")) d.createObjectStore("submissions", { keyPath: "id" }).createIndex("status", "status");
        if (!d.objectStoreNames.contains("drafts")) d.createObjectStore("drafts", { keyPath: "formId" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      Promise.resolve(fn(t.objectStore(store))).then((v) => { out = v; });
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const putSub = (s) => tx("submissions", "readwrite", (st) => reqP(st.put(s)));
  const allSubs = () => tx("submissions", "readonly", (st) => reqP(st.getAll()));
  const delSub = (id) => tx("submissions", "readwrite", (st) => reqP(st.delete(id)));
  const getDraft = (id) => tx("drafts", "readonly", (st) => reqP(st.get(id)));
  const putDraft = (d) => tx("drafts", "readwrite", (st) => reqP(st.put(d)));
  const delDraft = (id) => tx("drafts", "readwrite", (st) => reqP(st.delete(id)));

  // ───────────────────────── dates ─────────────────────────
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const excelDate = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 25569;
  const excelDateTime = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 864e5 + 25569;
  const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const fmtShort = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const fmtDT = (d) => d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

  function periodStart(sched, d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (sched === "weekly") x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    if (sched === "monthly") x.setDate(1);
    return x;
  }
  function prevPeriodStart(sched, d) {
    const s = periodStart(sched, d);
    if (sched === "daily") s.setDate(s.getDate() - 1);
    if (sched === "weekly") s.setDate(s.getDate() - 7);
    if (sched === "monthly") s.setMonth(s.getMonth() - 1);
    return s;
  }

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
  const rand4 = () => Math.random().toString(36).slice(2, 6).toUpperCase();

  // ───────────────────────── form structure ─────────────────────────
  function sectionsFor(form, st) {
    if (!form.sections) return [];
    let tiers = null;
    if (form.tierBy) tiers = form.tierBy.map[st.header[form.tierBy.field]] || [];
    return form.sections.map((s, si) => ({
      idx: si, no: String(si + 1), title: s.title, malay: s.malay, sectionComment: s.sectionComment, tier: s.tier,
      items: s.items.map((it, ii) => {
        const o = typeof it === "string" ? { text: it } : it;
        return Object.assign({}, o, { no: `${si + 1}${String.fromCharCode(65 + ii)}`, answers: o.answers || s.answers || form.answers || ["OK", "Fault"] });
      })
    })).filter((s) => !tiers || tiers.includes(s.tier));
  }
  function levelsResult(it, a) {
    const vals = it.levels.map((l) => (a.levels || {})[l]);
    if (vals.some((v) => !v)) return null;
    return vals.some((v) => K.LOW_LEVELS.includes(v)) ? "Fault" : "OK";
  }
  function scheduleOf(form, mode) {
    if (form.schedule !== "mode") return form.schedule;
    const m = form.modes.options.find((o) => o.value === mode);
    return m ? m.schedule : "weekly";
  }

  // ───────────────────────── home ─────────────────────────
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
  }
  function updateNet() {
    const n = $("#netState"); n.textContent = navigator.onLine ? "Online" : "Offline"; n.classList.toggle("off", !navigator.onLine);
  }

  function statusFor(form, subs, now) {
    const mine = subs.filter((s) => s.formId === form.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const last = mine[0];
    if (form.schedule === "each" || form.schedule === "none") {
      if (!last) return { cls: "info", label: form.schedule === "each" ? "Each use · none yet on this device" : "None yet on this device" };
      const d = new Date(last.submittedAt);
      const extra = last.headerCols && last.headerCols.Asset ? ` · ${last.headerCols.Asset}${last.mode ? " " + last.mode : ""}` : "";
      return { cls: "info", label: (ymd(d) === ymd(now) ? `Last today ${fmtTime(d)}` : `Last ${fmtShort(d)}`) + extra };
    }
    if (!last) return { cls: "due", label: "Not yet done on this device" };
    const lastDate = parseYmd(last.checkDate);
    const sched = scheduleOf(form, last.mode);
    if (sched === "annual") {
      const due = new Date(lastDate); due.setFullYear(due.getFullYear() + 1);
      const soon = new Date(due); soon.setMonth(soon.getMonth() - 1);
      if (now > due) return { cls: "over", label: "Overdue – last " + fmtDate(lastDate) };
      if (now >= soon) return { cls: "due", label: "Due by " + fmtDate(due) };
      return { cls: "done", label: "Done " + fmtDate(lastDate) };
    }
    const word = { daily: "today", weekly: "this week", monthly: "this month" }[sched];
    const modeTxt = form.schedule === "mode" ? ` (${last.mode.split(" – ")[0].toLowerCase()})` : "";
    if (lastDate >= periodStart(sched, now)) return { cls: "done", label: `Done ${word}${modeTxt}` };
    if (lastDate >= prevPeriodStart(sched, now)) return { cls: "due", label: `Due ${word}${modeTxt}` };
    return { cls: "over", label: "Overdue – last " + fmtDate(lastDate) };
  }

  async function renderHome() {
    const subs = await allSubs();
    const now = new Date();
    const wrap = $("#formTiles"); wrap.innerHTML = "";
    let group = null;
    for (const f of FORMS) {
      if (f.group !== group) { group = f.group; wrap.append(el("div", { class: "grp" }, group)); }
      const s = statusFor(f, subs, now);
      const hasDraft = drafts.has(f.id);
      wrap.append(el("section", { class: "card tile" },
        el("div", {}, el("div", { class: "name" }, f.title),
          el("span", { class: "status " + s.cls }, s.label),
          hasDraft ? el("span", { class: "status draft" }, "Draft saved") : null),
        el("button", { class: "btn primary", onclick: () => openForm(f.id) }, hasDraft ? "Resume" : "Start")));
    }
    const h = $("#history"); h.innerHTML = "";
    const recent = subs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 15);
    if (!recent.length) h.append(el("li", { class: "muted" }, "Nothing yet."));
    for (const s of recent) {
      const fails = s.items.filter((i) => isFault(i.result)).length;
      h.append(el("li", {},
        el("div", {}, el("strong", {}, s.formTitle || ("Washbay " + s.frequency)), " · ", fmtDT(new Date(s.submittedAt)), el("br"),
          el("span", { class: "muted" }, s.inspector + (s.headerCols && s.headerCols.Asset && !formById(s.formId || "")?.fixedAsset ? " · " + s.headerCols.Asset : "") + (fails ? ` · ${fails} fault${fails > 1 ? "s" : ""}` : " · all OK"))),
        el("span", { class: "pill " + s.status }, s.status === "synced" ? "Synced" : s.status === "error" ? "Retrying" : "Waiting")));
    }
    const pending = subs.filter((s) => s.status !== "synced").length;
    const lastSync = ls.get("lastSync");
    $("#syncSummary").textContent = CFG.syncMode === "none" ? "Sync not configured – data stays on this device."
      : (pending ? `${pending} form${pending > 1 ? "s" : ""} waiting to sync` : "Everything synced") + (lastSync ? ` · last sync ${fmtDT(new Date(lastSync))}` : "");
    $("#syncBtn").disabled = CFG.syncMode === "none";
  }

  // ───────────────────────── form state & drafts ─────────────────────────
  let cur = null;          // current form state
  let drafts = new Set();  // form ids with a saved draft
  let saveT = null;
  const objUrls = [];

  function newState(form) {
    const st = { formId: form.id, startedAt: new Date().toISOString(), header: {}, footer: {}, extras: {}, mode: "", ack: false,
      answers: {}, secNotes: {}, tasks: [], comments: "", signature: null, open: {} };
    for (const f of form.header || []) {
      if (f.default) st.header[f.key] = f.default;
      if (f.defaultInspector) st.header[f.key] = $("#inspector").value.trim();
      if (f.type === "multichips") st.header[f.key] = [];
    }
    if (form.freeTasks) st.tasks.push(newTask());
    return st;
  }
  const newTask = () => ({ id: rand4(), text: "", result: null, comment: "", photos: [] });
  const ans = (no) => cur.answers[no] || (cur.answers[no] = { result: null, comment: "", reading: "", levels: {}, photos: [] });

  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      if (!cur) return;
      cur.savedAt = new Date().toISOString();
      try { await putDraft(cur); drafts.add(cur.formId); } catch (e) { /* storage full – ignore */ }
    }, 500);
  }

  async function openForm(id) {
    const insp = $("#inspector").value.trim();
    if (!insp) { toast("Enter your name first"); $("#inspector").focus(); return; }
    const form = formById(id);
    const d = await getDraft(id).catch(() => null);
    cur = d || newState(form);
    $("#formTitle").textContent = form.title;
    $("#formDraftNote").textContent = d ? `Draft from ${fmtDT(new Date(d.savedAt || d.startedAt))} restored · ` : "";
    $("#discardBtn").classList.toggle("hidden", !d);
    $("#formError").classList.add("hidden");
    renderForm();
    show("form"); window.scrollTo(0, 0);
  }

  // ───────────────────────── form rendering ─────────────────────────
  function rerender() { const y = window.scrollY; renderForm(); window.scrollTo(0, y); }

  function chips(options, isOn, onPick, cls = "") {
    return el("div", { class: "chips " + cls }, options.map((o) => el("button", { type: "button", class: isOn(o) ? "on" : "", onclick: () => onPick(o) }, o)));
  }

  function fieldEl(f, store, form) {
    const val = store[f.key];
    const lbl = el("label", { class: "lbl" }, f.label, f.malay ? el("span", { class: "ms" }, " · " + f.malay) : null, f.required ? el("span", { class: "reqstar" }, " *") : null);
    const wrapAttrs = { class: "field", "data-field": f.key };
    if (f.type === "chips") return el("div", wrapAttrs, lbl, chips(f.options, (o) => val === o, (o) => { store[f.key] = o; saveSoon(); if (form.tierBy && form.tierBy.field === f.key) rerender(); else rerender(); }));
    if (f.type === "multichips") return el("div", wrapAttrs, lbl, chips(f.options, (o) => (val || []).includes(o), (o) => {
      const a = store[f.key] || (store[f.key] = []); const i = a.indexOf(o); i >= 0 ? a.splice(i, 1) : a.push(o); saveSoon(); rerender(); }));
    if (f.type === "select") {
      const opts = f.options.concat(f.other ? ["Other"] : []);
      const isOther = val && !f.options.includes(val);
      const sel = el("select", { onchange: (e) => { store[f.key] = e.target.value === "Other" ? " " : e.target.value; saveSoon(); rerender(); } },
        el("option", { value: "" }, "Select…"), opts.map((o) => { const op = el("option", { value: o }, o); if ((o === "Other" && isOther) || o === val) op.selected = true; return op; }));
      const other = isOther ? el("input", { type: "text", placeholder: "Enter asset name / ID", value: val.trim(), oninput: (e) => { store[f.key] = e.target.value || " "; saveSoon(); } }) : null;
      return el("div", wrapAttrs, lbl, sel, other);
    }
    return el("div", wrapAttrs, lbl, el("input", { type: f.type === "number" ? "text" : "text", inputmode: f.type === "number" ? "decimal" : null, value: val || "",
      oninput: (e) => { store[f.key] = e.target.value; saveSoon(); } }));
  }

  function photosEl(list) {
    const box = el("div", { class: "photos" });
    list.forEach((p, i) => {
      const u = URL.createObjectURL(p.blob); objUrls.push(u);
      box.append(el("div", { class: "thumb" }, el("img", { src: u, alt: "photo" }),
        el("button", { type: "button", "aria-label": "Remove photo", onclick: () => { list.splice(i, 1); saveSoon(); rerender(); } }, "×")));
    });
    const inp = el("input", { type: "file", accept: "image/*", capture: "environment" });
    inp.addEventListener("change", async () => {
      for (const f of inp.files) { try { list.push({ blob: await compressImage(f) }); } catch { toast("Couldn't read that photo"); } }
      saveSoon(); rerender();
    });
    box.append(el("label", { class: "addphoto" }, "📷 Add photo", inp));
    return box;
  }

  function itemEl(form, it) {
    const a = ans(it.no);
    const card = el("section", { class: "card item", "data-no": it.no });
    const head = el("div", { class: "q" }, el("span", { class: "no" }, it.no), it.text);
    card.append(head);
    if (it.malay) card.append(el("div", { class: "ms" }, it.malay));
    if (it.hint) card.append(el("div", { class: "hint" }, it.hint));

    if (it.levels) {
      for (const l of it.levels) {
        card.append(el("div", { class: "lbl small" }, l), chips(K.IBC_LEVELS, (o) => (a.levels || {})[l] === o, (o) => {
          (a.levels || (a.levels = {}))[l] = o; a.result = levelsResult(it, a); saveSoon(); rerender(); }, "levels"));
      }
      const r = levelsResult(it, a);
      if (r === "Fault") card.append(el("div", { class: "req" }, "Level below ½ – recorded as a Fault"));
      else if (r === "OK") card.append(el("div", { class: "okmsg" }, "All levels ½ or above ✓"));
    } else {
      if (it.reading) card.append(el("div", { class: "reading" }, el("input", { type: "text", inputmode: "decimal", placeholder: "Reading", value: a.reading || "",
        oninput: (e) => { a.reading = e.target.value; saveSoon(); } }), el("span", {}, it.reading)));
      const seg = el("div", { class: "seg n" + it.answers.length });
      it.answers.forEach((v) => seg.append(el("button", { type: "button", "data-v": v, class: (a.result === v ? "on " : "") + (isFault(v) ? "bad" : v === "N/A" ? "na" : "good"),
        onclick: () => { a.result = v; saveSoon(); rerender(); } }, v, form.answerMalay && form.answerMalay[v] !== v ? el("small", {}, form.answerMalay[v]) : null)));
      card.append(seg);
    }
    const needC = isFault(a.result) && !it.levels;
    card.append(el("div", { class: "extra" },
      el("label", { class: "small muted" }, "Comment", needC ? el("span", { class: "req" }, " – required for " + a.result) : null),
      el("textarea", { rows: 2, placeholder: "Comment / action taken", value: a.comment || "", oninput: (e) => { a.comment = e.target.value; saveSoon(); } }),
      photosEl(a.photos)));
    return card;
  }

  function taskEl(form, t, i) {
    const card = el("section", { class: "card item", "data-no": "T" + (i + 1) });
    card.append(el("div", { class: "row between" }, el("div", { class: "lbl" }, `Task ${i + 1}`),
      cur.tasks.length > 1 ? el("button", { type: "button", class: "btn link small", onclick: () => { cur.tasks.splice(i, 1); saveSoon(); rerender(); } }, "Remove") : null));
    card.append(el("input", { type: "text", placeholder: "Task performed", value: t.text, oninput: (e) => { t.text = e.target.value; saveSoon(); } }));
    const seg = el("div", { class: "seg n2", style: "margin-top:8px" });
    form.freeTasks.answers.forEach((v) => seg.append(el("button", { type: "button", "data-v": v, class: (t.result === v ? "on " : "") + (isFault(v) ? "bad" : "good"),
      onclick: () => { t.result = v; saveSoon(); rerender(); } }, v)));
    card.append(seg);
    card.append(el("div", { class: "extra" },
      el("label", { class: "small muted" }, "Comments", isFault(t.result) ? el("span", { class: "req" }, " – required") : null),
      el("textarea", { rows: 2, value: t.comment, oninput: (e) => { t.comment = e.target.value; saveSoon(); } }), photosEl(t.photos)));
    return card;
  }

  function signatureEl() {
    const canvas = el("canvas", { class: "sigpad" });
    const wrap = el("section", { class: "card", "data-field": "signature" },
      el("div", { class: "row between" }, el("label", { class: "lbl" }, "Signature", el("span", { class: "reqstar" }, " *")),
        el("button", { type: "button", class: "btn link small", onclick: () => { cur.signature = null; saveSoon(); rerender(); } }, "Clear")),
      canvas, el("div", { class: "tiny muted" }, "Sign with your finger"));
    requestAnimationFrame(() => {
      const r = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b2545";
      if (cur.signature) {
        const u = URL.createObjectURL(cur.signature); objUrls.push(u);
        const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = u;
      }
      let drawing = false, last = null;
      const pt = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
      canvas.addEventListener("pointerdown", (e) => { drawing = true; last = pt(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
      canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return; const p = pt(e);
        ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; e.preventDefault();
      });
      const end = () => { if (!drawing) return; drawing = false; canvas.toBlob((b) => { cur.signature = b; saveSoon(); wrap.classList.remove("missing"); }, "image/png"); };
      canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    });
    return wrap;
  }

  function renderForm() {
    while (objUrls.length) URL.revokeObjectURL(objUrls.pop());
    const form = formById(cur.formId);
    const body = $("#formBody"); body.innerHTML = "";
    const insp = $("#inspector").value.trim();
    $("#formMeta").textContent = `${CFG.site ? CFG.site + " · " : ""}${fmtDate(new Date(cur.startedAt))} · ${insp}`;

    if (form.header) body.append(el("section", { class: "card" }, form.header.map((f) => fieldEl(f, cur.header, form))));
    if (form.modes) {
      const m = form.modes.options.find((o) => o.value === cur.mode);
      body.append(el("section", { class: "card", "data-field": "mode" }, el("label", { class: "lbl" }, form.modes.label, el("span", { class: "reqstar" }, " *")),
        chips(form.modes.options.map((o) => o.value), (o) => cur.mode === o, (o) => { cur.mode = o; saveSoon(); rerender(); }, "big"),
        m ? el("div", { class: "hint" }, m.note) : null));
    }
    if (form.notice) {
      const n = form.notice;
      body.append(el("section", { class: "card warnbox" }, el("strong", {}, "⚠ HAZARD – "), n.hazard));
      body.append(el("section", { class: "card" }, el("div", { class: "lbl" }, "Instructions"), el("ol", { class: "steps" }, n.steps.map((s) => el("li", {}, s)))));
      body.append(el("label", { class: "card ack", "data-field": "ack" }, el("input", { type: "checkbox", checked: cur.ack, onchange: (e) => { cur.ack = e.target.checked; saveSoon(); rerender(); } }), el("span", {}, n.ack)));
    }

    // progress
    const secs = sectionsFor(form, cur);
    const all = secs.flatMap((s) => s.items);
    if (form.tierBy && !cur.header[form.tierBy.field]) body.append(el("p", { class: "muted center" }, "Select a service type to show the checklist."));
    if (all.length) {
      const done = all.filter((it) => (it.levels ? levelsResult(it, ans(it.no)) : ans(it.no).result)).length;
      body.append(el("div", { class: "progress" }, el("b", { style: `width:${Math.round(100 * done / all.length)}%` })), el("div", { class: "tiny muted center" }, `${done} of ${all.length} answered`));
    }
    for (const s of secs) {
      const done = s.items.filter((it) => (it.levels ? levelsResult(it, ans(it.no)) : ans(it.no).result)).length;
      const complete = done === s.items.length;
      const open = form.collapse ? (cur.open[s.idx] ?? false) : (cur.open[s.idx] ?? true);
      body.append(el("button", { type: "button", class: "sec" + (complete ? " complete" : ""), "data-sec": s.idx, onclick: () => { cur.open[s.idx] = !open; saveSoon(); rerender(); } },
        el("span", {}, (open ? "▾ " : "▸ ") + `${s.no} · ${s.title}`, s.malay ? el("em", {}, " · " + s.malay) : null),
        el("small", {}, complete ? "✓ " : "", `${done}/${s.items.length}`)));
      if (!open) continue;
      for (const it of s.items) body.append(itemEl(form, it));
      if (s.sectionComment) body.append(el("section", { class: "card" }, el("label", { class: "lbl" }, `${s.title} – comments`),
        el("div", { class: "hint" }, "Include any faults found and rectified, or actions otherwise"),
        el("textarea", { rows: 2, value: cur.secNotes[s.idx] || "", oninput: (e) => { cur.secNotes[s.idx] = e.target.value; saveSoon(); } })));
    }

    if (form.freeTasks) {
      body.append(el("div", { class: "sec static" }, el("span", {}, "Tasks performed"), el("small", {}, `${cur.tasks.length}`)));
      cur.tasks.forEach((t, i) => body.append(taskEl(form, t, i)));
      body.append(el("button", { type: "button", class: "addrow", onclick: () => { cur.tasks.push(newTask()); saveSoon(); rerender(); } }, "+ Add task"));
    }
    if (form.generalComments) {
      const g = form.generalComments === true ? { label: "Comments" } : form.generalComments;
      body.append(el("section", { class: "card" }, el("label", { class: "lbl" }, g.label, g.malay ? el("span", { class: "ms" }, " · " + g.malay) : null),
        el("textarea", { rows: 3, value: cur.comments, oninput: (e) => { cur.comments = e.target.value; saveSoon(); } })));
    }
    for (const x of form.extras || []) body.append(el("section", { class: "card" }, el("label", { class: "lbl" }, x.label),
      el("textarea", { rows: 3, value: cur.extras[x.key] || "", oninput: (e) => { cur.extras[x.key] = e.target.value; saveSoon(); } })));
    if (form.footer) body.append(el("section", { class: "card" }, form.footer.map((f) => fieldEl(f, cur.footer, form))));
    body.append(signatureEl());
  }

  function compressImage(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? res(b) : rej(new Error("compress failed"))), "image/jpeg", PHOTO_QUALITY);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); };
      img.src = url;
    });
  }

  // ───────────────────────── validate & submit ─────────────────────────
  function validate(form) {
    const errs = [], bad = [];
    for (const f of form.header || []) {
      const v = cur.header[f.key];
      if (f.required && (!v || (Array.isArray(v) ? !v.length : !String(v).trim()))) { errs.push(f.label); bad.push(`[data-field="${f.key}"]`); }
    }
    if (form.modes && !cur.mode) { errs.push(form.modes.label); bad.push('[data-field="mode"]'); }
    if (form.notice && !cur.ack) { errs.push("Acknowledge the instructions"); bad.push('[data-field="ack"]'); }
    const unanswered = [], needComment = [], needReading = [];
    for (const s of sectionsFor(form, cur)) for (const it of s.items) {
      const a = ans(it.no);
      if (it.levels) { if (!levelsResult(it, a)) unanswered.push(it.no); continue; }
      if (!a.result) unanswered.push(it.no);
      else if (isFault(a.result) && !(a.comment || "").trim()) needComment.push(it.no);
      if (it.reading && a.result && a.result !== "N/A" && !(a.reading || "").trim()) needReading.push(it.no);
    }
    if (form.tierBy && !sectionsFor(form, cur).length) unanswered.push("(choose service type)");
    cur.tasks.forEach((t, i) => {
      if (!t.text.trim() || !t.result) unanswered.push("Task " + (i + 1));
      else if (isFault(t.result) && !t.comment.trim()) needComment.push("Task " + (i + 1));
    });
    if (unanswered.length) errs.push("Answer: " + unanswered.join(", "));
    if (needComment.length) errs.push("Comment needed: " + needComment.join(", "));
    if (needReading.length) errs.push("Enter reading: " + needReading.join(", "));
    if (!cur.signature) { errs.push("Signature"); bad.push('[data-field="signature"]'); }
    // open collapsed sections that have problems so they can be fixed
    const probNos = new Set([...unanswered, ...needComment, ...needReading]);
    for (const s of sectionsFor(form, cur)) if (s.items.some((it) => probNos.has(it.no))) cur.open[s.idx] = true;
    return { errs, bad, probNos };
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const form = formById(cur.formId);
    const { errs, bad, probNos } = validate(form);
    if (errs.length) {
      rerender();
      document.querySelectorAll(".missing").forEach((e) => e.classList.remove("missing"));
      bad.forEach((sel) => document.querySelectorAll(sel).forEach((e) => e.classList.add("missing")));
      document.querySelectorAll(".item").forEach((c) => { if (probNos.has(c.dataset.no) || probNos.has("Task " + c.dataset.no.slice(1))) c.classList.add("missing"); });
      const err = $("#formError"); err.innerHTML = ""; err.append(el("strong", {}, "Still needed:"), el("ul", {}, errs.map((e) => el("li", {}, e)))); err.classList.remove("hidden");
      const first = document.querySelector(".missing"); if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const now = new Date();
    const id = `${PREFIX[form.id] || "CK"}-${ymd(now).replace(/-/g, "")}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand4()}`;
    const items = [];
    for (const s of sectionsFor(form, cur)) {
      for (const it of s.items) {
        const a = ans(it.no);
        items.push({ section: s.title, no: it.no, text: it.text, result: it.levels ? levelsResult(it, a) : a.result,
          reading: it.levels ? it.levels.map((l) => `${l} ${a.levels[l]}`).join(" · ") : (a.reading ? `${a.reading} ${it.reading}` : ""),
          comment: (a.comment || "").trim(), photos: a.photos.map((p, i) => ({ name: `${id}_${it.no}_${i + 1}.jpg`, blob: p.blob })) });
      }
      if (s.sectionComment && (cur.secNotes[s.idx] || "").trim()) items.push({ section: s.title, no: s.no + "-NOTE", text: `${s.title} – comments`, result: "Note", reading: "", comment: cur.secNotes[s.idx].trim(), photos: [] });
    }
    cur.tasks.forEach((t, i) => items.push({ section: "Tasks performed", no: "T" + (i + 1), text: t.text.trim(), result: t.result, reading: "", comment: t.comment.trim(),
      photos: t.photos.map((p, j) => ({ name: `${id}_T${i + 1}_${j + 1}.jpg`, blob: p.blob })) }));

    const headerCols = { Asset: form.fixedAsset || "" };
    for (const f of (form.header || []).concat(form.footer || [])) {
      const v = (form.header || []).includes(f) ? cur.header[f.key] : cur.footer[f.key];
      headerCols[f.col] = Array.isArray(v) ? v.join(", ") : String(v || "").trim();
    }
    for (const x of form.extras || []) headerCols[x.col] = (cur.extras[x.key] || "").trim();
    const mode = cur.mode || (form.tierBy ? cur.header[form.tierBy.field] : "") || "";
    delete headerCols["Mode / Type"];

    const sub = {
      id, formId: form.id, formTitle: form.title, mode, site: CFG.site || "", inspector: $("#inspector").value.trim(), device: deviceId(),
      checkDate: ymd(now), submittedAt: now.toISOString(), headerCols, comments: cur.comments.trim(), items,
      signature: { name: `${id}_signature.png`, blob: cur.signature },
      status: "pending", error: "", attempts: 0
    };
    await putSub(sub);
    await delDraft(form.id).catch(() => { }); drafts.delete(form.id);
    cur = null;
    show("home"); await renderHome();
    toast(navigator.onLine && CFG.syncMode !== "none" ? "Saved – syncing…" : "Saved on device ✓");
    syncAll();
  }

  function show(id) { for (const s of ["home", "form"]) $("#" + s).classList.toggle("hidden", s !== id); }

  // ───────────────────────── payload for Google Sheets ─────────────────────────
  function buildPayload(sub) {
    const submitted = new Date(sub.submittedAt), synced = new Date();
    const legacy = !sub.formId;
    const formName = legacy ? `Washbay ${sub.frequency} (v1)` : sub.formTitle;
    const h = sub.headerCols || { Asset: sub.area || "Washbay" };
    const base = { "Submission ID": sub.id, "Check Date": excelDate(parseYmd(sub.checkDate)), "Submitted At": excelDateTime(submitted),
      "Form": formName, "Mode / Type": sub.mode || "", "Site": sub.site || "", "Asset": h.Asset || "" };
    const rows = sub.items.map((it) => Object.fromEntries(ITEM_COLS.map((c) => [c, ({
      ...base, "Section": it.section || "", "Item No": it.no, "Check Item": it.text, "Result": it.result, "Reading": it.reading || "", "Comment": it.comment || "",
      "Photo": it.photos[0] ? it.photos[0].name : "", "All Photo Links": it.photos.map((p) => p.name).join(" "),
      "Inspector": sub.inspector, "Device": sub.device, "Synced At": excelDateTime(synced) })[c] ?? ""])));
    const faults = sub.items.filter((i) => isFault(i.result)).length;
    const submission = Object.fromEntries(SUB_COLS.map((c) => [c, ({
      ...base, ...h, "Items": sub.items.filter((i) => i.result !== "Note").length, "Faults": faults, "Comments": sub.comments || "",
      "Signature": sub.signature && sub.signature.name || "", "PDF": "", "Inspector": sub.inspector, "Device": sub.device, "Synced At": excelDateTime(synced) })[c] ?? ""]));
    // details the script uses to lay out the PDF copy
    const form = formById(sub.formId || "");
    const meta = { formId: sub.formId || "legacy", malay: form && form.answerMalay ? true : false,
      headerFields: form ? (form.header || []).concat(form.footer || []).map((f) => [f.label, h[f.col] || ""]) : [] };
    return { submission, rows, meta };
  }

  // ───────────────────────── sync ─────────────────────────
  let syncing = false;
  async function syncAll(manual) {
    if (CFG.syncMode === "none") { if (manual) toast("Sync isn't configured yet"); return; }
    if (syncing) return;
    if (!navigator.onLine) { if (manual) toast("No connection – will sync later"); return; }
    syncing = true;
    const msg = $("#syncMsg"); msg.className = "small"; msg.textContent = "Syncing…";
    let ok = 0, lastErr = "";
    try {
      const pending = (await allSubs()).filter((s) => s.status !== "synced").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      for (const sub of pending) {
        try {
          await syncGoogleSheets(sub);
          sub.status = "synced"; sub.error = ""; sub.syncedAt = new Date().toISOString();
          sub.items.forEach((i) => i.photos.forEach((p) => { delete p.blob; }));
          if (sub.signature) delete sub.signature.blob;
          await putSub(sub); ok++;
        } catch (e) {
          sub.status = "error"; sub.error = String(e && e.message || e); sub.attempts = (sub.attempts || 0) + 1;
          await putSub(sub); lastErr = sub.error;
          if (!navigator.onLine) break;
        }
      }
      if (ok) ls.set("lastSync", new Date().toISOString());
      const cutoff = Date.now() - KEEP_SYNCED_DAYS * 864e5;
      for (const s of await allSubs()) if (s.status === "synced" && Date.parse(s.submittedAt) < cutoff) await delSub(s.id);
    } finally { syncing = false; }
    msg.textContent = lastErr || (ok ? `Synced ${ok} form${ok > 1 ? "s" : ""} ✓` : "");
    if (lastErr) msg.className = "small err";
    if (manual && !ok && !lastErr) toast("Nothing to sync");
    renderHome();
  }

  const blobToBase64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob);
  });

  async function syncGoogleSheets(sub) {
    const gs = CFG.googleSheets || {};
    if (!gs.url) throw new Error("Google Sheets web app URL missing in config.js");
    const { submission, rows, meta } = buildPayload(sub);
    const photos = [];
    for (const it of sub.items) for (const p of it.photos) if (p.blob) photos.push({ fileName: p.name, itemNo: it.no, contentBase64: await blobToBase64(p.blob) });
    const signature = sub.signature && sub.signature.blob ? { fileName: sub.signature.name, contentBase64: await blobToBase64(sub.signature.blob) } : null;
    let r;
    try {
      r = await fetch(gs.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ version: 2, key: gs.accessKey || "", submissionId: sub.id, submission, rows, photos, signature, meta }) });
    } catch { throw new Error("Google Sheets: network error"); }
    if (!r.ok) throw new Error(`Google Sheets failed (${r.status})`);
    let res;
    try { res = await r.json(); } catch { throw new Error("Google Sheets: unexpected reply – check the web app is deployed with access 'Anyone'"); }
    if (!res || res.ok !== true) throw new Error("Google Sheets: " + ((res && res.error) || "rejected"));
  }

  // ───────────────────────── CSV export ─────────────────────────
  async function exportCsv() {
    const subs = (await allSubs()).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    if (!subs.length) { toast("Nothing to export"); return; }
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [["Submission ID", "Check Date", "Form", "Mode / Type", "Asset", "Section", "Item No", "Check Item", "Result", "Reading", "Comment", "Inspector", "Sync Status"].join(",")];
    for (const s of subs) for (const it of s.items) lines.push([s.id, s.checkDate, s.formTitle || s.frequency, s.mode || "", (s.headerCols || {}).Asset || "", it.section || "", it.no, it.text,
      it.result, it.reading || "", it.comment, s.inspector, s.status].map(esc).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `cki_mof_checks_${ymd(new Date())}.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  // ───────────────────────── boot ─────────────────────────
  async function boot() {
    document.title = CFG.appTitle; $("#appTitle").textContent = CFG.appTitle;
    $("#versionInfo").textContent = `v${APP_VERSION} · ${deviceId()} · sync: ${CFG.syncMode}`;
    const insp = $("#inspector");
    insp.value = ls.get("inspector", "");
    insp.addEventListener("change", () => ls.set("inspector", insp.value.trim()));
    $("#backBtn").addEventListener("click", () => { if (cur) { clearTimeout(saveT); cur.savedAt = new Date().toISOString(); putDraft(cur).then(() => { drafts.add(cur.formId); cur = null; renderHome(); }); } show("home"); });
    $("#discardBtn").addEventListener("click", async () => { if (!cur) return; const id = cur.formId; await delDraft(id); drafts.delete(id); cur = null; openForm(id); toast("Started fresh"); });
    $("#formEl").addEventListener("submit", submitForm);
    $("#syncBtn").addEventListener("click", () => syncAll(true));
    $("#exportBtn").addEventListener("click", exportCsv);
    window.addEventListener("online", () => { updateNet(); syncAll(); });
    window.addEventListener("offline", updateNet);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !cur) { renderHome(); syncAll(); } });
    setInterval(() => syncAll(), 2 * 60 * 1000);
    updateNet();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    try { (await tx("drafts", "readonly", (st) => reqP(st.getAllKeys()))).forEach((k) => drafts.add(k)); } catch { }
    await renderHome();
    const sp = $("#splash"); if (sp) setTimeout(() => { sp.classList.add("gone"); setTimeout(() => sp.remove(), 600); }, 1400);
    syncAll();
  }

  window.__cki = { allSubs, syncAll, buildPayload, FORMS, sectionsFor };
  boot();
})();
