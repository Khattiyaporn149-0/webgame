/* ---------- BG ---------- */
const canvas = document.getElementById("bgCanvas");
if (canvas) {
  const ctx = canvas.getContext("2d");
  function drawBackground(){
    canvas.width = innerWidth; canvas.height = innerHeight;
    const g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width*.6);
    g.addColorStop(0,"#1e2130"); g.addColorStop(1,"#0b0d12");
    ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<100;i++){
      const x=Math.random()*canvas.width,y=Math.random()*canvas.height;
      ctx.fillStyle=`rgba(255,255,255,${Math.random()*.5+.3})`;
      ctx.beginPath();ctx.arc(x,y,Math.random()*1.5+.5,0,Math.PI*2);ctx.fill();
    }
  }
  drawBackground(); setInterval(drawBackground,10000);
}

/* ---------- DOM ---------- */
const $ = (id)=>document.getElementById(id);
const listEl  = $("roomList");
const emptyEl = $("emptyState");
const infoEl  = $("info");

const joinModal  = $("joinModal");
const joinBtn    = $("joinByCodeBtn");
const joinClose  = $("joinClose");
const joinInput  = $("joinCodeInput");
const joinErr    = $("joinErr");
const joinSubmit = $("joinSubmit");

/* ---------- Modal ---------- */
function reallyOpenJoin(){
  if (joinErr) joinErr.textContent = "";
  if (joinInput) joinInput.value = "";
  if (joinModal) {
    joinModal.setAttribute("aria-hidden","false");
    setTimeout(()=> joinInput && joinInput.focus(), 0);
  }
}
window._openJoin = reallyOpenJoin;

joinBtn?.addEventListener("click",(e)=>{ e.preventDefault(); e.stopPropagation(); reallyOpenJoin(); });
joinClose?.addEventListener("click",()=> joinModal?.setAttribute("aria-hidden","true"));

/* auto-open if ?code=XXXX */
const urlCode = new URLSearchParams(location.search).get("code");
if (urlCode && joinModal && joinInput) {
  joinModal.setAttribute("aria-hidden","false");
  joinInput.value = (urlCode||"").toUpperCase();
  setTimeout(()=>joinInput.focus(),0);
}

/* ---------- Firebase ---------- */
import { rtdb, ref, onValue, get, update, remove } from "./firebase.js";

/** เก็บ snapshot ล่าสุดของ rooms ให้ภารโรงใช้ */
let latestRooms = {};

/* ---------- Listeners ---------- */
(() => {
  const createdCode = new URLSearchParams(location.search).get("code");
  if (createdCode && infoEl) infoEl.textContent = `เข้ามาจากห้องที่เพิ่งสร้าง: ${createdCode}`;

  // rooms → render + ภารโรง
  onValue(ref(rtdb, "rooms"), snap => {
    latestRooms = snap.val() || {};
    renderRooms(latestRooms);
    scheduleJanitor();
  }, err => {
    console.error("[roomlist] onValue(rooms) error:", err);
    if (emptyEl){
      emptyEl.style.display="block";
      emptyEl.textContent = "โหลดรายการห้องไม่ได้ (ตรวจ RTDB rules)";
    }
  });

  // lobbies → ผู้เล่นเปลี่ยน → ภารโรง
  onValue(ref(rtdb, "lobbies"), () => scheduleJanitor(), err => console.error("[roomlist] onValue(lobbies) error:", err));

  // กันตกหล่น
  setInterval(()=> scheduleJanitor(), 10000);
})();

/* ---------- Render ---------- */
function renderRooms(roomsObj){
  if (!listEl || !emptyEl) return;

  const rooms = Object.values(roomsObj||{})
    .filter(r => (r?.status ?? "lobby") === "lobby" && (r?.type ?? "public") !== "private")
    .sort((a,b)=>(b.lastActivity||0)-(a.lastActivity||0));

  listEl.innerHTML = "";
  if(!rooms.length){ emptyEl.style.display="block"; return; }
  emptyEl.style.display="none";

  rooms.forEach(r=>{
    const div = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = `
      <div class="room-info">
        <div class="room-name">${r.name || "(no name)"} <small style="opacity:.7">#${r.code||""}</small></div>
        <div class="room-detail">👥 ${r.playerCount || 0}/${r.maxPlayers ?? "?"} • ${r.type || "-"}</div>
        ${r.host ? `<div class="room-host" style="opacity:.75">Host: ${r.host}</div>` : ""}
      </div>
      <button class="join-btn" data-code="${r.code}" type="button">Join</button>
    `;

    div.querySelector(".join-btn").onclick = async (e)=>{
      const code = e.currentTarget.dataset.code;
      try{
        const snap = await get(ref(rtdb, `rooms/${code}`));
        const room = snap.val();
        if(!room || room.status!=="lobby"){ alert("ห้องนี้ไม่พร้อมเข้าหรือถูกลบแล้ว"); return; }
        if(room.playerCount >= (room.maxPlayers || 999)){ alert("ห้องเต็มแล้ว"); return; }

        const playerName =
          localStorage.getItem("ggd.name") ||
          localStorage.getItem("playerName") ||
          `Player_${Math.random().toString(36).slice(2,7)}`;

        localStorage.setItem("currentRoom", JSON.stringify({
          code: room.code, name: room.name, maxPlayers: room.maxPlayers,
          type: room.type, isHost: false
        }));
        if(!localStorage.getItem("playerName")) localStorage.setItem("playerName", playerName);
        if(!localStorage.getItem("ggd.name"))   localStorage.setItem("ggd.name", playerName);

        location.href = `lobby.html?code=${code}`;
      }catch(err){
        console.error(err);
        alert("เข้าห้องไม่สำเร็จ");
      }
    };

    listEl.appendChild(div);
  });
}

/* ---------- Join by code ---------- */
const normCode = s => (s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");

async function joinByCode(){
  const code = normCode(joinInput?.value.trim());
  if(!code || code.length<4){ if (joinErr) joinErr.textContent="กรุณากรอกรหัสอย่างน้อย 4 ตัว"; return; }

  try{
    const snap = await get(ref(rtdb, `rooms/${code}`));
    const room = snap.val();
    if(!room){ joinErr.textContent="ไม่พบห้องนี้"; return; }
    if(room.status!=="lobby"){ joinErr.textContent="ห้องนี้ไม่พร้อมเข้าหรือเริ่มเกมแล้ว"; return; }
    if((room.playerCount||0) >= (room.maxPlayers||999)){ joinErr.textContent="ห้องเต็มแล้ว"; return; }

    localStorage.setItem("currentRoom", JSON.stringify({
      code: room.code, name: room.name, maxPlayers: room.maxPlayers,
      type: room.type, isHost:false
    }));
    localStorage.setItem(`joinedByCode:${code}`,"1");
    location.href = `lobby.html?code=${code}`;
  }catch(e){
    console.error(e);
    if (joinErr) joinErr.textContent="เข้าห้องไม่สำเร็จ ลองใหม่อีกครั้ง";
  }
}
joinSubmit?.addEventListener("click", joinByCode);
joinInput?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") joinByCode(); });

/* ---------- Janitor (2-pass) ---------- */
const GRACE_MS = 5000; // ลดเหลือ 1000 ชั่วคราวถ้าอยาก test ไว
let janitorTimer = null;
let janitorRunning = false;

function scheduleJanitor() {
  if (janitorTimer) clearTimeout(janitorTimer);
  janitorTimer = setTimeout(()=> runJanitorFresh().catch(()=>{}), 1200);
}

async function runJanitorFresh() {
  if (janitorRunning) return;
  janitorRunning = true;
  try {
    // ----- PASS 1: เดินจาก rooms -----
    const rs = await get(ref(rtdb, "rooms"));
    const rooms = rs.exists() ? rs.val() : {};
    const codes = Object.keys(rooms || {});
    const now = Date.now();
    console.log("[janitor] rooms:", codes.join(", ") || "(none)");

    for (const code of codes) {
      const room = rooms[code] || {};
      if ((room?.status ?? "lobby") !== "lobby") continue;

      const last = typeof room?.lastActivity === "number" ? room.lastActivity : 0;
      if (now - last < GRACE_MS) continue;

      // นับ players จริง
      let count = 0;
      try {
        const pSnap = await get(ref(rtdb, `lobbies/${code}/players`));
        count = pSnap.exists() ? Object.keys(pSnap.val() || {}).length : 0;
      } catch {}

      // sync playerCount (ถ้าติด rules ก็ไม่เป็นไร)
      try { await update(ref(rtdb, `rooms/${code}`), { playerCount: count }); } catch {}

      if (count === 0) {
        // ลบลูก → ลบ lobby → ลบ room
        try { await remove(ref(rtdb, `lobbies/${code}/players`)); } catch {}
        try { await remove(ref(rtdb, `lobbies/${code}/chat`)); }    catch {}
        try { await remove(ref(rtdb, `lobbies/${code}`)); }         catch (e) { console.warn("[janitor] rm lobby fail:", code, e?.code); }
        try { await remove(ref(rtdb, `rooms/${code}`)); }           catch (e) { console.warn("[janitor] rm room fail:", code, e?.code); }
      }
    }

    // ----- PASS 2: กวาดลอบบี้ที่หลงเหลือ/ไร้ room -----
    try {
      const ls = await get(ref(rtdb, "lobbies"));
      const lobbies = ls.exists() ? ls.val() : {};
      const lobbyCodes = Object.keys(lobbies || {});
      for (const code of lobbyCodes) {
        const hasRoom = rooms && Object.prototype.hasOwnProperty.call(rooms, code);
        let pCount = 0;
        try {
          const p = await get(ref(rtdb, `lobbies/${code}/players`));
          pCount = p.exists() ? Object.keys(p.val() || {}).length : 0;
        } catch {}

        if (!hasRoom || pCount === 0) {
          try { await remove(ref(rtdb, `lobbies/${code}/players`)); } catch {}
          try { await remove(ref(rtdb, `lobbies/${code}/chat`)); }    catch {}
          try { await remove(ref(rtdb, `lobbies/${code}`)); }         catch (e) { console.warn("[janitor] rm lone lobby fail:", code, e?.code); }
        }
      }
    } catch (e) {
      console.warn("[janitor] scan lobbies failed:", e?.code, e?.message);
    }
  } finally {
    janitorRunning = false;
  }
}
