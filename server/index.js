const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../client")));

let players = {}; // เก็บสถานะผู้เล่นทั้งหมด

io.on("connection", socket => {
  console.log("✅ New player connected:", socket.id);

  // spawn player ใหม่
  players[socket.id] = { x: 100, y: 100, color: randomColor() };

  // ส่งข้อมูล player ทั้งหมดกลับไปให้ client
  socket.emit("currentPlayers", players);
  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

  // รับข้อมูลการเคลื่อนไหว
  socket.on("move", data => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      io.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Player disconnected:", socket.id);
    delete players[socket.id];
    io.emit("removePlayer", socket.id);
  });
});

function randomColor() {
  const colors = ["red", "blue", "green", "orange", "purple", "pink"];
  return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));


