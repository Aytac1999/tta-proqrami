// TTA və protokolun çap görünüşü (PDF üçün: Çap et -> "PDF kimi saxla").
const _h = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function aktHtml(q, sat, alc, tip, rekv) {
  tip = _tip(tip);
  const no = q.seriya + q.nomre;
  const basliq = aktBasliq(tip);
  const sat_ = q.mallar.map((m, i) => {
    const mq = Number.isInteger(m.miqdar) ? m.miqdar : m.miqdar;
    return `<tr><td class="c">${i + 1}</td><td>${_h(m.ad)}</td><td class="c">${_h(m.kod)}</td><td class="c">${_h(m.olcu)}</td><td class="r">${mq}</td><td class="r">${fmtQiymet(m.qiymet)}</td><td class="r">${fmt(m.mebleg)}</td></tr>`;
  }).join("");
  const blok = (bas, t) => `<div class="blok"><b>${bas}</b><br><b>${_h(t.ad)}</b><br>VÖEN: ${_h(t.voen)}<br><br>${_h(t.rol)}: ${_h(t.direktor) || "______________________"}<br><br><br><br>İmza: ______________________<br><b>M.Y.</b></div>`;
  return `<section class="akt"><div class="ust"><b>${_h(AYAR.sheher)}</b><b>${_h(q.tarix)}</b></div>
<h2>${_h(basliq)} № ${_h(no)}</h2><p class="giris">${_h(girisMetni(q, sat, alc, tip))}</p>
<table class="mal"><thead><tr><th>№</th><th>Malın / işin / xidmətin adı</th><th>Kod</th><th>Ölçü vahidi</th><th>Miqdar</th><th>Vahidin qiyməti</th><th>Məbləğ</th></tr></thead><tbody>${sat_}</tbody></table>
<table class="yek"><tr><td><b>Cəmi</b></td><td><b>${fmt(q.cemi)}</b></td></tr><tr><td><b>${edvEtiketi(q)}</b></td><td><b>${fmt(q.edv)}</b></td></tr><tr><td><b>Yekun</b></td><td><b>${fmt(q.yekun)}</b></td></tr></table>
<p class="yaz"><b>Yekun məbləğ (yazı ilə):</b> ${_h(meblegYazi(q.yekun))}${tip === "hesab" ? "" : "<br>" + _h(AYAR.iddia_cumlesi)}</p>${tip === "hesab" ? rekvHtml(rekv) : ""}
<div class="imza">${blok("SATICI", sat)}${blok("ALICI", alc)}</div></section>`;
}

function rekvHtml(r) {
  return `<div class="rekv"><b>SATICININ BANK REKVİZİTLƏRİ</b>${REKV_SETRI.map(([k, ad]) => `<div>${ad}: <b>${_h((r && r[k]) || "______________________")}</b></div>`).join("")}</div>`;
}
