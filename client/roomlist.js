import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ✅ ดึงรายการห้อง public จาก Firestore
const q = query(
  collection(db, "rooms"),
  where("type", "==", "public"),
  orderBy("createdAt", "desc")
);

onSnapshot(q, (snap) => {
  const list = document.getElementById("roomList");
  const empty = document.getElementById("emptyState");
  list.innerHTML = "";

  if (snap.empty) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  snap.forEach(docSnap => {
    const room = docSnap.data();
    const div = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = `
      <div class="room-info">
        <div class="room-name">📛 ${room.name}</div>
        <div class="room-detail">👥 ${room.maxPlayers} • 🔒 ${room.type}</div>
      </div>
      <button class="join-btn" data-roomcode="${room.code}">Join</button>
    `;
    list.appendChild(div);
  });

  // ✅ ผูก event ให้ปุ่ม Join ทุกห้อง
  document.querySelectorAll(".join-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const roomCode = btn.getAttribute("data-roomcode");
      showCodePrompt(roomCode);
    });
  });
});

// 📌 แสดงกล่องให้ใส่โค้ดก่อนเข้า
async function showCodePrompt(correctCode) {
  const input = prompt("🔑 กรุณาใส่โค้ด 4 ตัวเพื่อเข้าห้องนี้:");
  if (input === null) return;

  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    alert("⚠️ กรุณาใส่โค้ด 4 ตัว (A-Z หรือ 0-9)");
    return;
  }

  if (code !== correctCode) {
    alert("❌ โค้ดไม่ถูกต้อง ลองใหม่อีกครั้ง");
    return;
  }

  // ✅ ตรวจสอบว่าห้องยังอยู่ไหม
  const q = query(collection(db, "rooms"), where("code", "==", code));
  const snap = await getDocs(q);
  if (snap.empty) {
    alert("❌ ไม่พบห้องนี้ หรือห้องถูกลบไปแล้ว");
    return;
  }

  // ✅ ถ้าโค้ดถูกต้อง → ไป lobby
  window.location.href = `lobby.html?code=${code}`;
}
