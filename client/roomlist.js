let rooms = [
  { roomId: "A1B2C3", roomName: "Sarayut's Room", host: "Sarayut", players: 1, maxPlayers: 8, status: "waiting" }
];

function renderRooms() {
  const container = document.getElementById("roomList");
  container.innerHTML = "";

  if (rooms.length === 0) {
    container.innerHTML = "<p style='text-align:center;opacity:0.7'>ยังไม่มีห้องที่เปิดอยู่ 😅</p>";
    return;
  }

  rooms.forEach(room => {
    const roomEl = document.createElement("div");
    roomEl.className = "room-card";
    roomEl.innerHTML = `
      <div class="room-info">
        <div class="room-name">${room.roomName}</div>
        <div class="room-detail">👤 Host: ${room.host}</div>
        <div class="room-detail">🧑 Players: ${room.players}/${room.maxPlayers}</div>
        <div class="room-detail">📶 Status: ${room.status}</div>
      </div>
      <button class="join-btn" onclick="joinRoom('${room.roomId}')">Join</button>
    `;
    container.appendChild(roomEl);
  });
}

document.getElementById("createRoomBtn").addEventListener("click", () => {
  const roomName = prompt("ตั้งชื่อห้อง:");
  if (!roomName) return;
  rooms.push({
    roomId: Math.random().toString(36).substring(2, 8).toUpperCase(),
    roomName,
    host: "Player" + Math.floor(Math.random() * 100),
    players: 1,
    maxPlayers: 8,
    status: "waiting"
  });
  renderRooms();
});

function joinRoom(roomId) {
  alert(`✅ เข้าห้อง ${roomId} แล้ว!`);
}

document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

renderRooms();
