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

/* ---------- Modal: ensure open works ---------- */
function reallyOpenJoin(){
  if (joinErr) joinErr.textContent = "";
  if (joinInput) joinInput.value = "";
  if (joinModal) {
    joinModal.setAttribute("aria-hidden","false");
    setTimeout(()=> joinInput && joinInput.focus(), 0);
  }
}
window._openJoin = reallyOpenJoin;

if (joinBtn) {
  joinBtn.addEventListener("click", (e)=>{
    e.preventDefault(); e.stopPropagation();
    reallyOpenJoin();
  });
}
if (joinClose) {
  joinClose.addEventListener("click", ()=> joinModal && joinModal.setAttribute("aria-hidden","true"));
}

/* auto-open if ?code=XXXX */
const urlCode = new URLSearchParams(location.search).get("code");
if (urlCode && joinModal && joinInput) {
  joinModal.setAttribute("aria-hidden","false");
  joinInput.value = (urlCode||"").toUpperCase();
  setTimeout(()=>joinInput.focus(),0);
}

/* ---------- Firebase (dynamic import) ---------- */
let rtdb, ref, onValue, get;
let firebaseReady = false;

(async () => {
  try {
    const mod = await import("./firebase.js");
    rtdb = mod.rtdb; ref = mod.ref; onValue = mod.onValue; get = mod.get;
    firebaseReady = true;

    const createdCode = new URLSearchParams(location.search).get("code");
    if (createdCode && infoEl) infoEl.textContent = `เข้ามาจากห้องที่เพิ่งสร้าง: ${createdCode}`;

    onValue(ref(rtdb, "rooms"), snap => renderRooms(snap.val()), err => {
      console.error("[roomlist] onValue error:", err);
      if (emptyEl){
        emptyEl.style.display="block";
        emptyEl.textContent = "โหลดรายการห้องไม่ได้ (ตรวจ RTDB rules)";
      }
    });
  } catch (e) {
    console.error("[roomlist] โหลด firebase.js ไม่ได้:", e);
    if (emptyEl){
      emptyEl.style.display="block";
      emptyEl.textContent = "ไม่สามารถโหลดระบบได้: ตรวจไฟล์ firebase.js หรือ path";
    }
  }
})();

/* ---------- Render list (hide private) ---------- */
function renderRooms(roomsObj){
  if (!listEl || !emptyEl) return;

  const rooms = Object.values(roomsObj||{})
    .filter(r => (r?.status ?? "lobby") === "lobby" && (r?.type ?? "public") !== "private")
    .sort((a,b)=>(b.lastActivity||0)-(a.lastActivity||0));

  listEl.innerHTML = "";
  if(!rooms.length){ emptyEl.style.display="block"; return; }
  emptyEl.style.display="none";

  rooms.forEach(r=>{
    const lockIcon = r.type === "private" ? "🔒" : "🔓";
    const div = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = `
      <div class="room-info">
        <div class="room-name">${lockIcon} ${r.name || "(no name)"} <small>#${r.code || ""}</small></div>
        <div class="room-detail">👥 ${r.playerCount || 0}/${r.maxPlayers ?? "?"} • ${r.type || "-"}</div>
      </div>
      <button class="join-btn" data-code="${r.code}" type="button">Join</button>
    `;

    div.querySelector(".join-btn").onclick = async (e)=>{
      const code = e.currentTarget.dataset.code;
      if (!firebaseReady) { alert("ระบบยังไม่พร้อม (โหลด Firebase ไม่สำเร็จ)"); return; }
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
  if (!firebaseReady){ if (joinErr) joinErr.textContent = "ระบบยังไม่พร้อม (โหลด Firebase ไม่สำเร็จ)"; return; }

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

if (joinSubmit) joinSubmit.onclick = joinByCode;
if (joinInput)  joinInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") joinByCode(); });
