// İstifadəçi interfeysi (sandbox daxilində). Buradakı dəyişikliklər GitHub-dan hamıya avtomatik gedir.
(function () {
  const $ = (s, k) => (k || document).querySelector(s);
  const hamisi = (s, k) => [...(k || document).querySelectorAll(s)];
  const jurnal = $("#jurnal");
  let dayan = false, isleyir = false, son = { tta: [], protokol: [] };
  LOG = (m) => { jurnal.textContent += m + "\n"; jurnal.scrollTop = jurnal.scrollHeight; };
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
    araliq(s, "bu-ay");
    hamisi("[data-ar]", s).forEach((b) => b.addEventListener("click", () => araliq(s, b.dataset.ar)));
  });
  const oxu = (s) => {
    const f = (k) => $(`[data-f=${k}]`, s);
    return { istiqamet: f("ist").value, dan: f("dan").value, ya: f("ya").value,
      voen: f("voen").value.split(/[\s,;]+/).filter(Boolean), nomre: f("nomre").value.toUpperCase().split(/[\s,;]+/).filter(Boolean),
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
    if (b) { jurnal.textContent = ""; $("#dolu").style.width = "0"; $("#chap-qutu").hidden = true; }
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
    if (isleyir) return;
    icaze = papkaVar ? await KOPRU("papka_icaze") : false;  // klikdən dərhal sonra: icazə sorğusu istifadəçi hərəkətinə bağlıdır
    mesgul(true); netice([["", "İşləyir …"]]);
    try { await is(); }
    catch (e) { netice([["x", e instanceof SessiyaXetasi ? e.message : "Xəta: " + (e && e.message || e)]]); }
    mesgul(false);
  }
  const say = (q, k) => q.filter((x) => x.istiqamet === k).length;
  const aralikYazi = (o) => `${tarixAz(o.dan)} – ${tarixAz(o.ya)}`;

  $("#bas-terkib").addEventListener("click", () => isle("terkib", async () => {
    const o = oxu($("#b-terkib"));
    if (!o.dan || !o.ya) return netice([["x", "Tarixləri seçin."]]);
    const q = await qaimeleriTopla({ ...o, sade: !o.f("tarixce") }, (i, n) => { progress(i, n); netice([["", `İşləyir … ${i}/${n}`]]); });
    if (!q.length) return netice([["", `${aralikYazi(o)} aralığında uyğun qaimə tapılmadı.`]]);
    const bytes = await xlsxYarat(terkibSehifeleri(q));
    const yer = await saxla([{ ad: `qaime_terkibi_${bugun()}.xlsx`, data: bytes, mime: XLSX_MIME }]);
    const sətir = q.reduce((a, x) => a + x.mallar.length, 0);
    netice([["", `${aralikYazi(o)} aralığında ${q.length} qaimə tapıldı (gələn: ${say(q, "Gələn")}, göndərilən: ${say(q, "Göndərilən")}).`],
      ["", `Qaimə tərkibi Excel-i hazırlandı: ${sətir} mal sətri.`], ["ok", `Yerləşdirildi: ${yer}.`]]);
  }));

  $("#bas-tta").addEventListener("click", () => isle("tta", async () => {
    const o = oxu($("#b-tta"));
    if (!o.dan || !o.ya) return netice([["x", "Tarixləri seçin."]]);
    const tta = o.f("tta"), prot = o.f("protokol"), hes = o.f("hesab");
    if (!tta && !prot && !hes) return netice([["x", "Ən azı bir sənəd növünü seçin."]]);
    if (hes) {
      await rekvSaxla(true);  // formada yazılıb, amma saxlanmayıbsa, saxla
      rekvDict = await rekvizitler();
      if (!Object.keys(rekvDict).length) return netice([["x", "Hesab-faktura üçün əvvəlcə satıcının bank rekvizitlərini daxil edin."]]);
    }
        const q = await qaimeleriTopla({ ...o, sade: true }, (i, n) => { progress(i, n); netice([["", `İşləyir … ${i}/${n}`]]); });
    if (!q.length) return netice([["", `${aralikYazi(o)} aralığında uyğun qaimə tapılmadı.`]]);
    netice([["", "Direktorlar reyestrdən yoxlanılır …"]]);
    const fayllar = []; son = { tta: [], protokol: [], hesab: [] }; const direktorsuz = [], rekvsiz = [];
    for (const x of q) {
      const sat = await teref(x.gonderen_voen, x.gonderen_ad), alc = await teref(x.qebul_voen, x.qebul_ad);
      const no = x.seriya + x.nomre;
      if (!sat.direktor || !alc.direktor) direktorsuz.push(no);
      if (tta) { fayllar.push({ ad: `TTA_${no}.xlsx`, data: await xlsxYarat([aktSehifesi(x, sat, alc, false)]), mime: XLSX_MIME }); son.tta.push([x, sat, alc]); }
      if (prot) { fayllar.push({ ad: `Protokol_${no}.xlsx`, data: await xlsxYarat([aktSehifesi(x, sat, alc, true)]), mime: XLSX_MIME }); son.protokol.push([x, sat, alc]); }
      if (hes) {
        const rk = rekvizitSec(rekvDict, sat.voen);
        if (!rk) rekvsiz.push(no);
        fayllar.push({ ad: `Hesab_faktura_${no}.xlsx`, data: await xlsxYarat([aktSehifesi(x, sat, alc, "hesab", rk)]), mime: XLSX_MIME });
        son.hesab.push([x, sat, alc, rk]);
      }
      LOG(`+ ${no}: ${alc.ad}  yekun ${fmt(x.yekun)}  direktor: ${alc.direktor || "(tapılmadı)"}`);
    }
    const yer = await saxla(fayllar, `TTA_Protokol_${bugun()}.zip`);
    $("#chap-qutu").hidden = false;
    $("#chap-tta").hidden = !son.tta.length; $("#chap-prot").hidden = !son.protokol.length; $("#chap-hesab").hidden = !son.hesab.length;
    const s = [["", `${aralikYazi(o)} aralığında ${q.length} qaimə tapıldı (gələn: ${say(q, "Gələn")}, göndərilən: ${say(q, "Göndərilən")}).`],
      ["", `Hazırlandı: ${[son.tta.length ? son.tta.length + " TTA" : "", son.protokol.length ? son.protokol.length + " protokol" : "", son.hesab.length ? son.hesab.length + " hesab-faktura" : ""].filter(Boolean).join(", ")} (Excel).`],
      ["ok", `Yerləşdirildi: ${yer}.`]];
    if (direktorsuz.length) s.push(["x", `Direktoru tapılmayan ${direktorsuz.length} qaimə var (imza xanası boş qalıb): ${direktorsuz.slice(0, 5).join(", ")}${direktorsuz.length > 5 ? " …" : ""}`]);
    if (rekvsiz.length) s.push(["x", `${rekvsiz.length} hesab-fakturada satıcı üçün rekvizit tapılmadı (xanalar boş qalıb): ${rekvsiz.slice(0, 5).join(", ")}${rekvsiz.length > 5 ? " …" : ""}`]);
    s.push(["", "PDF lazımdırsa, aşağıdakı çap düymələrindən istifadə edin."]);
    netice(s);
  }));

  function chap(tip) {
    const s = son[tip]; if (!s || !s.length) return;
    $("#cap").innerHTML = s.map(([q, a, b, rk]) => aktHtml(q, a, b, tip, rk)).join("");
    document.body.classList.add("chapda");
    setTimeout(() => { window.print(); document.body.classList.remove("chapda"); $("#cap").innerHTML = ""; }, 100);
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
