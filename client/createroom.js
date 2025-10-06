// 📌 อ่านชื่อผู้เล่นจากระบบเดิม (ถ้ามี)
const playerName = localStorage.getItem('ggd.name') || 'Guest';

// 📌 ปุ่มกลับ
document.getElementById('btnBack').addEventListener('click', () => {
  window.location.href = 'index.html';
});

// 📌 สร้างรหัสห้อง
function genCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// 📌 สร้างสีพื้นอวาตาร์แบบสุ่ม
function randColor() {
  const hues = [150, 180, 200, 220, 260, 300];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h} 70% 65%)`;
}

// 📌 ปุ่ม CREATE → ไปหน้า Lobby (ใหม่)
document.getElementById('btnCreate').addEventListener('click', () => {
  const roomNameInput = document.getElementById('roomName').value.trim();
  const errorDiv = document.getElementById('nameError');
  errorDiv.textContent = ""; // เคลียร์ข้อความก่อนทุกครั้ง

  // ❗ ตรวจสอบห้ามว่าง
  if (roomNameInput === "") {
    errorDiv.textContent = "⚠️ Please enter a room name.";
    return;
  }

  // ❗ ตรวจสอบให้ใส่ได้เฉพาะภาษาอังกฤษและตัวเลข
  const validNamePattern = /^[A-Za-z0-9]+$/;
  if (!validNamePattern.test(roomNameInput)) {
    errorDiv.textContent = "⚠️ Room name English and numbers (no spaces).";
    return;
  }

  // ✅ ถ้าผ่านแล้ว → สร้างห้อง
  const room = {
    code: genCode(),
    name: roomNameInput,
    maxPlayers: +document.getElementById('maxPlayers').value,
    type: document.getElementById('roomType').value,
    players: [{ name: playerName, color: randColor(), ready: false }]
  };

  // เก็บข้อมูลห้องไว้ใน localStorage
  localStorage.setItem('currentRoom', JSON.stringify(room));

  // 🔁 ไปหน้า lobby.html
  window.location.href = 'lobby.html';
});
