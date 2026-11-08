// Kitabxanasız Excel (.xlsx) və ZIP yaradıcısı.
const _enc = new TextEncoder();
const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const _col = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
let _crcT = null;
function crc32(b) {
  if (!_crcT) { _crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = _crcT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function _deflate(u8) {
  const cs = new CompressionStream("deflate-raw"), w = cs.writable.getWriter();
  w.write(u8); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function zipYarat(files, sixis) { // files: [{ad, data: Uint8Array|string}]
  const parts = [], merkez = []; let off = 0;
  const d = new Date();
  const vaxt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const tarix = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const ad = _enc.encode(f.ad), raw = typeof f.data === "string" ? _enc.encode(f.data) : f.data;
    const crc = crc32(raw);
    let data = raw, metod = 0;
    if (sixis && typeof CompressionStream !== "undefined") { data = await _deflate(raw); metod = 8; }
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, metod, true);
    h.setUint16(10, vaxt, true); h.setUint16(12, tarix, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, ad.length, true);
    parts.push(new Uint8Array(h.buffer), ad, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, metod, true); c.setUint16(12, vaxt, true); c.setUint16(14, tarix, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, ad.length, true); c.setUint32(42, off, true);
    merkez.push(new Uint8Array(c.buffer), ad);
    off += 30 + ad.length + data.length;
  }
  const msize = merkez.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, msize, true); e.setUint32(16, off, true);
  const hamisi = [...parts, ...merkez, new Uint8Array(e.buffer)];
  const out = new Uint8Array(hamisi.reduce((a, b) => a + b.length, 0)); let p = 0;
  for (const b of hamisi) { out.set(b, p); p += b.length; }
  return out;
}

// Üslub nömrələri (xlsxStyles ilə eyni sıra)
const S = { NORMAL: 0, BASLIQ: 1, METN: 2, MERKEZ: 3, PUL: 4, QIYMET: 5, TITUL: 6, QALIN: 7, YEK_AD: 8, YEK_DEG: 9,
  GIRIS: 10, SAG_QALIN: 11, SAG: 12, TBASLIQ: 13, TPUL: 14, TQIYMET: 15 };
function _styles() {
  const xf = (n, f, fi, b, al) => `<xf numFmtId="${n}" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment ${al || ""}/></xf>`;
  const xfs = [
    xf(0, 0, 0, 0), xf(0, 1, 2, 1, 'horizontal="center" vertical="center" wrapText="1"'), xf(0, 0, 0, 1, 'vertical="center" wrapText="1"'),
    xf(0, 0, 0, 1, 'horizontal="center" vertical="center"'), xf(164, 0, 0, 1, 'vertical="center"'), xf(165, 0, 0, 1, 'vertical="center"'),
    xf(0, 2, 0, 0, 'horizontal="center"'), xf(0, 1, 0, 0), xf(0, 1, 3, 1, 'horizontal="right"'), xf(164, 1, 3, 1),
    xf(0, 0, 0, 0, 'vertical="top" wrapText="1"'), xf(0, 1, 0, 0, 'horizontal="right"'), xf(0, 0, 0, 1, 'horizontal="right" vertical="center"'),
    xf(0, 3, 2, 0, 'horizontal="center" vertical="center" wrapText="1"'), xf(164, 0, 0, 0), xf(165, 0, 0, 0),
  ];
  const font = (sz, b) => `<font>${b ? "<b/>" : ""}<sz val="${sz}"/><name val="Arial"/></font>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.00#######"/></numFmts>` +
    `<fonts count="4">${font(9)}${font(9, 1)}${font(12, 1)}${font(10, 1)}</fonts>` +
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F8"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FF8896AA"/></left><right style="thin"><color rgb="FF8896AA"/></right><top style="thin"><color rgb="FF8896AA"/></top><bottom style="thin"><color rgb="FF8896AA"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function _sheet(sh) {
  let maxC = 1;
  const rows = sh.rows.map((row, ri) => {
    const r = ri + 1;
    const ht = sh.hundur && sh.hundur[r] ? ` ht="${sh.hundur[r]}" customHeight="1"` : "";
    const cs = row.map((c, ci) => {
      if (c == null || c === "") return "";
      if (typeof c !== "object") c = { v: c };
      const ref = _col(ci + 1) + r; maxC = Math.max(maxC, ci + 1);
      const s = c.s ? ` s="${c.s}"` : "";
      if (c.f) return `<c r="${ref}"${s}><f>${_esc(c.f)}</f><v>${c.v}</v></c>`;
      if (typeof c.v === "number") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
      if (c.v === "" || c.v == null) return `<c r="${ref}"${s}/>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${_esc(c.v)}</t></is></c>`;
    }).join("");
    return `<row r="${r}"${ht}>${cs}</row>`;
  }).join("");
  const cols = sh.eni ? `<cols>${sh.eni.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const pane = sh.dondur ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` : "";
  const filt = sh.suzgec && sh.rows.length > 0 ? `<autoFilter ref="A1:${_col(sh.suzgec)}${sh.rows.length}"/>` : "";
  const merge = sh.birlesdir && sh.birlesdir.length ? `<mergeCells count="${sh.birlesdir.length}">${sh.birlesdir.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  const fit = sh.sigdir ? `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` : "";
  const setup = sh.sigdir ? `<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fit}` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}` +
    `<sheetData>${rows}</sheetData>${filt}${merge}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>${setup}</worksheet>`;
}
async function xlsxYarat(sehifeler) { // [{ad, rows, eni, dondur, suzgec, birlesdir, hundur, sigdir}]
  const n = sehifeler.length;
  const files = [
    { ad: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sehifeler.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { ad: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { ad: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sehifeler.map((s, i) => `<sheet name="${_esc(s.ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { ad: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sehifeler.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { ad: "xl/styles.xml", data: _styles() },
    ...sehifeler.map((s, i) => ({ ad: `xl/worksheets/sheet${i + 1}.xml`, data: _sheet(s) })),
  ];
  return zipYarat(files, true);
}

// ------------------------------------------------------------------ konkret cədvəllər
function terkibSehifeleri(qaimeler) {
  const bas = ["Qaimə (seriya+nömrə)", "Qaimə tarixi", "İstiqamət", "Status", "Qaimənin tipi", "Vəziyyəti (Cari/Düzəliş)", "Versiya №",
    "Göndərildi", "Təsdiqləndi (son)", "Düzəliş edilib?", "Düzəliş tarixi", "Düzəliş edən",
    "Əlaqəli qaimələr (geri qaytarma / əsas qaimə)", "Göndərən VÖEN", "Göndərən adı", "Qəbul edən VÖEN", "Qəbul edən adı", "Əsas",
    "Əlavə qeydlər", "Sıra №", "Malın adı", "Malın kodu", "Ölçü vahidi", "Miqdar", "Vahidin qiyməti", "Məbləğ (ƏDV-siz)", "ƏDV",
    "Yekun məbləğ", "Qaytarma səbəbi", "Ləğv tarixi", "Bağlı avans qaiməsi", "Bağlı normal qaimə"];
  const eni = [20, 12, 12, 14, 16, 11, 9, 17, 17, 14, 17, 28, 50, 14, 34, 14, 34, 40, 24, 7, 50, 14, 10, 10, 12, 14, 12, 14, 18, 26, 30, 30];
  const bs = (a) => a.map((v) => ({ v, s: S.TBASLIQ }));
  const ana = [bs(bas)];
  for (const q of qaimeler) for (const m of q.mallar) {
    ana.push([q.seriya + q.nomre, q.tarix, q.istiqamet || "", q.status || "", q.tip || "", q.novu || "", q.versiya_no == null ? "" : q.versiya_no,
      q.gonderildi || "", q.tesdiqlendi || "", q.duzelis || "", q.duzelis_tarixi || "", q.duzelis_eden || "", q.elaqeli || "",
      q.gonderen_voen, q.gonderen_ad, q.qebul_voen, q.qebul_ad, q.esas, q.esas2 || "", m.sira, m.ad, m.kod, m.olcu, m.miqdar,
      { v: m.qiymet, s: S.TQIYMET }, { v: m.mebleg, s: S.TPUL }, { v: m.edv, s: S.TPUL }, { v: m.yekun, s: S.TPUL }, m.sebeb || "", q.legv || "", q.bagli_avans || "", q.bagli_normal || ""]);
  }
  const sh = [{ ad: "Qaimə tərkibi", rows: ana, eni, dondur: true, suzgec: bas.length }];
  if (qaimeler.some((q) => q.ek)) {
    const w2 = [bs(["Qaimə", "Tarix", "İstifadəçi", "Status", "Qeyd"])], w3 = [bs(["Qaimə", "Versiya №", "Cari", "Yekun məbləğ", "ƏDV məbləği", "Vergi", "Dəyişdirən", "Dəyişmə tarixi"])];
    const w4 = [bs(["Bu qaimə", "Əlaqəli qaimə №", "Tarix", "Növ", "Status", "Üst qaimə", "Tərəf (VÖEN/ad)", "Xam məlumat"])];
    for (const q of qaimeler) {
      const no = q.seriya + q.nomre, ek = q.ek || {};
      [...(ek.events || [])].sort((a, b) => String(a.modifiedAt || "").localeCompare(String(b.modifiedAt || "")))
        .forEach((e) => w2.push([no, tarixSaat(e.modifiedAt), e.userName || "", STATUS_AZ[e.status] || e.status || "", String(e.comment || "")]));
      (ek.versions || []).forEach((v) => w3.push([no, v.versionNumber, v.current ? "Bəli" : "Xeyr", v.amount, v.vatAmount, v.taxAmount, v.modifiedBy || "", tarixSaat(v.modifiedAt)]));
      (q.elaqeli_siyahi || []).forEach((e) => w4.push([no, e.nomre, e.tarix, e.novu, e.status, e.ata, e.teref, e.xam]));
    }
    sh.push({ ad: "Tarixçə", rows: w2, eni: [20, 17, 36, 28, 40], dondur: true, suzgec: 5 },
      { ad: "Versiyalar", rows: w3, eni: [20, 10, 8, 14, 14, 10, 36, 17], dondur: true, suzgec: 8 },
      { ad: "Əlaqəli qaimələr", rows: w4, eni: [20, 20, 17, 30, 24, 20, 30, 80], dondur: true, suzgec: 8 });
  }
  return sh;
}
function aktSehifesi(q, sat, alc, tip, rekv) {
  tip = _tip(tip);
  const no = q.seriya + q.nomre;
  const basliq = aktBasliq(tip);
  const rows = [[{ v: AYAR.sheher, s: S.QALIN }, "", "", "", "", "", { v: q.tarix, s: S.SAG_QALIN }], [], [{ v: `${basliq} № ${no}`, s: S.TITUL }], [],
    [{ v: girisMetni(q, sat, alc, tip), s: S.GIRIS }], [], [], [],
    ["№", "Malın / işin / xidmətin adı", "Kod", "Ölçü vahidi", "Miqdar", "Vahidin qiyməti", "Məbləğ"].map((v) => ({ v, s: S.BASLIQ }))];
  const hundur = { 9: 26 };
  q.mallar.forEach((m, i) => {
    rows.push([{ v: i + 1, s: S.MERKEZ }, { v: m.ad, s: S.METN }, { v: m.kod, s: S.MERKEZ }, { v: m.olcu, s: S.MERKEZ },
      { v: m.miqdar, s: S.SAG }, { v: m.qiymet, s: S.QIYMET }, { v: m.mebleg, s: S.PUL }]);
    hundur[rows.length] = m.ad.length > 58 ? 25 : 15;
  });
  const ilk = 10, son = rows.length;
  const cemi = r2(q.mallar.reduce((a, m) => a + m.mebleg, 0));
  rows.push([null, null, null, null, null, { v: "Cəmi", s: S.YEK_AD }, { f: `SUM(G${ilk}:G${son})`, v: cemi, s: S.YEK_DEG }]);
  rows.push([null, null, null, null, null, { v: edvEtiketi(q), s: S.YEK_AD }, { v: q.edv, s: S.YEK_DEG }]);
  rows.push([null, null, null, null, null, { v: "Yekun", s: S.YEK_AD }, { f: `G${son + 1}+G${son + 2}`, v: r2(cemi + q.edv), s: S.YEK_DEG }]);
  rows.push([], [{ v: "Yekun məbləğ (yazı ilə): " + meblegYazi(q.yekun), s: S.QALIN }]);
  if (tip === "hesab") {
    rows.push([], [{ v: "SATICININ BANK REKVİZİTLƏRİ", s: S.QALIN }]);
    for (const [k, ad] of REKV_SETRI) rows.push([{ v: `${ad}: ${(rekv && rekv[k]) || "______________________"}`, s: S.NORMAL }]);
    rows.push([], [], []);
  } else rows.push([{ v: AYAR.iddia_cumlesi, s: S.NORMAL }], [], [], []);
  const b = rows.length + 1;
  const blok = (tr, bas) => [bas, tr.ad, `VÖEN: ${tr.voen}`, "", `${tr.rol}: ${tr.direktor}`, "", "", "", "İmza: ______________________", "M.Y."];
  const sb = blok(sat, "SATICI"), ab = blok(alc, "ALICI");
  for (let k = 0; k < 10; k++) {
    const row = [];
    row[0] = k === 0 || k === 1 || k === 9 ? { v: sb[k], s: S.QALIN } : sb[k];
    row[3] = k === 0 || k === 1 || k === 9 ? { v: ab[k], s: S.QALIN } : ab[k];
    rows.push(row);
  }
  return { ad: tip === "protokol" ? "Protokol" : tip === "hesab" ? "Hesab-faktura" : "TTA", rows, eni: [5, 46, 15, 11, 9, 13, 14], hundur, sigdir: true, birlesdir: ["A3:G3", "A5:G7"] };
}
