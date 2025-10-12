const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../client")));
const PORT = 3000;

// memory
const gameRooms = {};
function ensureGameRoom(code) {
  if (!gameRooms[code]) {
    gameRooms[code] = { players: new Map(), interval: null };
    gameRooms[code].interval = setInterval(() => tickRoom(code), 100);
  }
  return gameRooms[code];
}

function tickRoom(code) {
  const gr = gameRooms[code];
  if (!gr) return;
  const payload = {
    players: Array.from(gr.players.values())
  };
  io.to(code).volatile.emit("snapshot", payload);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // ===============================
  // JOIN ROOM
  // ===============================
  socket.on("game:join", (data) => {
    const { room, uid, name, color, x, y } = data;
    if (!room || !uid) return;
    const gr = ensureGameRoom(room);
    gr.players.set(uid, {
      uid, name, color, x, y,
      socketId: socket.id,
    });
    socket.join(room);
    console.log(`👋 ${name} joined ${room}`);
    io.to(room).emit("snapshot", { players: Array.from(gr.players.values()) });
  });

  // ===============================
  // MOVE
  // ===============================
  socket.on("player:move", (data) => {
    const { uid, x, y } = data;
    if (!uid) return;
    for (const [room, gr] of Object.entries(gameRooms)) {
      if (gr.players.has(uid)) {
        const p = gr.players.get(uid);
        p.x = x; p.y = y;
        io.to(room).volatile.emit("snapshot", { players: Array.from(gr.players.values()) });
        return;
      }
    }
  });



  // ===============================
  // DISCONNECT
  // ===============================
  socket.on("disconnect", () => {
    for (const [room, gr] of Object.entries(gameRooms)) {
      for (const [uid, p] of gr.players.entries()) {
        if (p.socketId === socket.id) {
          gr.players.delete(uid);
        }
      }
      if (gr.players.size === 0) {
        clearInterval(gr.interval);
        delete gameRooms[room];
        console.log(`🗑️ Room cleared: ${room}`);
      }
    }
    console.log("🔴 Disconnected:", socket.id);
  });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
