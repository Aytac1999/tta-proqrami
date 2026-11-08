// SABİT YÜKLƏYİCİ. app/ qovluğundakı proqram kodunu GitHub-dan yoxlayır, yaddaşda saxlayır və sandbox-da işə salır.
// Brauzer ilə əlaqə (e-taxes sorğuları, yükləmə, yaddaş) yalnız buradan keçir; token sandbox-a verilmir.
const ETAX = "https://new.e-taxes.gov.az";
const MENBE_DEF = "https://raw.githubusercontent.com/Aytac1999/tta-proqrami/main";
const qutu = document.getElementById("qutu");
let gonderildi = false, hazir = false;

// ---- papka seçimi (File System Access API); seçilmiş papka brauzerin yaddaşında (IndexedDB) saxlanır
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open("tta_papka", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function idbGet(k) { const d = await idb(); return new Promise((ok) => { const q = d.transaction("h").objectStore("h").get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); }
async function idbSet(k, v) { const d = await idb(); return new Promise((ok) => { const t = d.transaction("h", "readwrite"); if (v === null) t.objectStore("h").delete(k); else t.objectStore("h").put(v, k); t.oncomplete = () => ok(true); }); }
async function papkaIcaze(sor) {
  const h = await idbGet("papka");
  if (!h) return null;
  try {
    let p = await h.queryPermission({ mode: "readwrite" });
    if (p !== "granted" && sor) p = await h.requestPermission({ mode: "readwrite" });
    return p === "granted" ? h : null;
  } catch (e) { return null; }
}

async function st(k) { return (await chrome.storage.local.get(k))[k]; }
async function tokenAl() {
  const tabs = await chrome.tabs.query({ url: ETAX + "/*" });
  for (const t of tabs) {
    try {
      // bağlı/donmuş tab səbəbindən ilişməsin: hər tab üçün 4 san. limit
      const [r] = await Promise.race([chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: () => localStorage.getItem("aztax-jwt") || sessionStorage.getItem("aztax-jwt"),
      }), new Promise((_, no) => setTimeout(() => no(new Error("vaxt bitdi")), 4000))]);
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
// GitHub-dakı proqramın yeni versiyasını (varsa) paralel yükləyib yaddaşa yazır
async function yenile(menbe, kesh) {
  const uz = JSON.parse(await getir(menbe + "/chrome_eklenti/app/versiya.json", 6000));
  if (kesh && kesh.versiya === uz.versiya) return kesh;
  const hamisi = await Promise.all(uz.fayllar.map((f) => getir(menbe + "/chrome_eklenti/app/" + f, 15000)));
  const fayllar = {};
  uz.fayllar.forEach((f, i) => (fayllar[f] = hamisi[i]));
  const paket = { versiya: uz.versiya, siyahi: uz.fayllar, fayllar };
  await chrome.storage.local.set({ app_kesh: paket });
  return paket;
}
async function yukle(yalnizDaxili) {
  hazir = false;
  let paket = null;
  if (!yalnizDaxili) {
    const menbe = ((await st("menbe")) || MENBE_DEF).replace(/\/$/, "");
    paket = await st("app_kesh");
    // yeni versiya varsa dərhal yüklənir: əvvəl yalnız kiçik versiya faylı yoxlanır (adətən saniyənin bir hissəsi, 2 san. limit).
    // Eyni versiyadırsa yaddaşdakı nüsxə dərhal açılır; internet yoxdursa da yaddaşdakı nüsxə işləyir.
    try {
      const uz = JSON.parse(await getir(menbe + "/chrome_eklenti/app/versiya.json", 2000));
      if (!paket || paket.versiya !== uz.versiya) paket = await yenile(menbe, null);
    } catch (e) { /* yoxlama alınmadı: yaddaşdakı və ya daxili nüsxə işlənəcək */ }
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
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 60000);  // 60 san.-dən çox gözləmə
      try {
        const r = await fetch(m.url, { method: m.metod || "GET", headers: basliq, body: m.json !== undefined ? JSON.stringify(m.json) : undefined, signal: ac.signal });
        return { status: r.status, text: await r.text() };
      } finally { clearTimeout(tm); }
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
  if (m.t === "papka_ad") { const h = await idbGet("papka"); return h ? h.name : null; }
  if (m.t === "papka_sec") {
    try { const h = await window.showDirectoryPicker({ mode: "readwrite" }); await idbSet("papka", h); return { ad: h.name }; }
    catch (e) {
      if (e && e.name === "AbortError") return { xeta: "ləğv edildi" };
      // yan paneldə fayl seçicisi bloklanıbsa: kiçik ayrıca pəncərədə seçilir
      await chrome.windows.create({ url: chrome.runtime.getURL("qovluq.html"), type: "popup", width: 460, height: 230 });
      return { pencere: true };
    }
  }
  if (m.t === "papka_sil") { await idbSet("papka", null); return true; }
  if (m.t === "papka_icaze") { return !!(await papkaIcaze(true)); }
  if (m.t === "papka_yaz") {
    const h = await papkaIcaze(false);
    if (!h) return { xeta: "qovluğa yazma icazəsi yoxdur" };
    for (const f of m.fayllar) {
      const fh = await h.getFileHandle(f.ad, { create: true });
      const w = await fh.createWritable(); await w.write(f.bytes); await w.close();
    }
    return { ok: m.fayllar.length, ad: h.name };
  }
  if (m.t === "ac_etaxes") { await chrome.tabs.create({ url: ETAX + "/eportal/invoice" }); return true; }
  if (m.t === "chap") { qutu.contentWindow.focus(); return true; }
  return { xeta: "naməlum əmr" };
}

// üzən pəncərədə açılıbsa, səhifəyə "yükləndi" xəbəri (bloklanıbsa bu gəlməz, ayrıca pəncərə açılır)
if (window.parent !== window) window.parent.postMessage({ tta_yuklendi: true }, "*");
