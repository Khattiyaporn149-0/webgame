// ========================================
// 1️⃣ เชื่อมต่อ Socket.IO (ถ้าไม่มี backend ก็ไม่ error แค่ไม่แสดงห้อง)
// ========================================
const socket = io ? io() : null;

// ========================================
// 2️⃣ ฟังก์ชัน render ห้อง
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
        <div class="room-name">ห้อง ${room.code}</div>
        <div class="room-detail">🧑 Players: ${room.players}/8</div>
      </div>
      <button class="join-btn" onclick="joinRoom('${room.code}')">Join</button>
    `;

    container.appendChild(roomEl);
  });
}

// ========================================
// 3️⃣ ขอรายการห้องจาก server ถ้า socket มี
// ========================================
if (socket) socket.emit("getRooms");

// ========================================
// 4️⃣ ฟัง event "roomList" ที่ server ส่งมา
// ========================================
if (socket) {
  socket.on("roomList", (roomList) => {
    console.log("📦 ได้ข้อมูลห้องจาก server:", roomList);
    renderRooms(roomList);
  });
}

// ========================================
// 5️⃣ ปุ่มสร้างห้อง
// ========================================
document.getElementById("createRoomBtn").addEventListener("click", () => {
  window.location.href = "createroom.html";
});

// ========================================
// 6️⃣ ปุ่มกลับหน้าหลัก
// ========================================
document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

// ========================================
// 7️⃣ กด Join → เข้าหน้าเกมพร้อมรหัสห้อง
// ========================================
function joinRoom(roomCode) {
  window.location.href = `game.html?room=${roomCode}`;
}

// ========================================
// 🧪 ถ้าไม่มี backend → สร้างห้องจำลองเพื่อทดสอบ
// ========================================

