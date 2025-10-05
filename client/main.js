const socket = io();

// ตัวแปรเกม
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const speed = 3;

let players = {}; // เก็บผู้เล่นทั้งหมด
let myId = null;

// เมื่อเชื่อมต่อ
socket.on("connect", () => {
  myId = socket.id;
  console.log("My ID:", myId);
});

// รับข้อมูลผู้เล่นทั้งหมด
socket.on("currentPlayers", (data) => {
  players = data;
  draw();
});

// มีผู้เล่นใหม่
socket.on("newPlayer", (player) => {
  players[player.id] = player;
  draw();
});

// ผู้เล่นเคลื่อนไหว
socket.on("playerMoved", (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    draw();
  }
});

// ผู้เล่นออก
socket.on("removePlayer", (id) => {
  delete players[id];
  draw();
});

// การควบคุม
let keys = {};
document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

function update() {
  const me = players[myId];
  if (!me) return;

  if (keys["ArrowUp"] || keys["w"]) me.y -= speed;
  if (keys["ArrowDown"] || keys["s"]) me.y += speed;
  if (keys["ArrowLeft"] || keys["a"]) me.x -= speed;
  if (keys["ArrowRight"] || keys["d"]) me.x += speed;

  socket.emit("move", { x: me.x, y: me.y });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
