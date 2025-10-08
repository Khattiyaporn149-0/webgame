// ======== เชื่อมต่อกับ Socket.IO Server ========
const socket = io("https://webgame-25n5.onrender.com")

// ======== อ้างอิง element จากหน้า HTML ========
const btnJoin = document.getElementById("btnJoin")
const btnCreate = document.getElementById("btnCreate")
const joinCodeInput = document.getElementById("joinCodeInput")

// ======== ตัวแปรเก็บสถานะ ========
let currentRoom = null

// ======== Event ปุ่มหลัก ========
btnJoin.addEventListener("click", () => {
  createRoom()
})

btnCreate.addEventListener("click", () => {
  askRoomCode()
})

// สร้าง modal หรือ prompt ให้กรอกโค้ด (แบบง่ายก่อน)
function askRoomCode() {
  const code = prompt("ใส่รหัสห้อง (4 ตัว) หรือเว้นว่างเพื่อสร้างห้องใหม่")
  if (!code) {
    createRoom()
  } else {
    joinRoom(code.trim().toUpperCase())
  }
}

// ======== Event ปุ่มหลัก ========
btnJoin.addEventListener("click", () => {
  // Quick play = สร้างห้องใหม่เลย
  createRoom()
})

btnCreate.addEventListener("click", () => {
  // Custom = เลือกว่าจะสร้างหรือ join
  askRoomCode()
})

// ======== ฟังก์ชัน Create / Join ห้อง ========
function createRoom() {
  console.log("📤 สร้างห้องใหม่")
  socket.emit("createRoom")
}

function joinRoom(code) {
  console.log("📤 เข้าห้องด้วยโค้ด:", code)
  socket.emit("joinRoom", code)
}

// ======== ฟัง event กลับจาก server ========
socket.on("roomCreated", (code) => {
  // ✅ หลังสร้างห้องสำเร็จ ให้เปลี่ยนไปหน้าเกมพร้อมส่งโค้ดไปใน URL
  window.location.href = `game.html?room=${code}`
})

socket.on("joinedRoom", (code) => {
  // ✅ หลัง join ห้องสำเร็จ
  window.location.href = `game.html?room=${code}`
})

socket.on("error", (msg) => {
  alert("⚠️ " + msg)
})

// ======== ฟังผู้เล่นใหม่ (ถ้ามี) ========
socket.on("newPlayer", (id) => {
  console.log("👥 ผู้เล่นใหม่เข้ามา:", id)
})
// ======= ส่วนเดิมของเกม (ตัวละครเดิน) =======
const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")
const speed = 3
let players = {}
let myId = null

socket.on("connect", () => {
  myId = socket.id
  console.log("My ID:", myId)
})

socket.on("playerMoved", (data) => {
  if (!players[data.id]) players[data.id] = { x: data.x, y: data.y, color: "blue" }
  else {
    players[data.id].x = data.x
    players[data.id].y = data.y
  }
  draw()
})

let keys = {}
document.addEventListener("keydown", (e) => (keys[e.key] = true))
document.addEventListener("keyup", (e) => (keys[e.key] = false))

let lastSend = 0
function update() {
  const now = Date.now()
  const me = players[myId] || (players[myId] = { x: 100, y: 100, color: "red" })
  if (keys["ArrowUp"] || keys["w"]) me.y -= speed
  if (keys["ArrowDown"] || keys["s"]) me.y += speed
  if (keys["ArrowLeft"] || keys["a"]) me.x -= speed
  if (keys["ArrowRight"] || keys["d"]) me.x += speed

  // ส่งตำแหน่งทุก 50ms แทนที่จะทุก frame
  if (now - lastSend > 50) {
    socket.emit("move", { x: me.x, y: me.y })
    lastSend = now
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (let id in players) {
    const p = players[id]
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
    ctx.fill()
  }
}

function loop() {
  update()
  draw()
  requestAnimationFrame(loop)
}
loop()