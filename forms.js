// CKI MOF Checks – form definitions.
// Edit wording here. Item numbers are generated from section order (1A, 1B, 2A…),
// so add new items at the END of a section to keep past numbering stable.
// After editing, bump CACHE_VERSION in sw.js so devices pick up the change.
(function () {
  const OK_FAULT = ["OK", "Fault"];
  const OK_FAULT_NA = ["OK", "Fault", "N/A"];
  const SERVICE = ["In order", "Action required", "N/A"];
  const DONE = ["Done", "Not done", "N/A"];

  const PLANT = ["HPU-01", "18kVA Genset", "22kVA Genset", "OTOC Genset"];
  const PPE = ["Safety glasses", "Hi-vis overalls", "Protective footwear", "Gloves", "Hard hat", "Site specific"];
  const IBC_LEVELS = ["Full", "¾", "½", "¼", "Empty"];
  const LOW_LEVELS = ["¼", "Empty"];   // below ½ → recorded as a Fault

  const recordHeader = [
    { key: "asset", label: "Asset name / ID", type: "select", options: PLANT.concat(["Washbay", "FPOE Compound"]), other: true, required: true, col: "Asset" },
    { key: "location", label: "Location", type: "text", default: "CKI MOF", col: "Location" },
    { key: "serviceType", label: "Service type", type: "chips", options: ["250hr", "500hr", "1000hr", "2000hr", "4000hr", "Other"], required: true, col: "Mode / Type" },
    { key: "hours", label: "Current hours – main engine", type: "number", col: "Hours" },
    { key: "auxHours", label: "Current hours – aux engine", type: "number", col: "Aux Hours" },
    { key: "workOrder", label: "Work order", type: "text", col: "Work Order" },
    { key: "labourHours", label: "Labour hours", type: "number", col: "Labour Hours" },
    { key: "performedBy", label: "Service performed by", type: "text", defaultInspector: true, required: true, col: "Performed By" },
    { key: "ppe", label: "Required PPE worn (tick all that apply)", type: "multichips", options: PPE, required: true, col: "PPE" }
  ];

  // Service record sections. "tier" controls which service types show them:
  // base = every service, t1000 = 1000/2000hr and above, t4000 = 4000hr. "Other" shows all.
  const S = (title, tier, items) => ({ title, tier, items });
  const NS = "No sampling available";
  const serviceSections = [
    S("Safety", "base", ["Ensure appropriate PPE is worn", "Communicate intended works with Operations", "Place asset in a safe location", "Isolate engine", "Place Out of Service signs/tags"]),
    S("Engine 250/500 hr", "base", [
      { text: "Check oil & filter cleanliness for signs of debris", hint: NS }, "Drain and replace engine oil", "Replace oil filter", "Replace oil bypass filter",
      "Replace primary/water separator fuel filter", "Replace engine fuel filter", "Check coolant level", "Check radiator condition, clean if necessary",
      "Inspect all hoses and clamps", "Check all belts, replace/adjust if necessary", "Check belt tensioner/idler bearings and fan hub",
      "Check air filter, replace if necessary", "Inspect exhaust and muffler", "Inspect integrity of exhaust lagging",
      "Check engine and power package mounts and bolts", "Lubricate / grease all points on asset"]),
    S("Electrical", "base", ["Check battery/s electrolyte level and terminals", "Check integrity of wiring/cable trays etc.", "Check switches on sensors/hydraulic valves etc."]),
    S("Hydraulics", "base", ["Check tank oil level", "Inspect hydraulic hoses for leakage/abrasions/hardness", "Inspect hydraulic fittings/valve blocks for leaks", "Check pumps and control valves for leaks etc."]),
    S("Gearbox / Transmission / Drive", "base", ["Check oil level", "Check mounts and bolts", "Check all linkages and/or cables", "Check all drive shaft bolts and grease", "Grease universal joints", "Check for leaks", "Check tyres, condition and pressures"]),
    S("Brakes and Steering", "base", ["Check handbrake operation, adjust if necessary", "Check brake and steering fluids"]),
    S("Engine 1000/2000 hr", "t1000", [{ text: "Check coolant cleanliness for signs of debris", hint: NS }, "Check turbo – turbine wheel spins freely, not marking housing, no excessive side play", "Check turbo for presence of oil", "Engine crankcase breather – clean/replace"]),
    S("Hydraulics 1000/2000 hr", "t1000", [{ text: "Check oil & filter cleanliness for signs of debris", hint: NS }, "Replace return filters", "Replace pressure filters", "Inspect Denso tape on switching, replace if needed", "Inspect hydraulic cylinders"]),
    S("Gearbox / Transmission / Drive 1000/2000 hr", "t1000", [{ text: "Check oil & filter cleanliness for signs of debris", hint: NS }, "Change gearbox/transmission oil", "Change filters (if applicable)", "Change/clean breathers"]),
    S("Brakes and Steering 1000/2000 hr", "t1000", ["Check brake linings – measure percentage remaining", "Check disc/drum condition"]),
    S("Engine 4000 hr", "t4000", ["Replace coolant", "Engine valve lash – check and adjust", "Fuel injectors – inspect and adjust", "Replace engine belts"]),
    S("Hydraulics 4000 hr", "t4000", ["Replace hydraulic oil"]),
    S("Brakes and Steering 4000 hr", "t4000", ["Replace brake fluid", "Replace power steering fluid"]),
    S("Structure 4000 hr", "t4000", ["Inspect all structural bolts for tightness", "Check counterweight bolts", "Inspect pins and linkages for excessive play", "Inspect wheel bearings, replace if necessary"]),
    S("Engine and Electrical Testing", "base", ["Remove isolation and out of service signs", "Start engine – check for noise, oil and coolant leaks", "Shut off engine and recheck oil level",
      "Check working/driving lights, indicators and mirrors", "Check warning/hazard lights and horn", "Check emergency stops",
      "Check cabin controls and warning alarms", "Check air conditioner and heater", "Check operation of cabin seat and seatbelt"])
  ];

  window.CKI_FORMS = [
    // ───────────────────────── WASHBAY ─────────────────────────
    {
      id: "washbay-daily", title: "Washbay Daily", group: "Washbay", schedule: "daily",
      fixedAsset: "Washbay", answers: OK_FAULT_NA,
      sections: [{ title: "Daily checks", items: [
        "Check chemical drums and confirm they're not empty. Replace if they are empty.",
        "Check Ultima dosing panel to confirm readings are within range.",
        "Check CMS unit contains paper.",
        "Check OWS oil drums to confirm there's no water flowing into the drums.",
        "Check clear plumbing sections to confirm water quality."] }],
      generalComments: true
    },
    {
      id: "washbay-prestart", title: "Washbay Prestart", group: "Washbay", schedule: "each",
      fixedAsset: "Washbay", answers: OK_FAULT,
      notice: {
        hazard: "The washbay uses a series of hazardous chemicals: sulphuric acid, sodium hydroxide and chlorine. Only take nominated walkways and do not walk on dosing pipework connecting to the IBCs on the far side of the washbay. Do not tamper with these lines and report any suspected leaks immediately.",
        steps: [
          "Wear site-appropriate PPE in accordance with FH policies.",
          "The system is set to ECONOMY when not in use. Prior to using, switch to FILTER (green button). Red button initiates BACKWASH.",
          "Check pressure gauges are operational.",
          "Check the pressure gauge on the polishing tank is within operating range.",
          "At end of use: retract all hoses and ensure pressure washer units are alongside the washbay wall. Ensure any gutter guards are closed.",
          "Ensure the system is switched back to ECONOMY. DO NOT TURN OFF.",
          "Report any faults to Supervisor / IMC Representative with this checklist."],
        ack: "I have read the instructions and hazard information"
      },
      sections: [
        { title: "System Checks", items: [
          "System switched to FILTER when in use",
          { text: "Pressure gauge on polishing pump within range", hint: "370–400 kPa during active washing · <520 kPa during circulation", reading: "kPa" },
          "Continuous Media System (CMS) – filter paper intact, float switch operational"] },
        { title: "Pressure Washers", items: [
          "No leaks or signs of damage – all hoses and attachments", "Operating pressure achieved", "Heat pump operational", "Diesel tank full"] },
        { title: "Washbay Unit", items: ["Overall condition – no signs of damage (ramps, walls, flooring, gutters)"] }
      ],
      generalComments: true
    },
    {
      id: "washbay-operator", title: "Washbay Operator Checklist", group: "Washbay", schedule: "mode",
      fixedAsset: "Washbay", answers: OK_FAULT,
      modes: { label: "Checklist type", options: [
        { value: "Operational – weekly", schedule: "weekly", note: "Undertaken weekly when operated (by operating party)" },
        { value: "Standby – monthly", schedule: "monthly", note: "Undertaken monthly by MC when not operating" }] },
      sections: [
        { title: "ASM Pump / Diaphragm Pump", items: [
          "Overall condition & moving parts – no leaks or signs of damage",
          "Servicing: change gear oil at 2 months (initial use), every 12 months thereafter"] },
        { title: "Continuous Media System (CMS)", items: [
          "Filter paper intact, catch can empty", "Overall condition & moving parts – no leaks or signs of damage", "Float switch operational – no damage"] },
        { title: "Oil Water Separator (OWS)", items: [
          "Check plates and clean if blocked (every 3 months, depending on build up)",
          "Check oil catch drum level (located under OWS). Dispose/decant if full."] },
        { title: "Polishing Filter / Pump", items: [
          { text: "Operating pressure – confirm within operating range", hint: "370–400 kPa during active washing · up to 520 kPa during internal recirculation", reading: "kPa" },
          "Backwash control valve – operational"] },
        { title: "Dosing System", items: [
          "Check chemicals are in range (on display)",
          "Check dosing lines not pinched, no leaks or signs of damage",
          { text: "Chemical levels in 3 × IBCs – record any levels below ½", levels: ["IBC 1", "IBC 2", "IBC 3"] }] },
        { title: "External Pipework & Pumps", items: [
          "External pipework – no leaks or signs of damage", "Washbay diaphragm pump – no belt slippage noise, no leaks"] },
        { title: "Pressure Washers", items: [
          "Pressure washers – no leaks or signs of damage", "Operating pressure achieved", "Heat pump operational", "Diesel tank full"] },
        { title: "Washbay Unit + Tanks", items: [
          "Ramps, pads, walls, wall supports, gutters, gutter guards – overall condition, no signs of damage",
          "Check external plumbing lines – no damage or leaks",
          "Check tank internals, including rainwater tank – clean? Notify if sludge removal required."] }
      ],
      generalComments: true
    },
    {
      id: "fpoe-monthly", title: "Monthly – FPOE & Washbay", group: "Washbay", schedule: "monthly",
      fixedAsset: "FPOE Compound / Washbay", answers: OK_FAULT,
      sections: [
        { title: "FPOE Compound", sectionComment: true, items: [
          "Inspect panel surface and remediate if necessary", "Check paintwork on fencing and touch up where applicable", "Check bolts on gate hinges, tighten if required"] },
        { title: "Washbay", sectionComment: true, items: [
          "Connect to Pi, contact Enviroconcepts for remote overview",
          "Check dosing (clear) tubes and confirm they remain free from obstructions",
          "Check dosing probes to confirm they're free of debris",
          { text: "Check chemical levels of all 3 IBCs", levels: ["IBC 1", "IBC 2", "IBC 3"] },
          { text: "Check pumps, function test system in accordance with OMM for specific equipment", hint: "Daily and weekly operational checks are consolidated into this monthly check for periods of non-use, where the system is kept in Eco Mode." },
          "Ensure wash bay area is clean and tidy (general housekeeping)"] }
      ]
    },
    {
      id: "fpoe-annual", title: "Annual – FPOE & Washbay", group: "Washbay", schedule: "annual",
      fixedAsset: "FPOE Compound / Washbay",
      sections: [
        { title: "FPOE Compound", sectionComment: true, answers: OK_FAULT, items: [
          "Inspect panels for signs of cracks", "Check paintwork on fencing and touch up where applicable", "Tighten all bolts on fencing connections and hinges"] },
        { title: "Washbay", sectionComment: true, answers: DONE, items: [
          "Replace media in blue media vessel", "Replace dosing probes", "Calibrate new dosing probes", "Replace dosing injectors", "Replace dosing tube (clear tube)"] }
      ]
    },

    // ───────────────────────── HPU ─────────────────────────
    {
      id: "hpu-prestart", title: "HPU Prestart", group: "HPU", schedule: "each", answers: OK_FAULT_NA,
      answerMalay: { "OK": "OK", "Fault": "Rosak", "N/A": "T/B" },
      header: [
        { key: "asset", label: "Plant", type: "select", options: ["HPU-01"], other: true, required: true, default: "HPU-01", col: "Asset" },
        { key: "hours", label: "Hours (HR)", malay: "Jam", type: "number", required: true, col: "Hours" }
      ],
      sections: [
        { title: "Fuel Checks", malay: "Periksaan Bahan Api", items: [
          { text: "Fuel leaks", malay: "Bocor bahan api" }, { text: "Fuel level", malay: "Aras bahan api" }] },
        { title: "Engine Checks", malay: "Periksaan Injin", items: [
          { text: "Engine oil level", malay: "Batas minyak injin" }, { text: "Hydraulic oil level", malay: "Batas minyak hydraulic" },
          { text: "Fan belts", malay: "Seterap kipas" }, { text: "Oil leaks", malay: "Minyak bocor" }] },
        { title: "Structure Checks", malay: "Periksaan Badan", items: [
          { text: "Ramp structure", malay: "Struktur ramp" }, { text: "Sleeves and shims", malay: "Selongsong dan bantalan" },
          { text: "HPU frame", malay: "Bingkai HPU" }, { text: "HPU bund – no water, plug installed", malay: "Bund HPU – tiada air, palam dipasang" }] },
        { title: "Hydraulic Checks", malay: "Pemeriksaan Hydraulik", items: [
          { text: "Hoses vented before connection", malay: "Selang diberi ventilasi sebelum disambungkan" }, { text: "Hoses", malay: "Hos" },
          { text: "Rams", malay: "Rams" }, { text: "Tubing", malay: "Tiub" }, { text: "Oil leaks", malay: "Minyak bocor" }] },
        { title: "Electrical", malay: "Elektrik", items: [
          { text: "Control cable", malay: "Kabel kawalan" }, { text: "Battery", malay: "Bateri" }] },
        { title: "Lubrication", malay: "Pelinciran", items: [
          { text: "Grease", malay: "Gris" }, { text: "Grease nipples (4 off)", malay: "Puting gris (4)" }] }
      ],
      generalComments: { label: "Fault comments", malay: "Komen kerosakan" },
      footer: [
        { key: "faultsReceivedBy", label: "Faults received by (supervisor)", type: "text", col: "Faults Received By" },
        { key: "woIssued", label: "Works order issued for repair – date / no.", type: "text", col: "WO Issued" }
      ]
    },

    // ───────────────────────── PLANT MAINTENANCE ─────────────────────────
    {
      id: "service-record", title: "Service Record", group: "Plant maintenance", schedule: "none", answers: SERVICE,
      header: recordHeader, sections: serviceSections,
      tierBy: { field: "serviceType", map: { "250hr": ["base"], "500hr": ["base"], "1000hr": ["base", "t1000"], "2000hr": ["base", "t1000"], "4000hr": ["base", "t1000", "t4000"], "Other": ["base", "t1000", "t4000"] } },
      collapse: true,
      generalComments: true,
      extras: [{ key: "spareParts", label: "Spare parts required", col: "Spare Parts" }]
    },
    {
      id: "maintenance-record", title: "Maintenance Record", group: "Plant maintenance", schedule: "none",
      header: recordHeader.map((f) => f.key === "serviceType" ? Object.assign({}, f, { required: false }) : f), freeTasks: { answers: ["OK", "Action required"] },
      generalComments: true
    }
  ];

  window.CKI_CONST = { IBC_LEVELS, LOW_LEVELS, FAULT_VALUES: ["Fault", "Action required", "Not done"] };
})();
