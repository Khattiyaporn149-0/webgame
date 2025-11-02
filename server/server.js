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

// Serve static files for the web client
// Public root
app.use(express.static(path.join(__dirname, "../client/public")));
// Additional mounts for module and asset paths used by HTML
app.use('/src', express.static(path.join(__dirname, "../client/src")));
app.use('/styles', express.static(path.join(__dirname, "../client/styles")));
app.use('/assets', express.static(path.join(__dirname, "../client/assets")));

// เชื่อม socket handler
registerSocketHandlers(io);

// เริ่ม server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
