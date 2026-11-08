// İkona basanda e-taxes səhifəsinin ÜSTÜNDƏ üzən pəncərə açılır/gizlənir (səhifə daralmır).
const ETAX = "https://new.e-taxes.gov.az";
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.url && tab.url.startsWith(ETAX + "/")) {
    try { await chrome.tabs.sendMessage(tab.id, { toggle: true }); return; }
    catch (e) { /* səhifə əvvəl açılıb, əlavə yüklənməyib: yenilənməlidir */
      await chrome.tabs.reload(tab.id); return; }
  }
  await chrome.tabs.create({ url: ETAX + "/eportal/invoice" });  // e-taxes tabı yoxdursa açılır; sonra ikona yenidən basılır
});
// Üzən pəncərə səhifənin təhlükəsizlik qaydaları ilə bloklanarsa: ayrıca kiçik pəncərədə açılır
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.pencere) chrome.windows.create({ url: chrome.runtime.getURL("panel.html"), type: "popup", width: 460, height: 760 });
});
