// İstifadəçi interfeysi (sandbox daxilində). Buradakı dəyişikliklər GitHub-dan hamıya avtomatik gedir.
(function () {
  const $ = (s, k) => (k || document).querySelector(s);
  const hamisi = (s, k) => [...(k || document).querySelectorAll(s)];
  const xeberler = [];
  let dayan = false, isleyir = false, son = { tta: [], protokol: [] };
  LOG = (m) => { if (/^\s*!/.test(m)) xeberler.push(m.replace(/^\s*!\s*/, "")); else if (/bağlantı kəsildi/.test(m)) netice([["x", m.replace(/^\s*\.*\s*/, "")]]); };
  DAYANDI = () => dayan;
  const progress = (i, n) => { $("#dolu").style.width = Math.round((i / n) * 100) + "%"; };
  $("#ver").textContent = "v" + (window.APP_VERSIYA || "?");

  // loqo: ikon base64 (loader qabığında ayrıca verilmir, sadə SVG)
  $("#logo").src = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#fff"/><path d="M32 20h42l22 22v60H32z" fill="#1f4e8c"/><path d="M74 20l22 22H74z" fill="#9db6da"/><g fill="#fff"><rect x="42" y="52" width="38" height="5" rx="2.5"/><rect x="42" y="64" width="38" height="5" rx="2.5"/><rect x="42" y="76" width="26" height="5" rx="2.5"/></g><circle cx="92" cy="92" r="26" fill="#22a05a" stroke="#fff" stroke-width="5"/><path d="M80 92l8 8 15-17" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');

  // tablar
  hamisi("nav button").forEach((b) => b.addEventListener("click", () => {
    hamisi("nav button").forEach((x) => x.classList.toggle("aktiv", x === b));
    hamisi(".bolme").forEach((s) => (s.hidden = s.id !== "b-" + b.dataset.b));
  }));

  // tarix: əllə yazılır, nöqtələr avtomatik düşür (08 -> 08. ; 10 -> 08.10. ; 2026 -> 08.10.2026)
  // fayl adı: <qaimə №>_<satıcı>_<alıcı>_<tarix>
  const faylTemiz = (x, n = 30) => String(x || "").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[ .]+|[ .]+$/g, "").slice(0, n).replace(/[ .]+$/, "");
  function faylAdi(x, sat, alc) {
    return [x.seriya + x.nomre, faylTemiz(sat && sat.ad), faylTemiz(alc && alc.ad), String(x.tarix || "").slice(0, 10)].filter(Boolean).join("_");
  }
  // sistemindən götürülən vergi ödəyicisi = ən çox rast gəlinən VÖEN
  function ozVergiOdeyicisi(qs) {
    const say = {}, ad = {};
    for (const q of qs) for (const [v, a] of [[q.gonderen_voen, q.gonderen_ad], [q.qebul_voen, q.qebul_ad]]) if (v) { say[v] = (say[v] || 0) + 1; if (!(v in ad)) ad[v] = a; }
    const k = Object.keys(say).sort((a, b) => say[b] - say[a])[0];
    return k ? faylTemiz(ad[k] || k, 40) : "";
  }
  function tarixMaska(xam, silme) {
    const hisse = []; let cari = "";
    for (const ch of xam) {
      if (/\d/.test(ch)) { cari += ch; if (cari.length === (hisse.length < 2 ? 2 : 4)) { hisse.push(cari); cari = ""; } }
      else if (cari) { hisse.push(hisse.length < 2 && cari.length === 1 ? "0" + cari : cari); cari = ""; }
      if (hisse.length === 3) break;
    }
    const p = cari ? [...hisse, cari] : hisse;
    let out = p.join(".");
    if (!silme && !cari && hisse.length > 0 && hisse.length < 3) out += ".";
    return out;
  }
  function tarixAyir(s) {  // "08.10.2026" -> "2026-10-08" (səhvdirsə: "")
    const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return "";
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }
  function tarixQur(div) {
    const inp = document.createElement("input");
    inp.type = "text"; inp.placeholder = "gg.aa.iiii"; inp.maxLength = 10; inp.inputMode = "numeric"; inp.autocomplete = "off";
    div.appendChild(inp);
    inp.addEventListener("input", (e) => {
      inp.value = tarixMaska(inp.value, !!(e.inputType && e.inputType.startsWith("delete")));
      inp.classList.remove("sehv");
    });
    inp.addEventListener("blur", () => inp.classList.toggle("sehv", inp.value !== "" && !tarixAyir(inp.value)));
    Object.defineProperty(div, "value", {
      get() { return tarixAyir(inp.value); },
      set(v) { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) inp.value = `${m[3]}.${m[2]}.${m[1]}`; },
    });
  }
  hamisi("[data-f=dan],[data-f=ya]").forEach(tarixQur);
  // tarix
  const isoG = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function araliq(bolme, tip) {
    const bu = new Date(); let a, b;
    if (tip === "bu-ay") { a = new Date(bu.getFullYear(), bu.getMonth(), 1); b = bu; }
    else if (tip === "kecen-ay") { a = new Date(bu.getFullYear(), bu.getMonth() - 1, 1); b = new Date(bu.getFullYear(), bu.getMonth(), 0); }
    else { a = new Date(bu.getFullYear(), 0, 1); b = bu; }
    $("[data-f=dan]", bolme).value = isoG(a); $("[data-f=ya]", bolme).value = isoG(b);
  }
  hamisi(".bolme").forEach((s) => {
    if (!$("[data-f=dan]", s)) return;  // ƏDV bölməsində gün tarixi yoxdur (ay seçilir)
    araliq(s, "bu-ay");
    hamisi("[data-ar]", s).forEach((b) => b.addEventListener("click", () => araliq(s, b.dataset.ar)));
  });
  { const b = new Date(), ay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const kecen = new Date(b.getFullYear(), b.getMonth() - 1, 1);
    $("[data-f=edvdan]").value = `${b.getFullYear()}-01`; $("[data-f=edvya]").value = ay(kecen);
    $("[data-f=evsdan]").value = `${b.getFullYear()}-01`; $("[data-f=evsya]").value = ay(kecen); }
  const oxu = (s) => {
    const f = (k) => $(`[data-f=${k}]`, s);
    return { istiqamet: f("ist") ? f("ist").value : "", dan: f("dan").value, ya: f("ya").value,
      voen: f("voen") ? f("voen").value.split(/[\s,;]+/).filter(Boolean) : [], nomre: f("nomre") ? f("nomre").value.toUpperCase().split(/[\s,;]+/).filter(Boolean) : [],
      f: (k) => (f(k) ? f(k).checked : false) };
  };

  // giriş vəziyyəti
  async function yoxla() {
    const var_ = await KOPRU("token_var");
    const n = $("#giris");
    n.textContent = var_ ? "e-taxes: daxil olunub" : "e-taxes: daxil olunmayıb";
    n.className = "nisan " + (var_ ? "ok" : "yox");
    $("#xeberdarliq").hidden = !!var_;
  }
  $("#ac").addEventListener("click", () => KOPRU("ac_etaxes"));
  yoxla(); setInterval(yoxla, 4000);


  // ---- istifadəçi icazəsi (icazeler.json). Əvvəl yaddaşdakı qərar tətbiq olunur (gecikmə yoxdur), yoxlama fonda gedir.
  let kilitli = false;
  const GUN = 86400000;
  function kilid(be, mesaj) {
    kilitli = be;
    hamisi("nav, .bolme").forEach((e) => { if (be) { e.hidden = true; } });
    if (!be) { $("nav").hidden = false; const a = $("nav button.aktiv"); if (a) hamisi(".bolme").forEach((s) => (s.hidden = s.id !== "b-" + a.dataset.b)); }
    $("#icaze").hidden = !mesaj; $("#icaze").textContent = mesaj || "";
    $("#icaze").className = "xeb" + (be ? "" : " info");
  }
  function qerar(j, kod, kodlar) {
    const e = (kodlar || [kod]).map((k) => (j.istifadeciler || {})[k]).find(Boolean);
    const bu = isoG(new Date());
    if (e && e.blok) return { ok: false, sebeb: "blok" };
    if (e) return e.bitir && bu > e.bitir ? { ok: false, sebeb: "bitib", bitir: e.bitir } : { ok: true, bitir: e.bitir || null };
    if (j.hamisina_ac) return { ok: true, bitir: null };
    return { ok: false, sebeb: "yox" };
  }
  function tetbiq(q, kod) {
    if (q.ok) {
      const qalan = q.bitir ? Math.ceil((new Date(q.bitir + "T23:59:59") - Date.now()) / GUN) : null;
      $("#kod").textContent = " · kod " + kod + (q.bitir ? " · bitir: " + q.bitir : "");
      kilid(false, qalan != null && qalan <= 7 ? `İcazənin bitməsinə ${qalan} gün qalıb (${q.bitir}).` : "");
    } else {
      kilid(true, q.sebeb === "bitib" ? `İcazənin müddəti bitib (${q.bitir}). Yeniləmək üçün kodunuzu göndərin: ${kod}`
        : q.sebeb === "blok" ? `İcazə ləğv edilib. Kodunuz: ${kod}`
        : `İcazə gözlənilir. İstifadə üçün bu kodu proqramı verən şəxsə göndərin: ${kod}`);
    }
  }
  (async () => {
    // köhnə (təsadüfi) kod: yalnız əvvəlki icazələr işləsin deyə saxlanır
    let kohne = await KOPRU("get", { key: "istifadeci_kodu" });
    if (!kohne || typeof kohne !== "string") {
      const b = new Uint8Array(5); crypto.getRandomValues(b);
      kohne = [...b].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("") + String(Date.now() % 1000).padStart(3, "0");
      await KOPRU("set", { key: "istifadeci_kodu", value: kohne });
    }
    // sabit kod: e-taxes istifadəçisinin (FİN) hash-indən. Extension silinib yenidən qurulsa da, başqa kompüterdə də dəyişmir.
    let kod = await KOPRU("get", { key: "sabit_kod" });
    if (!kod || typeof kod !== "string") {
      try {
        const r = await KOPRU("fetch", { url: "https://new.e-taxes.gov.az/api/po/profile/public/v2/profile", auth: true });
        const _pr = r && r.status === 200 ? JSON.parse(r.text) : null;
        // FİN; şirkət hesabında FİN olmaya bilər: onda VÖEN (tin) götürülür
        const _tap = (o, a) => { if (!o || typeof o !== "object") return null; for (const k of a) if (o[k] && typeof o[k] !== "object") return o[k]; for (const v of Object.values(o)) { const t = _tap(v, a); if (t) return t; } return null; };
        const pin = _pr ? (_tap(_pr, ["pin"]) || _tap(_pr, ["tin", "voen", "taxpayerTin"])) : null;
        if (pin) {
          const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("TTA|" + String(pin).trim().toUpperCase())));
          kod = [...h.slice(0, 8)].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
          await KOPRU("set", { key: "sabit_kod", value: kod });
        }
      } catch (e) { /* e-taxes-ə daxil olunmayıb: köhnə kod işlədilir */ }
    }
    if (!kod) kod = kohne;
    const kodlar = [...new Set([kod, kohne])];
    $("#kod").textContent = " · kod " + kod;
    const kesh = await KOPRU("get", { key: "icaze_kesh" });
    if (kesh && kesh.q && kesh.kod === kod) { const q = kesh.q; if (!q.ok || !q.bitir || isoG(new Date()) <= q.bitir) tetbiq(q, kod); else tetbiq({ ok: false, sebeb: "bitib", bitir: q.bitir }, kod); }
    else kilid(true, "İcazə yoxlanılır …");
    const menbe = window.APP_MENBE;
    if (!menbe) return;
    for (let c = 0; c < 3; c++) {
      let r;
      try { r = await KOPRU("fetch", { url: menbe + "/icazeler.json?t=" + Date.now() }); } catch (e) { r = null; }
      if (r && r.status === 200) {
        let j; try { j = JSON.parse(r.text); } catch (e) { j = null; }
        if (j) {
          const q = qerar(j, kod, kodlar);
          await KOPRU("set", { key: "icaze_kesh", value: { kod, q } });
          tetbiq(q, kod);
          if (kodlar.some((k) => (j.admin || []).includes(k))) { $("#nav-icaze").hidden = false; adminSiyahi(j); }
          return;
        }
      }
      if (r && r.status === 404) { tetbiq({ ok: true, bitir: null }, kod); return; }  // icazə faylı yoxdur: məhdudiyyət yoxdur
      await gozle(2500);
    }
    if (!kesh) tetbiq({ ok: false, sebeb: "yox" }, kod), kilid(true, "İcazə yoxlanıla bilmədi (internet). Bir az sonra yenidən açın. Kodunuz: " + kod);
  })();
  async function adminSiyahi(j) {
    const adlar = (await KOPRU("get", { key: "icaze_adlar" })) || {};
    const bu = isoG(new Date());
    const sat = Object.entries(j.istifadeciler || {}).map(([k, e]) => {
      const st = e.blok ? "bloklanıb" : e.bitir && bu > e.bitir ? "müddət bitib" : "aktiv";
      return `<tr><td><b>${_e(k)}</b></td><td><input data-ad="${_e(k)}" value="${_e(adlar[k] || "")}" placeholder="ad (yalnız burada)"></td><td>${_e(e.bitir || "limitsiz")}</td><td>${st}</td></tr>`;
    }).join("");
    $("#icaze-siyahi").innerHTML = `<p>Ümumi icazə (hamıya açıq): <b>${j.hamisina_ac ? "bəli" : "xeyr"}</b></p><table class="cedvel"><tr><th>Kod</th><th>Ad</th><th>Bitmə tarixi</th><th>Vəziyyət</th></tr>${sat || '<tr><td colspan="4">Hələ icazə verilən kod yoxdur.</td></tr>'}</table>`;
    hamisi("#icaze-siyahi [data-ad]").forEach((i) => i.addEventListener("change", async () => { adlar[i.dataset.ad] = i.value; await KOPRU("set", { key: "icaze_adlar", value: adlar }); }));
  }

  // ayarlar (mərkəzi ayarlar.json)
  (async () => {
    const menbe = window.APP_MENBE;
    if (!menbe) return;
    const r = await KOPRU("fetch", { url: menbe + "/ayarlar.json?t=" + Date.now() });
    try { if (r.status === 200) AYAR = { ...AYAR_DEF, ...JSON.parse(r.text) }; } catch (e) {}
  })();

  // ---- papka
  let papkaVar = false;
  let qabiqKohne = false;
  async function papkaGoster() {
    const ad = await KOPRU("papka_ad");
    qabiqKohne = !!ad && typeof ad === "object";  // köhnə qabıq bu əmri tanımır ("naməlum əmr")
    papkaVar = typeof ad === "string" && !!ad;
    $("#papka-ad").textContent = qabiqKohne ? "Yükləmələr qovluğu (qovluq seçimi üçün əlavəni yeniləyin: chrome://extensions → yenilə işarəsi)"
      : papkaVar ? "qovluq «" + ad + "»" : "Yükləmələr qovluğu";
    $("#papka-sil").hidden = !papkaVar;
    $("#papka-sec").disabled = qabiqKohne;
  }
  $("#papka-sec").addEventListener("click", async () => {
    if (qabiqKohne) return;
    const r = await KOPRU("papka_sec");
    if (r && r.pencere) {  // ayrıca pəncərədə seçilir: nəticəni gözləyirik
      netice([["", "Açılan kiçik pəncərədə qovluğu seçin."]]);
      const evvel = await KOPRU("papka_ad");
      for (let i = 0; i < 60; i++) {
        await gozle(1500);
        const ad = await KOPRU("papka_ad");
        if (typeof ad === "string" && ad && ad !== evvel) { netice([["ok", "Qovluq seçildi: " + ad]]); break; }
      }
      papkaGoster(); return;
    }
    if (r && r.xeta) { if (r.xeta === "naməlum əmr") { papkaGoster(); return; } if (r.xeta !== "ləğv edildi") netice([["x", "Qovluq seçilmədi: " + r.xeta + ". Fayllar Yükləmələr qovluğuna düşəcək."]]); return; }
    papkaGoster();
  });
  $("#papka-sil").addEventListener("click", async () => { await KOPRU("papka_sil"); papkaGoster(); });
  papkaGoster();

  // ---- nəticə (yazı kimi)
  const _e = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function netice(satirlar) { $("#netice").innerHTML = satirlar.map(([c, t]) => `<p class="${c || ""}">${_e(t)}</p>`).join(""); }
  const tarixAz = (i) => i.split("-").reverse().join(".");

  function mesgul(b) {
    isleyir = b; dayan = false;
    hamisi(".esas").forEach((x) => (x.disabled = b));
    $("#dayan").hidden = !b; $("#zolaq").hidden = !b;
    if (b) { xeberler.length = 0; DUZELISLER.clear(); $("#dolu").style.width = "0"; $("#chap-qutu").hidden = true; }
  }
  $("#dayan").addEventListener("click", () => { dayan = true; LOG("Dayandırılır …"); });

  // fayllar: [{ad, data(Uint8Array), mime}] -> papka (varsa) və ya Yükləmələr; hara yazıldığını qaytarır
  async function saxla(fayllar, zipAdi) {
    if (papkaVar && icaze) {
      const r = await KOPRU("papka_yaz", { fayllar: fayllar.map((f) => ({ ad: f.ad, bytes: f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) })) });
      if (r && r.ok) return `qovluq «${r.ad}» (${r.ok} fayl)`;
      LOG("Qovluğa yazılmadı: " + ((r && r.xeta) || "naməlum xəta") + ". Yükləmələrə düşür.");
    }
    if (zipAdi && fayllar.length > 1) {
      await KOPRU("yukle", { ad: zipAdi, bytes: await zipYarat(fayllar.map((f) => ({ ad: f.ad, data: f.data })), false), mime: "application/zip" });
      return `Yükləmələr qovluğu (${zipAdi}, içində ${fayllar.length} fayl)`;
    }
    for (const f of fayllar) await KOPRU("yukle", { ad: f.ad, bytes: f.data, mime: f.mime });
    return "Yükləmələr qovluğu";
  }
  let icaze = false;
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const bugun = () => isoG(new Date());

  async function isle(ad, is) {
    if (isleyir || kilitli) return;
    icaze = papkaVar ? await KOPRU("papka_icaze") : false;  // klikdən dərhal sonra: icazə sorğusu istifadəçi hərəkətinə bağlıdır
    mesgul(true); netice([["", "İşləyir …"]]);
    try { await is(); if (DUZELISLER.size) $("#netice").innerHTML += `<p class="ok">Yazı düzəlişi (${DUZELISLER.size}):</p>` + [...DUZELISLER].slice(0, 20).map((t) => `<p>${_e(t)}</p>`).join("") + (DUZELISLER.size > 20 ? "<p>…</p>" : ""); if (xeberler.length) $("#netice").innerHTML += `<p class="x">Diqqət (${xeberler.length}): ${_e(xeberler.slice(0, 3).join(" · "))}${xeberler.length > 3 ? " …" : ""}</p>`; }
    catch (e) { netice([["x", e instanceof SessiyaXetasi ? e.message : "Xəta: " + (e && e.message || e)]]); }
    mesgul(false);
  }
  const say = (q, k) => q.filter((x) => x.istiqamet === k).length;
  const aralikYazi = (o) => `${tarixAz(o.dan)} – ${tarixAz(o.ya)}`;

  $("#bas-terkib").addEventListener("click", () => isle("terkib", async () => {
    const o = oxu($("#b-terkib"));
    if (!o.dan || !o.ya) return netice([["x", "Tarixi gg.aa.iiii formatında düzgün yazın (məs. 08.10.2026)."]]);
    if (o.dan > o.ya) return netice([["x", "Başlanğıc tarix son tarixdən böyük ola bilməz."]]);
    const q = await qaimeleriTopla({ ...o, sade: !o.f("tarixce") }, (i, n) => { progress(i, n); netice([["", `İşləyir … ${i}/${n}`]]); });
    if (!q.length) return netice([["", `${aralikYazi(o)} aralığında uyğun qaimə tapılmadı.`]]);
    const bytes = await xlsxYarat(terkibSehifeleri(q));
    const yer = await saxla([{ ad: `qaime_terkibi${ozVergiOdeyicisi(q) ? "_" + ozVergiOdeyicisi(q) : ""}_${bugun()}.xlsx`, data: bytes, mime: XLSX_MIME }]);
    const sətir = q.reduce((a, x) => a + x.mallar.length, 0);
    netice([["", `${aralikYazi(o)} aralığında ${q.length} qaimə tapıldı (gələn: ${say(q, "Gələn")}, göndərilən: ${say(q, "Göndərilən")}).`],
      ["", `Qaimə tərkibi Excel-i hazırlandı: ${sətir} mal sətri.`], ["ok", `Yerləşdirildi: ${yer}.`]]);
  }));

  $("#bas-edv").addEventListener("click", () => isle("edv", async () => {
    const dan = $("#b-edv [data-f=edvdan]").value, ya = $("#b-edv [data-f=edvya]").value;
    if (!dan || !ya) return netice([["x", "Başlanğıc və son ayı seçin."]]);
    if (dan > ya) return netice([["x", "Başlanğıc ay son aydan böyük ola bilməz."]]);
    const r = await edvEvezlesmesi({ dan, ya }, (i, n, faza) => { if (i == null) return netice([["", `${faza} …`]]); progress(i, n); netice([["", `${faza || "Qaimələr götürülür"} … ${i}/${n}`]]); });
    if (!r.bey.length) return netice([["", "Bu aylar üçün ƏDV bəyannaməsi tapılmadı."]]);
    const bytes = await xlsxYarat(edvSehifeleri(r.setirler, r.ygb, r.bey));
    const yer = await saxla([{ ad: `edv_evezlesmesi_${bugun()}.xlsx`, data: bytes, mime: XLSX_MIME }]);
    const qs = new Set(r.setirler.map((x) => x.seriya + x.nomre)).size;
    netice([["", `${r.bey.length} ay üzrə bəyannamə tapıldı (${qs} qaimə, ${r.ygb.length} idxal sətri).`],
      ...(r.tapilmayan.length ? [["x", `e-taxes-də tapılmayan qaimə: ${r.tapilmayan.length} (Excel-də qeyd olunub).`]] : []),
      ["ok", `Yerləşdirildi: ${yer}.`]]);
  }));

  $("#bas-evezsiz").addEventListener("click", () => isle("evezsiz", async () => {
    const dan = $("#b-evezsiz [data-f=evsdan]").value, ya = $("#b-evezsiz [data-f=evsya]").value;
    if (!dan || !ya) return netice([["x", "Başlanğıc və son ayı seçin."]]);
    if (dan > ya) return netice([["x", "Başlanğıc ay son aydan böyük ola bilməz."]]);
    const r = await evezlesmemisQaimeler({ dan, ya }, (i, n, faza) => { if (i == null) return netice([["", `${faza} …`]]); progress(i, n); netice([["", `${faza} … ${i}/${n}`]]); });
    if (!r.qaimeler.length) return netice([["ok", "Əvəzləşməmiş qaimə tapılmadı."], ...(r.ugursuz.length ? [["x", `Yoxlanılmayan qaimə: ${r.ugursuz.join(" ")}`]] : [])]);
    const bytes = await xlsxYarat(evezlesmemisSehifeleri(r.qaimeler));
    const yer = await saxla([{ ad: `evezlesmemis_qaimeler_${bugun()}.xlsx`, data: bytes, mime: XLSX_MIME }]);
    const edv = Math.round(r.qaimeler.reduce((t, q) => t + q._edv, 0) * 100) / 100;
    netice([["", `${r.qaimeler.length} əvəzləşməmiş qaimə, ƏDV cəmi: ${fmt(edv)} (${r.beySayi} bəyannamə yoxlandı).`],
      ...(r.ugursuz.length ? [["x", `Yoxlanılmayan qaimə: ${r.ugursuz.join(" ")}`]] : []), ["ok", `Yerləşdirildi: ${yer}.`]]);
  }));

  $("#bas-akt").addEventListener("click", () => isle("akt", async () => {
    const o = oxu($("#b-akt"));
    if (!o.dan || !o.ya) return netice([["x", "Tarixi gg.aa.iiii formatında düzgün yazın (məs. 08.10.2026)."]]);
    if (o.dan > o.ya) return netice([["x", "Başlanğıc tarix son tarixdən böyük ola bilməz."]]);
    const r = await aktlariTopla(o, (i, n) => { progress(i, n); netice([["", `İşləyir … ${i}/${n}`]]); });
    if (!r.aktlar.length) return netice([["", `${aralikYazi(o)} aralığında alış aktı tapılmadı.`]]);
    const bytes = await xlsxYarat(aktSehifeleri(r.aktlar));
    const yer = await saxla([{ ad: `alis_aktlari_${bugun()}.xlsx`, data: bytes, mime: XLSX_MIME }]);
    const sətir = r.aktlar.reduce((a, x) => a + (x._items.length || 1), 0);
    netice([["", `${aralikYazi(o)} aralığında ${r.aktlar.length} akt tapıldı (${sətir} mal sətri).`],
      ...(r.alinmayan.length ? [["x", `Götürülməyən akt: ${r.alinmayan.join(" ")}`]] : []), ["ok", `Yerləşdirildi: ${yer}.`]]);
  }));

  $("#bas-risk").addEventListener("click", () => isle("risk", async () => {
    const voenler = [...new Set(($("#b-qaime [data-f=riskvoen]").value || "").split(/[\s,;]+/).filter(Boolean))];
    if (!voenler.length) return netice([["x", "VÖEN-i yazın (hər biri 10 rəqəm)."]]);
    const r = await riskSiyahisi(voenler, (i, n) => { progress(i, n); netice([["", `Yoxlanılır … ${i}/${n}`]]); });
    const riskli = r.filter((n) => n.risky), yox = r.filter((n) => n.risky === null);
    const _sat = r.slice(0, 15).map((n) => [n.risky ? "x" : n.risky === null ? "" : "ok", `${n.voen}${n.ad ? " — " + n.ad : ""}: ${n.risky ? "RİSKLİDİR" : n.risky === null ? n.qeyd : "riskli deyil"}`]);
    const sat2 = r.map((n) => [n.risky ? "x" : n.risky === null ? "" : "ok", `${n.voen}${n.ad ? " — " + n.ad : ""}: ${n.risky ? "RİSKLİDİR" : n.risky === null ? n.qeyd : "riskli deyil"}`]);   // fayl yazılmır, nəticə yalnız ekranda
    netice([["", `${r.length} VÖEN yoxlandı: ${riskli.length} riskli, ${r.length - riskli.length - yox.length} riskli deyil${yox.length ? `, ${yox.length} yoxlanmadı` : ""}.`], ...sat2]);
  }));

  $("#qaime-sablon").addEventListener("click", async () => {
    icaze = papkaVar ? await KOPRU("papka_icaze") : false;
    const bin = atob(QAIME_SABLON_B64), data = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const yer = await saxla([{ ad: "Qaime_sablonu.xlsx", data, mime: XLSX_MIME }]);
    netice([["ok", `Şablon yerləşdirildi: ${yer}.`]]);
  });

  $("#bas-qaime").addEventListener("click", () => isle("qaime", async () => {
    const fl = $("#qaime-fayl").files[0];
    if (!fl) return netice([["x", "Əvvəl Excel faylını seçin."]]);
    const sat = await xlsxOxu(await fl.arrayBuffer(), "Qaimə");
    const { qaimeler, xeta } = qaimeQrupla(sat);
    if (!qaimeler.length) return netice([["x", "Faylda doldurulmuş sətir tapılmadı."]]);
    if (xeta.length) return netice([["x", `${xeta.length} xəta tapıldı, heç nə yaradılmadı:`], ...xeta.slice(0, 15).map((t) => ["x", t]), ...(xeta.length > 15 ? [["x", "…"]] : [])]);
    const sets = qaimeler.reduce((a, q) => a + q.mallar.length, 0);
    if ($("#qaime-yoxla").checked) return netice([["ok", `Yoxlama keçdi: ${qaimeler.length} qaimə, ${sets} mal sətri.`], ["", "Qaralama yaratmaq üçün «Əvvəl yalnız yoxla» işarəsini götürüb yenidən basın."]]);
    const et = new ETaxes(), vah = await vahidSiyahisi(et), sonuc = [];
    const yeniVahid = new Set();
    for (const q of qaimeler) for (const m of q.mallar) if (vahidTap(vah, m.vahid) === undefined) yeniVahid.add(m.vahid);
    const vahidXeb = yeniVahid.size ? [["", `Diqqət: bu ölçü vahidləri e-taxes siyahısında yoxdur, yazıldığı kimi göndərilir: ${[...yeniVahid].join(", ")}`]] : [];
    for (let i = 0; i < qaimeler.length; i++) {
      if (dayan) break;
      const q = qaimeler[i]; progress(i, qaimeler.length); netice([["", `Yaradılır … ${i}/${qaimeler.length}`], ...sonuc]);
      try {
        let rey = await reyestr(q.voen);
        if (!rey && /2$/.test(String(q.voen))) rey = await fizikiAd(q.voen);  // fərdi sahibkar: e-taxes xidmətindən ad
        if (!rey && q.alAd) rey = { ad: q.alAd };  // tapılmadısa: şablondakı «Alıcının adı»
        if (!rey) { sonuc.push(["x", `${q.key}: alıcı VÖEN ${q.voen} tapılmadı (fərdi sahibkardırsa şablonun «Alıcının adı» sütununa Soyad Ad Ata adı yazın).`]); continue; }
        const sr = await et.istek("GET", "/api/po/invoice/public/v1/generateSerialNumber/" + q.kind);
        if (sr.status >= 400) throw new Error("seriya nömrəsi alınmadı (" + sr.status + ")");
        let serial = sr.text.trim(); try { const j = JSON.parse(sr.text); serial = typeof j === "string" ? j : j.serialNumber || j.serial || serial; } catch (e) {}
        const r = await et.istek("POST", QAIME_POST, { json: qaimeGovdesi(q, rey.ad, serial, vah) });
        if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${String(r.text).slice(0, 200)}`);
        sonuc.push(["ok", `${q.key} → ${serial} (${q.kind === "advanceInvoice" ? "avans, " : ""}${q.mallar.length} mal) qaralama yaradıldı.`]);
      } catch (e) { if (e instanceof SessiyaXetasi) throw e; sonuc.push(["x", `${q.key}: ${e.message}`]); }
    }
    netice([["", "Bitdi. Qaralamaları e-taxes-də «Qaralamalar» bölməsində yoxlayıb özünüz göndərin."], ...vahidXeb, ...sonuc]);
  }));

  $("#bas-tta").addEventListener("click", () => isle("tta", async () => {
    const o = oxu($("#b-tta"));
    if (!o.dan || !o.ya) return netice([["x", "Tarixi gg.aa.iiii formatında düzgün yazın (məs. 08.10.2026)."]]);
    if (o.dan > o.ya) return netice([["x", "Başlanğıc tarix son tarixdən böyük ola bilməz."]]);
    const tta = o.f("tta"), prot = o.f("protokol"), hes = o.f("hesab");
    if (!tta && !prot && !hes) return netice([["x", "Ən azı bir sənəd növünü seçin."]]);
    DIREKTORSUZ = o.f("dirsiz");
    const fmtSec = ($("[data-f=format]", $("#b-tta")) || {}).value || "pdf";
    const excelVar = fmtSec !== "pdf", pdfVar = fmtSec !== "excel";
    if (hes) {
      await rekvSaxla(true);  // formada yazılıb, amma saxlanmayıbsa, saxla
      rekvDict = await rekvizitler();
      if (!Object.keys(rekvDict).length) return netice([["x", "Hesab-faktura üçün əvvəlcə satıcının bank rekvizitlərini daxil edin."]]);
    }
        const q = await qaimeleriTopla({ ...o, sade: true }, (i, n) => { progress(i, n); netice([["", `İşləyir … ${i}/${n}`]]); });
    if (!q.length) return netice([["", `${aralikYazi(o)} aralığında uyğun qaimə tapılmadı.`]]);
    netice([["", "Direktorlar reyestrdən yoxlanılır …"]]);
    const fayllar = []; son = { tta: [], protokol: [], hesab: [] }; const direktorsuz = [], rekvsiz = [];
    {  // reyestr sorğuları əvvəlcədən, eyni anda 6-sı (nəticə keşə düşür)
      const voenler = [...new Set(q.flatMap((x) => [x.gonderen_voen, x.qebul_voen]).filter((v) => v && !String(v).endsWith("2")))];
      let nov = 0;
      await Promise.all(Array.from({ length: Math.min(6, voenler.length) }, async () => {
        while (nov < voenler.length) { const v = voenler[nov++]; try { await reyestr(v); } catch (e) {} }
      }));
    }
    for (const x of q) {
      const sat = await teref(x.gonderen_voen, x.gonderen_ad), alc = await teref(x.qebul_voen, x.qebul_ad);
      const no = faylAdi(x, sat, alc);
      if ((!DIREKTORSUZ || prot || hes) && (!sat.direktor || !alc.direktor)) direktorsuz.push(x.seriya + x.nomre);
      const yaz = async (ad, tip, rk) => {
        if (excelVar) fayllar.push({ ad: `${ad}_${no}.xlsx`, data: await xlsxYarat([aktSehifesi(x, sat, alc, tip, rk)]), mime: XLSX_MIME });
        if (pdfVar) fayllar.push({ ad: `${ad}_${no}.pdf`, data: await aktPdf(x, sat, alc, tip, rk), mime: "application/pdf" });
      };
      if (tta) { await yaz("TTA", false); son.tta.push([x, sat, alc]); }
      if (prot) { await yaz("Protokol", true); son.protokol.push([x, sat, alc]); }
      if (hes) {
        const rk = rekvizitSec(rekvDict, sat.voen);
        if (!rk) rekvsiz.push(x.seriya + x.nomre);
        await yaz("Hesab_faktura", "hesab", rk);
        son.hesab.push([x, sat, alc, rk]);
      }
      LOG(`+ ${no}: ${alc.ad}  yekun ${fmt(x.yekun)}  direktor: ${alc.direktor || "(tapılmadı)"}`);
    }
    const yer = await saxla(fayllar, `TTA_Protokol_${bugun()}.zip`);
    const s = [["", `${aralikYazi(o)} aralığında ${q.length} qaimə tapıldı (gələn: ${say(q, "Gələn")}, göndərilən: ${say(q, "Göndərilən")}).`],
      ["", `Hazırlandı: ${[son.tta.length ? son.tta.length + " TTA" : "", son.protokol.length ? son.protokol.length + " qiymət razılaşdırma protokolu" : "", son.hesab.length ? son.hesab.length + " hesab-faktura" : ""].filter(Boolean).join(", ")}${[pdfVar ? "PDF" : "", excelVar ? "Excel" : ""].filter(Boolean).join(" + ").replace(/^/, " (").replace(/$/, ")")}.`],
      ["ok", `Yerləşdirildi: ${yer}.`]];
    if (direktorsuz.length) s.push(["x", `Direktoru tapılmayan ${direktorsuz.length} qaimə var (imza xanası boş qalıb): ${direktorsuz.slice(0, 5).join(", ")}${direktorsuz.length > 5 ? " …" : ""}`]);
    if (rekvsiz.length) s.push(["x", `${rekvsiz.length} hesab-fakturada satıcı üçün rekvizit tapılmadı (xanalar boş qalıb): ${rekvsiz.slice(0, 5).join(", ")}${rekvsiz.length > 5 ? " …" : ""}`]);
    netice(s);
  }));

  function chap(tip) {
    const s = son[tip]; if (!s || !s.length) return;
    $("#cap").innerHTML = s.map(([q, a, b, rk]) => aktHtml(q, a, b, tip, rk)).join("");
    document.body.classList.add("chapda");
    const bas = document.title; document.title = " ";
    setTimeout(() => { window.print(); document.title = bas; document.body.classList.remove("chapda"); $("#cap").innerHTML = ""; }, 100);
  }
  $("#chap-tta").addEventListener("click", () => chap("tta"));
  $("#chap-prot").addEventListener("click", () => chap("protokol"));
  $("#chap-hesab").addEventListener("click", () => chap("hesab"));

  // ---- satıcının bank rekvizitləri
  let rekvDict = {};
  const rekvSahe = () => hamisi("[data-r]", $("#rekv"));
  const rekvOxu = () => Object.fromEntries(rekvSahe().map((e) => [e.dataset.r, e.value.trim()]));
  async function rekvSiyahi(secili) {
    rekvDict = await rekvizitler();
    const sec = $("#rekv-sec");
    sec.innerHTML = '<option value="__yeni">— yeni rekvizit —</option>' + Object.keys(rekvDict).map((k) =>
      `<option value="${_e(k)}">${k === "*" ? "Bütün satıcılar" : _e(k) + (rekvDict[k].ad ? " · " + _e(rekvDict[k].ad) : "")}</option>`).join("");
    sec.value = secili && rekvDict[secili] ? secili : "__yeni";
  }
  function rekvDoldur(k) {
    const r = rekvDict[k] || {};
    rekvSahe().forEach((e) => (e.value = e.dataset.r === "voen" ? (k === "*" || k === "__yeni" ? "" : k) : r[e.dataset.r] || ""));
  }
  async function rekvSaxla(sakit) {
    const r = rekvOxu();
    if (!r.ad && !r.hesab && !r.mh) { if (!sakit) netice([["x", "Ən azı bank adını və ya hesab nömrəsini yazın."]]); return; }
    const acar = r.voen || "*"; delete r.voen;
    const d = await rekvizitler(); d[acar] = r;
    await KOPRU("set", { key: "rekvizitler", value: d });
    await rekvSiyahi(acar);
    if (!sakit) netice([["ok", "Rekvizitlər saxlandı (" + (acar === "*" ? "bütün satıcılar üçün" : "VÖEN " + acar) + ")."]]);
  }
  $("#rekv-saxla").addEventListener("click", () => rekvSaxla(false));
  $("#rekv-sec").addEventListener("change", (e) => rekvDoldur(e.target.value));
  $("#rekv-sil").addEventListener("click", async () => {
    const k = $("#rekv-sec").value; if (k === "__yeni") return;
    const d = await rekvizitler(); delete d[k];
    await KOPRU("set", { key: "rekvizitler", value: d });
    await rekvSiyahi(); rekvDoldur("__yeni"); netice([["", "Rekvizit silindi."]]);
  });
  $("#hesab-sec").addEventListener("change", (e) => { $("#rekv").hidden = !e.target.checked; });
  rekvSiyahi().then(() => { const k = Object.keys(rekvDict)[0]; if (k) { $("#rekv-sec").value = k; rekvDoldur(k); } });
})();
