// socketHandler.js
// รวม event handlers ของ socket.io

const { gameRooms, ensureGameRoom, tickRoom } = require("./game/gameRoom");
const { GRACE_DISCONNECT_MS } = require("./constants");

// Minimal in-memory role/tasks store to satisfy client sync
// key: `${room}:${uid}` -> { role, waves, currentWave, completedTasks }
const playerTaskState = new Map();
const TASK_POOL = [
  'wires','upload','mix','switch','card','timer','align','mop',
  'simon','pipes','math','lights','mole','slider','rhythm','pattern',
];

function hashToInt(str){
  let h = 0;
  for (let i=0;i<str.length;i++){ h = ((h<<5)-h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function assignTasksFor(room, uid){
  const key = `${room}:${uid}`;
  if (playerTaskState.has(key)) return playerTaskState.get(key);
  const h = hashToInt(uid + ':' + room);
  const role = (h % 5 === 0) ? 'Thief' : 'Visitor';
  const shuffled = [...TASK_POOL].sort(() => (hashToInt(uid+room+Math.random()) % 3) - 1);
  const w1 = shuffled.slice(0, 3);
  const w2 = shuffled.slice(3, 6);
  const w3 = shuffled.slice(6, 9);
  const waves = [w1, w2, w3];
  const state = { role, waves, currentWave: 1, completedTasks: [] };
  playerTaskState.set(key, state);
  return state;
}

/**
 * registerSocketHandlers(io)
 * @param {Server} io - socket.io server
 */
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    // GAME RESET: clear room state and any task assignments
    socket.on("game:reset", (data = {}) => {
      const room = data?.room;
      if (!room) return;
      try {
        const gr = gameRooms[room];
        if (gr) {
          try { clearInterval(gr.interval); } catch {}
          for (const [, t] of gr.removeTimers.entries()) try { clearTimeout(t); } catch {}
          delete gameRooms[room];
        }
        for (const k of Array.from(playerTaskState.keys())){
          if (k.startsWith(room + ':')) playerTaskState.delete(k);
        }
        io.to(room).emit("snapshot", { room, players: [] });
        console.log(`?? Room reset: ${room}`);
      } catch {}
    });

    // JOIN ROOM
    socket.on("game:join", (data = {}) => {
      const { room, uid, name, color, char, x, y } = data;
      if (!room || !uid) return;

      const gr = ensureGameRoom(room);
      gr.io = io; // bind io ให้ tickRoom ใช้ได้

      // เคลียร์ timeout reconnect ถ้ามี
      if (gr.removeTimers.has(uid)) {
        clearTimeout(gr.removeTimers.get(uid));
        gr.removeTimers.delete(uid);
      }

      const existing = gr.players.get(uid);
      if (existing) {
        // อัปเดต player เดิม
        existing.socketId = socket.id;
        existing.name = name || existing.name;
        existing.color = color || existing.color;
        existing.char = char || existing.char;
        existing.x = (typeof x === "number") ? x : existing.x;
        existing.y = (typeof y === "number") ? y : existing.y;
        existing.lastMoveAt = Date.now();
      } else {
        // สร้าง player ใหม่
        gr.players.set(uid, {
          uid, 
          name, 
          color, 
          char, 
          x, 
          y,
          socketId: socket.id,
          room,
          lastMoveAt: Date.now(),
        });
      }

      socket.data.room = room;
      socket.data.uid = uid;
      socket.join(room);

      // Ack back to this client and optionally resume known state
      try { socket.emit("game:join:ack", { ok: true, room, uid }); } catch {}
      try {
        const key = `${room}:${uid}`;
        if (playerTaskState.has(key)){
          const st = playerTaskState.get(key);
          socket.emit('state:resume', {
            room,
            uid,
            role: st.role,
            waves: st.waves,
            currentWave: st.currentWave,
            completedTasks: st.completedTasks,
            x: (typeof x === 'number') ? x : undefined,
            y: (typeof y === 'number') ? y : undefined,
          });
        }
      } catch {}

      // ส่ง snapshot ให้ห้อง
      io.to(room).emit("snapshot", {
        room,
        players: Array.from(gr.players.values()),
      });

      console.log(`👋 ${name} joined ${room}`);
    });

    // MOVE PLAYER
    socket.on("player:move", (data = {}) => {
      const room = socket.data.room;
      const uid = socket.data.uid;
      if (!room || !uid) return;

      const gr = gameRooms[room];
      if (!gr) return;

      const p = gr.players.get(uid);
      if (!p) return;

      if (typeof data.x === "number") p.x = data.x;
      if (typeof data.y === "number") p.y = data.y;
      p.lastMoveAt = data.ts || Date.now();

      io.to(room).volatile.emit("player:movedelta", {
        uid, x: p.x, y: p.y, ts: p.lastMoveAt
      });

      io.to(room).volatile.emit("snapshot", {
        room, players: Array.from(gr.players.values())
      });
    });

    // Minimal tasks assignment: reply to tasks:request
    socket.on('tasks:request', (data = {}) => {
      const room = data.room || socket.data.room;
      const uid = data.uid || socket.data.uid;
      if (!room || !uid) return;
      const st = assignTasksFor(room, uid);
      try {
        socket.emit('tasks:assigned', {
          room,
          uid,
          role: st.role,
          waves: st.waves,
          currentWave: st.currentWave,
        });
      } catch {}
    });

    // Accept game:start from host; broadcast wave:unlock
    socket.on('game:start', (data = {}) => {
      const room = data.room || socket.data.room;
      if (!room) return;
      try {
        io.to(room).emit('wave:unlock', { currentWave: 1, unlockedTasks: [] });
        console.log(`?? game:start broadcasted for room ${room}`);
      } catch {}
    });

    // CHAT
    socket.on("chat:message", (data = {}) => {
      if (!data?.text || !data?.uid) return;
      const room = data.room || socket.data.room;
      if (!room) return;

      const now = Date.now();
      const safeText = String(data.text).slice(0, 500);
      socket.__msgSeq = socket.__msgSeq || new Map();
      const keySeq = `${room}:${data.uid}`;
      const nextSeq = (socket.__msgSeq.get(keySeq) || 0) + 1;
      socket.__msgSeq.set(keySeq, nextSeq);

      const id = (typeof data.id === "string" && data.id.length <= 128)
        ? data.id
        : `${data.uid}:${now}:${nextSeq}`;

      const payload = {
        room,
        uid: data.uid,
        name: data.name || "Unknown",
        text: safeText,
        ts: now,
        id,
        seq: nextSeq,
      };
      io.to(room).emit("chat:message", payload);
      console.log(`?? [${room}] ${payload.name}: ${payload.text}`);
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log("🔴 Disconnected:", socket.id);
      for (const [room, gr] of Object.entries(gameRooms)) {
        for (const [uid, p] of gr.players.entries()) {
          if (p.socketId === socket.id) {
            if (gr.removeTimers.has(uid)) clearTimeout(gr.removeTimers.get(uid));

            const t = setTimeout(() => {
              try {
                gr.players.delete(uid);
                gr.removeTimers.delete(uid);
                console.log(`🗑️ Player ${uid} removed from room ${room}`);

                io.to(room).emit("snapshot", {
                  room,
                  players: Array.from(gr.players.values()),
                });

                if (gr.players.size === 0) {
                  clearInterval(gr.interval);
                  delete gameRooms[room];
                  console.log(`🗑️ Room cleared: ${room}`);
                }
              } catch (e) {}
            }, GRACE_DISCONNECT_MS);

            gr.removeTimers.set(uid, t);
          }
        }
      }
    });
  });
}

module.exports = registerSocketHandlers;

