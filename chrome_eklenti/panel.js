// SABİT YÜKLƏYİCİ. app/ qovluğundakı proqram kodunu GitHub-dan yoxlayır, yaddaşda saxlayır və sandbox-da işə salır.
// Brauzer ilə əlaqə (e-taxes sorğuları, yükləmə, yaddaş) yalnız buradan keçir; token sandbox-a verilmir.
const ETAX = "https://new.e-taxes.gov.az";
const MENBE_DEF = "https://raw.githubusercontent.com/Aytac1999/tta-proqrami/main";
const qutu = document.getElementById("qutu");
let gonderildi = false, hazir = false;

async function st(k) { return (await chrome.storage.local.get(k))[k]; }
async function tokenAl() {
  const tabs = await chrome.tabs.query({ url: ETAX + "/*" });
  for (const t of tabs) {
    try {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: () => localStorage.getItem("aztax-jwt") || sessionStorage.getItem("aztax-jwt"),
      });
      let raw = (r && r.result || "").trim();
      if (!raw) continue;
      try {
        const p = JSON.parse(raw);
        if (typeof p === "string") raw = p;
        else if (p && typeof p === "object") raw = p.token || p.accessToken || p.access_token || p.jwt || p.idToken || "";
      } catch (e) { raw = raw.replace(/^"|"$/g, ""); }
      if (raw) return raw;
    } catch (e) { /* tab əlçatmazdır */ }
  }
  return null;
}
async function getir(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 8000);
  try { const r = await fetch(url, { cache: "no-store", signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
async function qablasdirilmis() {
  const ad = chrome.runtime.getURL("app/");
  const v = JSON.parse(await getir(ad + "versiya.json"));
  const fayllar = {};
  for (const f of v.fayllar) fayllar[f] = await getir(ad + f);
  return { versiya: v.versiya + " (daxili)", siyahi: v.fayllar, fayllar };
}
async function yukle(yalnizDaxili) {
  hazir = false;
  let paket = null;
  if (!yalnizDaxili) {
    const menbe = ((await st("menbe")) || MENBE_DEF).replace(/\/$/, "");
    paket = await st("app_kesh");
    try {
      const uz = JSON.parse(await getir(menbe + "/chrome_eklenti/app/versiya.json", 6000));
      if (!paket || paket.versiya !== uz.versiya) {
        const fayllar = {};
        for (const f of uz.fayllar) fayllar[f] = await getir(menbe + "/chrome_eklenti/app/" + f, 15000);
        paket = { versiya: uz.versiya, siyahi: uz.fayllar, fayllar };
        await chrome.storage.local.set({ app_kesh: paket });
      }
    } catch (e) { /* internet yoxdur / GitHub əlçatmazdır: keşdəki və ya daxili nüsxə işlənəcək */ }
    if (paket) paket.menbe = menbe;
  }
  if (!paket) paket = await qablasdirilmis();
  qutu.contentWindow.postMessage({ yukle: true, ...paket }, "*");
  setTimeout(async () => { if (!hazir) { await chrome.storage.local.remove("app_kesh"); if (!yalnizDaxili) yukle(true); } }, 10000);
}

window.addEventListener("message", async (e) => {
  if (e.source !== qutu.contentWindow) return;
  const m = e.data || {};
  if (m.qabiq) { if (!gonderildi) { gonderildi = true; yukle(false); } return; }
  if (m.hazir) { hazir = true; return; }
  if (m.xeta) { console.error("app xətası:", m.xeta); if (!hazir) { await chrome.storage.local.remove("app_kesh"); yukle(true); } return; }
  if (!m.kopru) return;
  let data;
  try { data = await isle(m); } catch (err) { data = { xeta: String(err && err.message || err) }; }
  qutu.contentWindow.postMessage({ cavab: true, id: m.id, data }, "*");
});

async function isle(m) {
  if (m.t === "token_var") return !!(await tokenAl());
  if (m.t === "fetch") {
    const izinli = m.url.startsWith(ETAX + "/") || m.url.startsWith("https://raw.githubusercontent.com/");
    if (!izinli) return { xeta: "icazə verilməyən ünvan" };
    const basliq = { Accept: "application/json", ...(m.json !== undefined ? { "Content-Type": "application/json" } : {}) };
    if (m.auth) {
      const tok = await tokenAl();
      if (!tok) return { sessiya: true };
      basliq["x-authorization"] = m.bearer ? "Bearer " + tok : tok;
    }
    try {
      const r = await fetch(m.url, { method: m.metod || "GET", headers: basliq, body: m.json !== undefined ? JSON.stringify(m.json) : undefined });
      return { status: r.status, text: await r.text() };
    } catch (err) { return { sebeke: String(err.message || err) }; }
  }
  if (m.t === "get") return await st(m.key);
  if (m.t === "set") { await chrome.storage.local.set({ [m.key]: m.value }); return true; }
  if (m.t === "yukle") {
    const b = new Blob([m.bytes], { type: m.mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = m.ad; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return true;
  }
  if (m.t === "ac_etaxes") { await chrome.tabs.create({ url: ETAX + "/eportal/invoice" }); return true; }
  if (m.t === "chap") { qutu.contentWindow.focus(); return true; }
  return { xeta: "naməlum əmr" };
}
