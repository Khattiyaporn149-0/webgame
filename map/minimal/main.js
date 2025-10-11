// ===============================
// 🌍 MINIMAL MAP VIEWER + WALLS
// ===============================

// === CONFIG ===
const TILE_SIZE = 140;
let zoom = 1;

// === CANVAS ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// === BACKGROUND IMAGE ===
const bgImg = new Image();
let bgReady = false;
const BG_URL = new URL('../MAP.png', import.meta.url);
bgImg.onload = () => { 
  bgReady = true; 
  initWorldFromImage(); 
  draw(); 
};
bgImg.onerror = (e) => { 
  console.error('Failed to load bg', BG_URL.href, e); 
  draw(); 
};
bgImg.src = BG_URL.href;

// === WORLD STATE ===
let world = {
  widthPx: 1000,
  heightPx: 800,
  cols: 0,
  rows: 0,
};

// === PLAYER ===
let player = { x: 1, y: 1 };

// === WALLS (load from file) ===
let walls = [];

// โหลดไฟล์ wall.json
fetch('./wall.json')
  .then(r => r.json())
  .then(data => {
    walls = [];
    for (const item of data) {
      const [x1,y1] = item.from;
      const [x2,y2] = item.to;
      walls.push(...addWallLine(x1,y1,x2,y2));
    }
    console.log(`✅ Loaded ${walls.length} wall tiles`);
    draw();
  });
function addWallLine(x1, y1, x2, y2) {
  const lineWalls = [];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)); // จำนวนขั้นตอนที่ต้องการ
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + (dx * i) / steps);  
    const y = Math.round(y1 + (dy * i) / steps);
    lineWalls.push([x, y]);
  } 
  return lineWalls;
}


// === INIT WORLD ===
function initWorldFromImage() {
  world.widthPx = bgImg.naturalWidth;
  world.heightPx = bgImg.naturalHeight;
  world.cols = Math.max(1, Math.floor(world.widthPx / TILE_SIZE));
  world.rows = Math.max(1, Math.floor(world.heightPx / TILE_SIZE));
  player.x = Math.min(Math.max(0, player.x), world.cols - 1);
  player.y = Math.min(Math.max(0, player.y), world.rows - 1);
}

// === CAMERA ===
function getCamera() {
  const viewW = Math.floor(canvas.width / zoom);
  const viewH = Math.floor(canvas.height / zoom);
  const playerPX = player.x * TILE_SIZE + TILE_SIZE / 2;
  const playerPY = player.y * TILE_SIZE + TILE_SIZE / 2;

  let sx = Math.floor(playerPX - viewW / 2);
  let sy = Math.floor(playerPY - viewH / 2);

  const maxSX = Math.max(0, world.widthPx - viewW);
  const maxSY = Math.max(0, world.heightPx - viewH);
  sx = Math.max(0, Math.min(sx, maxSX));
  sy = Math.max(0, Math.min(sy, maxSY));

  return { sx, sy, sw: viewW, sh: viewH };
}

// === DRAW ===
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { sx, sy, sw, sh } = getCamera();

  // วาดพื้นหลัง
  if (bgReady) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0d1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // วาดกริด
  const colStart = Math.floor(sx / TILE_SIZE);
  const rowStart = Math.floor(sy / TILE_SIZE);
  const colEnd = Math.min(world.cols, Math.ceil((sx + sw) / TILE_SIZE));
  const rowEnd = Math.min(world.rows, Math.ceil((sy + sh) / TILE_SIZE));

  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-sx, -sy);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '12px monospace';

  for (let y = rowStart; y <= rowEnd; y++) {
    ctx.beginPath();
    ctx.moveTo(colStart * TILE_SIZE, y * TILE_SIZE + 0.5);
    ctx.lineTo(colEnd * TILE_SIZE, y * TILE_SIZE + 0.5);
    ctx.stroke();
  }
  for (let x = colStart; x <= colEnd; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE_SIZE + 0.5, rowStart * TILE_SIZE);
    ctx.lineTo(x * TILE_SIZE + 0.5, rowEnd * TILE_SIZE);
    ctx.stroke();
  }

  // label x,y
  for (let gy = rowStart; gy < rowEnd; gy++) {
    for (let gx = colStart; gx < colEnd; gx++) {
      ctx.fillText(`${gx},${gy}`, gx * TILE_SIZE + 4, gy * TILE_SIZE + 12);
    }
  }

  // วาดกำแพง (red transparent)
  ctx.fillStyle = 'rgba(255,0,0,0.4)';
  for (const [wx, wy] of walls) {
    ctx.fillRect(wx * TILE_SIZE, wy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  // วาดผู้เล่น
  const px = player.x * TILE_SIZE + TILE_SIZE / 2;
  const py = player.y * TILE_SIZE + TILE_SIZE / 2;
  ctx.fillStyle = '#59c9a5';
  ctx.beginPath();
  ctx.arc(px, py, Math.max(8, TILE_SIZE * 0.4), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// === WALL CHECK ===
function isWall(x, y) {
  return walls.some(([wx, wy]) => wx === x && wy === y);
}

// === CONTROL ===
function keyToMove(e) {
  switch (e.key) {
    case 'ArrowUp':
    case 'w': case 'W': return [0, -1];
    case 'ArrowDown':
    case 's': case 'S': return [0, 1];
    case 'ArrowLeft':
    case 'a': case 'A': return [-1, 0];
    case 'ArrowRight':
    case 'd': case 'D': return [1, 0];
    default: return null;
  }
}

document.addEventListener('keydown', (e) => {
  const d = keyToMove(e);
  if (!d) return;
  const [dx, dy] = d;

  const nx = Math.max(0, Math.min(player.x + dx, world.cols - 1));
  const ny = Math.max(0, Math.min(player.y + dy, world.rows - 1));

  if (isWall(nx, ny)) {
    console.log('🚫 ชนกำแพงที่', nx, ny);
    return;
  }

  player.x = nx;
  player.y = ny;
  draw();
});

// === RESIZE HANDLER ===
function resizeCanvasToWindow() {
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  draw();
}
window.addEventListener('resize', resizeCanvasToWindow);
resizeCanvasToWindow();
