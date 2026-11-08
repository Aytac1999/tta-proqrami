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

  function mesgul(b) {
    isleyir = b; dayan = false;
    hamisi(".esas").forEach((x) => (x.disabled = b));
    $("#dayan").hidden = !b;
    if (b) { jurnal.textContent = ""; $("#dolu").style.width = "0"; }
  }
  $("#dayan").addEventListener("click", () => { dayan = true; LOG("Dayandırılır …"); });
  const yukle = (ad, bytes, mime) => KOPRU("yukle", { ad, bytes, mime });
  const bugun = () => isoG(new Date());

  async function isle(ad, is) {
    if (isleyir) return;
    mesgul(true);
    try { await is(); }
    catch (e) { LOG("! " + (e instanceof SessiyaXetasi ? e.message : "Xəta: " + (e && e.message || e))); }
    mesgul(false);
  }

  $("#bas-terkib").addEventListener("click", () => isle("terkib", async () => {
    const o = oxu($("#b-terkib"));
    if (!o.dan || !o.ya) return LOG("Tarixləri seçin.");
    const q = await qaimeleriTopla({ ...o, sade: !o.f("tarixce") }, progress);
    if (!q.length) return LOG("Heç bir qaimə işlənmədi.");
    const bytes = await xlsxYarat(terkibSehifeleri(q));
    await yukle(`qaime_terkibi_${bugun()}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    LOG(`Hazırdır (${q.length} qaimə). Fayl Yükləmələr qovluğuna düşdü.`);
  }));

  $("#bas-tta").addEventListener("click", () => isle("tta", async () => {
    const o = oxu($("#b-tta"));
    if (!o.dan || !o.ya) return LOG("Tarixləri seçin.");
    const tta = o.f("tta"), prot = o.f("protokol");
    if (!tta && !prot) return LOG("TTA və ya protokoldan birini seçin.");
    const q = await qaimeleriTopla({ ...o, sade: true }, progress);
    if (!q.length) return LOG("Heç bir qaimə işlənmədi.");
    LOG("\nTərəflər və direktorlar reyestrdən yoxlanılır …");
    const fayllar = []; son = { tta: [], protokol: [] };
    for (const x of q) {
      const sat = await teref(x.gonderen_voen, x.gonderen_ad), alc = await teref(x.qebul_voen, x.qebul_ad);
      const no = x.seriya + x.nomre;
      if (tta) { fayllar.push({ ad: `TTA_${no}.xlsx`, data: await xlsxYarat([aktSehifesi(x, sat, alc, false)]) }); son.tta.push([x, sat, alc]); }
      if (prot) { fayllar.push({ ad: `Protokol_${no}.xlsx`, data: await xlsxYarat([aktSehifesi(x, sat, alc, true)]) }); son.protokol.push([x, sat, alc]); }
      LOG(`+ ${no}: ${alc.ad}  yekun ${fmt(x.yekun)}  direktor: ${alc.direktor || "(tapılmadı)"}`);
    }
    await yukle(`TTA_Protokol_${bugun()}.zip`, await zipYarat(fayllar, false), "application/zip");
    $("#chap-qutu").hidden = false;
    $("#chap-tta").disabled = !son.tta.length; $("#chap-prot").disabled = !son.protokol.length;
    LOG(`Hazırdır (${q.length} qaimə). ZIP Yükləmələr qovluğuna düşdü. PDF üçün aşağıdakı düymələrdən istifadə edin.`);
  }));

  function chap(tip) {
    const s = son[tip]; if (!s.length) return;
    $("#cap").innerHTML = s.map(([q, a, b]) => aktHtml(q, a, b, tip === "protokol")).join("");
    document.body.classList.add("chapda");
    setTimeout(() => { window.print(); document.body.classList.remove("chapda"); $("#cap").innerHTML = ""; }, 100);
  }
  $("#chap-tta").addEventListener("click", () => chap("tta"));
  $("#chap-prot").addEventListener("click", () => chap("protokol"));
})();
