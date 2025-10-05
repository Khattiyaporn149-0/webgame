// Tiny animated background + UI logic + persistence

// ---- Background canvas particles (lightweight) ----
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let w, h, stars;
function resize() {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
  stars = Array.from({length: Math.min(140, Math.floor(w*h/12000))}, () => ({
    x: Math.random()*w,
    y: Math.random()*h,
    r: Math.random()*1.8 + 0.2,
    s: Math.random()*0.5 + 0.1
  }));
}
window.addEventListener('resize', resize);
resize();
(function loop(){
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const st of stars) {
    ctx.globalAlpha = 0.4 + Math.sin((performance.now()/1000 + st.x)*st.s)*0.4;
    ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI*2); ctx.fill();
  }
  requestAnimationFrame(loop);
})();

// ---- State & persistence ----
const state = {
  name: localStorage.getItem('ggd.name') || 'Guest',
  volume: parseFloat(localStorage.getItem('ggd.vol') || '0.8'),
  music: parseFloat(localStorage.getItem('ggd.music') || '0.6'),
  sfx: parseFloat(localStorage.getItem('ggd.sfx') || '0.9'),
  region: localStorage.getItem('ggd.region') || 'asia',
  version: 'V3.05.01'
};
document.getElementById('playerNameTop').textContent = state.name;
document.getElementById('ver').textContent = state.version;

// ---- Countdown (left rail) ----
let remaining = 24*60*60; // 24h demo
const elCountdown = document.getElementById('countdown');
setInterval(() => {
  remaining = Math.max(0, remaining-1);
  const hh = String(Math.floor(remaining/3600)).padStart(2,'0');
  const mm = String(Math.floor((remaining%3600)/60)).padStart(2,'0');
  const ss = String(remaining%60).padStart(2,'0');
  elCountdown.textContent = `${hh}:${mm}:${ss}`;
}, 1000);

// -------------- Name Gate (Start Screen) --------------
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const playerNameInput = document.getElementById("playerNameInput");

// rule: 3–16 chars, allow Thai/English/digits/space/_/-
const nameOk = (n) => {
  if (!n) return false;
  const t = n.trim();
  if (t.length < 3 || t.length > 16) return false;
  // อนุญาตทั่วไป ถ้าจะเข้มงวดขึ้นใช้ regex: /^[\\p{L}\\p{N} _-]+$/u
  return true;
};

function applyName(t) {
  state.name = t.trim();
  localStorage.setItem("ggd.name", state.name);
  document.getElementById("playerNameTop").textContent = state.name;
}

function showStartScreen() {
  startScreen.style.display = "grid";
  document.querySelector(".wrap").style.display = "none";
  playerNameInput.value = (state.name && state.name !== 'Guest') ? state.name : '';
  playerNameInput.focus();
}

function hideStartScreen() {
  startScreen.style.display = "none";
  const wrap = document.querySelector(".wrap");
  wrap.style.display = "grid";
  requestAnimationFrame(() => wrap.classList.add("show")); // ✨ เพิ่มตรงนี้
}


startBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!nameOk(name)) {
    alert("❗ กรุณากรอกชื่อยาว 3–16 ตัวอักษร");
    return;
  }
  applyName(name);
  hideStartScreen();
});

// Enter เพื่อยืนยันชื่อ
playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startBtn.click();
});

// แสดง start screen ถ้ายังไม่มีชื่อจริง ๆ
window.addEventListener("DOMContentLoaded", () => {
  const savedName = localStorage.getItem("ggd.name");
  if (savedName && nameOk(savedName)) {
    applyName(savedName);
    hideStartScreen();
  } else {
    showStartScreen();
  }
});

// helper: บังคับให้มีชื่อก่อน ถึงจะทำ action
const requireNameThen = (fn) => (...args) => {
  const saved = localStorage.getItem("ggd.name");
  if (!saved || !nameOk(saved)) {
    showStartScreen();
    return;
  }
  applyName(saved);
  fn(...args);
};

// ---- Buttons ----
const settingsModal = document.getElementById('settingsModal');
document.getElementById('btnSettingsTop').addEventListener('click', () => {
  settingsModal.classList.add('show');
  // sync sliders
  document.getElementById('rangeMaster').value = state.volume;
  document.getElementById('rangeMusic').value = state.music;
  document.getElementById('rangeSfx').value = state.sfx;
  document.getElementById('regionSel').value = state.region;
});
document.getElementById('closeSettings').addEventListener('click', () => {
  settingsModal.classList.remove('show');
});

document.getElementById('rangeMaster').addEventListener('input', e => {
  state.volume = +e.target.value; localStorage.setItem('ggd.vol', state.volume);
});
document.getElementById('rangeMusic').addEventListener('input', e => {
  state.music = +e.target.value; localStorage.setItem('ggd.music', state.music);
});
document.getElementById('rangeSfx').addEventListener('input', e => {
  state.sfx = +e.target.value; localStorage.setItem('ggd.sfx', state.sfx);
});
document.getElementById('regionSel').addEventListener('change', e => {
  state.region = e.target.value; localStorage.setItem('ggd.region', state.region);
});

// Primary actions (guarded)
document.getElementById('btnQuick').addEventListener('click', requireNameThen(() => {
  alert('QUICKPLAY: เริ่มค้นหาห้อง/แมตช์…\n(ใส่โค้ดเชื่อมเอนจิ้นเกมของคุณที่นี่)');
  // TODO: window.startGame && window.startGame({ mode: 'quick', ...state });
}));
document.getElementById('btnCustom').addEventListener('click', requireNameThen(() => {
  alert('CUSTOM GAME: สร้างห้อง/เข้าห้อง…');
}));

// Extra buttons
document.getElementById('btnTutorial').addEventListener('click', ()=> alert('เปิดโหมดสอนเล่น'));
document.getElementById('btnClassic').addEventListener('click', ()=> alert('สลับเพลงธีม/โหมดคลาสสิก'));
document.getElementById('btnFriends').addEventListener('click', ()=> alert('เปิดรายชื่อเพื่อน'));

// ปุ่มรูปคน: ให้เปลี่ยนชื่อเมื่อไรก็ได้
document.getElementById('btnProfile').addEventListener('click', ()=> {
  showStartScreen(); // เปิดหน้าตั้งชื่อเหมือนตอนเริ่มเกม
});

document.getElementById('btnWorld').addEventListener('click', ()=> alert('เลือกภูมิภาค/ภาษา'));

// Keyboard shortcut: ถ้าหน้า start ยังเปิดอยู่ ให้ Enter เป็นยืนยันชื่อ
window.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (startScreen.style.display !== 'none') {
      startBtn.click();
    } else {
      document.getElementById('btnQuick').click();
    }
  }
});

// sound
function hideStartScreen() {
  startScreen.style.display = "none";
  const wrap = document.querySelector(".wrap");
  wrap.style.display = "grid";
  requestAnimationFrame(() => wrap.classList.add("show")); // ✨ เพิ่มตรงนี้
}
