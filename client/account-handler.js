// account-handler.js
window.addEventListener("DOMContentLoaded", () => {
  // กันรันซ้ำ
  if (window.__AccountHandlerInit) return;
  window.__AccountHandlerInit = true;

  // ตรวจว่าอยู่หน้า index ไหม
  const isIndex = location.pathname.endsWith("index.html") || location.pathname.endsWith("/") || location.pathname === "";
  if (!isIndex) {
    console.log("⏭️ Not index.html → skip account modal check");
    return; // ไม่ต้องเช็ค popup ในหน้าที่ไม่ใช่ index
  }

  const name = (localStorage.getItem("ggd.name") || "").trim();
  const prompted = localStorage.getItem("ggd.prompted");

  const _safe = typeof safe === "function"
    ? safe
    : (id, fn) => { const el = document.getElementById(id); if (el) fn(el); return el; };

  // ✅ เด้งเฉพาะครั้งแรกที่ไม่มีชื่อ และยังไม่เคยเด้ง
  if (!name && !prompted) {
    console.log("🟡 ไม่มีชื่อ → เปิด modal ครั้งแรกเท่านั้น");
    if (typeof openModal === "function") openModal("accountModal");
    localStorage.setItem("ggd.prompted", "1");
  } else {
    console.log("🟢 มีชื่อแล้ว หรือเคยเด้งแล้ว → ไม่ต้องเปิด modal");
  }

  // ✅ ปุ่มเปิด/ปิด popup (เฉพาะใน index)
  _safe("btnProfile", (btn) => btn.addEventListener("click", () => {
    if (typeof openModal === "function") openModal("accountModal");
  }));

  _safe("closeAccount", (btn) => btn.addEventListener("click", () => {
    if (typeof closeModal === "function") closeModal("accountModal");
  }));

  _safe("accountModal", (modal) => modal.addEventListener("click", (e) => {
    if (e.target === modal && typeof closeModal === "function") closeModal("accountModal");
  }));
});
const modal = document.getElementById("accountModal");
modal.classList.add("show");
modal.setAttribute("aria-hidden", "false");
modal.classList.remove("show");
modal.setAttribute("aria-hidden", "true");
