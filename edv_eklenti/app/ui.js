// Pəncərənin məntiqi (sandbox daxilində işləyir). e-taxes sorğuları və yükləmə KOPRU ilə panel.js-dən keçir.
const ETAX = "https://new.e-taxes.gov.az";
const $ = (id) => document.getElementById(id);
let dayandi = false, isleyir = false, bearer = false;

const bu = new Date();
const ym = (il, ay) => `${il}-${String(ay).padStart(2, "0")}`;
const aralik = (d, y) => { $("dan").value = d; $("ya").value = y; };
$("dan").value = ym(bu.getFullYear(), 1);
$("ya").value = ym(bu.getFullYear(), bu.getMonth() + 1);
$("ver").textContent = "v" + (window.APP_VERSIYA || "?");
$("buil").onclick = () => aralik(ym(bu.getFullYear(), 1), ym(bu.getFullYear(), bu.getMonth() + 1));
$("kecenil").onclick = () => aralik(ym(bu.getFullYear() - 1, 1), ym(bu.getFullYear() - 1, 12));
$("son3").onclick = () => aralik(ym(bu.getFullYear() - 2, 1), ym(bu.getFullYear(), bu.getMonth() + 1));
$("ac").onclick = () => KOPRU("ac_etaxes");
$("dayan").onclick = () => { dayandi = true; $("durum").textContent = "Dayandırılır..."; };

function log(m) { const l = $("log"); l.value += m + "\n"; l.scrollTop = l.scrollHeight; }
const gozle = (ms) => new Promise((r) => setTimeout(r, ms));
const sessiyaXetasi = (msg) => Object.assign(new Error(msg), { sessiya: true });

// e-taxes-dən JSON (yalnız GET). Şəbəkə qısa müddətə itərsə təkrar cəhd edir.
async function getJson(yol) {
  let xeta;
  for (let c = 0; c < 4; c++) {
    const r = await KOPRU("fetch", { url: ETAX + yol, auth: true, bearer });
    if (r.sessiya) { $("xeberdarliq").hidden = false; throw sessiyaXetasi("e-taxes-ə daxil olunmayıb"); }
    if (r.sebeke || r.xeta) { xeta = new Error(r.sebeke || r.xeta); await gozle(1500 * (c + 1)); continue; }
    if ((r.status === 401 || r.status === 403) && !bearer) { bearer = true; continue; }
    if (r.status === 401 || r.status === 403) throw sessiyaXetasi("Sessiya bitib. e-taxes səhifəsində yenidən daxil olun.");
    if (r.status >= 400) throw new Error("HTTP " + r.status);
    $("xeberdarliq").hidden = true;
    return JSON.parse(r.text);
  }
  throw xeta || new Error("bağlantı kəsildi");
}

function bitir(msg) {
  isleyir = false;
  $("basla").disabled = false; $("dayan").disabled = true;
  $("durum").textContent = msg;
}

$("basla").onclick = async () => {
  if (isleyir) return;
  const dan = $("dan").value, ya = $("ya").value;
  if (!dan || !ya) { $("durum").textContent = "Dövrün başlanğıc və son ayını seçin."; return; }
  if (dan > ya) { $("durum").textContent = "Başlanğıc ay son aydan böyük ola bilməz."; return; }
  isleyir = true; dayandi = false;
  $("basla").disabled = true; $("dayan").disabled = false;
  $("log").value = ""; $("pb").value = 0; $("pb").max = 1;
  $("durum").textContent = "İşləyir...";
  try {
    const secim = { ygb: $("s_ygb").checked, qaime: $("s_qaime").checked, xam: $("s_xam").checked };
    const siyahi = await bayannameSiyahisi(getJson, dan, ya, $("rejim").value, log);
    log(`Tapıldı: ${siyahi.length} ƏDV bəyannaməsi.`);
    if (!siyahi.length) { bitir("Seçilmiş dövrdə ƏDV bəyannaməsi tapılmadı."); return; }
    $("pb").max = siyahi.length;
    const data = new Array(siyahi.length), ugursuz = [];
    let novbe = 0, oxunan = 0;
    await Promise.all(Array.from({ length: Math.min(4, siyahi.length) }, async () => {
      while (!dayandi) {
        const i = novbe++; if (i >= siyahi.length) return;
        const b = siyahi[i];
        try {
          data[i] = await bayannameYukle(getJson, b, secim);
          log(`  ${AYLAR_AZ[b.ay - 1]} ${b.il} (${BEY_NOV_AZ[b.nov] || b.nov}) oxundu`);
        } catch (e) {
          if (e.sessiya) throw e;
          ugursuz.push(b); log(`! ${b.no}: götürülmədi (${e.message})`);
        }
        $("pb").value = ++oxunan; $("durum").textContent = `${oxunan} / ${siyahi.length} bəyannamə oxundu`;
      }
    }));
    const hazir = data.filter(Boolean);
    if (!hazir.length) { bitir(dayandi ? "Dayandırıldı." : "Heç bir bəyannamə oxunmadı."); return; }
    const bayt = await xlsxYarat(secilenSehifeler(hazir, secim));
    const ad = `edv_beyannameleri_${dan.replace("-", "")}_${ya.replace("-", "")}.xlsx`;
    await KOPRU("yukle", { bytes: bayt, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ad });
    log(`Hazırdır (${hazir.length} bəyannamə): ${ad} (Yükləmələr qovluğuna düşür)`);
    if (ugursuz.length) log(`Götürülməyən: ${ugursuz.map((x) => x.no).join(" ")}`);
    bitir(dayandi ? "Dayandırıldı. Oxunan hissə Excel-ə yazıldı." : "Bitdi. Fayl Yükləmələr qovluğundadır.");
  } catch (e) {
    log(`! ${e.message}`);
    bitir(e.sessiya ? "e-taxes-ə daxil olun (səhifə açıq qalsın), sonra yenidən basın." : "Xəta baş verdi. Jurnala baxın.");
  }
};

// açılışda giriş yoxlanır (sessiya yoxdursa xəbərdarlıq göstərilir)
KOPRU("fetch", { url: ETAX + "/api/po/declaration/public/v1/dictionary/taxCodes", auth: true }).then((r) => { if (r && r.sessiya) $("xeberdarliq").hidden = false; });
