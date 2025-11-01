const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve the built client. `client/public` contains the main index.html,
// and `client` hosts shared asset folders like /styles and /assets.
app.use(express.static(path.join(__dirname, "../client/public")));
app.use(express.static(path.join(__dirname, "../client")));

// Root fallback to the SPA entrypoint
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/public/index.html"));
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// ===============================
// Game Constants
// ===============================
const MINIGAMES = [
  "align",
  "mop", 
  "upload",
  "dodge",
  "rhythm",
  "switch",
  "wires",
  "math"
];

// Default spawn point (on purple floor)
const DEFAULT_SPAWN = { x: 3500, y: 3900 };
// Spawn zone (small randomization inside safe area)
const SPAWN_ZONE = { x1: 3420, y1: 3820, x2: 3580, y2: 3980 };
function randomSpawnInZone(){
  const x = Math.floor(Math.random() * (SPAWN_ZONE.x2 - SPAWN_ZONE.x1 + 1)) + SPAWN_ZONE.x1;
  const y = Math.floor(Math.random() * (SPAWN_ZONE.y2 - SPAWN_ZONE.y1 + 1)) + SPAWN_ZONE.y1;
  return { x, y };
}
function ensureSpawn(x, y){
  // If invalid or zero-ish, return zone spawn; else return the same
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x <= 0 && y <= 0)) return randomSpawnInZone();
  return { x, y };
}

// Decide number of thieves based on player count (supports 2+ players)
function decideThievesCount(n){
  if (n <= 1) return 0;
  if (n >= 7) return 2;
  return 1; // 2..6 players => 1 thief
}

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper to assign or re-emit tasks to a specific player
function assignTasksToPlayer(gr, uid, { force = false } = {}){
  if (!gr || !uid) return;
  const player = gr.players.get(uid);
  if (!player) return;

  // default role
  const role = player.role;
  // ถ้ายังไม่รู้บทบาท อย่ามอบหมายใดๆ รอให้ client ส่ง role:set มาก่อน
  if (!role) {
    return;
  }
  if (role === 'Visitor'){
    // If already has tasks and not forcing, just re-emit to current socket
    if (!force && Array.isArray(player.waves) && player.waves.length){
      const targetSocket = io.sockets.sockets.get(player.socketId);
      if (targetSocket){
        targetSocket.emit('tasks:assigned', {
          role,
          waves: player.waves,
          currentWave: player.currentWave || 1,
        });
      }
      return;
    }

    // create fresh tasks
    const shuffled = shuffleArray(MINIGAMES);
    const waves = [
      shuffled.slice(0,2),
      shuffled.slice(2,5),
      shuffled.slice(5,8),
    ];
    player.waves = waves;
    player.currentWave = 1;
    if (!Array.isArray(player.completedTasks)) player.completedTasks = [];

    const targetSocket = io.sockets.sockets.get(player.socketId);
    if (targetSocket){
      targetSocket.emit('tasks:assigned', { role, waves, currentWave: 1 });
      console.log(`✅ Tasks assigned to ${player.name} (Visitor): Wave 1 = [${waves[0].join(', ')}]`);
    }
  } else {
    const targetSocket = io.sockets.sockets.get(player.socketId);
    if (targetSocket){
      targetSocket.emit('tasks:assigned', { role: 'Thief', waves: [], currentWave: 0 });
      console.log(`✅ Role assigned to ${player.name} (Thief)`);
    }
  }
}

// ===============================
// In-memory room state
// ===============================
const gameRooms = {};
function ensureGameRoom(code) {
  if (!gameRooms[code]) {
    gameRooms[code] = {
      players: new Map(),        // uid -> { uid, name, color, char, x, y, ... }
      removeTimers: new Map(),   // uid -> timeoutId (for graceful disconnect)
      interval: null,            // snapshot ticker
      gameStarted: false,        // เกมเริ่มหรือยัง
      visitorTargets: new Set(), // รายชื่อ Visitor ที่ต้องทำครบ 8/8 ในเกมนี้
    };

    // ส่ง snapshot ให้ทั้งห้องเป็นระยะ (heartbeat)
    gameRooms[code].interval = setInterval(() => tickRoom(code), 100);
  }
  return gameRooms[code];
}

// ===============================
// Helper: Shuffle Array
// ===============================
function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function tickRoom(code) {
  const gr = gameRooms[code];
  if (!gr) return;

  const payload = {
    room: code,
    players: Array.from(gr.players.values()),
  };
  io.to(code).volatile.emit("snapshot", payload);
}

// ===============================
// Socket.io
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // JOIN ROOM
  socket.on("game:join", (data = {}) => {
    const { room, uid, name, color, char, x, y } = data;
    if (!room || !uid) return;

    const gr = ensureGameRoom(room);

    // ถ้าเคยตั้ง timer ลบทิ้งเพราะ reconnect แล้ว
    if (gr.removeTimers.has(uid)) {
      clearTimeout(gr.removeTimers.get(uid));
      gr.removeTimers.delete(uid);
    }

    const existing = gr.players.get(uid);
    if (existing) {
      // อัปเดต player ที่มีอยู่ (รีเฟรชหรือ reconnect)
      console.log(`🔄 Updating ${name} socketId: ${existing.socketId} → ${socket.id}, color: ${existing.color} → ${color}, char: ${existing.char} → ${char}`);
      existing.socketId = socket.id;
      existing.name  = name  || existing.name;
      existing.color = color || existing.color;
      existing.char  = char  || existing.char;
      
      // ⭐ ถ้าเกมเริ่มแล้วและผู้เล่นมี role แล้ว ให้ส่ง tasks ใหม่ทันที
      if (gr.gameStarted && existing.role) {
        console.log(`🎮 Game already started, resending tasks to ${name} (${existing.role})`);
        if (existing.role === 'Visitor') {
          assignTasksToPlayer(gr, uid, { force: false });
        } else {
          const targetSocket = io.sockets.sockets.get(socket.id);
          if (targetSocket) {
            targetSocket.emit('tasks:assigned', { role: 'Thief', waves: [], currentWave: 0 });
            console.log(`✅ Resent Thief tasks to ${name}`);
          }
        }
      }
      
      // ตรวจสอบว่าตำแหน่งเดิมถูกต้องหรือไม่
      const hasValidPosition = Number.isFinite(existing.x) && Number.isFinite(existing.y) 
        && existing.x > 0 && existing.y > 0
        && existing.x >= SPAWN_ZONE.x1 && existing.x <= SPAWN_ZONE.x2
        && existing.y >= SPAWN_ZONE.y1 && existing.y <= SPAWN_ZONE.y2;
      
      if (!hasValidPosition) {
        // ถ้าตำแหน่งเดิมไม่ถูกต้อง ให้ spawn ใหม่ในโซนปลอดภัย
        const sp = randomSpawnInZone();
        existing.x = sp.x;
        existing.y = sp.y;
        console.log(`🔄 Respawning ${name} at (${sp.x}, ${sp.y}) - invalid old position`);
      }
      // ถ้าตำแหน่งเดิมถูกต้อง ให้ใช้ตำแหน่งเดิม (ไม่ต้องทำอะไร)
      
      existing.lastMoveAt = Date.now();
    } else {
      // สร้าง player ใหม่
      const sp = randomSpawnInZone();
      gr.players.set(uid, {
        uid,
        name,
        color,
        char,
        x: sp.x,
        y: sp.y,
        socketId: socket.id,
        room,
        lastMoveAt: Date.now(),
        role: null,
      });
    }

    // bind player identity กับ socket ตัวนี้
    socket.data.room = room;
    socket.data.uid  = uid;

    socket.join(room);
    console.log(`👋 ${name} (${uid}) joined ${room} with socketId ${socket.id}`);

    // ⭐ ตอบกลับให้ client รู้ว่า server ได้รับ game:join แล้ว
    socket.emit("game:join:ack", { success: true, uid, room });

    io.to(room).emit("snapshot", {
      room,
      players: Array.from(gr.players.values()),
    });

    // ถ้าเกมเริ่มแล้ว แต่ผู้เล่นนี้ยังไม่มีบทบาท (กรณี join กลางเกมหรือรีเฟรชหลุดตอนแจกบทบาท)
    try {
      const p = gr.players.get(uid);
      if (gr.gameStarted && p && !p.role) {
        // ค่าปลอดภัย: ใส่ Visitor ให้ไปก่อน แล้วมอบหมาย task ทันที
        p.role = 'Visitor';
        gr.visitorTargets?.add?.(uid);
        assignTasksToPlayer(gr, uid, { force: true });
      }
    } catch {}
  });

  // MOVE (อัปเดตตำแหน่งผู้เล่นคนนั้น แล้ว broadcast)
  socket.on("player:move", (data = {}) => {
    const room = socket.data.room;
    const uid  = socket.data.uid;
    if (!room || !uid) return;

    const gr = gameRooms[room];
    if (!gr) return;

    const p = gr.players.get(uid);
    if (!p) return;

    // ใช้ค่าจาก data.x / data.y ถ้ามาเป็นตัวเลข
    if (typeof data.x === "number") p.x = data.x;
    if (typeof data.y === "number") p.y = data.y;
    p.lastMoveAt = data.ts || Date.now();

    // ยิง delta เล็ก ๆ (optional: clientอาจไม่ใช้ก็ได้)
    io.to(room).volatile.emit("player:movedelta", {
      uid,
      x: p.x,
      y: p.y,
      ts: p.lastMoveAt,
    });

    // ยิง snapshot ใหม่ทันที (ทันใจกว่าแค่รอ tickRoom)
    io.to(room).volatile.emit("snapshot", {
      room,
      players: Array.from(gr.players.values()),
    });
  });

  // MEETING START
  socket.on('meeting:start', (data) => {
    const room = data?.room;
    if (!room) return;
    console.log(`📞 Meeting triggered in room ${room}`);
    io.to(room).emit('meeting:start', data);
  });

  // ===============================
  // GAME START (Task Assignment)
  // ===============================
  socket.on("game:start", (data = {}) => {
    const { room } = data;
    if (!room) {
      console.error("❌ game:start received without room!");
      return;
    }

    const gr = gameRooms[room];
    if (!gr) {
      console.error(`❌ Room ${room} not found!`);
      return;
    }
    
    if (gr.gameStarted) {
      console.warn(`⚠️ Room ${room} already started, ignoring duplicate game:start`);
      return;
    }

    gr.gameStarted = true;
    gr.visitorTargets = new Set(); // reset targets at start
    const rosterAll = Array.from(gr.players.values());
    const roster = rosterAll.filter(p => io.sockets.sockets.get(p.socketId)); // ใช้เฉพาะคนที่ยังต่อ socket อยู่จริง
    const N = roster.length;
    const ghost = rosterAll.length - N;
    console.log(`🎮 Game starting in room ${room} with ${N} connected players${ghost>0?` (filtered ${ghost} disconnected)`:''}`);

    if (N < 3) {
      console.warn(`🚫 Not enough players to start game in ${room} (N=${N}, minimum 3 required)`);
      io.to(room).emit('game:error', { message: 'ต้องมีอย่างน้อย 3 คนถึงจะเริ่มเกมได้' });
      return;
    }

    const T = decideThievesCount(N);
    const indices = shuffleInPlace([...Array(N).keys()]);
    const thiefIdx = new Set(indices.slice(0, T));

    // assign roles
    roster.forEach((p, i) => {
      p.role = thiefIdx.has(i) ? 'Thief' : 'Visitor';
    });

    // Emit role + tasks per player
    for (const p of roster) {
      const uid = p.uid;
      console.log(`📤 Sending tasks to ${p.name} (${uid}) via socketId: ${p.socketId}, role: ${p.role}`);
      if (p.role === 'Visitor') {
        gr.visitorTargets.add(uid);
        assignTasksToPlayer(gr, uid, { force: true });
      } else {
        const targetSocket = io.sockets.sockets.get(p.socketId);
        if (targetSocket){
          targetSocket.emit('tasks:assigned', { role: 'Thief', waves: [], currentWave: 0 });
          console.log(`🎭 Role -> Thief assigned to ${p.name}`);
        } else {
          console.error(`❌ Socket ${p.socketId} not found for ${p.name}!`);
        }
      }
    }

    // Post-emit resync: re-emit roles/tasks shortly after start to catch late listeners
    setTimeout(() => {
      try {
        for (const [uid, p] of gr.players.entries()) {
          const targetSocket = io.sockets.sockets.get(p.socketId);
          if (!targetSocket) continue;
          if (p.role === 'Visitor') {
            assignTasksToPlayer(gr, uid, { force: false });
          } else {
            targetSocket.emit('tasks:assigned', { role: 'Thief', waves: [], currentWave: 0 });
          }
        }
        console.log(`🔁 Post-emit tasks/roles re-sent in room ${room}`);
      } catch (e) {
        console.warn('post-emit resend failed', e);
      }
    }, 300);
  });

  // ===============================
  // SET ROLE (จาก client หลัง reveal)
  // ===============================
  socket.on('role:set', (data = {}) => {
    const room = data.room || socket.data.room;
    const uid  = data.uid  || socket.data.uid;
    const role = (data.role || '').toString();
    if (!room || !uid || !role) return;
    const gr = gameRooms[room];
    if (!gr) return;
    const p = gr.players.get(uid);
    if (!p) return;
    // If role already assigned by server (authoritative), ignore client request
    if (p.role) {
      console.log(`ℹ️ role:set ignored for ${uid} (already ${p.role})`);
      return;
    }
    p.role = role === 'Thief' ? 'Thief' : 'Visitor';
    console.log(`🎭 role:set -> ${p.name} (${uid}) = ${p.role} in room ${room}`);

    if (p.role === 'Visitor') {
      gr.visitorTargets.add(uid);
      assignTasksToPlayer(gr, uid, { force: true });
    } else {
      // ถ้าเป็น Thief ให้เคลียร์ tasks ที่อาจถูกกำหนดก่อนหน้า แล้วบอกสถานะ Thief
      p.waves = [];
      p.currentWave = 0;
      p.completedTasks = [];
      const targetSocket = io.sockets.sockets.get(p.socketId);
      if (targetSocket){
        targetSocket.emit('tasks:assigned', { role: 'Thief', waves: [], currentWave: 0 });
      }
    }
  });

  // ===== Request tasks (robust re-emit) =====
  socket.on('tasks:request', (data = {}) => {
    const room = data.room || socket.data.room;
    const uid  = data.uid  || socket.data.uid;
    if (!room || !uid) { console.warn('tasks:request missing room/uid', { room, uid }); return; }
    const gr = gameRooms[room];
    if (!gr) { console.warn('tasks:request: room not found', room); return; }
    console.log(`📦 tasks:request from ${uid} in room ${room}`);
    assignTasksToPlayer(gr, uid, { force: false });
  });

  // ===============================
  // GAME RESET (เมื่อกลับ Lobby)
  // ===============================
  socket.on("game:reset", (data = {}) => {
    const { room } = data;
    if (!room) return;

    const gr = gameRooms[room];
    if (!gr) return;

    // รีเซ็ต game state
    gr.gameStarted = false;
    
    // รีเซ็ต task data ของทุกคน
    for (const [uid, player] of gr.players.entries()) {
      player.waves = [];
      player.currentWave = 0;
      player.completedTasks = [];
      player.ready = false; // รีเซ็ต ready state ด้วย
    }
    
    console.log(`🔄 Game reset in room ${room}`);
  });

  // ===============================
  // TASK COMPLETE
  // ===============================
  socket.on("task:complete", (data = {}) => {
    const room = socket.data.room;
    const uid = socket.data.uid;
    const { taskName } = data;

    if (!room || !uid || !taskName) return;

    const gr = gameRooms[room];
    if (!gr) return;

    const player = gr.players.get(uid);
    if (!player || player.role !== "Visitor") return;

    // เช็คว่าทำภารกิจนี้ไปแล้วหรือยัง
    if (player.completedTasks.includes(taskName)) return;

    // บันทึกว่าทำเสร็จแล้ว
    player.completedTasks.push(taskName);
    console.log(`✅ ${player.name} completed task: ${taskName} (${player.completedTasks.length}/8)`);

    // เช็คว่าจบ wave ปัจจุบันหรือยัง
    const currentWaveIndex = player.currentWave - 1;
    const currentWaveTasks = player.waves[currentWaveIndex] || [];
    const completedInThisWave = currentWaveTasks.filter(t => player.completedTasks.includes(t));

    if (completedInThisWave.length === currentWaveTasks.length && player.currentWave < 3) {
      // ปลดล็อค wave ถัดไป
      player.currentWave++;
      const targetSocket = io.sockets.sockets.get(player.socketId);
      if (targetSocket) {
        targetSocket.emit("wave:unlock", {
          currentWave: player.currentWave,
          unlockedTasks: player.waves[player.currentWave - 1]
        });
        console.log(`🔓 ${player.name} unlocked Wave ${player.currentWave}`);
      }
    }

    // เช็คว่า Visitor ที่เป็นเป้าหมายในเกมนี้ทำครบ 8/8 หรือยัง
    const targets = gr.visitorTargets && gr.visitorTargets.size > 0
      ? Array.from(gr.visitorTargets).map(id => gr.players.get(id)).filter(Boolean)
      : Array.from(gr.players.values()).filter(p => p.role === 'Visitor');
    const allComplete = targets.length > 0 && targets.every(p => Array.isArray(p.completedTasks) && p.completedTasks.length === 8);

    if (allComplete && targets.length > 0) {
      console.log(`🎉 All Visitors completed their tasks in room ${room}!`);
      io.to(room).emit("game:visitorsWin", {
        message: "Visitors Win!"
      });
    }
  });

  // ===============================
  // CHAT (per-room)
  // ===============================
  // CHAT (เลือกเก็บตัวเดียวพอ)
  socket.on("chat:message", (data = {}) => {
    // รูปแบบ data ที่ client ส่งควรมี { text, uid, name, room? }
    if (!data?.text || !data?.uid) return;

    // ถ้า client ไม่ส่ง room มาก็ใช้ socket.data.room
    const room = data.room || socket.data.room;
    if (!room) {
      console.warn("⚠️ chat:message ไม่มี room:", data);
      return;
    }

    const payload = {
      room,
      uid: data.uid,
      name: data.name || "Unknown",
      text: String(data.text).slice(0, 500),
      ts: Date.now(),
    };

    io.to(room).emit("chat:message", payload);
    console.log(`💬 [${room}] ${payload.name}: ${payload.text}`);
  });

  // DISCONNECT (grace 5s ก่อนลบออกจากห้อง)
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    const GRACE_MS = 5000;

    for (const [room, gr] of Object.entries(gameRooms)) {
      for (const [uid, p] of gr.players.entries()) {
        if (p.socketId === socket.id) {
          if (gr.removeTimers.has(uid)) clearTimeout(gr.removeTimers.get(uid));

          const t = setTimeout(() => {
            try {
              gr.players.delete(uid);
              gr.removeTimers.delete(uid);
              try { gr.visitorTargets?.delete(uid); } catch {}
              console.log(`🗑️ Player ${uid} removed from room ${room} after disconnect timeout`);

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
          }, GRACE_MS);

          gr.removeTimers.set(uid, t);
        }
      }
    }
  });

  // ===============================
  // STATE RESUME (for F5 refresh)
  // ===============================
  socket.on('state:request', (data = {}) => {
    const room = data.room || socket.data.room;
    const uid  = data.uid  || socket.data.uid;
    if (!room || !uid) return;
    const gr = gameRooms[room];
    if (!gr) return;
    const p = gr.players.get(uid);
    if (!p) return;
    const targetSocket = io.sockets.sockets.get(p.socketId);
    if (!targetSocket) return;
    targetSocket.emit('state:resume', {
      role: p.role || null,
      waves: Array.isArray(p.waves) ? p.waves : [],
      currentWave: p.currentWave || 0,
      completedTasks: Array.isArray(p.completedTasks) ? p.completedTasks : [],
      ...(function(){ const sp = ensureSpawn(p.x, p.y); return { x: sp.x, y: sp.y }; })(),
    });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
