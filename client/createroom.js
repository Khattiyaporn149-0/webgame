// 📌 อ่านชื่อผู้เล่นจากระบบเดิม (ถ้ามี)
const playerName = localStorage.getItem('ggd.name') || 'Guest';

// 📌 ปุ่มกลับ (สองที่: หน้า setup และหน้า lobby)
document.getElementById('btnBack').addEventListener('click', () => window.location.href = 'index.html');
document.getElementById('btnLobbyBack').addEventListener('click', () => window.location.href = 'index.html');

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

// 📌 สร้างการ์ดตัวละคร
function makeAvatarCard(name, color) {
  const div = document.createElement('div');
  div.className = 'avatar';
  div.innerHTML = `
    <div class="pfp" style="background:${color}">${name.slice(0, 1).toUpperCase()}</div>
    <div class="name">${name}</div>
    <div style="opacity:.8;font-size:12px">Ready ⌛</div>
  `;
  return div;
}

// 📌 ปุ่ม CREATE → ไปหน้า Lobby พร้อมตรวจสอบชื่อห้อง
document.getElementById('btnCreate').addEventListener('click', () => {
  const roomNameInput = document.getElementById('roomName').value.trim();
  const errorDiv = document.getElementById('nameError');
  errorDiv.textContent = ""; // เคลียร์ข้อความก่อนทุกครั้ง

  // ❗ ตรวจสอบห้ามว่าง
  if (roomNameInput === "") {
    errorDiv.textContent = "⚠️ Please enter a room name before creating.";
    return;
  }

  // ❗ ตรวจสอบให้ใส่ได้เฉพาะภาษาอังกฤษและตัวเลข
  const validNamePattern = /^[A-Za-z0-9]+$/;
  if (!validNamePattern.test(roomNameInput)) {
    errorDiv.textContent = "⚠️ Room name must contain only English letters and numbers (no spaces).";
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

  // อัปเดต UI lobby
  document.getElementById('roomCode').textContent = room.code;
  const list = document.getElementById('players');
  list.innerHTML = '';
  room.players.forEach(p => list.appendChild(makeAvatarCard(p.name, p.color)));

  // ✅ สลับจากหน้าสร้างห้องไปหน้ารอ พร้อมแอนิเมชัน
  const setupEl = document.getElementById('setup');
  const lobbyEl = document.getElementById('lobby');

  setupEl.classList.remove('show');
  setupEl.style.display = 'none';

  lobbyEl.style.display = 'block';
  setTimeout(() => lobbyEl.classList.add('show'), 10);
});

// 📌 ปุ่ม LEAVE → กลับไปหน้า setup
document.getElementById('btnLeave').addEventListener('click', () => {
  localStorage.removeItem('currentRoom');

  const setupEl = document.getElementById('setup');
  const lobbyEl = document.getElementById('lobby');

  lobbyEl.classList.remove('show');
  lobbyEl.style.display = 'none';

  setupEl.style.display = 'block';
  setTimeout(() => setupEl.classList.add('show'), 10);
});

// 📌 ถ้ามี room ค้างไว้ (reload หน้า) ให้กลับเข้าหน้า lobby เลย
(function restore() {
  const saved = localStorage.getItem('currentRoom');
  if (!saved) return;

  const room = JSON.parse(saved);
  document.getElementById('roomCode').textContent = room.code;
  const list = document.getElementById('players');
  list.innerHTML = '';
  room.players.forEach(p => list.appendChild(makeAvatarCard(p.name, p.color)));

  const setupEl = document.getElementById('setup');
  const lobbyEl = document.getElementById('lobby');

  setupEl.style.display = 'none';
  lobbyEl.style.display = 'block';
  setTimeout(() => lobbyEl.classList.add('show'), 10);
})();

// 📌 ให้กล่องสร้างห้องเด้งขึ้นมาเมื่อโหลดหน้า
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("setup").classList.add("show");
});
