// client/createroom.js
// ใช้กับหน้า createroom.html (RTDB ล้วน)
// ต้องมี firebase.js ที่ export: rtdb, ref, set, update, onDisconnect, get

if (window.hasOwnProperty("AccountCheck")) {
  console.log("⏭️ AccountCheck already initialized — skipping duplicate import");
} else {
  window.AccountCheck = true;
}

// 📌 อ่านชื่อผู้เล่นจากระบบเดิม (ถ้ามี)
const playerName = localStorage.getItem('ggd.name') || 'Guest';
import { rtdb, ref, set, update, onDisconnect, get } from "./firebase.js";
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// ---------- DOM ----------
const $ = (id)=>document.getElementById(id);
const nameInput   = $("roomName");
const nameError   = $("nameError");
const maxSel      = $("maxPlayers");
const typeSel     = $("roomType");
const passRow     = $("roomPassRow");   // มีใน HTML (จะซ่อน/โชว์อัตโนมัติ)
const passInput   = $("roomPass");      // อาจไม่มี ถ้าไม่ใช้ private ให้เช็คก่อน
const btnCreate   = $("btnCreate");
const btnBack     = $("btnBack");

// ---------- UI: settings modal ----------
const modal = $("settingsModal");
$("btnSettingsTop").onclick = ()=> modal.setAttribute("aria-hidden","false");
$("closeSettings").onclick  = ()=> modal.setAttribute("aria-hidden","true");

// ---------- UI: โชว์/ซ่อนช่องรหัสตามประเภท ----------
typeSel.addEventListener("change", ()=>{
  if (passRow) passRow.style.display = typeSel.value === "private" ? "block" : "none";
});

// ---------- Helper ----------
function genCode(len=4){
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // ตัด I O 0 1 เพื่อลดสับสน
  let s = "";
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function getPlayerName(){
  return localStorage.getItem("ggd.name")
      || localStorage.getItem("playerName")
      || `Player_${Math.random().toString(36).slice(2,7)}`;
}
// uid ต่อแท็บ (กันทับเวลาเปิดหลายแท็บ)
const uid = sessionStorage.getItem("ggd.uid") || (()=>{
  const v = (crypto?.randomUUID?.() || ("uid_"+Math.random().toString(36).slice(2,10)));
  sessionStorage.setItem("ggd.uid", v);
  return v;
})();

// SHA-256 → hex
async function sha256Hex(s){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ---------- Background (เล็ก ๆ พอมีชีวิตชีวา) ----------
const bg = $("bgCanvas");
if (bg) {
  const ctx = bg.getContext("2d");
  function drawBackground(){
    bg.width = innerWidth; bg.height = innerHeight;
    const g = ctx.createRadialGradient(bg.width/2, bg.height/2, 0, bg.width/2, bg.height/2, bg.width*.6);
    g.addColorStop(0,"#1e2130"); g.addColorStop(1,"#0b0d12");
    ctx.fillStyle=g; ctx.fillRect(0,0,bg.width,bg.height);
    for(let i=0;i<100;i++){
      const x=Math.random()*bg.width,y=Math.random()*bg.height;
      ctx.fillStyle=`rgba(255,255,255,${Math.random()*.5+.3})`;
      ctx.beginPath();ctx.arc(x,y,Math.random()*1.5+.5,0,Math.PI*2);ctx.fill();
    }
  }
  drawBackground();
  setInterval(drawBackground, 10000);
}

// ---------- สร้างห้อง ----------
async function createRoom(){
  const roomName  = (nameInput.value || "").trim();
  const maxPlayers= parseInt(maxSel.value, 10);
  const roomType  = typeSel.value;
  const hostName  = getPlayerName();

  if (!roomName){
    nameError.textContent = "กรุณาตั้งชื่อห้อง";
    nameInput.focus();
    return;
  }
  nameError.textContent = "";

  // ถ้า private ต้องมีรหัส → เก็บเป็น hash
  let joinHash = null;
  if (roomType === "private") {
    const pass = (passInput?.value || "").trim();
    if (pass.length < 4) {
      alert("รหัสห้องต้องอย่างน้อย 4 ตัว");
      passInput?.focus();
      return;
    }
    joinHash = await sha256Hex(pass);
  }

  // สุ่มโค้ด 4 ตัว + กันชนซ้ำ (เช็ค RTDB)
  let code = genCode(4);
  for (let tries=0; tries<8; tries++){
    const ex = await get(ref(rtdb, `rooms/${code}`));
    if (!ex.exists()) break;
    code = genCode(4);
  }

  // (1) rooms/{code}
  const roomRef = ref(rtdb, `rooms/${code}`);
  await set(roomRef, {
    code, name: roomName, maxPlayers, type: roomType,
    host: hostName, status: "lobby",
    playerCount: 1,
    joinHash: joinHash,                         // null ถ้า public
    createdAt: serverTimestamp(), lastActivity: serverTimestamp()
  });

  // (2) lobbies/{code}/players/{uid}  — ใช้ uid เป็น key กันทับ
  const meRef = ref(rtdb, `lobbies/${code}/players/${uid}`);
  await set(meRef, {
    uid,
    name: hostName,
    isHost: true,
    ready: false,
    online: true,
    char: "mini_brown",
    joinTime: serverTimestamp()
  });
  onDisconnect(meRef).remove();

  // (3) bump activity
  await update(roomRef, { lastActivity: serverTimestamp() });

  // (4) เก็บ context & เด้งไป lobby
  localStorage.setItem("currentRoom", JSON.stringify({
    code, name: roomName, maxPlayers, type: roomType, isHost: true
  }));
  localStorage.setItem("playerName", hostName);
  localStorage.setItem("ggd.name", hostName);

  // ถ้า private ให้ mark ว่าผ่านการยืนยันรหัสแล้ว (ไว้ให้ lobby ตรวจ)
  if (roomType === "private") {
    localStorage.setItem(`roomAuth:${code}`, "ok");
  }

  location.href = `lobby.html?code=${code}`;
}

// ---------- Events ----------
btnCreate.onclick = ()=> {
  createRoom().catch(err=>{
    console.error(err);
    alert("สร้างห้องไม่สำเร็จ: " + (err?.message || err));
  });
};
btnBack.onclick = ()=> location.href = "index.html";
nameInput.addEventListener("keydown", e=>{
  if (e.key === "Enter") btnCreate.click();
});
window.addEventListener("DOMContentLoaded", () => {
  const last = parseFloat(localStorage.getItem("bgmTime") || "0");
  if (bgm && !isNaN(last)) bgm.currentTime = last;
});

// ===============================
// 🎛️ SETTINGS MODAL
// ===============================
const rangeMaster = document.getElementById("rangeMaster");
const rangeMusic = document.getElementById("rangeMusic");
const rangeSfx = document.getElementById("rangeSfx");
const regionSel = document.getElementById("regionSel");

if (rangeMaster && rangeMusic && rangeSfx && regionSel) {
  rangeMaster.value = settings.master;
  rangeMusic.value = settings.music;
  rangeSfx.value = settings.sfx;
  regionSel.value = settings.region;

  rangeMaster.addEventListener("input", e => {
    settings.master = parseFloat(e.target.value);
    saveSettings();
  });
  rangeMusic.addEventListener("input", e => {
    settings.music = parseFloat(e.target.value);
    saveSettings();
  });
  rangeSfx.addEventListener("input", e => {
    settings.sfx = parseFloat(e.target.value);
    saveSettings();
  });
  regionSel.addEventListener("change", e => {
    settings.region = e.target.value;
    saveSettings();
    updateRegion();
  });
}

// ===============================
// 🪟 SETTINGS MODAL TOGGLE
// ===============================
const btnSettingsTop = document.getElementById("btnSettingsTop");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");

if (btnSettingsTop && settingsModal && closeSettings) {
  btnSettingsTop.addEventListener("click", () => {
    settingsModal.setAttribute("aria-hidden", "false");
    playClick();
  });

  closeSettings.addEventListener("click", () => {
    settingsModal.setAttribute("aria-hidden", "true");
    playClick();
  });

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.setAttribute("aria-hidden", "true");
      playClick();
    }
  });
}

// ===============================
// 🔉 PLAY CLICK SOUND (debounced)
// ===============================
let lastClick = 0;
function playClick() {
  const now = Date.now();
  if (now - lastClick > 100) {
    clickSound.currentTime = 0;
    clickSound.play();
    lastClick = now;
  }
}

// Centralize audio + settings
try {
  if (window.GameAudio) window.GameAudio.init();
  if (window.GameSettings) {
    window.GameSettings.bindUI({});
    window.GameSettings.onChange(() => { if (window.GameAudio) window.GameAudio.applyVolumes(); });
  }
} catch {}
