// client/createroom.js
import { rtdb, ref, set, update, onDisconnect, get } from "./firebase.js";
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// ---------- DOM ----------
const $ = (id)=>document.getElementById(id);
const nameInput = $("roomName");
const nameError = $("nameError");
const maxSel    = $("maxPlayers");
const typeSel   = $("roomType");
const btnCreate = $("btnCreate");
const btnBack   = $("btnBack");

// ---------- Settings modal ----------
const modal = $("settingsModal");
$("btnSettingsTop").onclick = ()=> modal.setAttribute("aria-hidden","false");
$("closeSettings").onclick  = ()=> modal.setAttribute("aria-hidden","true");

// ---------- BG (เอฟเฟกต์พื้นหลังเล็ก ๆ) ----------
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

// ---------- Helpers ----------
function genCode(len=4){
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // ไม่มี I,O,0,1
  let s = "";
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function getPlayerName(){
  return localStorage.getItem("ggd.name")
      || localStorage.getItem("playerName")
      || `Player_${Math.random().toString(36).slice(2,7)}`;
}
// uid ต่อแท็บ
const uid = sessionStorage.getItem("ggd.uid") || (()=> {
  const v = (crypto?.randomUUID?.() || ("uid_"+Math.random().toString(36).slice(2,10)));
  sessionStorage.setItem("ggd.uid", v);
  return v;
})();

// ---------- สร้างห้อง ----------
async function createRoom(){
  const roomName   = (nameInput.value || "").trim();
  const maxPlayers = parseInt(maxSel.value, 10);
  const roomType   = typeSel.value; // 'public' | 'private'
  const hostName   = getPlayerName();

  if (!roomName){
    nameError.textContent = "กรุณาตั้งชื่อห้อง";
    nameInput.focus();
    return;
  }
  nameError.textContent = "";

  // สุ่มโค้ด 4 ตัว + กันชนซ้ำ
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
    host: hostName, hostId: uid,
    status: "lobby",
    playerCount: 1,
    createdAt: serverTimestamp(), lastActivity: serverTimestamp()
  });

  // (2) lobbies/{code}/players/{uid}
  const meRef = ref(rtdb, `lobbies/${code}/players/${uid}`);
  await set(meRef, {
    uid, name: hostName, isHost: true, ready: false, online: true,
    char: "mini_brown", joinTime: serverTimestamp()
  });
  onDisconnect(meRef).remove();

  // (3) bump activity
  await update(roomRef, { lastActivity: serverTimestamp() });

  // (4) context & แจ้งโค้ดห้อง & ไป lobby
  localStorage.setItem("currentRoom", JSON.stringify({
    code, name: roomName, maxPlayers, type: roomType, isHost: true
  }));
  localStorage.setItem("playerName", hostName);
  localStorage.setItem("ggd.name", hostName);

  const inviteURL = new URL(`lobby.html`, location.href);
  inviteURL.searchParams.set("code", code);
  try {
    await navigator.clipboard.writeText(inviteURL.toString());
    alert(`รหัสห้องของคุณคือ: ${code}\nลิงก์เชิญถูกคัดลอกแล้ว!`);
  } catch {
    alert(`รหัสห้องของคุณคือ: ${code}`);
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
