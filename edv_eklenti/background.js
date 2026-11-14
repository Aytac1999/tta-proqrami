// İkona basanda panel kiçik ayrıca pəncərədə açılır. Artıq açıqdırsa, öndə gətirilir.
const ETAX = "https://new.e-taxes.gov.az";
let pencereId = null;
chrome.action.onClicked.addListener(async () => {
  if (pencereId !== null) {
    try { await chrome.windows.update(pencereId, { focused: true }); return; } catch (e) { pencereId = null; }
  }
  const w = await chrome.windows.create({ url: chrome.runtime.getURL("panel.html"), type: "popup", width: 520, height: 700 });
  pencereId = w.id;
});
chrome.windows.onRemoved.addListener((id) => { if (id === pencereId) pencereId = null; });
