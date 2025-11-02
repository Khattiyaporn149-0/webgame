// server.js
// จุดเริ่มต้น server + register socket.io

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { PORT } = require("./constants");
const registerSocketHandlers = require("./socketHandler");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../client/public")));

// เชื่อม socket handler
registerSocketHandlers(io);

// เริ่ม server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
