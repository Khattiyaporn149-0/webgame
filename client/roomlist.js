import { db } from "./firebase.js";
import {
  collection, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ✅ ถ้ามี backend ก็ยังเชื่อม socket ได้ (optional)
let socket = null;
try {
  socket = io("https://webgame-25n5.onrender.com");
} catch (e) {
  console.warn("⚠️ ไม่มี backend หรือเชื่อม socket ไม่ได้");
}

// ========================================
// 📡 ถ้ามี socket ให้ขอห้องจาก server
// ========================================
if (socket) {
  socket.emit("getRooms");
  socket.on("roomList", (rooms) => {
    console.log("📦 ได้ข้อมูลห้องจาก server:", rooms);
    renderRooms(rooms);
  });
}

// ========================================
// 📊 ดึงรายการห้องจาก Firestore (แบบเรียลไทม์)
// ========================================
const q = query(collection(db, "rooms"), orderBy("createdAt", "desc"));

onSnapshot(q, (snap) => {
  const rooms = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log("🔥 Firestore rooms:", rooms);
  renderRooms(rooms);
});

// ========================================
// 🧩 ฟังก์ชัน render ห้อง
// ========================================
function renderRooms(rooms) {
  const container = document.getElementById("roomList");
  container.innerHTML = "";

  if (!rooms || rooms.length === 0) {
    container.innerHTML = "<p style='text-align:center;opacity:0.7'>ยังไม่มีห้องที่เปิดอยู่ 😅</p>";
    return;
  }

  rooms.forEach(room => {
    const roomEl = document.createElement("div");
    roomEl.className = "room-card";

    roomEl.innerHTML = `
      <div class="room-info">
        <div class="room-name">📛 ${room.name || "Unknown"} (${room.code})</div>
        <div class="room-detail">👥 Players: ${(room.players?.length) || 1}/${room.maxPlayers || 8}</div>
      </div>
      <button class="join-btn" onclick="joinRoom('${room.code}')">Join</button>
    `;

    container.appendChild(roomEl);
  });
}

// ========================================
// 📍 ปุ่มสร้างห้อง & กลับหน้าหลัก
// ========================================
document.getElementById("createRoomBtn").addEventListener("click", () => {
  window.location.href = "createroom.html";
});
document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

// ========================================
// 🚀 Join → ไปหน้าเกมพร้อมรหัสห้อง
// ========================================
window.joinRoom = function (roomCode) {
  window.location.href = `game.html?room=${roomCode}`;
};
