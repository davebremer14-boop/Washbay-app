// Washbay inspection checklist.
// Edit the wording here to change what appears in the app. Keep each "no"
// unique within its frequency – it is written to the Excel "Item No" column.
// After editing, bump CACHE_VERSION in sw.js so devices pick up the change.
window.WASHBAY_CHECKLIST = {
  Daily: [
    { no: "D1", text: "Check chemical drums and confirm they're not empty. Replace if they are empty." },
    { no: "D2", text: "Check Ultima dosing panel to confirm readings are within range." },
    { no: "D3", text: "Check CMS unit contains paper." },
    { no: "D4", text: "Check OWS oil drums to confirm there's no water flowing into the drums." },
    { no: "D5", text: "Check clear plumbing sections to confirm water quality." }
  ],
  Weekly: [
    { no: "W1", text: "Check CMS belt to confirm it's operating smoothly." },
    { no: "W2", text: "Check chemical bunds to confirm they're clear of liquid." },
    { no: "W3", text: "Bump test peristaltic dosing pumps and visually inspect operation." },
    { no: "W4", text: "Check OWS to confirm the clear well is not contaminated." },
    { no: "W5", text: "Manually inspect and check all floats to confirm they're activating the related pumps and motors." },
    { no: "W6", text: "Manually run a backwash and observe operation to confirm free flow of water to system drain." }
  ],
  Monthly: [
    { no: "M1", text: "Check dosing (clear) tubes and confirm they remain free from obstructions." },
    { no: "M2", text: "Check dosing probes to confirm they're free of debris." },
    { no: "M3", text: "Check paintwork on fencing and touch up where applicable." }
  ]
};
