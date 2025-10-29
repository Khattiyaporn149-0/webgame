const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../client")));
const PORT = 3000;

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
      // อัปเดต player ที่มีอยู่
      existing.socketId = socket.id;
      existing.name  = name  || existing.name;
      existing.color = color || existing.color;
      existing.char  = char  || existing.char;
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

    // bind player identity กับ socket ตัวนี้
    socket.data.room = room;
    socket.data.uid  = uid;

    socket.join(room);
    console.log(`👋 ${name} joined ${room}`);

    io.to(room).emit("snapshot", {
      room,
      players: Array.from(gr.players.values()),
    });
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
    if (!room) return;

    const gr = gameRooms[room];
    if (!gr || gr.gameStarted) return;

    gr.gameStarted = true;
    console.log(`🎮 Game starting in room ${room}`);

    // วนส่งภารกิจให้แต่ละคน
    for (const [uid, player] of gr.players.entries()) {
      const role = player.role || "Visitor"; // ใช้ role ที่มีอยู่แล้ว หรือ default เป็น Visitor

      if (role === "Visitor") {
        // สุ่มลำดับภารกิจ 8 อัน
        const shuffled = shuffleArray(MINIGAMES);
        
        // แบ่งเป็น 3 ระลอก: 2 + 3 + 3
        const waves = [
          shuffled.slice(0, 2),   // Wave 1: 2 tasks
          shuffled.slice(2, 5),   // Wave 2: 3 tasks
          shuffled.slice(5, 8)    // Wave 3: 3 tasks
        ];

        // เก็บข้อมูลไว้ที่ player object
        player.waves = waves;
        player.currentWave = 1;
        player.completedTasks = [];

        // ส่งไปให้ client ของคนนั้น
        const targetSocket = io.sockets.sockets.get(player.socketId);
        if (targetSocket) {
          targetSocket.emit("tasks:assigned", {
            role,
            waves,
            currentWave: 1
          });
          console.log(`✅ Tasks assigned to ${player.name} (Visitor)`);
        }
      } else if (role === "Thief") {
        // Thief ไม่มีระบบภารกิจ
        const targetSocket = io.sockets.sockets.get(player.socketId);
        if (targetSocket) {
          targetSocket.emit("tasks:assigned", {
            role: "Thief",
            waves: [],
            currentWave: 0
          });
          console.log(`✅ Role assigned to ${player.name} (Thief)`);
        }
      }
    }
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

    // เช็คว่า Visitor ทุกคนทำครบ 8/8 หรือยัง
    const allVisitors = Array.from(gr.players.values()).filter(p => p.role === "Visitor");
    const allComplete = allVisitors.every(p => p.completedTasks && p.completedTasks.length === 8);

    if (allComplete && allVisitors.length > 0) {
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
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
