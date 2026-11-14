// SABİT QABIQ (sandbox tərəfi). Əsas proqram kodu (app/*) yükləyicidən gəlir və burada işə salınır.
// Bu fayl nadir hallarda dəyişir; gündəlik dəyişikliklər app/ qovluğunda olur və GitHub-dan avtomatik gəlir.
let _id = 0;
const _gozleyen = {};
window.KOPRU = function (t, data) {
  return new Promise((ok) => {
    const id = ++_id;
    _gozleyen[id] = ok;
    parent.postMessage({ kopru: true, id, t, ...(data || {}) }, "*");
  });
};
window.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.cavab && _gozleyen[m.id]) { _gozleyen[m.id](m.data); delete _gozleyen[m.id]; return; }
  if (m.yukle) basla(m);
});
function xeta(msg) { parent.postMessage({ xeta: String(msg) }, "*"); }
window.addEventListener("error", (e) => xeta(e.message));
window.addEventListener("unhandledrejection", (e) => xeta(e.reason));
function basla(m) {
  try {
    document.getElementById("stil").textContent = m.fayllar["app.css"] || "";
    document.getElementById("kok").innerHTML = m.fayllar["app.html"] || "";
    window.APP_MENBE = m.menbe; window.APP_VERSIYA = m.versiya;
    for (const ad of m.siyahi.filter((x) => x.endsWith(".js"))) {
      const s = document.createElement("script");
      s.textContent = m.fayllar[ad] + "\n//# sourceURL=app/" + ad;
      document.body.appendChild(s);
    }
    parent.postMessage({ hazir: true }, "*");
  } catch (err) { xeta(err); }
}
parent.postMessage({ qabiq: true }, "*");
