#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Qaimədən Təhvil-Təslim Aktı (TTA) və qaimə tərkibi proqramı.

İki iş rejimi:
  1) PDF qaimələrdən:     py tta_proqrami.py QAIME.pdf [QOVLUQ ...]
  2) e-taxes-dən (girişlə): py tta_proqrami.py --etaxes --il 2026 --tta
Heç bir arqument verməsəniz, proqram sizə seçim menyusu göstərir.

Nəticə cixis/ qovluğunda olur:
  * qaime_terkibi.xlsx   - hər mal ayrıca sətir (qaimə nömrəsi, tarix, status, VÖEN, ad, mal, kod, ölçü, miqdar, qiymət, məbləğ ...)
  * TTA_<qaimə>.xlsx və TTA_<qaimə>.pdf  - hər qaimə üçün akt (e-taxes rejimində --tta ilə, PDF rejimində həmişə)

Qaydalar (ayarlar.json ilə dəyişdirilə bilər):
  * Akt №  = qaimənin seriyası + nömrəsi;  tarix = qaimənin tarixi
  * Müqavilə cümləsi = qaimənin "Əsas" xanası
  * Direktor = dövlət reyestrindən (qanuni təmsilçi); ayarlar.json-da "direktor_duzelis" ilə əl ilə düzəldilə bilər
"""
import argparse, datetime, glob, json, os, re, sys, time

import pdfplumber
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

VERSION = "1.5.7"
ETAX = "https://new.e-taxes.gov.az"
REYESTR_URL = ETAX + "/api/po/authless/public/v1/authless/findTaxpayer"
KESH_FAYLI = "direktorlar.json"
AYAR_FAYLI = "ayarlar.json"
BRAUZER_PROFILI = os.path.join(os.path.expanduser("~"), ".tta_proqrami_brauzer")

STATUS_AZ = {
    "approved": "Təsdiqləndi",
    "onApproval": "Təsdiq gözləyir",
    "approvedBySystem": "Sistem tərəfindən təsdiqlənib",
    "updateApproval": "Dəyişiklik təsdiqi gözləyir",
    "updateRequested": "Dəyişiklik tələb olunub",
    "cancelRequested": "Ləğv tələb olunub",
    "onApprovalEdited": "Düzəliş təsdiq gözləyir",
    "deactivated": "Ləğv edilib",
    "cancelationRefused": "Ləğvetmə rədd edilib",
    "correctionRefused": "Düzəliş rədd edilib",
}

# --------------------------------------------------------------------------- ayarlar
VARSAYILAN = {
    "pencere": False,  # True olarsa, proqram açılışda pəncərə rejimini göstərir
    "yenileme_url": "",  # məs. https://raw.githubusercontent.com/SIZIN_AD/tta/main  (version.txt, tta_proqrami.py, ayarlar.json)
    "sheher": "Bakı şəhəri",
    "giris_sablon": ("Biz, aşağıda imza edənlər, Satıcı {satici} (VÖEN {satici_voen}) və Alıcı {alici} (VÖEN {alici_voen}), "
                     "bu aktı tərtib edirik ki, {esas}aşağıda göstərilən mallar Satıcı tərəfindən təhvil verilmiş, "
                     "Alıcı tərəfindən qəbul edilmişdir."),
    "protokol_yarat": True,  # TTA ilə birlikdə "Qiymət razılaşdırma protokolu" da hazırlansın
    "protokol_basliq": "QİYMƏT RAZILAŞDIRMA PROTOKOLU",
    "protokol_giris_sablon": "",
    "hesab_basliq": "HESAB-FAKTURA",
    "hesab_giris_sablon": ("Satıcı {satici} (VÖEN {satici_voen}) tərəfindən Alıcı {alici} (VÖEN {alici_voen}) üçün {esas}"
                           "aşağıda göstərilən mallar üzrə hesab-faktura təqdim edilir. Ödənişin aşağıda göstərilən "
                           "bank rekvizitlərinə köçürülməsi xahiş olunur."),
    "rekvizitler": {},  # hesab-faktura üçün satıcının bank rekvizitləri: {"VÖEN" və ya "*": {"ad","kod","bvoen","mh","swift","hesab"}}  # boşdursa TTA mətni götürülür ("aktı" sözü "protokolu" ilə əvəz olunur)
    "iddia_cumlesi": "Tərəflərin həcm, keyfiyyət və müddətə dair bir-birinə qarşı iddiası yoxdur.",
    "direktor_duzelis": {},                                    # {"VÖEN": "Ad Soyad Ata adı oğlu"}
    "esas_evezlemeleri": [["müqaviləsi\\s*$", "müqaviləsinə"]],  # [regex, əvəz]
}
AYAR = dict(VARSAYILAN)


def ayar_yukle(merkezi=None):
    """Sıra: standart < mərkəzi (yeniləmə mənbəyindən) < yerli ayarlar.json"""
    global AYAR
    a = dict(VARSAYILAN)
    if merkezi:
        a.update(merkezi)
    if os.path.exists(AYAR_FAYLI):
        try:
            with open(AYAR_FAYLI, encoding="utf-8") as f:
                yerli = json.load(f)
            a.update(yerli)
        except (OSError, ValueError) as e:
            print(f"! {AYAR_FAYLI} oxunmadı ({e}), standart ayarlar işlədilir")
    else:
        try:
            with open(AYAR_FAYLI, "w", encoding="utf-8") as f:
                json.dump(VARSAYILAN, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
    AYAR = a


def yenile():
    """Proqramın və mərkəzi ayarların yeni versiyası varsa, avtomatik yüklə."""
    url = (AYAR.get("yenileme_url") or "").rstrip("/")
    if not url:
        return
    try:
        import requests
        v = requests.get(url + "/version.txt", timeout=6).text.strip()
        yeni = tuple(int(x) for x in v.split("."))
        kohne = tuple(int(x) for x in VERSION.split("."))
        if yeni > kohne:
            r = requests.get(url + "/tta_proqrami.py", timeout=30)
            r.raise_for_status()
            compile(r.text, "tta_proqrami.py", "exec")  # sintaksis yoxlaması
            yol = os.path.abspath(__file__)
            with open(yol + ".yeni", "w", encoding="utf-8", newline="\n") as f:
                f.write(r.text)
            os.replace(yol + ".yeni", yol)
            print(f"Proqram yeniləndi: {VERSION} -> {v}. Yenidən başladılır ...")
            os.execv(sys.executable, [sys.executable, yol] + sys.argv[1:])
        m = requests.get(url + "/ayarlar.json", timeout=6)
        if m.ok:
            ayar_yukle(m.json())
    except SystemExit:
        raise
    except Exception as e:
        print(f"  (yeniləmə yoxlanmadı: {e})")


# --------------------------------------------------------------------------- şrift
def _shrift_tap():
    adaylar = [
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for r, b in adaylar:
        if os.path.exists(r) and os.path.exists(b):
            return r, b
    sys.exit("Arial/Liberation/DejaVu şrifti tapılmadı.")


_r, _b = _shrift_tap()
pdfmetrics.registerFont(TTFont("F", _r))
pdfmetrics.registerFont(TTFont("FB", _b))
pdfmetrics.registerFontFamily("F", normal="F", bold="FB")


# --------------------------------------------------------------------------- köməkçilər
def az_lower(s):
    return s.replace("İ", "i").replace("I", "ı").lower()


def az_adlandir(ad):
    """RƏŞİD ALIYEV MÜLAİM OĞLU -> Rəşid Alıyev Mülaim oğlu"""
    sozler = []
    for w in ad.strip().split():
        k = az_lower(w)
        if k in ("oğlu", "qızı", "oglu", "qizi", "ogly"):
            sozler.append(k)
        else:
            sozler.append(("İ" if k[:1] == "i" else k[:1].upper()) + k[1:])
    return " ".join(sozler)


def fmt(x):
    return f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_qiymet(x):
    """Vahid qiymət: 2 rəqəmə qədər yuvarlaqlaşdırma yoxdur, 9 onluğa qədər dəqiq göstərilir (miqdar×qiymət = məbləğ görünsün)."""
    t = f"{abs(x):.9f}".rstrip("0")
    dec = t.split(".")[1] if "." in t else ""
    if len(dec) <= 2:
        return fmt(x)
    return ("-" if x < 0 else "") + f"{int(abs(x)):,}".replace(",", ".") + "," + dec


def num(s):
    s = str(s if s is not None else "").strip().replace(" ", "")
    return float(s) if s else 0.0


_TEKLER = ["", "bir", "iki", "üç", "dörd", "beş", "altı", "yeddi", "səkkiz", "doqquz"]
_ONLAR = ["", "on", "iyirmi", "otuz", "qırx", "əlli", "altmış", "yetmiş", "səksən", "doxsan"]


def _uc_reqemli(n):
    s = []
    y, o, t = n // 100, (n // 10) % 10, n % 10
    if y:
        s.append(("" if y == 1 else _TEKLER[y] + " ") + "yüz")
    if o:
        s.append(_ONLAR[o])
    if t:
        s.append(_TEKLER[t])
    return " ".join(s)


def yazi_ile(n):
    if n == 0:
        return "sıfır"
    parcalar = []
    for bol, ad in ((10**9, "milyard"), (10**6, "milyon"), (1000, "min")):
        q = n // bol
        if q:
            parcalar.append("min" if (ad == "min" and q == 1) else _uc_reqemli(q) + " " + ad)
            n %= bol
    if n:
        parcalar.append(_uc_reqemli(n))
    return " ".join(parcalar)


def mebleg_yazi(yekun):
    yekun = round(yekun, 2)
    m = int(yekun)
    q = int(round((yekun - m) * 100))
    s = f"{yazi_ile(m)} manat {q:02d} qəpik"
    return ("İ" if s[0] == "i" else s[0].upper()) + s[1:]


def tarix_saat(s):
    """ISO və ya başqa tarixi 'gg.aa.iiii ss:dd' formasına (Bakı vaxtı) çevir."""
    s = str(s or "")
    if not s:
        return ""
    try:
        d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if d.tzinfo is not None:
            d = d.astimezone(datetime.timezone(datetime.timedelta(hours=4)))
        return d.strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return tarix_cevir(s)


def tarix_cevir(s):
    s = str(s or "")
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m[3]}.{m[2]}.{m[1]}"
    m = re.match(r"(\d{2})[-./](\d{2})[-./](\d{4})", s)
    if m:
        return f"{m[1]}.{m[2]}.{m[3]}"
    if re.fullmatch(r"\d{10,13}", s):
        ts = int(s) / 1000 if len(s) == 13 else int(s)
        return datetime.datetime.fromtimestamp(ts).strftime("%d.%m.%Y")
    return s


# --------------------------------------------------------------------------- reyestr
_kesh = None


def _kesh_yukle():
    global _kesh
    if _kesh is None:
        try:
            with open(KESH_FAYLI, encoding="utf-8") as f:
                _kesh = json.load(f)
        except (OSError, ValueError):
            _kesh = {}
    return _kesh


def reyestr(voen, oflayn=False):
    """VÖEN -> {'ad':..., 'direktor':...} (dövlət reyestrindən, girişsiz). Tapılmazsa None."""
    kesh = _kesh_yukle()
    if voen in kesh:
        return kesh[voen]
    if oflayn:
        return None
    try:
        import requests
        r = requests.post(
            REYESTR_URL,
            json={"tin": voen, "type": "legalEntity", "serviceCode": "checkLegalName", "isStateRegistry": True},
            timeout=30,
        )
        r.raise_for_status()
        t = r.json()["taxpayers"][0]
        netice = {"ad": t["name"], "direktor": az_adlandir(t["legalTaxpayerStatus"]["legitimate"])}
    except Exception as e:
        print(f"  ! Reyestr sorğusu alınmadı ({voen}): {e}")
        return None
    kesh[voen] = netice
    with open(KESH_FAYLI, "w", encoding="utf-8") as f:
        json.dump(kesh, f, ensure_ascii=False, indent=1)
    return netice


# --------------------------------------------------------------------------- qaimə oxuyucusu (PDF)
def qaime_oxu(yol):
    with pdfplumber.open(yol) as pdf:
        metn = "\n".join((p.extract_text() or "") for p in pdf.pages)
        cedveller = [t for p in pdf.pages for t in p.extract_tables()]

    m = re.search(r"Seriya:\s*(\S+)\s+Nömrə:\s*(\d+)\s+Tarix:\s*(\d{2}\.\d{2}\.\d{4})", metn)
    if not m:
        raise ValueError("Seriya/nömrə/tarix tapılmadı (bu qaimə PDF-i deyil?)")
    seriya, nomre, tarix = m.groups()

    vs = [("".join(t[0])) for t in cedveller if len(t) == 1 and len(t[0]) == 10 and all(len(c or "") == 1 for c in t[0])]
    if len(vs) < 2:
        raise ValueError("VÖEN-lər tapılmadı")
    gonderen_voen, qebul_voen = vs[0], vs[1]

    def ad_oxu(etiket):
        mm = re.search(rf"{etiket}:\s*VÖEN[^\n]*?\b\d(?:\s+\d)*\s+(.+)", metn)
        return mm.group(1).strip() if mm else ""

    esas = ""
    me = re.search(r"Əsas\s+(.+?)\s*\n", metn)
    if me:
        esas = me.group(1).strip()
        if esas in ("-", "—"):
            esas = ""

    mallar, cemi = [], None
    for t in cedveller:
        for r in t:
            if len(r) < 18:
                continue
            if (r[1] or "").strip() == "Cəmi":
                cemi = r
                continue
            if re.fullmatch(r"\d+", (r[0] or "").strip()) and (r[1] or "").strip() not in ("2", ""):
                mallar.append({
                    "sira": int(r[0]), "ad": " ".join((r[1] or "").split()), "kod": (r[2] or "").strip(),
                    "olcu": (r[4] or "").strip(), "miqdar": num(r[5]), "qiymet": num(r[6]),
                    "mebleg": round(num(r[7]), 2), "edv": round(num(r[15]), 2), "yekun": round(num(r[17]), 2),
                })
    if not mallar:
        raise ValueError("Mal sətirləri tapılmadı")
    if cemi is not None:
        cemi_mebleg, edv = round(num(cemi[7]), 2), round(num(cemi[15]), 2)
    else:
        cemi_mebleg = round(sum(x["mebleg"] for x in mallar), 2)
        edv = round(sum(x["edv"] for x in mallar), 2)
    return {
        "fayl": yol, "seriya": seriya, "nomre": nomre, "tarix": tarix, "status": "", "istiqamet": "",
        "gonderen_voen": gonderen_voen, "gonderen_ad": ad_oxu("Göndərən"),
        "qebul_voen": qebul_voen, "qebul_ad": ad_oxu("Qəbul edən"),
        "esas": esas, "esas2": "", "mallar": mallar,
        "cemi": cemi_mebleg, "edv": edv, "yekun": round(cemi_mebleg + edv, 2),
    }


# --------------------------------------------------------------------------- e-taxes (girişlə)
def _token_ayir(raw):
    """localStorage/sessionStorage-dəki dəyərdən JWT sətrini çıxar."""
    if not raw:
        return None
    raw = raw.strip()
    try:
        p = json.loads(raw)
        if isinstance(p, str):
            return p
        if isinstance(p, dict):
            for k in ("token", "accessToken", "access_token", "jwt", "idToken"):
                if isinstance(p.get(k), str):
                    return p[k]
            return None
    except ValueError:
        pass
    return raw.strip('"')


def etaxes_token():
    """Brauzer açır; siz e-taxes-ə özünüz daxil olursunuz; giriş tokeni oxunur. Parol proqrama verilmir."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright yoxdur. Bir dəfə bunu yazın:  py -m pip install playwright")
    token = None
    with sync_playwright() as p:
        try:
            ctx = p.chromium.launch_persistent_context(BRAUZER_PROFILI, channel="chrome", headless=False)
        except Exception as e:
            sys.exit(f"Chrome açılmadı ({e}). Google Chrome quraşdırılıb?")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(ETAX + "/eportal/invoice")
        print("Brauzer açıldı. e-taxes-ə daxil olun (Asan İmza / SİMA / Kod-Parol). Giriş gözlənilir (10 dəq.) ...")
        son = time.time() + 600
        while time.time() < son:
            try:
                raw = page.evaluate("() => localStorage.getItem('aztax-jwt') || sessionStorage.getItem('aztax-jwt')")
            except Exception:
                raw = None
            token = _token_ayir(raw)
            if token:
                break
            page.wait_for_timeout(2000)
        ctx.close()
    if not token:
        sys.exit("Giriş tapılmadı (vaxt bitdi).")
    return token


class ETaxes:
    def __init__(self, token):
        import requests
        self.s = requests.Session()
        self.token = token
        self.var = "xam"  # başlıq formatı: xam token, alınmasa 'Bearer ' ilə

    def _istek(self, metod, yol, **kw):
        for _ in range(2):
            basliq = {"Accept": "application/json",
                      "x-authorization": self.token if self.var == "xam" else "Bearer " + self.token}
            r = self._gonder(metod, yol, basliq, kw)
            if r.status_code in (401, 403) and self.var == "xam":
                self.var = "bearer"
                continue
            break
        if r.status_code in (401, 403):
            sys.exit("Sessiya bitib və ya giriş qəbul edilmədi. Proqramı yenidən işə salıb daxil olun.")
        return r

    def _gonder(self, metod, yol, basliq, kw):
        """İnternet qısa müddətə itərsə (DNS/timeout), bir neçə dəfə gözləyib təkrar cəhd edir."""
        import requests
        gozle = [3, 6, 12, 20, 30]
        for i in range(len(gozle) + 1):
            try:
                return self.s.request(metod, ETAX + yol, headers=basliq, timeout=60, **kw)
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
                if i == len(gozle):
                    raise
                print(f"  ... bağlantı kəsildi, {gozle[i]} san. gözləyib yenidən cəhd edirəm ({i + 1}/{len(gozle)})")
                time.sleep(gozle[i])

    def siyahi(self, istiqamet, dan, ya):
        """istiqamet: 'inbox' (gələn) və ya 'outbox' (göndərilən); dan/ya: dd-mm-yyyy"""
        ya_g = datetime.datetime.strptime(ya, "%d-%m-%Y") + datetime.timedelta(days=1)
        govde = {
            "sortBy": "creationDate", "sortAsc": True,
            "statuses": None,  # None = bütün statuslar
            "types": ["current", "corrected"],
            "kinds": ["defaultInvoice", "agent", "resale", "recycling", "taxCodex163", "taxCodex177_5", "returnInvoice",
                      "returnByAgent", "returnRecycled", "exportNoteInvoice", "exciseGoodsTransfer", "advanceInvoice"],
            "serialNumber": None, "senderTin": None, "senderName": None, "productName": None, "productCode": None,
            "receiverTin": None, "receiverName": None,
            "creationDateFrom": f"{dan} 00:00", "creationDateTo": ya_g.strftime("%d-%m-%Y 00:00"),
            "amountFrom": None, "amountTo": None, "offset": 0, "maxCount": 50, "actionOwner": None,
        }
        netice, ilk, merhele = [], True, 0
        while True:
            r = self._istek("POST", f"/api/po/invoice/public/v2/invoice/find.{istiqamet}", json=govde)
            if r.status_code == 400 and ilk:  # server "hamısı" qəbul etməsə: köhnə siyahı, sonra hamısı boş
                merhele += 1
                if merhele == 1:
                    govde["statuses"] = ["approved", "onApproval", "updateApproval", "updateRequested", "cancelRequested",
                                         "approvedBySystem", "onApprovalEdited", "deactivated", "cancelationRefused",
                                         "correctionRefused"]
                else:
                    govde.update(statuses=None, types=None, kinds=None)
                    ilk = False
                continue
            ilk = False
            r.raise_for_status()
            j = r.json()
            sira = j.get("invoices") or []
            netice += sira
            if not j.get("hasMore") or not sira:
                break
            govde["offset"] += len(sira)
        return netice

    def detay(self, qaime):
        r = self._istek("GET", f"/api/po/invoice/public/v2/invoice/{qaime['id']}",
                        params={"sourceSystem": qaime.get("sourceSystem") or "avis"})
        r.raise_for_status()
        return r.json()


def _ek(cl_istek, yol, **kw):
    try:
        r = cl_istek("GET" if "json" not in kw else "POST", yol, **kw)
        r.raise_for_status()
        return r.json()
    except SystemExit:
        raise
    except Exception as e:
        print(f"  ! {yol.split('/')[-1][:40]}: alınmadı ({e})")
        return None


def tarixce_al(cl, qaime):
    """Tarixçə (hadisələr), versiyalar və əlaqəli qaimələr (növlər üzrə tarixçə) - yalnız oxuma."""
    sn = qaime.get("serialNumber") or ""
    ss = {"sourceSystem": qaime.get("sourceSystem") or "avis"}
    base = f"/api/po/invoice/public/v1/invoice/{qaime['id']}"
    h = _ek(cl._istek, base + "/history", params=ss) or {}
    v = _ek(cl._istek, base + "/versions", params=ss) or {}
    t = _ek(cl._istek, "/api/po/invoice/public/v1/invoice/tree", json={"serialNumbers": [sn]}) or {}
    e = _ek(cl._istek, f"/api/po/invoice/public/v1/invoice/get-related-invoice-tree/{sn}") or {}
    return {"sn": sn, "events": h.get("events") or [], "versions": v.get("versions") or [],
            "tree": t.get("invoiceTree") or [], "related": e.get("parentInvoiceHistories") or []}


NOV_AZ = {"current": "Cari", "corrected": "Düzəliş edilmiş"}
# Qaimənin tipi: seriyanın ilk 2 hərfinə görə (MT/MQ e-taxes-də təsdiqlənib; digərləri bəlli olduqca əlavə olunur – ayarlar.json-da "tip_adlari")
TIP_AZ = {"MT": "Malların, işlərin və xidmətlərin təqdim edilməsi barədə elektron qaimə-faktura",
          "MQ": "Malların qaytarılması barədə elektron qaimə-faktura"}


def qaime_tipi(sn, d=None):
    t = (AYAR.get("tip_adlari") or {}).get(sn[:2]) or TIP_AZ.get(sn[:2])
    if t:
        return t
    for k in ("invoiceTypeName", "invoiceType", "documentType", "kind", "typeName"):
        v = (d or {}).get(k)
        if isinstance(v, dict):
            v = (v.get("name") or {}).get("az") if isinstance(v.get("name"), dict) else v.get("name")
        if v:
            return str(v)
    return sn[:2]


def qaytarma_sebebi(it):
    """Malların qaytarılması qaiməsində sətirin 'Qaytarma səbəbi' (sahə adı bəlli olmadığı üçün 'reason' axtarılır)."""
    for k, v in it.items():
        if "reason" in k.lower() and v not in (None, "", [], {}):
            if isinstance(v, dict):
                v = (v.get("name") or {}).get("az") if isinstance(v.get("name"), dict) else (v.get("name") or v.get("value") or "")
            return str(v or "")
    return ""


def etaxes_cevir(d, istiqamet, ek=None):
    """e-taxes qaimə detalı -> proqramın daxili qaimə strukturu"""
    sn = d.get("serialNumber") or ""
    mallar = []
    for i, it in enumerate(d.get("items") or [], 1):
        cost = round(num(it.get("cost")), 2)
        edvli = num(it.get("vat18")) > 0
        edv = round(cost * 0.18, 2) if edvli else 0.0
        olcu = ((it.get("unitFromDict") or {}).get("name") or {}).get("az") or it.get("unit") or ""
        mallar.append({
            "sira": i, "ad": " ".join((it.get("productName") or "").split()),
            "kod": (it.get("productGroup") or {}).get("code") or "", "olcu": olcu,
            "miqdar": num(it.get("quantity")), "qiymet": num(it.get("pricePerUnit")),
            "mebleg": cost, "edv": edv, "yekun": round(cost + edv, 2), "sebeb": qaytarma_sebebi(it),
        })
    yekun = round(num(d.get("amount")), 2)
    edv = round(num(d.get("vat")), 2)
    cemi = round(yekun - edv, 2)
    toplam = round(sum(m["mebleg"] for m in mallar), 2)
    if abs(toplam - cemi) > 0.02:
        print(f"  ! {sn}: mal sətirlərinin cəmi ({toplam}) ilə qaimənin ƏDV-siz məbləği ({cemi}) üst-üstə düşmür")
    s, r = d.get("sender") or {}, d.get("receiver") or {}
    return {
        "fayl": "", "seriya": sn[:6], "nomre": sn[6:], "tarix": tarix_cevir(d.get("createdAt")),
        "status": STATUS_AZ.get(d.get("status"), d.get("status") or ""), "istiqamet": istiqamet,
        "gonderen_voen": s.get("tin") or "", "gonderen_ad": s.get("name") or "",
        "qebul_voen": r.get("tin") or "", "qebul_ad": r.get("name") or "",
        "esas": (d.get("invoiceComment") or "").strip(), "esas2": (d.get("invoiceComment2") or "").strip(),
        "mallar": mallar, "cemi": cemi, "edv": edv, "yekun": yekun,
        "novu": NOV_AZ.get(d.get("type"), d.get("type") or ""), "tip": qaime_tipi(sn, d), "versiya_no": d.get("version"),
        **tarixce_xulase(ek),
        "_avansdir": bool(re.search(r"advance|avans", str(d.get("kind") or d.get("invoiceKind") or "") + " " + str(qaime_tipi(sn, d)), re.I)),
    }


def avans_bagla(q):
    """avans qaiməsi <-> normal qaimə bağlantısı (əlaqəli qaimələr siyahısından)"""
    el = q.get("elaqeli_siyahi") or []
    avm = lambda e: bool(re.search(r"advance|avans", (e.get("novu") or "") + " " + (e.get("xam") or ""), re.I))
    yaz = lambda e: f'{e["nomre"]}' + (f' ({e["tarix"]})' if e.get("tarix") else "")
    q["bagli_avans"] = "" if q["_avansdir"] else "; ".join(yaz(e) for e in el if avm(e))
    q["bagli_normal"] = "; ".join(yaz(e) for e in el if not avm(e)) if q["_avansdir"] else ""
    return q


_SN_ACARLAR = ("serialNumber", "invoiceSerialNumber", "serial", "number", "invoiceNumber")
_TARIX_ACARLAR = ("invoiceDate", "createdAt", "date", "operationDate", "modifiedAt", "created", "creationDate")
_NOV_ACARLAR = ("type", "invoiceType", "relationType", "kind", "operationType", "typeName", "invoiceKind")
_STATUS_ACARLAR = ("status", "state")


def elaqeli_ac(*kokler):
    """tree / get-related-invoice-tree cavabındakı bütün qaimələri (iç-içə olsa da) düz siyahıya çevir.
    Hər qeyd: nömrə, növ, tarix, status + bütün sahələr (xam). Quruluş bəlli olmadığı üçün ümumi yazılıb."""
    out, gorulen = [], set()

    def ilk(d, acarlar):
        for a in acarlar:
            v = d.get(a)
            if v not in (None, "", [], {}) and not isinstance(v, (dict, list)):
                return v
        return ""

    def yur(x, ata=""):
        if isinstance(x, list):
            for i in x:
                yur(i, ata)
        elif isinstance(x, dict):
            sn = ilk(x, _SN_ACARLAR)
            cari_ata = ata
            if sn:
                acar = (sn, str(ilk(x, _TARIX_ACARLAR)), str(ilk(x, _NOV_ACARLAR)), ata)
                if acar not in gorulen:
                    gorulen.add(acar)
                    tr = [str(v) for k, v in x.items() if not isinstance(v, (dict, list)) and v and
                          any(z in k.lower() for z in ("tin", "voen", "taxpayer", "sender", "owner", "company"))]
                    out.append({"teref": " / ".join(tr), "nomre": str(sn), "tarix": tarix_saat(ilk(x, _TARIX_ACARLAR)), "novu": str(ilk(x, _NOV_ACARLAR)) or TIP_AZ.get(str(sn)[:2], ""),
                                "status": STATUS_AZ.get(ilk(x, _STATUS_ACARLAR), str(ilk(x, _STATUS_ACARLAR))),
                                "ata": ata, "xam": json.dumps(x, ensure_ascii=False)[:800]})
                cari_ata = str(sn)
            for k, v in x.items():
                if isinstance(v, (dict, list)):
                    yur(v, cari_ata)

    for k in kokler:
        yur(k)
    return out


def tarixce_xulase(ek):
    """Hadisələrdən: göndərilmə / son təsdiq tarixi və kim təsdiqlədi."""
    r = {"gonderildi": "", "tesdiqlendi": "", "tesdiq_eden": "", "legv": "", "ek": ek,
         "duzelis": "", "duzelis_tarixi": "", "duzelis_eden": "", "elaqeli": "", "elaqeli_siyahi": []}
    if not ek:
        return r
    vs = sorted(ek.get("versions") or [], key=lambda v: v.get("versionNumber") or 0)
    if len(vs) > 1:
        son = vs[-1]
        r["duzelis"] = f"Bəli ({len(vs)} versiya)"
        r["duzelis_tarixi"] = tarix_saat(son.get("modifiedAt"))
        r["duzelis_eden"] = son.get("modifiedBy") or ""
    elif vs:
        r["duzelis"] = "Xeyr"
    el = elaqeli_ac(ek.get("tree"), ek.get("related"))
    own = ek.get("sn") or ""
    el = [e for e in el if e["nomre"] != own]
    r["elaqeli_siyahi"] = el
    r["elaqeli"] = "; ".join(f'{e["nomre"]} ({e["tarix"]}{", " + e["novu"] if e["novu"] else ""})' for e in el)
    ev = sorted(ek["events"], key=lambda x: x.get("modifiedAt") or "")
    gond = [x for x in ev if x.get("status") == "onApproval"]
    tes = [x for x in ev if x.get("status") in ("approved", "approvedBySystem")]
    if gond:
        r["gonderildi"] = tarix_saat(gond[0].get("modifiedAt"))
    if tes:
        r["tesdiqlendi"] = tarix_saat(tes[-1].get("modifiedAt"))  # SON təsdiq
        r["tesdiq_eden"] = tes[-1].get("userName") or ""
    leg = [x for x in ev if x.get("status") == "deactivated"]
    legg = [x for x in ev if x.get("status") == "cancelRequested"]
    if leg:
        r["legv"] = "Ləğv edildi: " + tarix_saat(leg[-1].get("modifiedAt"))
    elif legg:
        r["legv"] = "Ləğvə göndərildi: " + tarix_saat(legg[-1].get("modifiedAt"))
    return r


# --------------------------------------------------------------------------- tərəflər və mətn
_SOYAD_SONLUQ = ("yeva", "yev", "ova", "eva", "ov", "ev", "zadə", "zade", "ski", "skaya")
_SOYAD_SONLUQ_UZUN = ("lı", "li", "lu", "lü")  # yalnız uzun sözlərdə (Əli, Vəli kimi adlarla qarışmasın)
_ATA = ("oğlu", "qızı", "oglu", "qizi", "ogly", "kızı")


def _soyaddir(t):
    k = az_lower(t)
    return k.endswith(_SOYAD_SONLUQ) or (len(k) >= 6 and k.endswith(_SOYAD_SONLUQ_UZUN))


def soyad_ad_ata(ad):
    """Fərdi sahibkarın adı: Soyad Ad Ata adı sırası ilə (məs. 'Nadir Rafiq oğlu Mirzəyev' -> 'Mirzəyev Nadir Rafiq oğlu')."""
    tok = ad.strip().strip('"').split()
    i = next((k for k, t in enumerate(tok) if k >= 1 and az_lower(t) in _ATA), None)
    if i is None:
        return az_adlandir(" ".join(tok))
    ata = tok[i - 1:i + 1]
    qalan = tok[:i - 1] + tok[i + 1:]
    if len(qalan) == 2 and not _soyaddir(qalan[0]) and _soyaddir(qalan[1]):
        qalan = [qalan[1], qalan[0]]
    return az_adlandir(" ".join(qalan + ata))


def teref(voen, ad_qaime, oflayn):
    if str(voen).endswith("2"):
        # VÖEN sonu 2 = fərdi sahibkar: reyestrə sorğu yoxdur, ad qaimədəki ad əsasında Soyad Ad Ata adı sırası ilə
        sexs = soyad_ad_ata(ad_qaime or str(voen))
        return {"voen": voen, "ad": sexs, "rol": "Fərdi Sahibkar", "direktor": AYAR.get("direktor_duzelis", {}).get(voen) or sexs}
    r = reyestr(voen, oflayn)
    ad = (r or {}).get("ad") or ad_qaime or voen
    full = ad if ad.startswith('"') or "Cəmiyyət" in ad else f'"{ad}"'
    kicik = az_lower(ad.strip('"').strip())
    rol = "Fərdi Sahibkar" if re.search(r"(oğlu|qızı)$", kicik) else "Direktor"
    direktor = AYAR.get("direktor_duzelis", {}).get(voen) or (r or {}).get("direktor", "")
    if not direktor and rol == "Fərdi Sahibkar":
        direktor = soyad_ad_ata(ad.strip('"'))
    return {"voen": voen, "ad": full, "rol": rol, "direktor": direktor}


def esas_cumle(q):
    es = (q.get("esas") or "").strip()
    if not es:
        return ""
    for desen, evez in AYAR.get("esas_evezlemeleri", []):
        es = re.sub(desen, evez, es)
    if not re.search(r"əsasən\s*$", es):
        es += " əsasən"
    return es + " "


def _tip(x):
    return "protokol" if x is True else (x or "tta")


def akt_basliq(tip):
    tip = _tip(tip)
    return AYAR["protokol_basliq"] if tip == "protokol" else AYAR["hesab_basliq"] if tip == "hesab" else "TƏHVİL-TƏSLİM AKTI"


def giris_metni(q, sat, alc, tip="tta"):
    tip = _tip(tip)
    sablon = AYAR["giris_sablon"]
    if tip == "protokol":
        sablon = AYAR.get("protokol_giris_sablon") or sablon.replace("bu aktı", "bu protokolu")
    elif tip == "hesab":
        sablon = AYAR["hesab_giris_sablon"]
    return sablon.format(satici=sat["ad"], satici_voen=sat["voen"], alici=alc["ad"],
                         alici_voen=alc["voen"], esas=esas_cumle(q))


REKV_SETRI = (("ad", "Bank"), ("kod", "Bank kodu"), ("bvoen", "Bankın VÖEN-i"), ("mh", "Müxbir hesab (M/H)"),
              ("swift", "SWIFT"), ("hesab", "Hesab nömrəsi (IBAN)"))


def rekv_tap(voen):
    d = AYAR.get("rekvizitler") or {}
    return d.get(voen) or d.get("*") or {}


def rekv_saxla(voen, deyerler):
    """Rekvizitləri yerli ayarlar.json-a yaz (voen boşdursa '*' = bütün satıcılar)."""
    try:
        with open(AYAR_FAYLI, encoding="utf-8") as f:
            yerli = json.load(f)
    except (OSError, ValueError):
        yerli = {}
    d = yerli.setdefault("rekvizitler", {})
    d[voen or "*"] = {k: (deyerler.get(k) or "").strip() for k, _ in REKV_SETRI}
    with open(AYAR_FAYLI, "w", encoding="utf-8") as f:
        json.dump(yerli, f, ensure_ascii=False, indent=2)
    AYAR.setdefault("rekvizitler", {})[voen or "*"] = d[voen or "*"]


def edv_etiketi(q):
    return "ƏDV (18%)" if q["cemi"] and abs(q["edv"] - round(q["cemi"] * 0.18, 2)) < 0.02 else "ƏDV"


# --------------------------------------------------------------------------- TTA PDF
def tta_pdf(yol, q, sat, alc, protokol=False):
    tip = _tip(protokol)
    no = q["seriya"] + q["nomre"]
    basliq = akt_basliq(tip)
    W, H = letter
    c = canvas.Canvas(yol, pagesize=letter)
    c.setTitle(f"{basliq.capitalize()} {no}")
    L, R = 45, W - 45
    y = H - 52
    c.setFont("FB", 8.5); c.drawString(L, y, AYAR["sheher"]); c.drawRightString(R, y, q["tarix"])
    y -= 36; c.setFont("FB", 11); c.drawCentredString(W / 2, y, f"{basliq} № {no}")
    y -= 24
    p = Paragraph(giris_metni(q, sat, alc, tip), ParagraphStyle("p", fontName="F", fontSize=8, leading=10.5))
    w, h = p.wrap(R - L, 200); p.drawOn(c, L, y - h); y -= h + 14

    hs = ParagraphStyle("h", fontName="FB", fontSize=7.5, leading=9, alignment=TA_CENTER)
    cs = ParagraphStyle("c", fontName="F", fontSize=7.5, leading=9)
    cc = ParagraphStyle("cc", fontName="F", fontSize=7.5, leading=9, alignment=TA_CENTER)
    cr = ParagraphStyle("cr", fontName="F", fontSize=7.5, leading=9, alignment=TA_RIGHT)
    esc = lambda s: str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    data = [[Paragraph(x, hs) for x in ["№", "Malın / işin / xidmətin adı", "Kod", "Ölçü vahidi", "Miqdar", "Vahidin qiyməti", "Məbləğ"]]]
    for i, m in enumerate(q["mallar"], 1):
        mq = int(m["miqdar"]) if m["miqdar"] == int(m["miqdar"]) else m["miqdar"]
        data.append([Paragraph(str(i), cc), Paragraph(esc(m["ad"]), cs), Paragraph(esc(m["kod"]), cc),
                     Paragraph(esc(m["olcu"]), cc), Paragraph(str(mq), cr), Paragraph(fmt_qiymet(m["qiymet"]), cr),
                     Paragraph(fmt(m["mebleg"]), cr)])
    cw = [22, 175, 62, 50, 40, 62, 62]
    sc = (R - L) / sum(cw); cw = [x * sc for x in cw]
    t = Table(data, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#8896aa")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dce6f2")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, 0), 4), ("BOTTOMPADDING", (0, 0), (-1, 0), 4)]))
    w, h = t.wrap(R - L, 700)
    if y - h < 230:
        c.showPage(); y = H - 52
    t.drawOn(c, L, y - h); y -= h
    tt = Table([[Paragraph("<b>Cəmi</b>", cr), Paragraph(f"<b>{fmt(q['cemi'])}</b>", cr)],
                [Paragraph(f"<b>{edv_etiketi(q)}</b>", cr), Paragraph(f"<b>{fmt(q['edv'])}</b>", cr)],
                [Paragraph("<b>Yekun</b>", cr), Paragraph(f"<b>{fmt(q['yekun'])}</b>", cr)]], colWidths=[62 * sc, 62 * sc])
    tt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#8896aa")),
                            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef2f8")),
                            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    w, h = tt.wrap(200, 200); tt.drawOn(c, R - w, y - h); y -= h + 22
    c.setFont("FB", 8); c.drawString(L, y, "Yekun məbləğ (yazı ilə):")
    x = L + c.stringWidth("Yekun məbləğ (yazı ilə): ", "FB", 8)
    c.setFont("F", 8); c.drawString(x, y, mebleg_yazi(q["yekun"]))
    if tip == "hesab":
        rk = rekv_tap(sat["voen"])
        if y - 230 < 60:
            c.showPage(); y = H - 52
        y -= 26; c.setFont("FB", 8); c.drawString(L, y, "SATICININ BANK REKVİZİTLƏRİ")
        for k, ad in REKV_SETRI:
            y -= 12; c.setFont("F", 8); c.drawString(L, y, f"{ad}: ")
            c.setFont("FB", 8); c.drawString(L + c.stringWidth(f"{ad}: ", "F", 8), y, rk.get(k) or "______________________")
        y -= 40
    else:
        y -= 13; c.drawString(L, y, AYAR["iddia_cumlesi"])
        y -= 52
    mid = W / 2 + 20

    def blok(x0, basliq, tr):
        yy = y
        c.setFont("FB", 8); c.drawString(x0, yy, basliq)
        yy -= 13; c.drawString(x0, yy, tr["ad"])
        yy -= 12; c.setFont("F", 8); c.drawString(x0, yy, f'VÖEN: {tr["voen"]}')
        yy -= 24; c.drawString(x0, yy, f'{tr["rol"]}: {tr["direktor"] or "______________________"}')
        yy -= 62; c.drawString(x0, yy, "İmza: ______________________")
        yy -= 12; c.setFont("FB", 8); c.drawString(x0, yy, "M.Y.")

    blok(L, "SATICI", sat); blok(mid, "ALICI", alc)
    c.save()


# --------------------------------------------------------------------------- TTA Excel
def tta_xlsx(yol, q, sat, alc, protokol=False):
    tip = _tip(protokol)
    no = q["seriya"] + q["nomre"]
    basliq = akt_basliq(tip)
    wb = Workbook(); ws = wb.active; ws.title = {"protokol": "Protokol", "hesab": "Hesab-faktura"}.get(tip, "TTA")
    for col, wd in zip("ABCDEFG", [5, 46, 15, 11, 9, 13, 14]):
        ws.column_dimensions[col].width = wd
    thin = Side(style="thin", color="8896AA"); bd = Border(left=thin, right=thin, top=thin, bottom=thin)
    hf = PatternFill("solid", fgColor="DCE6F2"); tf = PatternFill("solid", fgColor="EEF2F8")
    ar = lambda **k: Font(name="Arial", size=9, **k)
    ws["A1"] = AYAR["sheher"]; ws["A1"].font = ar(bold=True)
    ws["G1"] = q["tarix"]; ws["G1"].font = ar(bold=True); ws["G1"].alignment = Alignment(horizontal="right")
    ws.merge_cells("A3:G3"); ws["A3"] = f"{basliq} № {no}"
    ws["A3"].font = Font(name="Arial", bold=True, size=12); ws["A3"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A5:G7"); ws["A5"] = giris_metni(q, sat, alc, tip); ws["A5"].font = ar()
    ws["A5"].alignment = Alignment(wrap_text=True, vertical="top")
    r = 9
    for j, h in enumerate(["№", "Malın / işin / xidmətin adı", "Kod", "Ölçü vahidi", "Miqdar", "Vahidin qiyməti", "Məbləğ"], 1):
        x = ws.cell(r, j, h); x.font = ar(bold=True); x.fill = hf; x.border = bd
        x.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 26
    ilk = r + 1
    for i, m in enumerate(q["mallar"], 1):
        r += 1
        for j, v in enumerate([i, m["ad"], m["kod"], m["olcu"], m["miqdar"], m["qiymet"], m["mebleg"]], 1):
            x = ws.cell(r, j, v); x.font = ar(); x.border = bd
            x.alignment = Alignment(vertical="center", wrap_text=(j == 2), horizontal="center" if j in (1, 3, 4) else None)
        ws.cell(r, 6).number_format = "#,##0.00#######"
        ws.cell(r, 7).number_format = "#,##0.00"
        ws.row_dimensions[r].height = 25 if len(m["ad"]) > 58 else 15
    son = r
    edv_f = q["edv"]  # qaimədəki ƏDV məbləği olduğu kimi
    for k, (lab, f) in enumerate([("Cəmi", f"=SUM(G{ilk}:G{son})"), (edv_etiketi(q), edv_f),
                                  ("Yekun", f"=G{son + 1}+G{son + 2}")], 1):
        a = ws.cell(son + k, 6, lab); b = ws.cell(son + k, 7, f)
        for x in (a, b):
            x.font = ar(bold=True); x.fill = tf; x.border = bd
        a.alignment = Alignment(horizontal="right"); b.number_format = "#,##0.00"
    r = son + 5
    ws.cell(r, 1, "Yekun məbləğ (yazı ilə): " + mebleg_yazi(q["yekun"])).font = ar(bold=True)
    if tip == "hesab":
        rk = rekv_tap(sat["voen"])
        ws.cell(r + 2, 1, "SATICININ BANK REKVİZİTLƏRİ").font = ar(bold=True)
        for i, (k, ad) in enumerate(REKV_SETRI, 3):
            ws.cell(r + i, 1, f"{ad}: {rk.get(k) or '______________________'}").font = ar()
        r += 11
    else:
        ws.cell(r + 1, 1, AYAR["iddia_cumlesi"]).font = ar()
        r += 4
    for col, bas, tr in ((1, "SATICI", sat), (4, "ALICI", alc)):
        ws.cell(r, col, bas).font = ar(bold=True)
        ws.cell(r + 1, col, tr["ad"]).font = ar(bold=True)
        ws.cell(r + 2, col, f'VÖEN: {tr["voen"]}').font = ar()
        ws.cell(r + 4, col, f'{tr["rol"]}: {tr["direktor"]}').font = ar()
        ws.cell(r + 8, col, "İmza: ______________________").font = ar()
        ws.cell(r + 9, col, "M.Y.").font = ar(bold=True)
    ws.page_setup.paperSize = ws.PAPERSIZE_A4; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.print_options.horizontalCentered = True
    wb.save(yol)


# --------------------------------------------------------------------------- tərkib Excel-i
def terkib_xlsx(yol, qaimeler):
    wb = Workbook(); ws = wb.active; ws.title = "Qaimə tərkibi"
    bas = ["Qaimə (seriya+nömrə)", "Qaimə tarixi", "İstiqamət", "Status", "Qaimənin tipi", "Vəziyyəti (Cari/Düzəliş)", "Versiya №",
           "Göndərildi", "Təsdiqləndi (son)", "Təsdiq edən", "Düzəliş edilib?", "Düzəliş tarixi", "Düzəliş edən",
           "Əlaqəli qaimələr (geri qaytarma / əsas qaimə)", "Göndərən VÖEN", "Göndərən adı", "Qəbul edən VÖEN",
           "Qəbul edən adı", "Əsas", "Əlavə qeydlər", "Sıra №", "Malın adı", "Malın kodu", "Ölçü vahidi", "Miqdar",
           "Vahidin qiyməti", "Məbləğ (ƏDV-siz)", "ƏDV", "Yekun məbləğ", "Qaytarma səbəbi", "Ləğv tarixi", "Bağlı avans qaiməsi", "Bağlı normal qaimə"]
    sehife(ws, bas, [20, 12, 12, 24, 40, 18, 9, 17, 17, 28, 14, 17, 28, 50, 14, 34, 14, 34, 40, 24, 7, 50, 14, 10, 10, 12, 14, 12, 14, 18, 26, 30, 30])
    for q in qaimeler:
        for m in q["mallar"]:
            ws.append([q["seriya"] + q["nomre"], q["tarix"], q.get("istiqamet", ""), q.get("status", ""), q.get("tip", ""), q.get("novu", ""),
                       q.get("versiya_no"), q.get("gonderildi", ""), q.get("tesdiqlendi", ""), q.get("tesdiq_eden", ""),
                       q.get("duzelis", ""), q.get("duzelis_tarixi", ""), q.get("duzelis_eden", ""), q.get("elaqeli", ""),
                       q["gonderen_voen"], q["gonderen_ad"], q["qebul_voen"], q["qebul_ad"], q["esas"], q.get("esas2", ""),
                       m["sira"], m["ad"], m["kod"], m["olcu"], m["miqdar"], m["qiymet"], m["mebleg"], m["edv"], m["yekun"], m.get("sebeb", ""), q.get("legv", ""), q.get("bagli_avans", ""), q.get("bagli_normal", "")])
    for row in ws.iter_rows(min_row=2):
        for x in row[24:29]:
            x.number_format = "#,##0.00#######" if x.column == 26 else "#,##0.00"
    if any(q.get("ek") for q in qaimeler):
        w2 = wb.create_sheet("Tarixçə")
        sehife(w2, ["Qaimə", "Tarix", "İstifadəçi", "Status", "Qeyd"], [20, 17, 36, 28, 40])
        w3 = wb.create_sheet("Versiyalar")
        sehife(w3, ["Qaimə", "Versiya №", "Cari", "Yekun məbləğ", "ƏDV məbləği", "Vergi", "Dəyişdirən", "Dəyişmə tarixi"],
               [20, 10, 8, 14, 14, 10, 36, 17])
        w4 = wb.create_sheet("Əlaqəli qaimələr")
        sehife(w4, ["Bu qaimə", "Əlaqəli qaimə №", "Tarix", "Növ", "Status", "Üst qaimə", "Tərəf (VÖEN/ad)", "Xam məlumat"], [20, 20, 17, 30, 24, 20, 30, 80])
        for q in qaimeler:
            no, ek = q["seriya"] + q["nomre"], q.get("ek") or {}
            for e in sorted(ek.get("events", []), key=lambda x: x.get("modifiedAt") or ""):
                w2.append([no, tarix_saat(e.get("modifiedAt")), e.get("userName") or "",
                           STATUS_AZ.get(e.get("status"), e.get("status") or ""), str(e.get("comment") or "")])
            for v in ek.get("versions", []):
                w3.append([no, v.get("versionNumber"), "Bəli" if v.get("current") else "Xeyr", v.get("amount"),
                           v.get("vatAmount"), v.get("taxAmount"), v.get("modifiedBy") or "", tarix_saat(v.get("modifiedAt"))])
            for e in q.get("elaqeli_siyahi", []):
                w4.append([no, e["nomre"], e["tarix"], e["novu"], e["status"], e["ata"], e["teref"], e["xam"]])
    wb.save(yol)


def sehife(ws, bas, enler):
    ws.append(bas)
    for x in ws[1]:
        x.font = Font(name="Arial", bold=True, size=10); x.fill = PatternFill("solid", fgColor="DCE6F2")
        x.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
    for i, wd in enumerate(enler, 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = wd
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions


# --------------------------------------------------------------------------- iş axını
def senedler(sened):
    """'ikisi' (köhnə: TTA + protokol), 'hamisi', və ya vergüllə: 'tta,protokol,hesab' -> sənəd növləri çoxluğu"""
    sened = (sened or "ikisi").lower()
    if sened == "hamisi":
        return {"tta", "protokol", "hesab"}
    if sened == "ikisi":
        return {"tta", "protokol"} if AYAR.get("protokol_yarat", True) else {"tta"}
    return {x.strip() for x in sened.split(",") if x.strip() in ("tta", "protokol", "hesab")}


def tta_yaz(q, cixis, oflayn, sened="ikisi"):
    """sened: 'ikisi' (TTA + protokol), 'hamisi', yaxud 'tta' / 'protokol' / 'hesab' (vergüllə birləşdirmək olar)"""
    sec = senedler(sened)
    sat = teref(q["gonderen_voen"], q["gonderen_ad"], oflayn)
    alc = teref(q["qebul_voen"], q["qebul_ad"], oflayn)
    ad = q["seriya"] + q["nomre"]
    if "tta" in sec:
        tta_xlsx(os.path.join(cixis, f"TTA_{ad}.xlsx"), q, sat, alc)
        tta_pdf(os.path.join(cixis, f"TTA_{ad}.pdf"), q, sat, alc)
        print(f"+ TTA_{ad}: {alc['ad']}  yekun {fmt(q['yekun'])}  direktor: {alc['direktor'] or '(tapılmadı)'}")
    if "protokol" in sec:
        tta_xlsx(os.path.join(cixis, f"Protokol_{ad}.xlsx"), q, sat, alc, "protokol")
        tta_pdf(os.path.join(cixis, f"Protokol_{ad}.pdf"), q, sat, alc, "protokol")
        print(f"+ Protokol_{ad}: {alc['ad']}  yekun {fmt(q['yekun'])}")
    if "hesab" in sec:
        if not rekv_tap(sat["voen"]):
            print(f"  ! Hesab-faktura {ad}: satıcı ({sat['voen']}) üçün bank rekvizitləri daxil edilməyib - xanalar boş qalır")
        tta_xlsx(os.path.join(cixis, f"Hesab_faktura_{ad}.xlsx"), q, sat, alc, "hesab")
        tta_pdf(os.path.join(cixis, f"Hesab_faktura_{ad}.pdf"), q, sat, alc, "hesab")
        print(f"+ Hesab_faktura_{ad}: {alc['ad']}  yekun {fmt(q['yekun'])}")


def pdf_rejimi(girisler, cixis, oflayn, sened="ikisi"):
    fayllar = []
    for g in girisler:
        fayllar += sorted(glob.glob(os.path.join(g, "*.pdf"))) if os.path.isdir(g) else [g]
    qaimeler = []
    for f in fayllar:
        try:
            q = qaime_oxu(f)
        except Exception as e:
            print(f"! {os.path.basename(f)}: oxunmadı ({e})")
            continue
        tta_yaz(q, cixis, oflayn, sened)
        qaimeler.append(q)
    return qaimeler


def _tarix_tap(x):
    """Siyahı elementindən tarixi tap (sahə adı bəlli olmadığı üçün bir neçə variant yoxlanır)."""
    for k in ("creationDate", "createdAt", "invoiceDate", "date", "creationTime", "created", "createDate", "modifiedAt"):
        v = x.get(k)
        if v:
            try:
                return datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00")).replace(tzinfo=None).date()
            except ValueError:
                for f in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%d-%m-%Y"):
                    try:
                        return datetime.datetime.strptime(str(v), f).date()
                    except ValueError:
                        pass
    return None


def aralidadir(t, dan, ya):
    """t: datetime.date; dan/ya: dd-mm-yyyy"""
    d = datetime.datetime.strptime(dan, "%d-%m-%Y").date()
    y = datetime.datetime.strptime(ya, "%d-%m-%Y").date()
    return d <= t <= y


def etaxes_rejimi(a, cixis):
    dan, ya = a.dan, a.ya
    if a.il:
        dan, ya = f"01-01-{a.il}", f"31-12-{a.il}"
    if not (dan and ya):
        bu = datetime.date.today()
        dan, ya = f"01-01-{bu.year}", bu.strftime("%d-%m-%Y")
    istiqametler = {"gelen": [("inbox", "Gələn")], "gonderilen": [("outbox", "Göndərilən")]}.get(
        a.istiqamet, [("inbox", "Gələn"), ("outbox", "Göndərilən")])
    print("Chrome açılır. Orada Asan İmza / SİMA ilə daxil olun (pəncərəni bağlamayın, 10 dəqiqəyə qədər gözləyirəm)...")
    cl = ETaxes(etaxes_token())
    qaimeler, ugursuz = [], []

    def isle(x, ad, i, n):
        d = cl.detay(x)
        ek = None if a.sade else tarixce_al(cl, x)
        q = avans_bagla(etaxes_cevir(d, ad, ek))
        if not a.nomre and q["tarix"] and not aralidadir(datetime.datetime.strptime(q["tarix"], "%d.%m.%Y").date(), dan, ya):
            return
        if getattr(a, "voen", None) and not ({q["gonderen_voen"], q["qebul_voen"]} & set(a.voen)):
            return
        qaimeler.append(q)
        print(f"  {i}/{n} {q['seriya'] + q['nomre']} {q['tarix']} {q['status']}")
        if a.tta:
            tta_yaz(q, cixis, a.oflayn, getattr(a, "sened", "ikisi"))
        time.sleep(0.2)

    for kod, ad in istiqametler:
        if _dayandi():
            break
        sira = cl.siyahi(kod, dan, ya)
        if a.nomre:
            sira = [x for x in sira if x.get("serialNumber") in a.nomre]
        else:  # sayt tarix filtrini nəzərə almaya bilər - özümüz də süzürük
            sira = [x for x in sira if _tarix_tap(x) is None or aralidadir(_tarix_tap(x), dan, ya)]
        print(f"{ad} qaimələr ({dan} - {ya}): {len(sira)} ədəd")
        for i, x in enumerate(sira, 1):
            if _dayandi():
                print("Dayandırıldı.")
                break
            try:
                isle(x, ad, i, len(sira))
            except Exception as e:
                print(f"! {x.get('serialNumber')}: götürülmədi ({str(e)[:90]})")
                ugursuz.append((x, ad, i, len(sira)))
    if ugursuz and not _dayandi():
        print(f"\n{len(ugursuz)} qaimə götürülə bilmədi. 15 saniyə sonra bir də cəhd edirəm...")
        time.sleep(15)
        qalan = []
        for x, ad, i, n in ugursuz:
            try:
                isle(x, ad, i, n)
            except Exception as e:
                print(f"! {x.get('serialNumber')}: yenə götürülmədi ({str(e)[:90]})")
                qalan.append(x.get("serialNumber"))
        if qalan:
            print("\nGötürülməyən qaimələr: " + " ".join(qalan))
            print("Bunları sonra menyudan nömrə yazaraq təkrar götürə bilərsiniz.")
    return qaimeler


def _tarix_oxu(metn, bos):
    v = input(metn).strip().replace(".", "-").replace("/", "-")
    return v or bos


def _istiqamet_sec():
    s = input("Hansı qaimələr? 1) Gələn  2) Göndərilən  3) Hamısı [3]: ").strip()
    return {"1": "gelen", "2": "gonderilen"}.get(s, "hamisi")


def menyu(a):
    print(f"TTA proqramı {VERSION}")
    print("  1) PDF qaimələrdən TTA hazırla")
    print("  2) e-taxes: qaimə tərkibi (Excel) - seçdiyim tarix aralığında")
    print("  3) e-taxes: TTA hazırla - seçdiyim tarix aralığında (Excel + PDF)")
    sec = input("Seçim (1/2/3): ").strip()
    if sec in ("1", "3"):
        print("  Hansı sənəd hazırlansın?  1) TTA + protokol   2) yalnız TTA   3) yalnız protokol   4) hesab-faktura   5) hamısı")
        a.sened = {"2": "tta", "3": "protokol", "4": "hesab", "5": "hamisi"}.get(input("Seçim (1-5) [1]: ").strip(), "ikisi")
        if "hesab" in senedler(a.sened) and not AYAR.get("rekvizitler"):
            print("  Hesab-faktura üçün satıcının bank rekvizitlərini bir dəfə daxil edin (boş buraxsanız, xanalar boş qalır):")
            rk = {k: input(f"    {ad}: ").strip() for k, ad in REKV_SETRI}
            if any(rk.values()):
                rekv_saxla(input("    Hansı satıcı VÖEN üçün? (boş = hamısı): ").strip(), rk)
    if sec == "1":
        a.giris = [input("Qaimə PDF-lərinin qovluğu (cari qovluq üçün . yazın): ").strip() or "."]
        return a
    a.etaxes = True
    a.istiqamet = _istiqamet_sec()
    a.dan = _tarix_oxu("Başlanğıc tarix (gg-aa-iiii, boş = ilin əvvəli): ", None)
    a.ya = _tarix_oxu("Son tarix (gg-aa-iiii, boş = bu gün): ", None)
    a.voen = input("VÖEN-ə görə? VÖEN-ləri boşluqla yazın (boş = aralıqdakı bütün VÖEN-lər): ").split() or None
    if sec == "3":
        a.tta = True
        a.yalniz_tta = True  # TTA ayrı bölmədir: qaimə tərkibi Excel-i hazırlanmır
        a.sade = True  # TTA üçün tarixçə/versiya lazım deyil - daha sürətli
        n = input("Yalnız müəyyən qaimələr? Nömrələri boşluqla yazın (boş = seçilmiş şərtlərə uyğun hamısı): ").split()
        a.nomre = [x.upper() for x in n] or None
    else:
        a.sade = input("Tarixçə, versiya və əlaqəli qaimələr də götürülsün? (b/x) [b]: ").strip().lower() in ("x", "xeyr", "n", "no")
        a.tta = False
        n = input("Yalnız müəyyən qaimələr? Nömrələri boşluqla yazın (boş = seçilmiş şərtlərə uyğun hamısı): ").split()
        a.nomre = [x.upper() for x in n] or None
    return a


DAYAN = None  # pəncərə rejimində "Dayandır" düyməsi üçün (threading.Event)


def _dayandi():
    return DAYAN is not None and DAYAN.is_set()


def isle_ve_yaz(a):
    """Seçilmiş rejimdə qaimələri işlə və nəticəni cixis qovluğuna yaz (konsol və pəncərə rejimi üçün ortaq)."""
    os.makedirs(a.cixis, exist_ok=True)
    qaimeler = etaxes_rejimi(a, a.cixis) if a.etaxes else pdf_rejimi(a.giris, a.cixis, a.oflayn, getattr(a, "sened", "ikisi"))
    if qaimeler:
        if not getattr(a, "yalniz_tta", False):
            terkib_xlsx(os.path.join(a.cixis, "qaime_terkibi.xlsx"), qaimeler)
        print(f"Hazırdır ({len(qaimeler)} qaimə): {os.path.abspath(a.cixis)}")
    else:
        print("Heç bir qaimə işlənmədi.")
    return qaimeler


def _konsol(goster):
    """Windows-da qara pəncərəni gizlət / göstər (pəncərə rejimində)."""
    try:
        import ctypes
        h = ctypes.windll.kernel32.GetConsoleWindow()
        if h:
            ctypes.windll.user32.ShowWindow(h, 5 if goster else 0)
    except Exception:
        pass


def _tarix_gui(metn):
    return datetime.datetime.strptime((metn or "").strip().replace(".", "-").replace("/", "-"), "%d-%m-%Y").date()


def pencere_rejimi(sinaq=False):
    """Tkinter pəncərəsi: seçimlər düymə/qutu ilə, gedişat zolağı, nəticə qovluğunu aç düyməsi."""
    import queue, subprocess, threading
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    global DAYAN
    DAYAN = threading.Event()
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    kok = tk.Tk()
    kok.title(f"TTA proqramı {VERSION}")
    kok.geometry("640x560")
    kok.minsize(600, 520)
    try:
        ttk.Style().theme_use("vista")
    except Exception:
        pass
    _konsol(False)

    bu = datetime.date.today()
    v_rejim, v_ist = tk.StringVar(value="terkib"), tk.StringVar(value="hamisi")
    v_dan = tk.StringVar(value=bu.replace(day=1).strftime("%d.%m.%Y"))
    v_ya = tk.StringVar(value=bu.strftime("%d.%m.%Y"))
    v_voen, v_nomre = tk.StringVar(), tk.StringVar()
    v_tarixce = tk.BooleanVar(value=True)
    v_s_tta, v_s_prot, v_s_hes = tk.BooleanVar(value=True), tk.BooleanVar(value=True), tk.BooleanVar(value=False)
    v_sened = type("V", (), {"get": staticmethod(lambda: ",".join(n for n, v in (("tta", v_s_tta), ("protokol", v_s_prot), ("hesab", v_s_hes)) if v.get()))})()
    v_pdf = tk.StringVar(value=os.getcwd())
    v_cixis = tk.StringVar(value=os.path.join(os.getcwd(), "cixis"))
    v_durum = tk.StringVar(value="Hazırdır. Seçim edib \"Başla\" düyməsinə basın.")
    q = queue.Queue()
    veziyyet = {"isleyir": False, "stdout": None}
    pdf_vid, etaxes_vid = [], []

    def blok(valid, ad):
        f = ttk.LabelFrame(kok, text=f" {ad} ")
        f.pack(fill="x", padx=8, pady=2)
        return f

    # --- 1. nə hazırlansın
    f1 = blok(kok, "1. Nə hazırlansın?")
    for deyer, metn in (("pdf", "PDF qaimələrdən TTA"),
                        ("terkib", "e-taxes: tərkib (Excel)"),
                        ("tta", "e-taxes: TTA (Excel + PDF)")):
        ttk.Radiobutton(f1, text=metn, value=deyer, variable=v_rejim, command=lambda: gorunus()).pack(side="left", padx=(8, 4), pady=2)
    f1b = ttk.Frame(kok)
    f1b.pack(fill="x", padx=8, pady=(0, 2))
    ttk.Label(f1b, text="Sənədlər:").pack(side="left", padx=(8, 4))
    sened_vid = [ttk.Checkbutton(f1b, text=t, variable=v) for t, v in (("TTA", v_s_tta), ("Protokol", v_s_prot), ("Hesab-faktura", v_s_hes))]
    for w in sened_vid:
        w.pack(side="left", padx=4)

    def rekvizit_penceresi():
        from tkinter import Toplevel
        pen = Toplevel(kok)
        pen.title("Satıcının bank rekvizitləri (hesab-faktura üçün)")
        sah = {}
        ttk.Label(pen, text="Hansı satıcı VÖEN üçün (boş = bütün satıcılar):").grid(row=0, column=0, sticky="w", padx=8, pady=(8, 0))
        v_rv = tk.StringVar()
        ttk.Entry(pen, textvariable=v_rv, width=40).grid(row=0, column=1, padx=8, pady=(8, 0))
        for i, (k, ad) in enumerate(REKV_SETRI, 1):
            ttk.Label(pen, text=ad + ":").grid(row=i, column=0, sticky="w", padx=8, pady=2)
            sah[k] = tk.StringVar(value=rekv_tap("").get(k) or "")
            ttk.Entry(pen, textvariable=sah[k], width=40).grid(row=i, column=1, padx=8, pady=2)

        def saxla():
            rekv_saxla(v_rv.get().strip(), {k: v.get() for k, v in sah.items()})
            messagebox.showinfo("Saxlandı", "Rekvizitlər saxlandı.", parent=pen)
            pen.destroy()
        ttk.Button(pen, text="Saxla", command=saxla).grid(row=len(REKV_SETRI) + 1, column=1, sticky="e", padx=8, pady=8)

    ttk.Button(f1b, text="Rekvizitlər…", command=rekvizit_penceresi).pack(side="left", padx=(10, 0))
    cb_sened = type("CB", (), {"state": staticmethod(lambda st: [w.state(st) for w in sened_vid])})()

    # --- PDF
    f2 = blok(kok, "PDF qaimələrin qovluğu")
    e = ttk.Entry(f2, textvariable=v_pdf)
    e.pack(side="left", fill="x", expand=True, padx=(8, 4), pady=3)
    b = ttk.Button(f2, text="Seç...", command=lambda: v_pdf.set(filedialog.askdirectory(initialdir=v_pdf.get()) or v_pdf.get()))
    b.pack(side="left", padx=(0, 8))
    pdf_vid += [e, b]

    # --- e-taxes
    f3 = blok(kok, "e-taxes seçimləri")
    sat = ttk.Frame(f3)
    sat.pack(fill="x", padx=8, pady=(3, 1))
    ttk.Label(sat, text="Hansı qaimələr:").pack(side="left")
    for deyer, metn in (("hamisi", "Hamısı"), ("gelen", "Gələn"), ("gonderilen", "Göndərilən")):
        r = ttk.Radiobutton(sat, text=metn, value=deyer, variable=v_ist)
        r.pack(side="left", padx=8)
        etaxes_vid.append(r)
    sat = ttk.Frame(f3)
    sat.pack(fill="x", padx=8, pady=1)
    ttk.Label(sat, text="Başlanğıc tarix:").pack(side="left")
    e1 = ttk.Entry(sat, textvariable=v_dan, width=12)
    e1.pack(side="left", padx=(6, 14))
    ttk.Label(sat, text="Son tarix:").pack(side="left")
    e2 = ttk.Entry(sat, textvariable=v_ya, width=12)
    e2.pack(side="left", padx=6)
    ttk.Label(sat, text="(gg.aa.iiii)").pack(side="left", padx=6)
    etaxes_vid += [e1, e2]

    def aralik(d1, d2):
        v_dan.set(d1.strftime("%d.%m.%Y"))
        v_ya.set(d2.strftime("%d.%m.%Y"))

    def kecen_ay():
        son = bu.replace(day=1) - datetime.timedelta(days=1)
        aralik(son.replace(day=1), son)

    sat = ttk.Frame(f3)
    sat.pack(fill="x", padx=8, pady=1)
    for metn, fn in (("Bu ay", lambda: aralik(bu.replace(day=1), bu)), ("Keçən ay", kecen_ay),
                     ("Son 30 gün", lambda: aralik(bu - datetime.timedelta(days=30), bu)),
                     ("Bu il", lambda: aralik(datetime.date(bu.year, 1, 1), bu))):
        bb = ttk.Button(sat, text=metn, command=fn)
        bb.pack(side="left", padx=(0, 6))
        etaxes_vid.append(bb)
    sat = ttk.Frame(f3)
    sat.pack(fill="x", padx=8, pady=1)
    ttk.Label(sat, text="VÖEN (boş = hamısı):", width=26).pack(side="left")
    e3 = ttk.Entry(sat, textvariable=v_voen)
    e3.pack(side="left", fill="x", expand=True)
    sat = ttk.Frame(f3)
    sat.pack(fill="x", padx=8, pady=1)
    ttk.Label(sat, text="Qaimə nömrələri (boş=hamısı):", width=26).pack(side="left")
    e4 = ttk.Entry(sat, textvariable=v_nomre)
    e4.pack(side="left", fill="x", expand=True)
    c1 = ttk.Checkbutton(f3, text="Tarixçə, versiya, düzəliş, əlaqəli qaimələri də götür (tərkib üçün; yavaş)",
                         variable=v_tarixce)
    c1.pack(anchor="w", padx=10, pady=(2, 3))
    etaxes_vid += [e3, e4]

    # --- nəticə qovluğu
    f4 = blok(kok, "Nəticə qovluğu")
    ttk.Entry(f4, textvariable=v_cixis).pack(side="left", fill="x", expand=True, padx=(8, 4), pady=3)
    ttk.Button(f4, text="Seç...", command=lambda: v_cixis.set(filedialog.askdirectory(initialdir=v_cixis.get()) or v_cixis.get())).pack(side="left", padx=(0, 8))

    def gorunus():
        rj = v_rejim.get()
        for w in pdf_vid:
            w.state(["!disabled"] if rj == "pdf" else ["disabled"])
        for w in etaxes_vid:
            w.state(["!disabled"] if rj != "pdf" else ["disabled"])
        c1.state(["!disabled"] if rj == "terkib" else ["disabled"])
        cb_sened.state(["!disabled"] if rj != "terkib" else ["disabled"])

    # --- düymələr
    dym = ttk.Frame(kok)
    dym.pack(fill="x", padx=8, pady=(4, 0))
    b_basla = ttk.Button(dym, text="Başla", command=lambda: basla())
    b_basla.pack(side="left")
    b_dayan = ttk.Button(dym, text="Dayandır", command=lambda: dayan())
    b_dayan.pack(side="left", padx=8)
    ttk.Button(dym, text="Nəticə qovluğunu aç", command=lambda: ac()).pack(side="left")
    ttk.Label(kok, textvariable=v_durum).pack(anchor="w", padx=8, pady=(2, 0))
    pb = ttk.Progressbar(kok, mode="determinate", maximum=100)
    pb.pack(fill="x", padx=8, pady=2)
    cerc = ttk.Frame(kok)
    cerc.pack(fill="both", expand=True, padx=8, pady=(2, 6))
    log = tk.Text(cerc, height=6, wrap="word", state="disabled")
    sk = ttk.Scrollbar(cerc, command=log.yview)
    log.configure(yscrollcommand=sk.set)
    sk.pack(side="right", fill="y")
    log.pack(side="left", fill="both", expand=True)

    def yaz(metn):
        log.configure(state="normal")
        log.insert("end", metn)
        log.see("end")
        log.configure(state="disabled")
        for sətir in metn.splitlines():
            m = re.match(r"\s*(\d+)/(\d+)\s", sətir)
            if m:
                pb.configure(maximum=max(int(m.group(2)), 1), value=int(m.group(1)))
                v_durum.set(f"{m.group(1)} / {m.group(2)} qaimə işlənib")
            elif re.search(r"qaimələr \(.*\): \d+ ədəd", sətir):
                pb.configure(value=0)
                v_durum.set(sətir.strip())

    class Yazici:
        encoding = "utf-8"

        def write(self, metn):
            if metn:
                q.put(("yaz", metn))
            return len(metn or "")

        def flush(self):
            pass

        def isatty(self):
            return False

    def bitdi():
        veziyyet["isleyir"] = False
        sys.stdout = veziyyet["stdout"]
        b_basla.state(["!disabled"])
        v_durum.set("Bitdi. Nəticə qovluğunu açıb faylları yoxlaya bilərsiniz.")
        pb.configure(value=pb["maximum"])

    def yoxla():
        try:
            while True:
                nov, metn = q.get_nowait()
                if nov == "yaz":
                    yaz(metn)
                elif nov == "bitdi":
                    bitdi()
        except queue.Empty:
            pass
        if not sinaq:
            kok.after(150, yoxla)

    def basla():
        if veziyyet["isleyir"]:
            return
        rj = v_rejim.get()
        a = argparse.Namespace(giris=[], etaxes=False, istiqamet="hamisi", il=None, dan=None, ya=None, nomre=None,
                               voen=None, sade=False, tta=False, yalniz_tta=False, sened=v_sened.get(), oflayn=False, yenile=False,
                               pencere=True, cixis=(v_cixis.get().strip() or "cixis"))
        if rj == "pdf":
            yol = v_pdf.get().strip()
            if not os.path.exists(yol):
                messagebox.showerror("Qovluq tapılmadı", "PDF qaimələrin qovluğu tapılmadı. \"Seç...\" düyməsi ilə seçin.")
                return
            a.giris = [yol]
        else:
            try:
                d1, d2 = _tarix_gui(v_dan.get()), _tarix_gui(v_ya.get())
            except ValueError:
                messagebox.showerror("Tarix səhvdir", "Tarixi bu formada yazın: 01.10.2026")
                return
            if d1 > d2:
                messagebox.showerror("Tarix səhvdir", "Başlanğıc tarix son tarixdən böyük ola bilməz.")
                return
            a.etaxes, a.istiqamet = True, v_ist.get()
            a.dan, a.ya = d1.strftime("%d-%m-%Y"), d2.strftime("%d-%m-%Y")
            a.voen = v_voen.get().split() or None
            a.nomre = [x.upper() for x in v_nomre.get().split()] or None
            if rj == "tta":
                a.tta = a.yalniz_tta = a.sade = True
                if not a.sened:
                    messagebox.showerror("Sənəd seçilməyib", "TTA, protokol və ya hesab-fakturadan ən azı birini seçin.")
                    return
            else:
                a.sade = not v_tarixce.get()
        DAYAN.clear()
        veziyyet["isleyir"] = True
        veziyyet["stdout"] = sys.stdout
        sys.stdout = Yazici()
        b_basla.state(["disabled"])
        log.configure(state="normal")
        log.delete("1.0", "end")
        log.configure(state="disabled")
        pb.configure(value=0)
        v_durum.set("İşləyir...")

        def ish():
            try:
                isle_ve_yaz(a)
            except SystemExit as ex:
                print(f"\n! {ex.code if ex.code not in (None, 0) else 'Dayandırıldı'}")
            except Exception as ex:
                import traceback
                print(f"\n! Xəta: {ex}")
                print(traceback.format_exc()[-900:])
            finally:
                q.put(("bitdi", None))

        th = threading.Thread(target=ish, daemon=True)
        th.start()
        return th

    def dayan():
        if veziyyet["isleyir"]:
            DAYAN.set()
            v_durum.set("Dayandırılır... (cari qaimə bitəndən sonra)")

    def ac():
        yol = os.path.abspath(v_cixis.get().strip() or "cixis")
        os.makedirs(yol, exist_ok=True)
        try:
            os.startfile(yol)
        except AttributeError:
            subprocess.Popen(["xdg-open", yol])

    def baglan():
        if veziyyet["isleyir"] and not messagebox.askokcancel("Bağlansın?", "İş davam edir. Yenə də bağlansın?"):
            return
        DAYAN.set()
        kok.destroy()
        _konsol(True)

    kok.protocol("WM_DELETE_WINDOW", baglan)
    gorunus()
    yaz("Seçimləri edin və \"Başla\" düyməsinə basın.\ne-taxes seçsəniz, Chrome açılacaq - orada Asan İmza / SİMA ilə daxil olun.\n")
    if sinaq:
        return argparse.Namespace(basla=basla, dayan=dayan, yoxla=yoxla, q=q, v_rejim=v_rejim, v_ist=v_ist, v_dan=v_dan,
                                  v_ya=v_ya, v_voen=v_voen, v_nomre=v_nomre, v_tarixce=v_tarixce, v_pdf=v_pdf,
                                  v_cixis=v_cixis, v_durum=v_durum, veziyyet=veziyyet, gorunus=gorunus, ac=ac)
    kok.after(150, yoxla)
    kok.mainloop()


def main():
    ap = argparse.ArgumentParser(description="Qaimədən TTA və qaimə tərkibi (Excel + PDF)")
    ap.add_argument("giris", nargs="*", help="qaimə PDF faylları və ya qovluqlar")
    ap.add_argument("--etaxes", action="store_true", help="qaimələri e-taxes-dən çək (giriş brauzerdə edilir)")
    ap.add_argument("--istiqamet", choices=["gelen", "gonderilen", "hamisi"], default="hamisi")
    ap.add_argument("--il", help="il, məs. 2026")
    ap.add_argument("--dan", help="başlanğıc tarix gg-aa-iiii")
    ap.add_argument("--ya", help="son tarix gg-aa-iiii")
    ap.add_argument("--voen", nargs="*", help="yalnız bu VÖEN-lərlə (göndərən və ya qəbul edən) qaimələr")
    ap.add_argument("--nomre", nargs="*", help="yalnız bu qaimə nömrələri")
    ap.add_argument("--sade", action="store_true", help="tarixçə/versiya/əlaqəli qaimələri götürmə (daha sürətli)")
    ap.add_argument("--tta", action="store_true", help="e-taxes rejimində hər qaimə üçün TTA da hazırla")
    ap.add_argument("--sened", default="ikisi", help="ikisi (TTA+protokol) | hamisi | vergüllə: tta,protokol,hesab")
    ap.add_argument("--cixis", default="cixis")
    ap.add_argument("--oflayn", action="store_true", help="reyestrə müraciət etmə")
    ap.add_argument("--pencere", action="store_true", help="proqram pəncərəsi ilə işlə (qara pəncərə əvəzinə)")
    ap.add_argument("--yenileme-yoxla", dest="yenile", action="store_true", help="yeniləməni yoxla")
    a = ap.parse_args()

    ayar_yukle()
    yenile()
    if a.pencere or (AYAR.get("pencere") and not a.giris and not a.etaxes):
        try:
            return pencere_rejimi()
        except ImportError:
            print("tkinter tapılmadı - adi (qara pəncərə) rejimi açılır.")
        except Exception as e:
            import traceback
            open("hata.log", "a", encoding="utf-8").write(traceback.format_exc() + "\n")
            print(f"Pəncərə açılmadı ({e}). Adi rejim açılır.")
            if sys.stdin is None:
                return
    if not a.giris and not a.etaxes:
        a = menyu(a)
    isle_ve_yaz(a)


if __name__ == "__main__":
    main()
