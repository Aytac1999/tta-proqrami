// Qovluq seçimi üçün kiçik pəncərə (adi əlavə səhifəsində fayl seçicisi etibarlı işləyir). Yan panel qovluğu eyni yaddaşdan oxuyur.
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open("tta_papka", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function idbSet(k, v) { const d = await idb(); return new Promise((ok) => { const t = d.transaction("h", "readwrite"); t.objectStore("h").put(v, k); t.oncomplete = () => ok(true); }); }
document.getElementById("b").addEventListener("click", async () => {
  const n = document.getElementById("n");
  try {
    const h = await window.showDirectoryPicker({ mode: "readwrite" });
    await idbSet("papka", h);
    n.textContent = "Seçildi: " + h.name + ". Bu pəncərə bağlanır …";
    setTimeout(() => window.close(), 900);
  } catch (e) {
    n.textContent = e && e.name === "AbortError" ? "Seçim ləğv edildi." : "Xəta: " + (e && e.message || e);
  }
});
