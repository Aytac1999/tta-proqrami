// İkona basanda panel e-taxes səhifəsinin yanında (yan panel) açılır; ayrıca tab açılmır.
chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));
chrome.runtime.onStartup.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));
