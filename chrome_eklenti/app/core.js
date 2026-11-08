// Köməkçi funksiyalar, e-taxes sorğuları və qaimənin çevrilməsi (Python proqramının eyni məntiqi).
const ETAX = "https://new.e-taxes.gov.az";
const REYESTR_URL = ETAX + "/api/po/authless/public/v1/authless/findTaxpayer";
const AYAR_DEF = {
  sheher: "Bakı şəhəri",
  giris_sablon: "Biz, aşağıda imza edənlər, Satıcı {satici} (VÖEN {satici_voen}) və Alıcı {alici} (VÖEN {alici_voen}), bu aktı tərtib etdik ona görə ki, {esas}aşağıda göstərilən mallar Satıcı tərəfindən təhvil verilmiş, Alıcı tərəfindən qəbul edilmişdir.",
  iddia_cumlesi: "",
  protokol_yarat: true,
  protokol_basliq: "QİYMƏT RAZILAŞDIRMA PROTOKOLU",
  protokol_giris_sablon: "",
  hesab_basliq: "HESAB-FAKTURA",
  hesab_giris_sablon: "Satıcı {satici} (VÖEN {satici_voen}) tərəfindən Alıcı {alici} (VÖEN {alici_voen}) üçün {esas}aşağıda göstərilən mallar üzrə hesab-faktura təqdim edilir. Ödənişin aşağıda göstərilən bank rekvizitlərinə köçürülməsi xahiş olunur.",
  direktor_duzelis: {},
  esas_evezlemeleri: [["müqaviləsi\\s*$", "müqaviləsinə"]],
  tip_adlari: {},
};
let AYAR = { ...AYAR_DEF };
let LOG = (m) => {};
let DAYANDI = () => false;

const STATUS_AZ = {
  approved: "Təsdiqləndi", onApproval: "Təsdiq gözləyir", approvedBySystem: "Sistem tərəfindən təsdiqlənib",
  updateApproval: "Dəyişiklik təsdiqi gözləyir", updateRequested: "Dəyişiklik tələb olunub",
  cancelRequested: "Ləğv tələb olunub", onApprovalEdited: "Düzəliş təsdiq gözləyir", deactivated: "Ləğv edilib",
  cancelationRefused: "Ləğvetmə rədd edilib", deleted: "Silindi", deletedBySystem: "Sistem tərəfindən silindi",
  cancelled: "Ləğv edilib", canceled: "Ləğv edilib", passive: "Passiv", correctionRefused: "Düzəliş rədd edilib",
};
// tanış olmayan statusu söz parçasına görə tapır (cancel -> Ləğv edilib, delet -> Silindi, passiv/inactive -> Passiv)
function statusAz(k) {
  if (!k) return "";
  if (STATUS_AZ[k]) return STATUS_AZ[k];
  const a = String(k).toLowerCase();
  if (a.includes("cancel") && !a.includes("request")) return "Ləğv edilib";
  if (a.includes("delet")) return a.includes("system") ? "Sistem tərəfindən silindi" : "Silindi";
  if (a.includes("passiv") || a.includes("inactive")) return "Passiv";
  return String(k);
}
const NOV_AZ = { current: "Cari", corrected: "Düzəliş edilmiş" };
const TIP_AZ = {
  MT: "Malların, işlərin və xidmətlərin təqdim edilməsi barədə elektron qaimə-faktura",
  MQ: "Malların qaytarılması barədə elektron qaimə-faktura",
};

// ------------------------------------------------------------------ köməkçilər
function azLower(s) { return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase(); }
function azAdlandir(ad) {
  return ad.trim().split(/\s+/).filter(Boolean).map((w) => {
    const k = azLower(w);
    if (["oğlu", "qızı", "oglu", "qizi", "ogly"].includes(k)) return k;
    return (k[0] === "i" ? "İ" : k[0].toLocaleUpperCase("az")) + k.slice(1);
  }).join(" ");
}
function fmt(x) {
  const neg = x < 0;
  let [i, d] = Math.abs(x).toFixed(2).split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + i + "," + d;
}
function fmtQiymet(x) {
  const t = Math.abs(x).toFixed(9).replace(/0+$/, "");
  const dec = t.includes(".") ? t.split(".")[1] : "";
  if (dec.length <= 2) return fmt(x);
  return (x < 0 ? "-" : "") + String(Math.floor(Math.abs(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}
function num(s) {
  const t = String(s == null ? "" : s).trim().replace(/\s/g, "");
  const v = t ? parseFloat(t) : 0;
  return isNaN(v) ? 0 : v;
}
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const TEKLER = ["", "bir", "iki", "üç", "dörd", "beş", "altı", "yeddi", "səkkiz", "doqquz"];
const ONLAR = ["", "on", "iyirmi", "otuz", "qırx", "əlli", "altmış", "yetmiş", "səksən", "doxsan"];
function ucReqemli(n) {
  const s = [], y = Math.floor(n / 100), o = Math.floor(n / 10) % 10, t = n % 10;
  if (y) s.push((y === 1 ? "" : TEKLER[y] + " ") + "yüz");
  if (o) s.push(ONLAR[o]);
  if (t) s.push(TEKLER[t]);
  return s.join(" ");
}
function yaziIle(n) {
  if (n === 0) return "sıfır";
  const p = [];
  for (const [bol, ad] of [[1e9, "milyard"], [1e6, "milyon"], [1000, "min"]]) {
    const q = Math.floor(n / bol);
    if (q) { p.push(ad === "min" && q === 1 ? "min" : ucReqemli(q) + " " + ad); n %= bol; }
  }
  if (n) p.push(ucReqemli(n));
  return p.join(" ");
}
function meblegYazi(yekun) {
  yekun = r2(yekun);
  const m = Math.floor(yekun), q = Math.round((yekun - m) * 100);
  const s = `${yaziIle(m)} manat ${String(q).padStart(2, "0")} qəpik`;
  return (s[0] === "i" ? "İ" : s[0].toUpperCase()) + s.slice(1);
}
function tarixCevir(s) {
  s = String(s || "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = s.match(/^(\d{2})[-./](\d{2})[-./](\d{4})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s;
}
function tarixSaat(s) {
  s = String(s || "");
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d)) {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", day: "2-digit", month: "2-digit",
        year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
      return `${p.day}.${p.month}.${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
    }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
  return tarixCevir(s);
}
function iso(s) { // dd.mm.yyyy -> yyyy-mm-dd
  const m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function tarixTap(x) {
  for (const k of ["creationDate", "createdAt", "invoiceDate", "date", "creationTime", "created", "createDate", "modifiedAt"]) {
    const v = x[k];
    if (!v) continue;
    const s = String(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{2})[.\-](\d{2})[.\-](\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}
const araliqda = (t, dan, ya) => dan <= t && t <= ya;  // ISO sətirləri
const ddmmyyyy = (isoS) => isoS.split("-").reverse().join("-");
const gozle = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ reyestr (direktor)
let _reyKesh = null, _reyYaz = Promise.resolve();
const _reyGozleyen = {};  // eyni VÖEN eyni anda bir dəfə sorğulanır
async function reyestr(voen) {
  if (!_reyKesh) _reyKesh = (await KOPRU("get", { key: "direktorlar" })) || {};
  if (_reyKesh[voen]) return _reyKesh[voen];
  if (_reyGozleyen[voen]) return _reyGozleyen[voen];
  return (_reyGozleyen[voen] = (async () => {
    const r = await KOPRU("fetch", { url: REYESTR_URL, metod: "POST",
      json: { tin: voen, type: "legalEntity", serviceCode: "checkLegalName", isStateRegistry: true } });
    try {
      const t = JSON.parse(r.text).taxpayers[0];
      const n = { ad: t.name, direktor: azAdlandir(t.legalTaxpayerStatus.legitimate) };
      _reyKesh[voen] = n;
      _reyYaz = _reyYaz.then(() => KOPRU("set", { key: "direktorlar", value: _reyKesh }));  // yazmalar növbə ilə
      return n;
    } catch (e) { LOG(`  ! Reyestr sorğusu alınmadı (${voen})`); return null; }
    finally { delete _reyGozleyen[voen]; }
  })());
}
const _SOYAD = ["yeva", "yev", "ova", "eva", "ov", "ev", "zadə", "zade", "ski", "skaya"];
const _SOYAD_UZUN = ["lı", "li", "lu", "lü"];  // yalnız uzun sözlərdə (Əli, Vəli kimi adlarla qarışmasın)
const _ATA = ["oğlu", "qızı", "oglu", "qizi", "ogly", "kızı"];
function _soyaddir(t) { const k = azLower(t); return _SOYAD.some((x) => k.endsWith(x)) || (k.length >= 6 && _SOYAD_UZUN.some((x) => k.endsWith(x))); }
// Fərdi sahibkarın adı: Soyad Ad Ata adı sırası ilə
function soyadAdAta(ad) {
  const tok = ad.trim().replace(/^"|"$/g, "").split(/\s+/).filter(Boolean);
  const i = tok.findIndex((t, k) => k >= 1 && _ATA.includes(azLower(t)));
  if (i < 0) return azAdlandir(tok.join(" "));
  const ata = tok.slice(i - 1, i + 1);
  let qalan = [...tok.slice(0, i - 1), ...tok.slice(i + 1)];
  if (qalan.length === 2 && !_soyaddir(qalan[0]) && _soyaddir(qalan[1])) qalan = [qalan[1], qalan[0]];
  return azAdlandir([...qalan, ...ata].join(" "));
}
async function teref(voen, adQaime) {
  if (String(voen).endsWith("2")) {
    // VÖEN sonu 2 = fərdi sahibkar: reyestrə sorğu yoxdur
    const sexs = soyadAdAta(adQaime || String(voen));
    return { voen, ad: sexs, rol: "Fərdi Sahibkar", direktor: (AYAR.direktor_duzelis || {})[voen] || sexs };
  }
  const r = await reyestr(voen);
  const ad = (r && r.ad) || adQaime || voen;
  const full = ad.startsWith('"') || ad.includes("Cəmiyyət") ? ad : `"${ad}"`;
  const kicik = azLower(ad.replace(/^"|"$/g, "").trim());
  const rol = /(oğlu|qızı)$/.test(kicik) ? "Fərdi Sahibkar" : "Direktor";
  let direktor = (AYAR.direktor_duzelis || {})[voen] || (r && r.direktor) || "";
  if (!direktor && rol === "Fərdi Sahibkar") direktor = soyadAdAta(ad);
  return { voen, ad: full, rol, direktor };
}
function esasCumle(q) {
  let es = (q.esas || "").trim();
  if (!es) return "";
  for (const [desen, evez] of AYAR.esas_evezlemeleri || []) es = es.replace(new RegExp(desen), evez);
  if (!/əsasən\s*$/.test(es)) es += " əsasən";
  return es + " ";
}
const _tip = (t) => (t === true ? "protokol" : t || "tta");  // köhnə boolean çağırışlarla uyğunluq
function aktBasliq(t) { t = _tip(t); return t === "protokol" ? AYAR.protokol_basliq : t === "hesab" ? AYAR.hesab_basliq : "TƏHVİL-TƏSLİM AKTI"; }
function girisMetni(q, sat, alc, tip) {
  tip = _tip(tip);
  let sablon = AYAR.giris_sablon;
  if (tip === "protokol") sablon = AYAR.protokol_giris_sablon || sablon.replace("bu aktı", "bu protokolu");
  if (tip === "hesab") sablon = AYAR.hesab_giris_sablon;
  const d = { satici: sat.ad, satici_voen: sat.voen, alici: alc.ad, alici_voen: alc.voen, esas: esasCumle(q) };
  return sablon.replace(/\{(\w+)\}/g, (a, k) => (k in d ? d[k] : a));
}
// Hesab-faktura üçün satıcının bank rekvizitləri (istifadəçi özü daxil edir): {"VÖEN" və ya "*": {ad, kod, bvoen, mh, swift, hesab}}
const REKV_SETRI = [["ad", "Bank"], ["kod", "Bank kodu"], ["bvoen", "Bankın VÖEN-i"], ["mh", "Müxbir hesab (M/H)"], ["swift", "SWIFT"], ["hesab", "Hesab nömrəsi (IBAN)"]];
async function rekvizitler() { return (await KOPRU("get", { key: "rekvizitler" })) || {}; }
function rekvizitSec(dict, voen) { return dict[voen] || dict["*"] || null; }
const edvEtiketi = (q) => (q.cemi && Math.abs(q.edv - r2(q.cemi * 0.18)) < 0.02 ? "ƏDV (18%)" : "ƏDV");

// ------------------------------------------------------------------ e-taxes sorğuları
class SessiyaXetasi extends Error {}
class ETaxes {
  constructor() { this.bearer = false; }
  async istek(metod, yol, { json, params } = {}) {
    let url = ETAX + yol;
    if (params) url += "?" + new URLSearchParams(params);
    const gozleyis = [3, 6, 12, 20, 30];
    for (let ev = 0; ev < 2; ev++) {
      let r;
      for (let i = 0; i <= gozleyis.length; i++) {
        r = await KOPRU("fetch", { url, metod, json, auth: true, bearer: this.bearer });
        if (r.sessiya) throw new SessiyaXetasi("e-taxes-ə daxil olunmayıb");
        if (!r.sebeke) break;
        if (i === gozleyis.length) throw new Error("bağlantı kəsildi");
        LOG(`  ... bağlantı kəsildi, ${gozleyis[i]} san. gözləyib yenidən cəhd edirəm (${i + 1}/${gozleyis.length})`);
        await gozle(gozleyis[i] * 1000);
      }
      if ((r.status === 401 || r.status === 403) && !this.bearer) { this.bearer = true; continue; }
      if (r.status === 401 || r.status === 403) throw new SessiyaXetasi("Sessiya bitib. e-taxes səhifəsində yenidən daxil olun.");
      return r;
    }
  }
  async siyahi(istiqamet, dan, ya, serial) { // dan/ya: ISO; serial: yalnız bu nömrəli qaimə
    const yaG = new Date(ya + "T00:00:00Z"); yaG.setUTCDate(yaG.getUTCDate() + 1);
    const yaS = yaG.toISOString().slice(0, 10).split("-").reverse().join("-");
    const govde = {
      sortBy: "creationDate", sortAsc: true,
      statuses: null,  // null = bütün statuslar (e-taxes-də "Bütün statuslar")
      types: ["current", "corrected"],
      kinds: ["defaultInvoice", "agent", "resale", "recycling", "taxCodex163", "taxCodex177_5", "returnInvoice", "returnByAgent",
        "returnRecycled", "exportNoteInvoice", "exciseGoodsTransfer", "advanceInvoice"],
      serialNumber: serial || null, senderTin: null, senderName: null, productName: null, productCode: null, receiverTin: null,
      receiverName: null, creationDateFrom: `${ddmmyyyy(dan)} 00:00`, creationDateTo: `${yaS} 00:00`,
      amountFrom: null, amountTo: null, offset: 0, maxCount: 50, actionOwner: null,
    };
    const STATUS_SIYAHI = ["approved", "onApproval", "updateApproval", "updateRequested", "cancelRequested", "approvedBySystem",
      "onApprovalEdited", "deactivated", "cancelationRefused", "correctionRefused"];
    const netice = []; let ilk = true, merhele = 0;
    for (;;) {
      const r = await this.istek("POST", `/api/po/invoice/public/v2/invoice/find.${istiqamet}`, { json: govde });
      if (r.status === 400 && ilk) {
        merhele++;
        if (merhele === 1) govde.statuses = STATUS_SIYAHI;                       // 2) köhnə status siyahısı
        else { Object.assign(govde, { statuses: null, types: null, kinds: null }); ilk = false; }  // 3) hamısı boş
        continue;
      }
      ilk = false;
      if (r.status >= 400) throw new Error("siyahı alınmadı (" + r.status + ")");
      const j = JSON.parse(r.text);
      const sira = j.invoices || [];
      netice.push(...sira);
      if (!j.hasMore || !sira.length) break;
      govde.offset += sira.length;
    }
    return netice;
  }
  async json(metod, yol, o) {
    const r = await this.istek(metod, yol, o);
    if (r.status >= 400) throw new Error("HTTP " + r.status);
    return JSON.parse(r.text);
  }
  detay(q) { return this.json("GET", `/api/po/invoice/public/v2/invoice/${q.id}`, { params: { sourceSystem: q.sourceSystem || "avis" } }); }
}
async function ekAl(cl, yol, o) {
  try { return await cl.json(o && o.json ? "POST" : "GET", yol, o); }
  catch (e) { if (e instanceof SessiyaXetasi) throw e; LOG(`  ! ${yol.split("/").pop().slice(0, 40)}: alınmadı (${e.message})`); return null; }
}
async function tarixceAl(cl, q) {
  const sn = q.serialNumber || "", ss = { sourceSystem: q.sourceSystem || "avis" };
  const base = `/api/po/invoice/public/v1/invoice/${q.id}`;
  const [h0, v0, t0, e0] = await Promise.all([   // 4 sorğu eyni anda
    ekAl(cl, base + "/history", { params: ss }),
    ekAl(cl, base + "/versions", { params: ss }),
    ekAl(cl, "/api/po/invoice/public/v1/invoice/tree", { json: { serialNumbers: [sn] } }),
    ekAl(cl, `/api/po/invoice/public/v1/invoice/get-related-invoice-tree/${sn}`),
  ]);
  const h = h0 || {}, v = v0 || {}, t = t0 || {}, e = e0 || {};
  return { sn, events: h.events || [], versions: v.versions || [], tree: t.invoiceTree || [], related: e.parentInvoiceHistories || [] };
}

// ------------------------------------------------------------------ qaimənin çevrilməsi
const KIND_AZ = {
  advanceInvoice: "Avans qaiməsi",
  defaultInvoice: "Malların, işlərin və xidmətlərin təqdim edilməsi barədə elektron qaimə-faktura",
  returnInvoice: "Malların qaytarılması barədə elektron qaimə-faktura",
};
function qaimeTipi(sn, d) {
  const t = (AYAR.tip_adlari || {})[sn.slice(0, 2)] || TIP_AZ[sn.slice(0, 2)];
  if (t) return t;
  for (const k of ["invoiceTypeName", "invoiceType", "documentType", "kind", "typeName"]) {
    let v = (d || {})[k];
    if (v && typeof v === "object") v = v.name && typeof v.name === "object" ? v.name.az : v.name;
    if (v) return KIND_AZ[String(v)] || String(v);
  }
  return sn.slice(0, 2);
}
function qaytarmaSebebi(it) {
  for (const [k, v0] of Object.entries(it)) {
    let v = v0;
    if (k.toLowerCase().includes("reason") && v != null && v !== "" && !(Array.isArray(v) && !v.length)) {
      if (v && typeof v === "object") v = v.name && typeof v.name === "object" ? v.name.az : (v.name || v.value || "");
      return String(v || "");
    }
  }
  return "";
}
function qaimeCevir(d, istiqamet, ek) {
  const sn = d.serialNumber || "";
  const mallar = (d.items || []).map((it, i) => {
    const cost = r2(num(it.cost));
    const edv = num(it.vat18) > 0 ? r2(cost * 0.18) : 0;
    const olcu = (((it.unitFromDict || {}).name || {}).az) || it.unit || "";
    return { sira: i + 1, ad: (it.productName || "").split(/\s+/).filter(Boolean).join(" "),
      kod: (it.productGroup || {}).code || "", olcu, miqdar: num(it.quantity), qiymet: num(it.pricePerUnit),
      mebleg: cost, edv, yekun: r2(cost + edv), sebeb: qaytarmaSebebi(it) };
  });
  const yekun = r2(num(d.amount)), edv = r2(num(d.vat)), cemi = r2(yekun - edv);
  const toplam = r2(mallar.reduce((a, m) => a + m.mebleg, 0));
  if (Math.abs(toplam - cemi) > 0.02) LOG(`  ! ${sn}: mal sətirlərinin cəmi (${toplam}) ilə qaimənin ƏDV-siz məbləği (${cemi}) üst-üstə düşmür`);
  const s = d.sender || {}, r = d.receiver || {};
  return { seriya: sn.slice(0, 6), nomre: sn.slice(6), tarix: tarixCevir(d.createdAt),
    status: statusAz(d.status), istiqamet,
    gonderen_voen: s.tin || "", gonderen_ad: s.name || "", qebul_voen: r.tin || "", qebul_ad: r.name || "",
    esas: (d.invoiceComment || "").trim(), esas2: (d.invoiceComment2 || "").trim(), mallar, cemi, edv, yekun,
    novu: NOV_AZ[d.type] || d.type || "", tip: qaimeTipi(sn, d), versiya_no: d.version, ...tarixceXulase(ek),
    _avansdir: /advance|avans/i.test(String(d.kind || d.invoiceKind || "") + " " + qaimeTipi(sn, d)) };
}
// avans qaiməsi <-> normal qaimə bağlantısı (əlaqəli qaimələr siyahısından)
function avansBagla(q) {
  const el = q.elaqeli_siyahi || [];
  const avm = (e) => /advance|avans/i.test((e.novu || "") + " " + (e.xam || ""));
  const yaz = (e) => `${e.nomre}${e.tarix ? " (" + e.tarix + ")" : ""}`;
  q.bagli_avans = q._avansdir ? "" : el.filter(avm).map(yaz).join("; ");
  q.bagli_normal = q._avansdir ? el.filter((e) => !avm(e)).map(yaz).join("; ") : "";
  return q;
}
const SN_AC = ["serialNumber", "invoiceSerialNumber", "serial", "number", "invoiceNumber"];
const TARIX_AC = ["invoiceDate", "createdAt", "date", "operationDate", "modifiedAt", "created", "creationDate"];
const NOV_AC = ["type", "invoiceType", "relationType", "kind", "operationType", "typeName", "invoiceKind"];
const STATUS_AC = ["status", "state"];
function elaqeliAc(...kokler) {
  const out = [], gorulen = new Set();
  const ilk = (d, ac) => { for (const a of ac) { const v = d[a]; if (v != null && v !== "" && typeof v !== "object") return v; } return ""; };
  const yur = (x, ata = "") => {
    if (Array.isArray(x)) { x.forEach((i) => yur(i, ata)); return; }
    if (!x || typeof x !== "object") return;
    const sn = ilk(x, SN_AC);
    let cariAta = ata;
    if (sn) {
      const acar = [sn, String(ilk(x, TARIX_AC)), String(ilk(x, NOV_AC)), ata].join("|");
      if (!gorulen.has(acar)) {
        gorulen.add(acar);
        const tr = Object.entries(x).filter(([k, v]) => typeof v !== "object" && v &&
          ["tin", "voen", "taxpayer", "sender", "owner", "company"].some((z) => k.toLowerCase().includes(z))).map(([, v]) => String(v));
        out.push({ teref: tr.join(" / "), nomre: String(sn), tarix: tarixSaat(ilk(x, TARIX_AC)),
          novu: String(ilk(x, NOV_AC)) || TIP_AZ[String(sn).slice(0, 2)] || "",
          status: STATUS_AZ[ilk(x, STATUS_AC)] || String(ilk(x, STATUS_AC)), ata, xam: JSON.stringify(x).slice(0, 800) });
      }
      cariAta = String(sn);
    }
    for (const v of Object.values(x)) if (v && typeof v === "object") yur(v, cariAta);
  };
  kokler.forEach((k) => yur(k));
  return out;
}
function tarixceXulase(ek) {
  const r = { gonderildi: "", tesdiqlendi: "", tesdiq_eden: "", legv: "", ek, duzelis: "", duzelis_tarixi: "", duzelis_eden: "", elaqeli: "", elaqeli_siyahi: [] };
  if (!ek) return r;
  const vs = [...(ek.versions || [])].sort((a, b) => (a.versionNumber || 0) - (b.versionNumber || 0));
  if (vs.length > 1) {
    const son = vs[vs.length - 1];
    r.duzelis = `Bəli (${vs.length} versiya)`; r.duzelis_tarixi = tarixSaat(son.modifiedAt); r.duzelis_eden = son.modifiedBy || "";
  } else if (vs.length) r.duzelis = "Xeyr";
  const el = elaqeliAc(ek.tree, ek.related).filter((e) => e.nomre !== (ek.sn || ""));
  r.elaqeli_siyahi = el;
  r.elaqeli = el.map((e) => `${e.nomre} (${e.tarix}${e.novu ? ", " + e.novu : ""})`).join("; ");
  const ev = [...ek.events].sort((a, b) => String(a.modifiedAt || "").localeCompare(String(b.modifiedAt || "")));
  const gond = ev.filter((x) => x.status === "onApproval");
  const tes = ev.filter((x) => ["approved", "approvedBySystem"].includes(x.status));
  if (gond.length) r.gonderildi = tarixSaat(gond[0].modifiedAt);
  if (tes.length) { const son = tes[tes.length - 1]; r.tesdiqlendi = tarixSaat(son.modifiedAt); r.tesdiq_eden = son.userName || ""; }
  const leg = ev.filter((x) => ["deactivated"].includes(x.status) || (/cancel/i.test(x.status || "") && !/request/i.test(x.status)));
  const sil = ev.filter((x) => /delet/i.test(x.status || ""));
  const legG = ev.filter((x) => x.status === "cancelRequested");
  if (leg.length) r.legv = "Ləğv edildi: " + tarixSaat(leg[leg.length - 1].modifiedAt);
  else if (sil.length) r.legv = "Silindi: " + tarixSaat(sil[sil.length - 1].modifiedAt);
  else if (legG.length) r.legv = "Ləğvə göndərildi: " + tarixSaat(legG[legG.length - 1].modifiedAt);
  return r;
}

// ------------------------------------------------------------------ qaimələrin toplanması
async function qaimeleriTopla({ istiqamet, dan, ya, voen, nomre, sade }, progress) {
  const cl = new ETaxes();
  const yonler = { gelen: [["inbox", "Gələn"]], gonderilen: [["outbox", "Göndərilən"]] }[istiqamet] || [["inbox", "Gələn"], ["outbox", "Göndərilən"]];
  const qaimeler = [], ugursuz = [];
  const PARALEL = 6;  // eyni anda neçə qaimə işlənir
  const isle = async (x, ad, i, n) => {
    const [d, ek] = await Promise.all([cl.detay(x), sade ? null : tarixceAl(cl, x)]);
    const q = avansBagla(qaimeCevir(d, ad, ek));
    const t = iso(q.tarix);
    if (!(nomre && nomre.length) && t && !araliqda(t, dan, ya)) return null;
    if (voen && voen.length && !voen.some((v) => v === q.gonderen_voen || v === q.qebul_voen)) return null;
    LOG(`  ${i}/${n} ${q.seriya + q.nomre} ${q.tarix} ${q.status}`);
    progress && progress(++hazir, n);
    return q;
  };
  let hazir = 0;
  // qaimələri paralel götürür, nəticəni əvvəlki sıra ilə qaytarır
  const paralel = async (sira, ad, ugursuzSiyahi) => {
    const netice = new Array(sira.length).fill(null);
    let nov = 0;
    const isci = async () => {
      while (!DAYANDI()) {
        const i = nov++;
        if (i >= sira.length) return;
        try { netice[i] = await isle(sira[i], ad, i + 1, sira.length); }
        catch (e) {
          if (e instanceof SessiyaXetasi) throw e;
          LOG(`! ${sira[i].serialNumber}: götürülmədi (${String(e.message).slice(0, 90)})`);
          ugursuzSiyahi.push([sira[i], ad, i + 1, sira.length]);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALEL, sira.length) }, isci));
    return netice.filter(Boolean);
  };
  for (const [kod, ad] of yonler) {
    if (DAYANDI()) break;
    let sira = await cl.siyahi(kod, dan, ya);
    if (nomre && nomre.length) sira = sira.filter((x) => nomre.includes(x.serialNumber));
    else sira = sira.filter((x) => { const t = tarixTap(x); return t === null || araliqda(t, dan, ya); });
    LOG(`${ad} qaimələr (${ddmmyyyy(dan)} - ${ddmmyyyy(ya)}): ${sira.length} ədəd`);
    hazir = 0;
    qaimeler.push(...(await paralel(sira, ad, ugursuz)));
    if (DAYANDI()) LOG("Dayandırıldı.");
  }
  if (ugursuz.length && !DAYANDI()) {
    LOG(`\n${ugursuz.length} qaimə götürülə bilmədi. 15 saniyə sonra bir də cəhd edirəm...`);
    await gozle(15000);
    const qalan = [];
    for (const [x, ad, i, n] of ugursuz) {
      try { const q = await isle(x, ad, i, n); if (q) qaimeler.push(q); } catch (e) {
        if (e instanceof SessiyaXetasi) throw e;
        LOG(`! ${x.serialNumber}: yenə götürülmədi`); qalan.push(x.serialNumber);
      }
    }
    if (qalan.length) LOG("\nGötürülməyən qaimələr: " + qalan.join(" ") + "\nBunları nömrə yazaraq təkrar götürə bilərsiniz.");
  }
  return qaimeler;
}


// ------------------------------------------------------------------ ƏDV əvəzləşməsi (bəyannamələrdən)
const AYLAR_AZ = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const BEY_NOV_AZ = { CURRENT: "Cari", CLARIFYING: "Dəqiqləşdirilmiş", CAMERAL: "Kameral" };
const BEY_STATUS_AZ = { CONFIRMED: "Təsdiqlənmiş", ON_CHECK: "Uyğunsuzluq yoxlamasında", FILED: "Təqdim edilib" };
const BEY_API = "/api/po/declaration/public/v1";

// dan/ya: "YYYY-MM". Hər ay üçün SONUNCU (qeydiyyat tarixinə görə) ƏDV bəyannaməsi: cari, dəqiqləşdirilmiş və ya kameral
async function edvBeyannameleri(cl, dan, ya) {
  const [dI, dA] = dan.split("-").map(Number), [yI, yA] = ya.split("-").map(Number);
  const acar = (il, ay) => il * 12 + ay, d1 = acar(dI, dA), d2 = acar(yI, yA);
  const gor = new Map();
  for (let il = dI; il <= yI + 1; il++) {  // qeydiyyat ili hesabat ilindən sonra ola bilər
    let j;
    try { j = await cl.json("GET", `${BEY_API}/declaration/list?year=${il}`); }
    catch (e) { if (e instanceof SessiyaXetasi) throw e; LOG(`! ${il}: bəyannamə siyahısı alınmadı (${e.message})`); continue; }
    for (const x of j.declarations || []) {
      const d = x.declaration;
      if (!d || !(d.taxCode === "_0300" || /Əlavə dəyər/.test(d.taxName || ""))) continue;
      const rp = d.reportingPeriod || {};
      if (rp.type !== "MONTH" || /DRAFT|DELET/i.test(d.declarationStatus || "")) continue;
      const k = acar(rp.year, rp.month);
      if (k < d1 || k > d2) continue;
      gor.set(d.registrationNumber, { il: rp.year, ay: rp.month, no: d.registrationNumber, nov: d.declarationType,
        status: d.declarationStatus, reg: (d.registrationDate || "").slice(0, 10), gonder: d.submissionDate || "", tutar: d.taxAmount });
    }
  }
  const ay = new Map();
  for (const b of gor.values()) {
    const k = acar(b.il, b.ay), c = ay.get(k);
    if (!c || (b.reg + b.gonder + b.no) > (c.reg + c.gonder + c.no)) ay.set(k, b);
  }
  return [...ay.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
}
async function beyCedvel(cl, kod, no) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    let a = null, son = null;
    for (let c = 0; c < 3 && a === null; c++) {
      try { a = JSON.parse((await cl.json("GET", `${BEY_API}/calc/${kod}?reg_number=${no}&offset=${off}&maxCount=1000`)).calcPartJson || "[]"); }
      catch (e) { if (e instanceof SessiyaXetasi) throw e; son = e; await gozle(1500); }
    }
    if (a === null) throw son || new Error("cədvəl alınmadı");
    out.push(...a);
    if (a.length < 1000) break;
  }
  return out;
}
const _tarixIso = (s) => String(s || "").slice(0, 10).split("-").reverse().join(".");
async function edvEvezlesmesi({ dan, ya }, progress) {
  const cl = new ETaxes();
  const bey = await edvBeyannameleri(cl, dan, ya);
  for (let i = 0; i < bey.length && !DAYANDI(); i++) {
    const b = bey[i];
    b.inv = await beyCedvel(cl, "VAT_APPENDIX_1_REPORT_PERIOD_INVOICE", b.no);
    b.ccd = await beyCedvel(cl, "VAT_APPENDIX_1_REPORT_PERIOD_CCD", b.no);
    LOG(`  ${AYLAR_AZ[b.ay - 1]} ${b.il} (${BEY_NOV_AZ[b.nov] || b.nov}): ${b.inv.length} qaimə, ${b.ccd.length} YGB`);
  }
  // e-taxes nömrə ilə axtarışı qəbul etmir (400): qaimələr tarixə görə götürülür, nömrə ilə uyğunlaşdırılır
  const tarixler = [...new Set(bey.flatMap((b) => (b.inv || []).map((r) => String(r.documentDate || "").slice(0, 10)).filter(Boolean)))].sort();
  const lazim = new Set(bey.flatMap((b) => (b.inv || []).map((r) => r.documentSerial + r.documentNumber)));
  const ceh = new Map(), sabah = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let nov = 0, hazir = 0;
  const isci = async () => {
    while (!DAYANDI()) {
      const i = nov++; if (i >= tarixler.length) return;
      const g = tarixler[i];
      try {
        const sira = (await cl.siyahi("inbox", g, g)).filter((z) => lazim.has(z.serialNumber) && !ceh.has(z.serialNumber));
        for (const x of sira) { if (DAYANDI()) break; ceh.set(x.serialNumber, qaimeCevir(await cl.detay(x), "Gələn", null)); }
      } catch (e) { if (e instanceof SessiyaXetasi) throw e; LOG(`! ${g}: qaimələr götürülmədi (${String(e.message).slice(0, 80)})`); }
      progress && progress(++hazir, tarixler.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, tarixler.length) }, isci));
  // VÖEN -> ad: əvvəl tapılmış qaimələrdən, tapılmayanlar üçün reyestrdən (fərdi sahibkar VÖEN-i 2 ilə bitir: reyestr yoxdur)
  const adlar = {}; let oz = null;
  for (const q of ceh.values()) if (q) { if (q.gonderen_voen && q.gonderen_ad) adlar[q.gonderen_voen] = q.gonderen_ad; if (!oz && q.qebul_voen) oz = { voen: q.qebul_voen, ad: q.qebul_ad }; }
  const bilinmeyen = [...new Set(bey.flatMap((b) => (b.inv || []).filter((r) => !ceh.get(r.documentSerial + r.documentNumber)).map((r) => r.tin)).filter((t) => t && !adlar[t] && !/2$/.test(t)))];
  let rn = 0;
  await Promise.all(Array.from({ length: Math.min(4, bilinmeyen.length) }, async () => {
    while (!DAYANDI()) { const i = rn++; if (i >= bilinmeyen.length) return; const r = await reyestr(bilinmeyen[i]).catch(() => null); if (r && r.ad) adlar[bilinmeyen[i]] = r.ad; }
  }));
  const setirler = [], ygb = [], tapilmayan = [];
  for (const b of bey) {
    const ayAd = `${AYLAR_AZ[b.ay - 1]} ${b.il}`, nv = BEY_NOV_AZ[b.nov] || b.nov;
    for (const r of b.inv || []) {
      const sn = r.documentSerial + r.documentNumber;
      let q = ceh.get(sn);
      if (!q) {
        tapilmayan.push(sn);
        q = { seriya: r.documentSerial, nomre: r.documentNumber, tarix: _tarixIso(r.documentDate), istiqamet: "Gələn", status: "", tip: "", novu: "",
          gonderen_voen: r.tin || "", gonderen_ad: adlar[r.tin] || "", qebul_voen: oz ? oz.voen : "", qebul_ad: oz ? oz.ad : "", esas: "", esas2: "", elaqeli_siyahi: [],
          mallar: [{ sira: "", ad: "(qaimə e-taxes-də tapılmadı)", kod: "", olcu: "", miqdar: "", qiymet: "", mebleg: r2(num(r.amount) - num(r.vat)), edv: num(r.vat), yekun: num(r.amount), sebeb: "" }] };
      }
      setirler.push({ ...q, _bey: ayAd, _beyNov: b.reg ? `${nv}, ${_tarixIso(b.reg)}` : nv, _odenilmis: r.paidAmount, _evez: r.paidVat });
    }
    for (const c of b.ccd || []) ygb.push({ bey: ayAd, nov: nv, no: c.documentNumber, tarix: _tarixIso(c.documentDate), deyer: c.cost, edv: c.vat });
  }
  return { bey, setirler, ygb, tapilmayan };
}
