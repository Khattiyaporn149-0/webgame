// ===== เชื่อมกับ server =====
const socket = io()

// ===== ดึงรหัสห้องจาก URL =====
const params = new URLSearchParams(window.location.search)
const roomCode = params.get("room")
document.getElementById("roomCodeText").textContent = roomCode

// ===== เตรียม Canvas =====
const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")

// ===== ตัวอย่าง: ผู้เล่นเรา =====
let player = { x: 100, y: 100, color: randomColor() }

// วาดตัวเราเอง
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = player.color
  ctx.fillRect(player.x, player.y, 50, 50)
  requestAnimationFrame(draw)
}
draw()

// ===== ขยับด้วยแป้นลูกศร =====
document.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowUp": player.y -= 10; break
    case "ArrowDown": player.y += 10; break
    case "ArrowLeft": player.x -= 10; break
    case "ArrowRight": player.x += 10; break
  }
  socket.emit("move", { room: roomCode, player })
})

// ===== รับตำแหน่งจากคนอื่น =====
let others = {}

socket.on("playerMoved", (data) => {
  others[data.id] = data.player
})

// ===== Helper =====
function randomColor() {
  return `hsl(${Math.random() * 360}, 70%, 50%)`
}