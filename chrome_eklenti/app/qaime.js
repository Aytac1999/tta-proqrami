// ---- 4. Qaimə yazma: Excel şablonundan e-taxes-də QARALAMA yaradır (göndərmir, imzalamır)
const QAIME_POST = "/api/po/invoice/public/v2/invoice";

async function _inflateRaw(u8) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function zipOxu(buf) {  // {ad: Uint8Array}
  const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Bu Excel (xlsx) faylı deyil.");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const td = new TextDecoder(), out = {};
  for (let i = 0; i < n; i++) {
    const met = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
      el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const ad = td.decode(u.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true), bas = lo + 30 + lnl + lel;
    const xam = u.subarray(bas, bas + csz);
    out[ad] = met === 0 ? xam : await _inflateRaw(xam);
    p += 46 + nl + el + cl;
  }
  return out;
}
const _xmlDe = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c)).replace(/&amp;/g, "&");
function _sutun(r) { let n = 0; for (const c of r.replace(/\d+/g, "")) n = n * 26 + c.charCodeAt(0) - 64; return n; }
// Excel -> {sehife adı: [[...sətir]]} (yalnız ad uyğun gələn vərəq)
async function xlsxOxu(buf, vereqAdi) {
  const f = await zipOxu(buf), td = new TextDecoder();
  const txt = (a) => (f[a] ? td.decode(f[a]) : "");
  const ss = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => _xmlDe([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const wb = txt("xl/workbook.xml"), rels = txt("xl/_rels/workbook.xml.rels");
  const vlar = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ ad: _xmlDe((m[0].match(/name="([^"]*)"/) || [])[1] || ""), rid: (m[0].match(/r:id="([^"]*)"/) || [])[1] }));
  const v = vlar.find((x) => x.ad === vereqAdi) || vlar[0];
  if (!v) throw new Error("Excel-də vərəq tapılmadı.");
  let yol = "";
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) if ((m[0].match(/Id="([^"]*)"/) || [])[1] === v.rid) yol = (m[0].match(/Target="([^"]*)"/) || [])[1];
  yol = yol.replace(/^\//, ""); if (!yol.startsWith("xl/")) yol = "xl/" + yol;
  const xml = txt(yol), setirler = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const s = []; 
    for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = cm[1], r = (at.match(/\br="([A-Z]+)\d+"/) || [])[1]; if (!r) continue;
      const t = (at.match(/\bt="([^"]*)"/) || [])[1], ic = cm[2] || "";
      const vv = (ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let d = null;
      if (t === "s") d = vv != null ? ss[+vv] : null;
      else if (t === "inlineStr") d = _xmlDe([...ic.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (t === "str") d = vv != null ? _xmlDe(vv) : null;
      else if (vv != null && vv !== "") d = t === "b" ? vv === "1" : Number(vv);
      s[_sutun(r) - 1] = d;
    }
    setirler[+rm[1] - 1] = s;
  }
  return Array.from(setirler, (x) => x || []);
}

const _s = (x) => (x == null ? "" : String(x).trim());
const _n = (x) => { if (x == null || x === "") return null; const v = typeof x === "number" ? x : Number(String(x).replace(/\s/g, "").replace(",", ".")); return isNaN(v) ? NaN : v; };
const _r = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const _edvNov = (t) => { const k = _s(t).toLowerCase().replace(/\s/g, ""); return k === "18%" || k === "18" || k === "0.18" || k === "" ? "18" : k === "0%" || k === "0" ? "0" : k === "azad" ? "azad" : /cəlb|celb/.test(k) ? "celb" : null; };

// sətirlər -> qaimələr (eyni «Qaimə №» bir qaimə); xətalar siyahısı
function qaimeQrupla(setirler) {
  const qs = new Map(), xeta = [];
  for (let i = 1; i < setirler.length; i++) {
    const s = setirler[i]; if (!s || !s.some((x) => x != null && x !== "")) continue;
    const no = i + 1, ad = _s(s[4]);
    if (!ad && !_s(s[0]) && _n(s[8]) == null) continue;
    const key = _s(s[0]) || "_" + no, nov_ = /avans/i.test(_s(s[18])) ? "advanceInvoice" : "defaultInvoice";
    if (!qs.has(key)) qs.set(key, { key, voen: _s(s[1]).replace(/\D/g, ""), esas: _s(s[2]), obyekt: _s(s[3]), alAd: _s(s[19]), mallar: [], ilk: no, kind: nov_ });
    const q = qs.get(key);
    if (q.kind !== nov_) xeta.push(`Sətir ${no}: eyni qaimədə Mal və Avans qarışıb.`);
    if (_s(s[1]).replace(/\D/g, "") !== q.voen) xeta.push(`Sətir ${no}: alıcı VÖEN eyni qaimədə fərqlidir.`);
    const miq = _n(s[8]), qiy = _n(s[9]), aks = _n(s[10]), yol = _n(s[12]), nov = _edvNov(s[11]);
    if (!ad) xeta.push(`Sətir ${no}: malın adı yoxdur.`);
    if (!_s(s[7])) xeta.push(`Sətir ${no}: ölçü vahidi yoxdur.`);
    if (miq == null || isNaN(miq) || miq <= 0) xeta.push(`Sətir ${no}: miqdar düzgün deyil.`);
    if (qiy == null || isNaN(qiy) || qiy < 0) xeta.push(`Sətir ${no}: qiymət düzgün deyil.`);
    if (aks != null && isNaN(aks)) xeta.push(`Sətir ${no}: aksiz dərəcəsi düzgün deyil.`);
    if (yol != null && isNaN(yol)) xeta.push(`Sətir ${no}: yol vergisi düzgün deyil.`);
    if (!nov) xeta.push(`Sətir ${no}: ƏDV növü tanınmadı (18%, 0%, azad, cəlb edilmir).`);
    q.mallar.push({ no, ad, kod: _s(s[5]), gtin: _s(s[6]), vahid: _s(s[7]), miq, qiy, aks: aks || 0, nov, yol: yol || 0 });
  }
  for (const q of qs.values()) {
    if (!/^\d{10}$/.test(q.voen)) xeta.push(`Qaimə «${q.key}» (sətir ${q.ilk}): alıcı VÖEN 10 rəqəm olmalıdır.`);
    if (!q.esas) xeta.push(`Qaimə «${q.key}» (sətir ${q.ilk}): «Əsas» boşdur.`);
  }
  return { qaimeler: [...qs.values()], xeta };
}
function qaimeSetiri(m, vahidKodu) {
  // e-taxes sətir məbləğini miqdar × qiymət kimi (yuvarlaqlaşdırmadan) saxlayır; ƏDV bazası eyni olmalıdır, yoxsa cəmi uyğunsuz çıxır
  const _r6 = (x) => Math.round((x + Number.EPSILON) * 1e6) / 1e6;
  const cost = _r6(m.miq * m.qiy), excise = _r(cost * m.aks / 100), baza = _r6(cost + excise);
  return {
    productName: m.ad, unit: m.vahid, quantity: m.miq, pricePerUnit: m.qiy, cost,
    exciseRate: m.aks ? m.aks : null, excise,
    vat18: m.nov === "18" ? baza : 0, vat0: m.nov === "0" ? baza : 0, vatFree: m.nov === "azad" ? baza : 0, exempt: m.nov === "celb" ? baza : 0,
    roadTax: m.yol, barcode: m.gtin || null, commission: null, serviceCost: 0, packagingGoodsNumber: null,
    unitCode: vahidKodu, productGroupCode: m.kod || null, returnReasonCode: null, sourceInvoiceItemId: null, sourceInvoiceSerialNumber: null,
  };
}
function qaimeGovdesi(q, ad, serial, vahidler) {
  return {
    kind: q.kind,
    receiver: { tin: q.voen, pin: null, passportSerialNumber: null, name: ad, objectName: q.obyekt || "", objectCode: null },
    resaleType: null, serialNumber: serial, invoiceComment: q.esas, invoiceComment2: "", type: "current",
    items: q.mallar.map((m) => qaimeSetiri(m, vahidler[m.vahid.toLowerCase()])),
    vehicleRegistrationNumber: "", senderObjectName: "", senderObjectCode: "",
  };
}
async function vahidSiyahisi(et) {
  const r = await et.istek("GET", "/api/po/dictionary/public/v1/units");
  if (r.status >= 400) throw new Error("Ölçü vahidləri siyahısı alınmadı (" + r.status + ")");
  const m = {};
  for (const x of JSON.parse(r.text).items || []) { const a = x.name && x.name.az; if (a) m[String(a).toLowerCase()] = x.code; }
  return m;
}
