// เชื่อมต่อกับ server (Render URL ของนาย)
const socket = io("https://webgame-25n5.onrender.com")

// สร้างห้องใหม่
function createRoom() {
  socket.emit("createRoom")
}

// เข้าห้องด้วยโค้ด
function joinRoom(code) {
  socket.emit("joinRoom", code)
}

// เมื่อสร้างห้องสำเร็จ
socket.on("roomCreated", (code) => {
  alert(`✅ ห้องของคุณคือ ${code}`)
})

// เมื่อเข้าห้องสำเร็จ
socket.on("joinedRoom", (code) => {
  alert(`🎮 เข้าห้อง ${code} สำเร็จ!`)
})

// เมื่อมีผู้เล่นใหม่ในห้อง
socket.on("newPlayer", (id) => {
  console.log("👥 ผู้เล่นใหม่เข้ามา:", id)
})

// เมื่อเกิด error เช่น ใส่โค้ดห้องผิด
socket.on("error", (msg) => alert(msg))

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
