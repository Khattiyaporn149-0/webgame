const canvas = document.getElementById("bgCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawBackground();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// 🌌 ฟังก์ชันวาดพื้นหลัง
function drawBackground() {
  const w = canvas.width;
  const h = canvas.height;
  const radius = Math.min(w, h) * 0.6;

  // พื้นหลังนุ่ม ๆ ไล่สี
  const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * 0.2, w / 2, h / 2, radius);
  gradient.addColorStop(0, "#1e2130");
  gradient.addColorStop(1, "#0b0d12");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // วาดวงกลมโค้งมนแบบ soft glow
  const circleGradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, radius * 0.8);
  circleGradient.addColorStop(0, "rgba(0, 200, 255, 0.2)");
  circleGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = circleGradient;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
  ctx.fill();

  // ⭐ เพิ่มดาวหลังพื้นหลังวาดเสร็จ
  drawStars();
}

// ฟังก์ชันวาดดาว
function drawStars() {
  const w = canvas.width;
  const h = canvas.height;
  const starCount = Math.min(120, Math.floor((w * h) / 8000));
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const radius = Math.random() * 1.5 + 0.5;
    const alpha = Math.random() * 0.5 + 0.3;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
// วาดพื้นหลังครั้งแรก
drawBackground();
// วาดพื้นหลังทุก 10 วินาทีเพื่อให้ดาวกระพริบ
setInterval(drawBackground, 100000000);
