// e-taxes səhifəsinin üstündə üzən (sürüklənən) TTA pəncərəsi. Səhifəni daraltmır.
(() => {
  if (window.top !== window || window.__ttaIcerik) return;
  window.__ttaIcerik = true;
  let host = null, iframe = null, yuklendi = false;

  function yarat() {
    host = document.createElement("div");
    host.id = "tta-uzen-pencere";
    const sh = host.attachShadow({ mode: "closed" });
    sh.innerHTML = `
      <style>
        .k{position:fixed;top:16px;right:16px;width:440px;height:min(780px,calc(100vh - 32px));min-width:340px;min-height:200px;
           z-index:2147483647;background:#f3f6fb;border:1px solid #9fb3cf;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.28);
           display:flex;flex-direction:column;overflow:hidden;resize:both;font:13px/1.2 system-ui,Segoe UI,Arial,sans-serif}
        .b{display:flex;align-items:center;gap:6px;padding:5px 8px;background:#1f4e8c;color:#fff;cursor:move;user-select:none;flex:0 0 auto}
        .b span{flex:1;font-weight:600}
        .b button{all:unset;cursor:pointer;width:22px;height:22px;text-align:center;line-height:22px;border-radius:4px;font-size:15px}
        .b button:hover{background:rgba(255,255,255,.25)}
        iframe{border:0;flex:1 1 auto;width:100%;min-height:0;background:#f3f6fb}
        .k.mini{height:auto!important;min-height:0;resize:none}.k.mini iframe{display:none}
        .k.surur iframe{pointer-events:none}
      </style>
      <div class="k"><div class="b"><span>TTA Köməkçisi</span><button id="mn" title="Kiçilt">–</button><button id="bq" title="Gizlət">×</button></div>
      <iframe id="f" allow="clipboard-write"></iframe></div>`;
    const k = sh.querySelector(".k"), bar = sh.querySelector(".b");
    iframe = sh.getElementById("f");
    iframe.src = chrome.runtime.getURL("panel.html");
    sh.getElementById("mn").onclick = () => k.classList.toggle("mini");
    sh.getElementById("bq").onclick = () => { host.style.display = "none"; };
    // sürükləmə
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      const r = k.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      k.classList.add("surur"); bar.setPointerCapture(e.pointerId);
      const hereket = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 80), y = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 30);
        k.style.left = x + "px"; k.style.top = y + "px"; k.style.right = "auto";
      };
      const burax = () => { k.classList.remove("surur"); bar.removeEventListener("pointermove", hereket); bar.removeEventListener("pointerup", burax); };
      bar.addEventListener("pointermove", hereket); bar.addEventListener("pointerup", burax);
    });
    document.documentElement.appendChild(host);
    // səhifənin təhlükəsizlik siyasəti iframe-i bloklayarsa: ayrıca kiçik pəncərə
    setTimeout(() => {
      if (!yuklendi) { host.remove(); host = null; chrome.runtime.sendMessage({ pencere: true }); }
    }, 5000);
  }

  window.addEventListener("message", (e) => { if (e.data && e.data.tta_yuklendi) yuklendi = true; });
  chrome.runtime.onMessage.addListener((m) => {
    if (!m || !m.toggle) return;
    if (!host) { yarat(); return; }
    host.style.display = host.style.display === "none" ? "" : "none";
  });
})();
