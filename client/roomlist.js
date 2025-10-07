// RTDB Room List (แทนที่ของเดิม)
import { rtdb, ref, onValue, get } from "./firebase.js";

const $ = (id)=>document.getElementById(id);
const listEl = $("roomList");
const emptyEl = $("emptyState");
const infoEl = $("info");

const playerName =
  localStorage.getItem("ggd.name") ||
  localStorage.getItem("playerName") ||
  `Player_${Math.random().toString(36).slice(2,7)}`;

const createdCode = new URLSearchParams(location.search).get("code");
if (createdCode) infoEl.textContent = `เข้ามาจากห้องที่เพิ่งสร้าง: ${createdCode}`;

function renderRooms(roomsObj){
  const rooms = Object.values(roomsObj || {})
    .filter(r => (r.type ?? "public")==="public" && (r.status ?? "lobby")==="lobby")
    .sort((a,b)=>(b.lastActivity||0)-(a.lastActivity||0));

  listEl.innerHTML = "";
  if (!rooms.length){ emptyEl.style.display="block"; return; }
  emptyEl.style.display="none";

  rooms.forEach(r=>{
    const div = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = `
      <div class="room-info">
        <div class="room-name">📛 ${r.name || "(no name)"} <small>#${r.code}</small></div>
        <div class="room-detail">👥 ${r.playerCount || 0}/${r.maxPlayers ?? "?"} • 🔒 ${r.type || "-"}</div>
      </div>
      <button class="join-btn" data-code="${r.code}">Join</button>
    `;
    div.querySelector(".join-btn").onclick = async (e)=>{
      const code = e.currentTarget.dataset.code;
      const snap = await get(ref(rtdb, `rooms/${code}`));
      const room = snap.val();
      if(!room || room.status!=="lobby"){ alert("ห้องนี้ไม่พร้อมเข้าหรือถูกลบแล้ว"); return; }
      if(room.playerCount >= (room.maxPlayers || 999)){ alert("ห้องเต็มแล้ว"); return; }

      localStorage.setItem("currentRoom", JSON.stringify({
        code: room.code, name: room.name, maxPlayers: room.maxPlayers,
        type: room.type, isHost: false
      }));
      if(!localStorage.getItem("playerName")) localStorage.setItem("playerName", playerName);
      if(!localStorage.getItem("ggd.name"))   localStorage.setItem("ggd.name", playerName);

      location.href = `lobby.html?code=${code}`;
    };

    if(createdCode && r.code===createdCode){
      div.style.outline = "2px solid #76f7b1";
      div.style.boxShadow = "0 0 0 3px rgba(118,247,177,.25)";
    }
    listEl.appendChild(div);
  });
}

onValue(ref(rtdb,"rooms"), snap => renderRooms(snap.val()), err=>{
  console.error("[roomlist] onValue error:", err);
  emptyEl.style.display="block";
  emptyEl.textContent = "โหลดรายการห้องไม่ได้ (ตรวจ RTDB rules)";
});
