(() => {
  // ===========================================================
  // 🌍 1) OVERWORLD MAP SYSTEM
  // ===========================================================
  const world = document.getElementById("world");
  const wctx = world.getContext("2d");
  const keys = {};
  let overlayOpen = false;

  const CFG = window.MINIGAMES_CONFIG || {};
  const W = (world.width = Math.max(100, Math.min(1600, CFG.world?.width || 800)));
  const H = (world.height = Math.max(100, Math.min(1200, CFG.world?.height || 450)));

  const player = {
    x: 150,
    y: 220,
    r: CFG.world?.playerRadius || 16,
    speed: CFG.world?.playerSpeed || 210,
  };

  // จุด mission ใน overworld
  let objects = [
    { key: "dodge",   label: "Dodge Square",  x: 120, y: 130, color: "#FFD54F", r: 26 },
    { key: "react",   label: "Reaction",       x: 400, y: 120, color: "#52E0FF", r: 26 },
    { key: "aim",     label: "Aim Trainer",    x: 650, y: 100, color: "#FF8A80", r: 26 },
    { key: "speedtap",label: "Speed Tap",      x: 120, y: 300, color: "#FF80AB", r: 26 },
    { key: "wires",   label: "Fix Wiring",     x: 280, y: 280, color: "#FFD740", r: 28 },
    { key: "upload",  label: "Upload Data",    x: 500, y: 260, color: "#64B5F6", r: 28 },
    { key: "mix",     label: "Mix Chemical",   x: 700, y: 300, color: "#81C784", r: 28 },
    { key: "switch",  label: "Power Switch",   x: 200, y: 400, color: "#90CAF9", r: 28 },
    { key: "card",    label: "Swipe Card",     x: 430, y: 420, color: "#FFB74D", r: 28 },
    { key: "timer",   label: "Perfect Timer",  x: 660, y: 420, color: "#CE93D8", r: 28 },
    { key: "align",   label: "Align Engine",   x: 780, y: 240, color: "#4DB6AC", r: 28 },
    // Extra minigames (added)
    { key: "simon",   label: "Simon Says",     x: 240, y: 210, color: "#9C27B0", r: 26 },
    { key: "pipes",   label: "Pipe Connect",   x: 560, y: 210, color: "#00BCD4", r: 26 },
    { key: "math",    label: "Quick Math",     x: 720, y: 160, color: "#8BC34A", r: 26 },
    { key: "rhythm",  label: "Rhythm Tap",     x: 320, y: 340, color: "#E91E63", r: 26 },
    { key: "pattern", label: "Pattern Lock",   x: 620, y: 360, color: "#3F51B5", r: 26 },
    { key: "lights",  label: "Lights Out",     x: 250, y: 180, color: "#FFC107", r: 26 },
    { key: "mole",    label: "Whack-a-Mole",   x: 340, y: 420, color: "#FF7043", r: 26 },
    { key: "slider",  label: "Slider Puzzle",  x: 680, y: 200, color: "#8D6E63", r: 26 },
    { key: "mop",     label: "Mop Floor",      x: 520, y: 360, color: "#4FC3F7", r: 26 },
  ];

  // If external config provides objects, normalize and override
  if (Array.isArray(CFG.objects) && CFG.objects.length) {
    objects = CFG.objects.map(o => ({
      key: o.key,
      kind: o.kind || 'interact',
      label: o.label || o.key,
      x: o.x|0, y: o.y|0,
      color: o.color || '#FFD54F',
      shape: o.shape?.type === 'rect' ? { type:'rect', w: Math.max(4, o.shape.w|0), h: Math.max(4, o.shape.h|0) }
                                      : { type:'circle', r: Math.max(4, o.shape?.r|0 || (o.r|0) || 24) },
      game: (o.game || o.key || '').toLowerCase(),
    }));
  } else {
    // Backward compat: convert old {r} entries to circle shape
    objects = objects.map(o => ({ ...o, kind: 'interact', shape: { type:'circle', r: o.r || 24 }, game: (o.key||'').toLowerCase() }));
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Keyboard input
  document.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (e.key === "Escape" && overlayOpen) closeAnyOverlay();
  });
  document.addEventListener("keyup", (e) => (keys[e.key] = false));

  // --- Collision helpers ---
  function resolveCircleCollision(px, py, pr, ox, oy, or) {
    const dx = px - ox, dy = py - oy; const dist = Math.hypot(dx,dy) || 0.00001;
    const overlap = pr + or - dist;
    if (overlap > 0) { const nx = dx / dist, ny = dy / dist; return { x: px + nx*overlap, y: py + ny*overlap, hit: true }; }
    return { x: px, y: py, hit: false };
  }
  function resolveCircleRectCollision(px, py, pr, rx, ry, rw, rh) {
    const hx = rw/2, hy = rh/2;
    const cx = Math.max(rx - hx, Math.min(px, rx + hx));
    const cy = Math.max(ry - hy, Math.min(py, ry + hy));
    const dx = px - cx, dy = py - cy; const dist = Math.hypot(dx,dy);
    if (dist < pr) { const inv=(dist||0.00001); const nx=dx/inv, ny=dy/inv; const overlap = pr - dist; return { x: px + nx*overlap, y: py + ny*overlap, hit:true }; }
    return { x: px, y: py, hit:false };
  }
  function circleNearRect(px, py, pr, rx, ry, rw, rh, extra=6){
    const hx=rw/2, hy=rh/2; const cx=Math.max(rx-hx, Math.min(px, rx+hx)); const cy=Math.max(ry-hy, Math.min(py, ry+hy));
    return Math.hypot(px-cx, py-cy) <= pr + extra;
  }

  let lastInteractAt = 0;

  function updateWorld(dt) {
    if (overlayOpen) return;
    let ax = keys["a"] || keys["A"] || keys["ArrowLeft"] ? -1 : 0;
    let bx = keys["d"] || keys["D"] || keys["ArrowRight"] ? 1 : 0;
    let ay = keys["w"] || keys["W"] || keys["ArrowUp"] ? -1 : 0;
    let by = keys["s"] || keys["S"] || keys["ArrowDown"] ? 1 : 0;
    let dx = ax + bx,
      dy = ay + by;

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * player.speed * dt;
      dy = (dy / len) * player.speed * dt;
      let nx = clamp(player.x + dx, player.r, W - player.r);
      let ny = clamp(player.y + dy, player.r, H - player.r);
      // collide with all objects (treat as solid)
      for (const o of objects) {
        if (o.shape?.type === 'rect') {
          const r = resolveCircleRectCollision(nx, ny, player.r, o.x, o.y, o.shape.w, o.shape.h);
          nx = r.x; ny = r.y;
        } else { // circle
          const r = resolveCircleCollision(nx, ny, player.r, o.x, o.y, o.shape?.r || o.r || 24);
          nx = r.x; ny = r.y;
        }
      }
      player.x = nx; player.y = ny;
    }

    // interaction (debounced E)
    for (const o of objects) {
      let near=false;
      if (o.shape?.type === 'rect') near = circleNearRect(player.x, player.y, player.r, o.x, o.y, o.shape.w, o.shape.h, 8);
      else near = Math.hypot(player.x - o.x, player.y - o.y) <= player.r + (o.shape?.r || o.r || 24) + 6;
      if (!near) continue;
      if ((keys["e"] || keys["E"])) {
        const now = performance.now();
        if (now - lastInteractAt < 300) break;
        lastInteractAt = now;
        const k = (o.game || o.key || '').toLowerCase();
        if (k === "dodge" || k === 'reflex') openDodgeOverlay();
        else if (k === "react") openReactOverlay();
        else if (k === "aim") openAimOverlay();
        else if (k === "speedtap" || k === 'tap') openTapOverlay();
        else if (k === "wires") openWiresOverlay();
        else if (k === "upload") openUploadOverlay();
        else if (k === "mix") openMixOverlay();
        else if (k === "switch") openSwitchOverlay();
        else if (k === "card") openCardOverlay();
        else if (k === "timer") openTimerOverlay();
        else if (k === "align") openAlignOverlay();
        else if (k === "simon") openSimonOverlay();
        else if (k === "pipes") openPipesOverlay();
        else if (k === "math") openMathOverlay();
        else if (k === "rhythm") openRhythmOverlay();
        else if (k === "pattern") openPatternOverlay();
        else if (k === "lights") openLightsOverlay();
        else if (k === "mole" || k === 'whack') openMoleOverlay();
        else if (k === "slider") openSliderOverlay();
        else if (k === "mop" || k === 'broom') openMopOverlay();
        break;
      }
    }
  }

  function drawWorld() {
    wctx.clearRect(0, 0, W, H);
    wctx.fillStyle = "#0d1225";
    wctx.fillRect(0, 0, W, H);

    // grid
    wctx.save();
    wctx.globalAlpha = 0.10;
    wctx.strokeStyle = "#5a6ab5";
    for (let x = 0; x <= W; x += 50) { wctx.beginPath(); wctx.moveTo(x, 0); wctx.lineTo(x, H); wctx.stroke(); }
    for (let y = 0; y <= H; y += 50) { wctx.beginPath(); wctx.moveTo(0, y); wctx.lineTo(W, y); wctx.stroke(); }
    wctx.restore();

    // objects (circle/rect) and labels
    for (const o of objects) {
      wctx.fillStyle = o.color;
      wctx.strokeStyle = "#223";
      wctx.lineWidth = 3;
      if (o.shape?.type === 'rect') {
        const w = o.shape.w, h = o.shape.h;
        wctx.beginPath(); wctx.rect(o.x - w/2, o.y - h/2, w, h); wctx.fill(); wctx.stroke();
      } else {
        const r = o.shape?.r || o.r || 24;
        wctx.beginPath(); wctx.arc(o.x, o.y, r, 0, Math.PI * 2); wctx.fill(); wctx.stroke();
      }
      if (o.kind !== 'interact') continue;
      wctx.fillStyle = "#fff";
      wctx.font = "12px system-ui";
      wctx.textAlign = "center";
      const ly = o.shape?.type==='rect' ? (o.y - (o.shape.h/2 + 10)) : (o.y - ((o.shape?.r || o.r || 24) + 10));
      wctx.fillText(o.label, o.x, ly);
    }

    // player
    wctx.fillStyle = "#2bd46a";
    wctx.beginPath();
    wctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    wctx.fill();

    // prompt near closest object
    for (const o of objects) {
      let near=false;
      if (o.shape?.type === 'rect') near = circleNearRect(player.x, player.y, player.r, o.x, o.y, o.shape.w, o.shape.h, 8);
      else near = Math.hypot(player.x - o.x, player.y - o.y) <= player.r + (o.shape?.r || o.r || 24) + 6;
      if (near && o.kind==='interact') {
        const px = Math.min(W-10, Math.max(10, o.x + 30));
        const py = Math.max(26, (o.shape?.type==='rect' ? (o.y - o.shape.h/2 - 6) : (o.y - 26)));
        wctx.fillStyle = "rgba(0,0,0,0.6)";
        wctx.fillRect(px - 120, py - 20, 240, 22);
        wctx.fillStyle = "#fff";
        wctx.font = "14px system-ui";
        wctx.textAlign = "center";
        wctx.fillText(`กด E เพื่อเล่น ${o.label}`, px, py - 4);
        break;
      }
    }
  }

  let wl = performance.now();
  function wloop(t) {
    const dt = Math.min((t - wl) / 1000, 0.033);
    wl = t;
    updateWorld(dt);
    drawWorld();
    requestAnimationFrame(wloop);
  }
  requestAnimationFrame(wloop);

  // ===========================================================
  // 🪟 Overlay Management
  // ===========================================================
  function closeAnyOverlay() {
    closeDodgeOverlay(true);
    closeReactOverlay(true);
    closeAimOverlay(true);
    closeTapOverlay(true);
    closeWiresOverlay(true);
    closeUploadOverlay(true);
    closeMixOverlay(true);
    closeSwitchOverlay(true);
    closeCardOverlay(true);
    closeTimerOverlay(true);
    closeAlignOverlay(true);
    closeRhythmOverlay(true);
    closePatternOverlay(true);
    closeLightsOverlay(true);
    closeMoleOverlay(true);
    closeSliderOverlay(true);
    closeMopOverlay(true);
    closeSimonOverlay(true);
    closePipesOverlay(true);
    closeMathOverlay(true);
    overlayOpen = false;
  }

  // MINIGAMES SECTION\n
  // 🎮 MINIGAMES SECTION BELOW
  // ===========================================================
  // ===========================================================
  // 2) 🎮 Dodge Square
  // ===========================================================
  const overlayDodge = document.getElementById("miniOverlayDodge");
  const closeBtnDodge = document.getElementById("btnCloseMiniDodge");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const startBtn = document.getElementById("startBtn");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  canvas.width = 800;
  canvas.height = 450;

  const lcKey = "dodge_best_score_v1";
  let best = Number(localStorage.getItem(lcKey) || 0);
  bestEl.textContent = best.toFixed(1);

  const input = { left: false, right: false, up: false, down: false };
  let state = "hidden";
  let player2, enemies, spawnCooldown, time, score, rafId;

  function bindInput() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  function unbindInput() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") return closeDodgeOverlay(false);
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") input.left = true;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") input.right = true;
    if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") input.up = true;
    if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") input.down = true;
    if (e.key === " " && state !== "playing") startGame();
  }
  function onKeyUp(e) {
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") input.left = false;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") input.right = false;
    if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") input.up = false;
    if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") input.down = false;
  }

  function startGame() {
    state = "playing";
    player2 = { x: 400, y: 220, w: 24, h: 24, speed: 250 };
    enemies = [];
    spawnCooldown = 0.5;
    time = 0;
    score = 0;
    startBtn.textContent = "เล่นอยู่...";
    startBtn.disabled = true;
  }
  function endGame() {
    state = "gameover";
    startBtn.textContent = "เริ่มใหม่";
    startBtn.disabled = false;
    if (score > best) {
      best = score;
      localStorage.setItem(lcKey, String(best));
      bestEl.textContent = best.toFixed(1);
    }
  }

  function spawnEnemy() {
    const size = 16 + Math.random() * 22;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const targetX = player2.x + player2.w / 2;
    const targetY = player2.y + player2.h / 2;
    if (side === 0) {
      x = -size;
      y = Math.random() * 450;
    } else if (side === 1) {
      x = 800 + size;
      y = Math.random() * 450;
    } else if (side === 2) {
      x = Math.random() * 800;
      y = -size;
    } else {
      x = Math.random() * 800;
      y = 450 + size;
    }
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 150 + Math.min(time * 6, 200) + Math.random() * 60;
    enemies.push({ x, y, w: size, h: size, vx: (dx / len) * speed, vy: (dy / len) * speed });
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  let last = 0;
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (state === "hidden") return;
    const dt = Math.min((ts - (last || ts)) / 1000, 0.033);
    last = ts;

    if (state === "playing") {
      let vx = 0,
        vy = 0;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
      if (vx || vy) {
        const len = Math.hypot(vx, vy) || 1;
        vx = (vx / len) * player2.speed;
        vy = (vy / len) * player2.speed;
      }
      player2.x = clamp(player2.x + vx * dt, 0, 776);
      player2.y = clamp(player2.y + vy * dt, 0, 426);

      spawnCooldown -= dt;
      const freq = 0.9 - Math.min(time * 0.01, 0.5);
      if (spawnCooldown <= 0) {
        spawnEnemy();
        spawnCooldown = freq;
      }

      for (const e of enemies) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      enemies = enemies.filter(
        (e) => e.x > -100 && e.x < 900 && e.y > -100 && e.y < 550
      );
      for (const e of enemies) {
        if (aabb(player2, e)) endGame();
      }
      time += dt;
      score += dt * 10;
      scoreEl.textContent = score.toFixed(1);
    }

    ctx.clearRect(0, 0, 800, 450);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#a9b4ff";
    for (let x = 0; x <= 800; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 450);
      ctx.stroke();
    }
    for (let y = 0; y <= 450; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(800, y);
      ctx.stroke();
    }
    ctx.restore();

    if (player2) {
      ctx.fillStyle = "#2bd46a";
      ctx.fillRect(player2.x, player2.y, player2.w, player2.h);
    }
    ctx.fillStyle = "#ff4d6d";
    for (const e of enemies) ctx.fillRect(e.x, e.y, e.w, e.h);

    if (state !== "playing") {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, 800, 450);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "24px system-ui";
      if (state === "gameover") ctx.fillText("Game Over", 400, 220);
      else ctx.fillText("กดเริ่มหรือ Space เพื่อเริ่ม", 400, 220);
    }
  }

  function openDodgeOverlay() {
    overlayDodge.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    state = "menu";
    score = 0;
    scoreEl.textContent = "0.0";
    bindInput();
    if (!rafId) rafId = requestAnimationFrame(loop);
  }
  function closeDodgeOverlay(silent) {
    overlayDodge.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    state = "hidden";
    unbindInput();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  closeBtnDodge?.addEventListener("click", () => closeDodgeOverlay(false));
  startBtn?.addEventListener("click", startGame);

  // ===========================================================
  // 3) Reaction Tester
  // ===========================================================
  const overlayReact = document.getElementById("miniOverlayReact");
  const closeBtnReact = document.getElementById("btnCloseMiniReact");
  const reactCanvas = document.getElementById("reactCanvas");
  const rctx = reactCanvas.getContext("2d");
  const reactStartBtn = document.getElementById("reactStart");
  const reactBestEl = document.getElementById("reactBest");

  const REACT_KEY = "react_best_ms_v1";
  let reactBest = Number(localStorage.getItem(REACT_KEY) || 0) || null;
  reactBestEl.textContent = reactBest ? reactBest : "--";

  let rState = "hidden",
    waitTimer = null,
    goTime = 0,
    reaction = null;

  function openReactOverlay() {
    overlayReact.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    rState = "idle";
    drawReact();
    bindReact();
  }
  function closeReactOverlay(silent) {
    overlayReact.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    rState = "hidden";
    if (waitTimer) clearTimeout(waitTimer);
    unbindReact();
  }

  function bindReact() {
    window.addEventListener("keydown", onReactKey);
    reactCanvas.addEventListener("click", onReactClick);
    reactStartBtn.addEventListener("click", startReact);
  }
  function unbindReact() {
    window.removeEventListener("keydown", onReactKey);
    reactCanvas.removeEventListener("click", onReactClick);
    reactStartBtn.removeEventListener("click", startReact);
  }
  function onReactKey(e) {
    if (e.key === "Escape") return closeReactOverlay(false);
    if (e.key === " ") reactTrigger();
  }
  function onReactClick() {
    reactTrigger();
  }

  function startReact() {
    if (rState !== "idle") return;
    rState = "wait";
    drawReact();
    waitTimer = setTimeout(() => {
      rState = "go";
      goTime = performance.now();
      drawReact();
    }, 1000 + Math.random() * 2000);
  }

  function reactTrigger() {
    if (rState === "wait") {
      rState = "done";
      reaction = "เร็วเกินไป!";
      drawReact();
      clearTimeout(waitTimer);
    } else if (rState === "go") {
      const t = Math.round(performance.now() - goTime);
      rState = "done";
      reaction = `${t} ms`;
      if (!reactBest || t < reactBest) {
        reactBest = t;
        localStorage.setItem(REACT_KEY, String(t));
        reactBestEl.textContent = String(t);
      }
      drawReact();
      try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{}
      try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'react' }); } catch{}
      setTimeout(()=> closeReactOverlay(false), 80);
    }
  }

  function drawReact() {
    const w = reactCanvas.width,
      h = reactCanvas.height;
    rctx.clearRect(0, 0, w, h);
    if (rState === "idle") rctx.fillStyle = "#223";
    else if (rState === "wait") rctx.fillStyle = "#8B0000";
    else if (rState === "go") rctx.fillStyle = "#0B8B3B";
    else rctx.fillStyle = "#223";
    rctx.fillRect(0, 0, w, h);

    rctx.fillStyle = "#e7ecff";
    rctx.textAlign = "center";
    if (rState === "idle") {
      rctx.font = "20px system-ui";
      rctx.fillText("กด เริ่ม หรือ Space/Click เมื่อพื้นหลังเป็นสีเขียว", w / 2, h / 2);
    } else if (rState === "wait") {
      rctx.font = "24px system-ui";
      rctx.fillText("รอสัญญาณ...", w / 2, h / 2);
    } else if (rState === "go") {
      rctx.font = "28px system-ui";
      rctx.fillText("GO!", w / 2, h / 2);
    } else if (rState === "done") {
      rctx.font = "24px system-ui";
      rctx.fillText(reaction || "", w / 2, h / 2);
      rctx.font = "14px system-ui";
      rctx.fillText("กด เริ่ม เพื่อเล่นอีกครั้ง", w / 2, h / 2 + 28);
    }
  }
  closeBtnReact?.addEventListener("click", () => closeReactOverlay(false));

  // ===========================================================
  // 4) Aim Trainer
  // ===========================================================
  const overlayAim = document.getElementById("miniOverlayAim");
  const closeBtnAim = document.getElementById("btnCloseMiniAim");
  const aimCanvas = document.getElementById("aimCanvas");
  const actx = aimCanvas.getContext("2d");
  const aimStartBtn = document.getElementById("aimStart");
  const aimHitsEl = document.getElementById("aimHits");
  const aimBestEl = document.getElementById("aimBest");
  const AIM_KEY = "aim_best_hits_v1";
  let aimBest = Number(localStorage.getItem(AIM_KEY) || 0);
  aimBestEl.textContent = String(aimBest);

  let aState = "hidden",
    aTimer = 0,
    aHits = 0,
    aTarget = null,
    aRaf = null,
    aLast = 0,
    aSpawnCooldown = 0;

  function openAimOverlay() {
    overlayAim.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    aState = "idle";
    aHits = 0;
    aTimer = 0;
    aimHitsEl.textContent = "0";
    bindAim();
    drawAim();
  }
  function closeAimOverlay(silent) {
    overlayAim.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    aState = "hidden";
    unbindAim();
    if (aRaf) cancelAnimationFrame(aRaf);
  }
  function bindAim() {
    aimCanvas.addEventListener("click", onAimClick);
    window.addEventListener("keydown", onAimKey);
    aimStartBtn.addEventListener("click", startAim);
  }
  function unbindAim() {
    aimCanvas.removeEventListener("click", onAimClick);
    window.removeEventListener("keydown", onAimKey);
    aimStartBtn.removeEventListener("click", startAim);
  }
  function onAimKey(e) {
    if (e.key === "Escape") return closeAimOverlay(false);
  }
  function startAim() {
    aState = "play";
    aHits = 0;
    aimHitsEl.textContent = "0";
    aTimer = 15;
    aLast = 0;
    aSpawnCooldown = 0;
    aTarget = null;
    if (!aRaf) aRaf = requestAnimationFrame(aloop);
  }
  function onAimClick(ev) {
    if (aState !== "play") return;
    const rect = aimCanvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (aTarget && Math.hypot(x - aTarget.x, y - aTarget.y) <= aTarget.r) {
      aHits++;
      aimHitsEl.textContent = String(aHits);
      aTarget = null;
      aSpawnCooldown = 0;
    }
  }
  function spawnTarget() {
    const r = 12 + Math.random() * 18;
    const pad = r + 10;
    const x = pad + Math.random() * (aimCanvas.width - 2 * pad);
    const y = pad + Math.random() * (aimCanvas.height - 2 * pad);
    aTarget = { x, y, r };
  }
  function drawAim() {
    const w = aimCanvas.width,
      h = aimCanvas.height;
    actx.clearRect(0, 0, w, h);
    actx.fillStyle = "#0e1330";
    actx.fillRect(0, 0, w, h);
    actx.fillStyle = "#e7ecff";
    actx.textAlign = "left";
    actx.font = "14px system-ui";
    if (aState === "idle") actx.fillText("กด เริ่ม เพื่อเริ่มรอบ (15 วิ)", 16, 22);
    if (aState === "done") actx.fillText("รอบจบแล้ว - กด เริ่ม เพื่อเล่นอีกครั้ง", 16, 22);
    if (aState === "play") actx.fillText(`เวลา: ${aTimer.toFixed(1)}s`, 16, 22);

    if (aTarget) {
      actx.fillStyle = "#ff5252";
      actx.beginPath();
      actx.arc(aTarget.x, aTarget.y, aTarget.r, 0, Math.PI * 2);
      actx.fill();
      actx.fillStyle = "#fff";
      actx.beginPath();
      actx.arc(aTarget.x, aTarget.y, 3, 0, Math.PI * 2);
      actx.fill();
    }
  }
  function aloop(ts) {
    aRaf = requestAnimationFrame(aloop);
    if (aState !== "play") {
      drawAim();
      return;
    }
    const dt = Math.min((ts - (aLast || ts)) / 1000, 0.033);
    aLast = ts;
    aTimer = Math.max(0, aTimer - dt);
aSpawnCooldown -= dt;
if (!aTarget && aSpawnCooldown <= 0) {
spawnTarget();
aSpawnCooldown = 1.0 + Math.random() * 0.7;
}
drawAim();
if (aTimer <= 0) {
aState = "done";
if (aHits > aimBest) {
aimBest = aHits;
localStorage.setItem(AIM_KEY, String(aHits));
aimBestEl.textContent = String(aHits);
}
}
}
closeBtnAim?.addEventListener("click", () => closeAimOverlay(false));

// ===========================================================
// 5) Speed Tap
// ===========================================================
const overlayTap = document.getElementById("miniOverlayTap");
const closeTap = document.getElementById("btnCloseMiniTap");
const tapStart = document.getElementById("tapStart");
const tapScore = document.getElementById("tapScore");
const tapBest = document.getElementById("tapBest");
const tapTimer = document.getElementById("tapTimer");
const TAP_KEY = "tap_best_v1";
let tapBestScore = Number(localStorage.getItem(TAP_KEY) || 0);
tapBest.textContent = String(tapBestScore);

let tState = "hidden",
tCount = 0,
tTime = 0,
tRaf = null;

function openTapOverlay() {
overlayTap.setAttribute("aria-hidden", "false");
overlayOpen = true;
tState = "idle";
tapScore.textContent = "0";
bindTap();
}
function closeTapOverlay(silent) {
overlayTap.setAttribute("aria-hidden", "true");
overlayOpen = silent ? overlayOpen : false;
tState = "hidden";
unbindTap();
if (tRaf) cancelAnimationFrame(tRaf);
}

function bindTap() {
tapStart.addEventListener("click", startTap);
window.addEventListener("keydown", onTapKey);
}
function unbindTap() {
tapStart.removeEventListener("click", startTap);
window.removeEventListener("keydown", onTapKey);
}

function startTap() {
tState = "play";
tCount = 0;
tTime = 5;
tapScore.textContent = "0";
tapTimer.textContent = "5.0";
if (!tRaf) tRaf = requestAnimationFrame(tloop);
}

function onTapKey(e) {
if (e.key === "Escape") return closeTapOverlay(false);
if (e.key === " " && tState === "play") {
tCount++;
tapScore.textContent = String(tCount);
}
}

function tloop() {
tRaf = requestAnimationFrame(tloop);
if (tState !== "play") return;
const dt = 1 / 60;
tTime = Math.max(0, tTime - dt);
tapTimer.textContent = tTime.toFixed(1);
if (tTime <= 0) {
tState = "done";
if (tCount > tapBestScore) {
tapBestScore = tCount;
localStorage.setItem(TAP_KEY, String(tCount));
tapBest.textContent = String(tCount);
  try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{}
  try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'tap' }); } catch{}
  setTimeout(()=> closeTapOverlay(false), 80);
}
}
}
closeTap?.addEventListener("click", () => closeTapOverlay(false));
tapStart?.addEventListener("click", startTap);
  // ===========================================================
  // 6) Fix Wiring (ลากเส้นต่อสาย)
  // ===========================================================
  const overlayWires = document.getElementById("miniOverlayWires");
  const closeBtnWires = document.getElementById("btnCloseMiniWires");
  const wiresCanvas = document.getElementById("wiresCanvas");
  const wctx2 = wiresCanvas.getContext("2d");
  let wiresBG = undefined; // Image | null (undefined = not tried yet)
  let wiresBGRect = { dx:0, dy:0, dw:wiresCanvas.width, dh:wiresCanvas.height, scale:1 };
  // Percentage-based layout (relative to image), easy to fine-tune without stretch issues
  let LXP = 0.185, RXP = 0.815; // x positions as fraction of image width
  let TYP = 0.245, STEPYP = 0.125; // first y and spacing as fraction of image height
  const WIRES_RING_R = 32; // bigger button ring
  const WIRES_DOT_R = 20; // bigger inner dot
  let WIRES_DEBUG = false; // toggle overlay for debugging alignment
  const wireColors = ["#ff5252", "#4caf50", "#2196f3", "#ff9800", "#ffd740"]; // red, green, blue, orange, yellow
  const leftWires = [], rightWires = [];
  let selectedWire = null;

  const RIGHT_FIXED_ORDER = ["#2196f3", "#ff9800", "#ff5252", "#4caf50", "#ffd740"]; // reference order (unused when shuffling)
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=arr[i]; arr[i]=arr[j]; arr[j]=t; } return arr; }

  function loadWiresBG(){
    if (wiresBG !== undefined) return; // already tried
    wiresBG = null;
    try {
      const img = new Image();
      img.onload = () => { wiresBG = img; try { drawWires(); } catch{} };
      img.onerror = () => { wiresBG = null; };
      img.src = '../assets/wires-bg.png'; // put your image here
    } catch { wiresBG = null; }
  }

  function layoutWiresBG(){
    const W = wiresCanvas.width, H = wiresCanvas.height;
    const iw = (wiresBG && wiresBG.naturalWidth) || 1152;
    const ih = (wiresBG && wiresBG.naturalHeight) || 768;
    const s = Math.min(W/iw, H/ih); // fit image inside canvas (no stretch)
    const dw = Math.round(iw*s), dh = Math.round(ih*s);
    const dx = Math.round((W - dw) / 2), dy = Math.round((H - dh) / 2);
    wiresBGRect = { dx, dy, dw, dh, scale: s };
  }

  function toCX(px){ return wiresBGRect.dx + px; }
  function toCY(py){ return wiresBGRect.dy + py; }
  function fromPctX(p){ return wiresBGRect.dx + (p * wiresBGRect.dw); }
  function fromPctY(p){ return wiresBGRect.dy + (p * wiresBGRect.dh); }

  function setupWires() {
    leftWires.length = 0; rightWires.length = 0;
    layoutWiresBG();
    const order = shuffle([...wireColors]); // randomize right-side order each time
    wireColors.forEach((c, i) => {
      const yL = fromPctY(TYP + i*STEPYP);
      const yR = fromPctY(TYP + order.indexOf(c)*STEPYP);
      leftWires.push({ x: fromPctX(LXP), y: yL, color: c, connected: null });
      rightWires.push({ x: fromPctX(RXP), y: yR, color: c, connected: null });
    });
  }

  function drawWires() {
    const W = wiresCanvas.width, H = wiresCanvas.height;
    layoutWiresBG();
    // background image if available
    if (wiresBG) {
      wctx2.clearRect(0,0,W,H);
      wctx2.drawImage(wiresBG, wiresBGRect.dx, wiresBGRect.dy, wiresBGRect.dw, wiresBGRect.dh);
    } else {
      // fallback gradient panel
      wctx2.clearRect(0, 0, W, H);
      const g = wctx2.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#06174a'); g.addColorStop(1,'#0a1650');
      wctx2.fillStyle = g; wctx2.fillRect(0,0,W,H);
      // subtle diagonal lines
      wctx2.save(); wctx2.globalAlpha = 0.08; wctx2.strokeStyle = '#cfd8dc';
      for (let x=-H; x<W+H; x+=28){ wctx2.beginPath(); wctx2.moveTo(x,0); wctx2.lineTo(x+H,H); wctx2.stroke(); }
      wctx2.restore();
    }
    wctx2.lineWidth = 6; wctx2.lineCap = "round";
    // draw connected
    leftWires.forEach(l => {
      if (l.connected) {
        wctx2.strokeStyle = l.color;
        wctx2.beginPath();
        wctx2.moveTo(l.x, l.y);
        wctx2.lineTo(l.connected.x, l.connected.y);
        wctx2.stroke();
      }
    });
    // current
    if (selectedWire) {
      wctx2.strokeStyle = selectedWire.color;
      wctx2.beginPath();
      wctx2.moveTo(selectedWire.x, selectedWire.y);
      wctx2.lineTo(mouseX, mouseY);
      wctx2.stroke();
    }
    // endpoints: always draw ring + inner colored dot (overpaint BG so colors can shuffle)
    [...leftWires, ...rightWires].forEach(w => {
      // ring shell (draw even if BG exists to override BG colors)
      wctx2.save();
      wctx2.shadowColor = 'rgba(0,0,0,0.35)';
      wctx2.shadowBlur = 6;
      wctx2.fillStyle = '#d0d5db';
      wctx2.beginPath(); wctx2.arc(w.x, w.y, WIRES_RING_R, 0, Math.PI*2); wctx2.fill();
      wctx2.restore();
      // inner dot (visible in both cases)
      const innerR = wiresBG ? (WIRES_DOT_R - 2) : WIRES_DOT_R;
      wctx2.save();
      if (wiresBG){ wctx2.shadowColor='rgba(0,0,0,0.35)'; wctx2.shadowBlur=3; }
      wctx2.fillStyle = w.color;
      wctx2.beginPath(); wctx2.arc(w.x, w.y, innerR, 0, Math.PI*2); wctx2.fill();
      wctx2.restore();
    });

    // debug overlay showing target ring centers relative to BG
    if (WIRES_DEBUG){
      wctx2.save();
      wctx2.strokeStyle = 'rgba(0,255,255,0.8)';
      wctx2.setLineDash([5,3]);
      for (let i=0;i<5;i++){
        const y = fromPctY(TYP + i*STEPYP);
        wctx2.beginPath(); wctx2.arc(fromPctX(LXP), y, WIRES_RING_R+6, 0, Math.PI*2); wctx2.stroke();
        wctx2.beginPath(); wctx2.arc(fromPctX(RXP), y, WIRES_RING_R+6, 0, Math.PI*2); wctx2.stroke();
      }
      // show values
      wctx2.font = '12px system-ui'; wctx2.fillStyle = '#0ff'; wctx2.textAlign='left';
      const txt = `LXP=${LXP.toFixed(3)}  RXP=${RXP.toFixed(3)}  TYP=${TYP.toFixed(3)}  STEPYP=${STEPYP.toFixed(3)}`;
      wctx2.fillText(txt, 8, H-8);
      wctx2.restore();
    }
  }

  let mouseX = 0, mouseY = 0;
  wiresCanvas.addEventListener("mousemove", e => {
    const rect = wiresCanvas.getBoundingClientRect(); const sx = wiresCanvas.width / rect.width, sy = wiresCanvas.height / rect.height; mouseX = (e.clientX - rect.left) * sx; mouseY = (e.clientY - rect.top) * sy;
    if (selectedWire) drawWires();
  });
  wiresCanvas.addEventListener("mousedown", e => {
    const rect = wiresCanvas.getBoundingClientRect(); const sx = wiresCanvas.width / rect.width, sy = wiresCanvas.height / rect.height; const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy;
    if (!selectedWire) {
      const lw = leftWires.find(w => Math.hypot(x - w.x, y - w.y) < (WIRES_DOT_R+4) && !w.connected);
      if (lw) selectedWire = lw;
    } else {
      const rw = rightWires.find(w => Math.hypot(x - w.x, y - w.y) < (WIRES_DOT_R+4) && !w.connected);
      if (rw && rw.color === selectedWire.color) {
        selectedWire.connected = rw;
        rw.connected = selectedWire;
        selectedWire = null;
        drawWires();
        if (leftWires.every(w => w.connected)) { try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: "wires" }); } catch{} setTimeout(()=> closeWiresOverlay(false), 80); }
      }
    }
  });

  function saveWiresLayout(){
    try { localStorage.setItem('minigames:wires_layout_v1', JSON.stringify({ LXP, RXP, TYP, STEPYP })); } catch {}
  }
  function loadWiresLayout(){
    let saved=null; try { saved = JSON.parse(localStorage.getItem('minigames:wires_layout_v1')||'null'); } catch {}
    if (!saved){ try { saved = JSON.parse(localStorage.getItem('wires_layout')||'null'); } catch {} }
    if (saved && typeof saved==='object'){
      const f = (v, def)=> (typeof v==='number' ? v : (parseFloat(v)||def));
      LXP=f(saved.LXP, LXP); RXP=f(saved.RXP, RXP); TYP=f(saved.TYP, TYP); STEPYP=f(saved.STEPYP, STEPYP);
    }
  }

  function ensureWiresDevPanel(){
    const id='wiresDevPanel'; if (document.getElementById(id)) return;
    try {
      const panel = document.createElement('div'); panel.id=id; panel.style.cssText='position:absolute; top:10px; left:12px; display:flex; gap:6px; z-index:5;';
      const mkBtn=(txt)=>{ const b=document.createElement('button'); b.textContent=txt; b.style.cssText='padding:4px 8px; border-radius:6px; border:0; background:#2b64ff; color:#fff; font-size:12px; cursor:pointer;'; return b; };
      const btnSave=mkBtn('Save'); const btnReset=mkBtn('Reset'); btnReset.style.background='#546e7a';
      btnSave.onclick=()=>{ saveWiresLayout(); const o=overlayWires.querySelector('#wiresNotice')||document.createElement('div'); o.id='wiresNotice'; o.textContent='Saved'; o.style.cssText='margin-left:6px;color:#0f0;font-size:12px;'; panel.appendChild(o); setTimeout(()=>{ o.remove(); }, 900); };
      btnReset.onclick=()=>{ try { localStorage.removeItem('minigames:wires_layout_v1'); localStorage.removeItem('wires_layout'); } catch{} setupWires(); drawWires(); };
      panel.appendChild(btnSave); panel.appendChild(btnReset);
      overlayWires.querySelector('.mini-box')?.appendChild(panel);
    } catch {}
  }

  function onWiresKey(ev){
    if (!overlayOpen) return;
    if (ev.key === 'F2'){ WIRES_DEBUG = !WIRES_DEBUG; drawWires(); }
    // tuning with modifiers
    const step = ev.shiftKey ? 0.002 : (ev.ctrlKey ? 0.002 : 0);
    if (step){ ev.preventDefault(); }
    if (ev.shiftKey && (ev.key==='ArrowLeft' || ev.key==='ArrowRight')){ LXP += (ev.key==='ArrowRight'? step : -step); LXP = Math.max(0.05, Math.min(0.45, LXP)); setupWires(); drawWires(); }
    if (ev.ctrlKey && (ev.key==='ArrowLeft' || ev.key==='ArrowRight')){ RXP += (ev.key==='ArrowRight'? step : -step); RXP = Math.max(0.55, Math.min(0.95, RXP)); setupWires(); drawWires(); }
    if (ev.shiftKey && (ev.key==='ArrowUp' || ev.key==='ArrowDown')){ TYP += (ev.key==='ArrowDown'? step : -step); TYP = Math.max(0.05, Math.min(0.5, TYP)); setupWires(); drawWires(); }
    if (ev.ctrlKey && (ev.key==='ArrowUp' || ev.key==='ArrowDown')){ STEPYP += (ev.key==='ArrowDown'? step : -step); STEPYP = Math.max(0.05, Math.min(0.25, STEPYP)); setupWires(); drawWires(); }
    if (ev.key.toLowerCase() === 's' && (ev.altKey || ev.metaKey)) saveWiresLayout();
  }

  function openWiresOverlay() {
    loadWiresLayout();
    setupWires();
    loadWiresBG();
    overlayWires.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    drawWires();
    ensureWiresDevPanel();
    window.addEventListener('keydown', onWiresKey);
  }
  function closeWiresOverlay(silent) {
    overlayWires.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    window.removeEventListener('keydown', onWiresKey);
  }
  closeBtnWires?.addEventListener("click", () => closeWiresOverlay(false));

  // ===========================================================
  // 7) Upload Data (Progress Bar)
  // ===========================================================
  const overlayUpload = document.getElementById("miniOverlayUpload");
  const closeBtnUpload = document.getElementById("btnCloseMiniUpload");
  const uploadBar = document.getElementById("uploadBar");
  const uploadText = document.getElementById("uploadText");
  const uploadStart = document.getElementById("uploadStart");
  let uploadProgress = 0, uploadInt = null;

  function openUploadOverlay() {
    overlayUpload.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    uploadProgress = 0;
    uploadBar.style.width = "0%";
    uploadText.textContent = "0%";
  }
  function closeUploadOverlay(silent) {
    overlayUpload.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    if (uploadInt) clearInterval(uploadInt);
  }
  uploadStart?.addEventListener("click", () => {
    if (uploadInt) return;
    uploadInt = setInterval(() => {
      uploadProgress += Math.random() * 8;
      if (uploadProgress >= 100) {
        uploadProgress = 100;
        clearInterval(uploadInt);
        uploadInt = null;
        try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'upload' }); } catch{} setTimeout(()=> closeUploadOverlay(false), 80);
      }
      uploadBar.style.width = uploadProgress + "%";
      uploadText.textContent = Math.floor(uploadProgress) + "%";
    }, 200);
  });
  closeBtnUpload?.addEventListener("click", () => closeUploadOverlay(false));

  // ===========================================================
  // 8) Mix Chemical (คลิกให้ได้สีเป้าหมาย)
  // ===========================================================
  const overlayMix = document.getElementById("miniOverlayMix");
  const closeBtnMix = document.getElementById("btnCloseMiniMix");
  const mixCanvas = document.getElementById("mixCanvas");
  const mctx = mixCanvas.getContext("2d");
  let mixState = "hidden", mixTarget = null, mixColor = { r: 0, g: 0, b: 0 };

  function openMixOverlay() {
    overlayMix.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    mixState = "play";
    mixTarget = { r: Math.random() * 255, g: Math.random() * 255, b: Math.random() * 255 };
    drawMix();
  }
  function closeMixOverlay(silent) {
    overlayMix.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
  }

  function drawMix() {
    const w = mixCanvas.width, h = mixCanvas.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = `rgb(${mixColor.r},${mixColor.g},${mixColor.b})`;
    mctx.fillRect(0, 0, w, h);
    mctx.fillStyle = `rgb(${mixTarget.r},${mixTarget.g},${mixTarget.b})`;
    mctx.fillRect(w - 80, 20, 60, 60);
  }
  mixCanvas.addEventListener("click", e => {
    mixColor.r = Math.min(255, mixColor.r + Math.random() * 50);
    mixColor.g = Math.min(255, mixColor.g + Math.random() * 50);
    mixColor.b = Math.min(255, mixColor.b + Math.random() * 50);
    drawMix();
    const diff = Math.hypot(
      mixColor.r - mixTarget.r,
      mixColor.g - mixTarget.g,
      mixColor.b - mixTarget.b
    );
    if (diff < 60) { try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'mix' }); } catch{} setTimeout(()=> closeMixOverlay(false), 80); }
  });
  closeBtnMix?.addEventListener("click", () => closeMixOverlay(false));

  // ===========================================================
  // 9) Power Switch (เปิดทุกปุ่ม)
  // ===========================================================
  const overlaySwitch = document.getElementById("miniOverlaySwitch");
  const closeBtnSwitch = document.getElementById("btnCloseMiniSwitch");
  const switchPanel = document.getElementById("switchPanel");
  function openSwitchOverlay() {
    overlaySwitch.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    switchPanel.innerHTML = "";
    const batteryFill = document.getElementById('batteryFill');
    const batteryLabel = document.getElementById('batteryLabel');
    const total = 5;
    let onCount = 0;
  // Difficulty settings (increased decay frequency/likelihood)
  const TOTAL_TIME = 20; // seconds to complete
  const DECAY_INTERVAL = 1400; // ms between decay checks (more frequent)
  const DECAY_CHANCE = 0.55; // 55% chance per interval to flip one ON -> OFF
  const IMMEDIATE_REVERT_CHANCE = 0.45; // chance an ON immediately reverts shortly after being pressed
    let timeLeft = TOTAL_TIME;
    let decayTimer = null;
    let tickTimer = null;
    // Ensure bridge active
    try { MGBridge && MGBridge.setActive && MGBridge.setActive('switch'); } catch {}
    function updateBattery() {
      const pct = Math.round((onCount / total) * 100);
      if (batteryFill) batteryFill.style.width = pct + "%";
      if (batteryLabel) batteryLabel.textContent = `${onCount} / ${total}`;
      try { console.log('[switch] progress =>', pct); MGBridge && (MGBridge.debugPost ? MGBridge.debugPost('mg:progress',{ percent: pct }) : (MGBridge.progress && MGBridge.progress(pct))); } catch (e) { console.warn('MGBridge.progress failed', e); }
    }
    // create nice toggles
    for (let i = 0; i < total; i++) {
      const btn = document.createElement("button");
      btn.className = 'off';
      btn.setAttribute('aria-pressed','false');
      btn.textContent = "OFF";
      btn.onclick = () => {
        if (btn.classList.contains('on')) return; // already on
        btn.classList.remove('off'); btn.classList.add('on');
        btn.setAttribute('aria-pressed','true');
        btn.textContent = 'ON';
        onCount++;
        updateBattery();
        // small feedback
        btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 220 });
        // immediate short-window instability: small chance this newly-on switch flips back
        setTimeout(()=>{
          if (btn.classList.contains('on') && Math.random() < IMMEDIATE_REVERT_CHANCE){
            btn.classList.remove('on'); btn.classList.add('off'); btn.setAttribute('aria-pressed','false'); btn.textContent='OFF';
            onCount = Math.max(0, onCount - 1);
            updateBattery();
            // micro-shake to indicate failure
            btn.animate([{ transform:'translateX(-6px)'},{ transform:'translateX(6px)'},{ transform:'translateX(0)' }], { duration: 260 });
          }
        }, 300 + Math.random()*500);
        if (onCount === total) {
          // success: give an animation and then complete
          try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch {}
          // flash the mini-box for celebration
          const box = overlaySwitch.querySelector('.mini-box');
          if (box) box.classList.add('switch-success');
          setTimeout(()=>{
            try { console.log('[switch] complete => switch'); MGBridge && (MGBridge.debugPost ? MGBridge.debugPost('mg:complete',{ key: 'switch' }) : (MGBridge.complete && MGBridge.complete({ key: 'switch' }))); } catch(e) { console.warn('MGBridge.complete failed', e); }
            // close overlay after a short delay so user sees success
            clearInterval(decayTimer); clearInterval(tickTimer);
            closeSwitchOverlay(false);
            if (box) box.classList.remove('switch-success');
          }, 600);
        }
      };
      switchPanel.appendChild(btn);
    }
    updateBattery();
    // Timer display
    const timeEl = document.getElementById('switchTime');
    if (timeEl) timeEl.textContent = String(Math.ceil(timeLeft));
    // decay behavior: occasionally flip one ON back to OFF to increase difficulty
    decayTimer = setInterval(()=>{
      if (onCount <= 0) return;
      if (Math.random() < DECAY_CHANCE) {
        // pick a random ON button to flip off
        const ons = [...switchPanel.children].filter(b => b.classList.contains('on'));
        if (!ons.length) return;
        const pick = ons[Math.floor(Math.random()*ons.length)];
        pick.classList.remove('on'); pick.classList.add('off'); pick.setAttribute('aria-pressed','false'); pick.textContent = 'OFF';
        onCount = Math.max(0, onCount - 1);
        updateBattery();
      }
    }, DECAY_INTERVAL);
    // countdown tick
    tickTimer = setInterval(()=>{
      timeLeft = Math.max(0, timeLeft - 1);
      if (timeEl) timeEl.textContent = String(Math.ceil(timeLeft));
      // If time runs out before completion, reset switches partially to penalize
      if (timeLeft <= 0) {
        // small penalty: turn half of ON switches back off
        const ons = [...switchPanel.children].filter(b => b.classList.contains('on'));
        const toFlip = Math.ceil(ons.length / 2);
        for (let k=0;k<toFlip;k++){
          const idx = Math.floor(Math.random()*ons.length);
          const b = ons.splice(idx,1)[0]; if (!b) continue;
          b.classList.remove('on'); b.classList.add('off'); b.setAttribute('aria-pressed','false'); b.textContent = 'OFF';
          onCount = Math.max(0, onCount - 1);
        }
        updateBattery();
        // reset timer to give them another attempt (but keep difficulty)
        timeLeft = TOTAL_TIME;
        if (timeEl) timeEl.textContent = String(Math.ceil(timeLeft));
      }
    }, 1000);
  }
  function closeSwitchOverlay(silent) {
    overlaySwitch.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    // cleanup timers if any
    try{ clearInterval(decayTimer); clearInterval(tickTimer); } catch(_){}
  }
  closeBtnSwitch?.addEventListener("click", () => closeSwitchOverlay(false));

  // ===========================================================
  // 10) Swipe Card
  // ===========================================================
  const overlayCard = document.getElementById("miniOverlayCard");
  const closeBtnCard = document.getElementById("btnCloseMiniCard");
  const card = document.getElementById("card");
  const cardStatus = document.getElementById("cardStatus");
  let isDragging = false, dragStartX = 0;
  card.addEventListener("mousedown", e => {
    isDragging = true;
    dragStartX = e.clientX;
    cardStatus.textContent = "รูด...";
  });
  window.addEventListener("mouseup", e => {
    if (!isDragging) return;
    isDragging = false;
    const dist = e.clientX - dragStartX;
    if (dist > 250 && dist < 400) {
      cardStatus.textContent = "สำเร็จ!";
      try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'card' }); } catch{} setTimeout(()=> closeCardOverlay(false), 80);
    } else cardStatus.textContent = "เร็ว/ช้าเกินไป";
  });
  function openCardOverlay() {
    overlayCard.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    card.style.left = "10px";
    cardStatus.textContent = "พร้อมรูด...";
  }
  function closeCardOverlay(silent) {
    overlayCard.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
  }
  closeBtnCard?.addEventListener("click", () => closeCardOverlay(false));

  // ===========================================================
  // 11) Perfect Timer
  // ===========================================================
  const overlayTimer = document.getElementById("miniOverlayTimer");
  const closeBtnTimer = document.getElementById("btnCloseMiniTimer");
  const timerDisplay = document.getElementById("timerDisplay");
  const timerStart = document.getElementById("timerStart");
  let timerVal = 3, timerRunning = false, timerInt = null;

  function openTimerOverlay() {
    overlayTimer.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    timerVal = 3;
    timerDisplay.textContent = "3.00";
  }
  function closeTimerOverlay(silent) {
    overlayTimer.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
    clearInterval(timerInt);
  }
  timerStart.addEventListener("click", startTimer);
  window.addEventListener("keydown", e => {
    if (overlayOpen && e.key === " ") stopTimer();
  });
  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    timerVal = 3;
    timerInt = setInterval(() => {
      timerVal -= 0.05;
      timerDisplay.textContent = timerVal.toFixed(2);
      if (timerVal <= 0) {
        timerVal = 0;
        stopTimer();
      }
    }, 50);
  }
  function stopTimer() {
    clearInterval(timerInt);
    timerRunning = false;
    const diff = Math.abs(timerVal);
    if (diff < 0.1) timerDisplay.textContent = "Perfect!";
    else timerDisplay.textContent = diff < 0.3 ? "Close!" : "Miss!";
    try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'timer' }); } catch{} setTimeout(()=> closeTimerOverlay(false), 80);
  }
  closeBtnTimer?.addEventListener("click", () => closeTimerOverlay(false));

  // ===========================================================
  // 12) Align Engine (ปรับให้ตรงกลาง)
  // ===========================================================
  const overlayAlign = document.getElementById("miniOverlayAlign");
  const closeBtnAlign = document.getElementById("btnCloseMiniAlign");
  const alignCanvas = document.getElementById("alignCanvas");
  const alctx = alignCanvas.getContext("2d");
  let alignY = 200, targetY = Math.random() * 400;
  function drawAlign() {
    alctx.clearRect(0, 0, 800, 450);
    alctx.fillStyle = "#111a2f";
    alctx.fillRect(0, 0, 800, 450);
    alctx.fillStyle = "#4caf50";
    alctx.fillRect(380, alignY, 40, 40);
    alctx.strokeStyle = "#ffeb3b";
    alctx.strokeRect(380, targetY, 40, 40);
  }
  window.addEventListener("keydown", e => {
    if (!overlayOpen) return;
    if (e.key === "ArrowUp") alignY -= 5;
    if (e.key === "ArrowDown") alignY += 5;
    drawAlign();
    if (Math.abs(alignY - targetY) < 5) { try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'align' }); } catch{} setTimeout(()=> closeAlignOverlay(false), 80); }
  });
  function openAlignOverlay() {
    overlayAlign.setAttribute("aria-hidden", "false");
    overlayOpen = true;
    targetY = Math.random() * 400;
    alignY = 200;
    drawAlign();
  }
  function closeAlignOverlay(silent) {
    overlayAlign.setAttribute("aria-hidden", "true");
    overlayOpen = silent ? overlayOpen : false;
  }
  closeBtnAlign?.addEventListener("click", () => closeAlignOverlay(false));

  // ===========================================================
  // 9) Simon Says
  // ===========================================================
  const overlaySimon = document.getElementById('miniOverlaySimon');
  const closeBtnSimon = document.getElementById('btnCloseMiniSimon');
  const simonPads = Array.from(document.querySelectorAll('.simon-pad'));
  const simonStart = document.getElementById('simonStart');
  const simonRoundEl = document.getElementById('simonRound');
  const simonBestEl = document.getElementById('simonBest');
  const SIMON_KEY = 'simon_best_round_v1';
  let simonBest = Number(localStorage.getItem(SIMON_KEY) || 0);
  if (simonBestEl) simonBestEl.textContent = String(simonBest);
  let seq = [], idx = 0, showing = false;
  function flashPad(i){ const el=simonPads[i]; if(!el) return; const prev=el.style.filter; el.style.filter='brightness(1.7)'; setTimeout(()=>{ el.style.filter=prev; }, 250); }
  function showSeq(){ showing=true; let t=0; seq.forEach((v, k)=>{ setTimeout(()=> flashPad(v), 600*k); t=600*k; }); setTimeout(()=> showing=false, t+650); }
  function nextRound(){ seq.push(Math.floor(Math.random()*4)); idx=0; simonRoundEl.textContent=String(seq.length); showSeq(); }
  function openSimonOverlay(){ closeAnyOverlay(); overlaySimon.setAttribute('aria-hidden','false'); overlayOpen=true; seq=[]; idx=0; simonRoundEl.textContent='0'; }
  function closeSimonOverlay(silent){ overlaySimon.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; }
  closeBtnSimon?.addEventListener('click', ()=> closeSimonOverlay(false));
  simonStart?.addEventListener('click', ()=> nextRound());
  simonPads.forEach((btn, i)=> btn.addEventListener('click', ()=>{
    if (showing || !seq.length) return; flashPad(i);
    if (i === seq[idx]){ idx++; if (idx >= seq.length){ if (seq.length> simonBest){ simonBest=seq.length; localStorage.setItem(SIMON_KEY,String(simonBest)); simonBestEl.textContent=String(simonBest);} setTimeout(nextRound, 500); } }
    else { // fail
      setTimeout(()=> closeSimonOverlay(false), 600);
    }
  }));

  // ===========================================================
  // 10) Pipe Connect (simple rotate-to-connect)
  // ===========================================================
  const overlayPipes = document.getElementById('miniOverlayPipes');
  const closeBtnPipes = document.getElementById('btnCloseMiniPipes');
  const pipesCanvas = document.getElementById('pipesCanvas');
  const pctx = pipesCanvas?.getContext('2d');
  const pipesShuffle = document.getElementById('pipesShuffle');
  const GRID_W=6, GRID_H=3, TILE=100;
  const TYPES=['I','L']; // straight, corner
  let grid=[];
  function newGrid(){ grid=[]; for(let y=0;y<GRID_H;y++){ const row=[]; for(let x=0;x<GRID_W;x++){ const t = (Math.random()<0.5? 'I':'L'); const r = Math.floor(Math.random()*4); row.push({t,r}); } grid.push(row); } }
  function drawGrid(){ if(!pctx) return; pctx.clearRect(0,0,pipesCanvas.width,pipesCanvas.height); pctx.fillStyle='#0e1330'; pctx.fillRect(0,0,pipesCanvas.width,pipesCanvas.height); for(let y=0;y<GRID_H;y++){ for(let x=0;x<GRID_W;x++){ const cx=x*TILE+TILE/2, cy=y*TILE+TILE/2; pctx.save(); pctx.translate(cx,cy); pctx.rotate(grid[y][x].r*Math.PI/2); pctx.strokeStyle='#9fd1ff'; pctx.lineWidth=16; if(grid[y][x].t==='I'){ pctx.beginPath(); pctx.moveTo(-TILE/2+20,0); pctx.lineTo(TILE/2-20,0); pctx.stroke(); } else { pctx.beginPath(); pctx.arc(0,0, TILE/2-20, Math.PI*1.5, Math.PI*2); pctx.stroke(); } pctx.restore(); pctx.strokeStyle='#2b2f55'; pctx.strokeRect(x*TILE+0.5, y*TILE+0.5, TILE-1, TILE-1); } }
  }
  function openPipesOverlay(){ closeAnyOverlay(); overlayPipes.setAttribute('aria-hidden','false'); overlayOpen=true; newGrid(); drawGrid(); }
  function closePipesOverlay(silent){ overlayPipes.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; }
  closeBtnPipes?.addEventListener('click', ()=> closePipesOverlay(false));
  pipesShuffle?.addEventListener('click', ()=>{ newGrid(); drawGrid(); });
  pipesCanvas?.addEventListener('click',(e)=>{ const rect=pipesCanvas.getBoundingClientRect(); const x=Math.floor((e.clientX-rect.left)/TILE); const y=Math.floor((e.clientY-rect.top)/TILE); if(grid[y]?.[x]){ grid[y][x].r=(grid[y][x].r+1)%4; drawGrid(); } });

  // ===========================================================
  // 11) Quick Math
  // ===========================================================
  const overlayMath = document.getElementById('miniOverlayMath');
  const closeBtnMath = document.getElementById('btnCloseMiniMath');
  const mathQ = document.getElementById('mathQ');
  const mathA = document.getElementById('mathA');
  const mathB = document.getElementById('mathB');
  const mathTime = document.getElementById('mathTime');
  const mathScore = document.getElementById('mathScore');
  let mTimer=0, mScore=0, mRaf=null, mLast=0, curAns=0;
  function newQ(){ const a= Math.floor(Math.random()*9)+1, b=Math.floor(Math.random()*9)+1; const op=Math.random()<0.5? '+':'-'; const v=(op==='+')? a+b : a-b; curAns=v; mathQ.textContent=`${a} ${op} ${b} = ?`; if(Math.random()<0.5){ mathA.textContent=String(v); mathB.textContent=String(v + (Math.random()<0.5? 1:-1)*(Math.floor(Math.random()*3)+1)); } else { mathB.textContent=String(v); mathA.textContent=String(v + (Math.random()<0.5? 1:-1)*(Math.floor(Math.random()*3)+1)); } }
  function startMath(){ mTimer=15; mScore=0; mathScore.textContent='0'; newQ(); if(!mRaf) mRaf=requestAnimationFrame(mLoop); }
  function mLoop(ts){ mRaf=requestAnimationFrame(mLoop); const dt=Math.min((ts-(mLast||ts))/1000,0.033); mLast=ts; mTimer=Math.max(0,mTimer-dt); mathTime.textContent=mTimer.toFixed(1); if(mTimer<=0){ cancelAnimationFrame(mRaf); mRaf=null; try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'math' }); } catch{} setTimeout(()=> closeMathOverlay(false), 80); } }
  function openMathOverlay(){ closeAnyOverlay(); overlayMath.setAttribute('aria-hidden','false'); overlayOpen=true; startMath(); }
  function closeMathOverlay(silent){ overlayMath.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; if(mRaf){ cancelAnimationFrame(mRaf); mRaf=null; } }
  function pickMath(v){ if(mTimer<=0) return; if(Number(v)===curAns){ mScore++; mathScore.textContent=String(mScore); newQ(); } else { mTimer=Math.max(0, mTimer-2); } }
  closeBtnMath?.addEventListener('click', ()=> closeMathOverlay(false));
  mathA?.addEventListener('click', ()=> pickMath(Number(mathA.textContent)));
  mathB?.addEventListener('click', ()=> pickMath(Number(mathB.textContent)));

  // ===========================================================
  // 12) Rhythm Tap (multi-lane)
  // ===========================================================
  const overlayRhythm = document.getElementById('miniOverlayRhythm');
  const closeBtnRhythm = document.getElementById('btnCloseMiniRhythm');
  const rhythmCanvas = document.getElementById('rhythmCanvas');
  const rhCtx = rhythmCanvas?.getContext('2d');
  const rhythmStart = document.getElementById('rhythmStart');
  const rhythmComboEl = document.getElementById('rhythmCombo');

  const LANES = 4;
  const LANE_KEYS = ['d','f','j','k']; // map to 4 lanes
  const HIT_Y = (rhythmCanvas?.height || 240) - 40;
  const NOTE_SPEED = 260; // px/sec falling
  const HIT_WINDOW = 28; // px tolerance
  let notes = []; // {lane,y,hit}
  let rCombo=0, rOn=false, rRaf=null, rLast=0, spawnCd=0;

  function spawnNote(){
    const lane = Math.floor(Math.random()*LANES);
    notes.push({ lane, y: -20, hit: false });
  }

  function drawRhythm(){
    if(!rhCtx) return;
    const w=rhythmCanvas.width, h=rhythmCanvas.height;
    rhCtx.clearRect(0,0,w,h);
    // bg
    rhCtx.fillStyle='#0e1330'; rhCtx.fillRect(0,0,w,h);
    // lanes
    const laneW = w / LANES;
    for (let i=0;i<LANES;i++){
      rhCtx.fillStyle = i%2? '#121a3a' : '#0f1633';
      rhCtx.fillRect(i*laneW, 0, laneW, h);
    }
    // hit line
    rhCtx.fillStyle='#223b6a'; rhCtx.fillRect(0, HIT_Y-2, w, 4);
    // notes
    for (const n of notes){
      const x = n.lane*laneW + laneW*0.2;
      const w2 = laneW*0.6;
      rhCtx.fillStyle = n.hit? '#2bd46a' : '#9fd1ff';
      rhCtx.fillRect(x, n.y-12, w2, 24);
    }
    // lane labels
    rhCtx.fillStyle='#a9b4ff'; rhCtx.font='12px system-ui'; rhCtx.textAlign='center';
    for(let i=0;i<LANES;i++){ rhCtx.fillText(LANE_KEYS[i].toUpperCase(), i*laneW+laneW/2, h-8); }
  }

  function updateRhythm(dt){
    spawnCd -= dt;
    if (spawnCd<=0){ spawnNote(); spawnCd = 0.45 + Math.random()*0.35; }
    for (const n of notes){ if(!n.hit) n.y += NOTE_SPEED*dt; }
    // clear passed notes (misses)
    const before = notes.length;
    notes = notes.filter(n => {
      if (n.hit) return false; // remove hit notes
      if (n.y > HIT_Y + HIT_WINDOW + 24){ rCombo = 0; rhythmComboEl.textContent=String(rCombo); return false; }
      return true;
    });
    // draw
    drawRhythm();
  }

  function tickRhythm(ts){
    rRaf = requestAnimationFrame(tickRhythm);
    const dt = Math.min((ts-(rLast||ts))/1000, 0.05); rLast=ts;
    if (rOn) updateRhythm(dt);
  }

  function handleLaneHit(lane){
    // find closest note near HIT_Y in that lane
    let targetIdx = -1; let bestDist = 1e9;
    for (let i=0;i<notes.length;i++){
      const n = notes[i]; if (n.lane!==lane || n.hit) continue; const d = Math.abs(n.y - HIT_Y); if (d < bestDist){ bestDist = d; targetIdx = i; }
    }
    if (targetIdx>=0 && bestDist <= HIT_WINDOW){
      notes[targetIdx].hit = true; rCombo++; rhythmComboEl.textContent=String(rCombo);
    } else {
      rCombo = 0; rhythmComboEl.textContent=String(rCombo);
    }
  }

  function keyRhythm(e){
    if(e.key==='Escape'){ closeRhythmOverlay(false); return; }
    const k = e.key.toLowerCase();
    const idx = LANE_KEYS.indexOf(k);
    if (idx>=0 && rOn) handleLaneHit(idx);
  }

  function clickRhythm(ev){ // support mouse/touch
    const rect = rhythmCanvas.getBoundingClientRect();
    const x = ev.clientX - rect.left; const lane = Math.floor(x / (rect.width / LANES));
    if (lane>=0 && lane<LANES && rOn) handleLaneHit(lane);
  }

  function openRhythmOverlay(){
    closeAnyOverlay(); overlayRhythm.setAttribute('aria-hidden','false'); overlayOpen=true;
    rOn=true; rCombo=0; notes=[]; spawnCd=0.2; rLast=0; rhythmComboEl.textContent='0'; drawRhythm();
    if(!rRaf) rRaf=requestAnimationFrame(tickRhythm);
    window.addEventListener('keydown', keyRhythm);
    rhythmCanvas?.addEventListener('mousedown', clickRhythm);
  }
  function closeRhythmOverlay(silent){
    overlayRhythm.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; rOn=false;
    window.removeEventListener('keydown', keyRhythm);
    rhythmCanvas?.removeEventListener('mousedown', clickRhythm);
    if(rRaf){ cancelAnimationFrame(rRaf); rRaf=null; }
  }
  closeBtnRhythm?.addEventListener('click', ()=> closeRhythmOverlay(false));
  rhythmStart?.addEventListener('click', ()=>{ rCombo=0; notes=[]; spawnCd=0.2; rhythmComboEl.textContent='0'; });

  // ===========================================================
  // 13) Pattern Lock
  // ===========================================================
  const overlayPattern = document.getElementById('miniOverlayPattern');
  const closeBtnPattern = document.getElementById('btnCloseMiniPattern');
  const patternCanvas = document.getElementById('patternCanvas');
  const pct = patternCanvas?.getContext('2d');
  const patternStart = document.getElementById('patternStart');
  const DOTS=3, PAD=80; let pat=[], patInput=[], drawing=false;
  function genPattern(){ pat=[]; const used=new Set(); while(pat.length<4){ const i=Math.floor(Math.random()*9); if(!used.has(i)){ used.add(i); pat.push(i);} } drawPattern(true); setTimeout(()=> drawPattern(false), 800); }
  function dotPos(i){ const col=i%DOTS,row=Math.floor(i/DOTS); const cx=PAD+col*((patternCanvas.width-2*PAD)/(DOTS-1)); const cy=PAD+row*((patternCanvas.height-2*PAD)/(DOTS-1)); return {cx,cy}; }
  function drawPattern(showSeq=false){ pct.clearRect(0,0,patternCanvas.width,patternCanvas.height); pct.fillStyle='#0e1330'; pct.fillRect(0,0,patternCanvas.width,patternCanvas.height); pct.strokeStyle='#2b2f55'; pct.lineWidth=2; for(let i=0;i<9;i++){ const {cx,cy}=dotPos(i); pct.beginPath(); pct.arc(cx,cy,8,0,Math.PI*2); pct.fillStyle='#9fd1ff'; pct.fill(); } if(showSeq){ pct.strokeStyle='#ffca28'; pct.lineWidth=4; pct.beginPath(); pat.forEach((i,k)=>{ const {cx,cy}=dotPos(i); if(k===0) pct.moveTo(cx,cy); else pct.lineTo(cx,cy); }); pct.stroke(); } }
  function pickClosest(x,y){ let best=-1,bd=9999; for(let i=0;i<9;i++){ const {cx,cy}=dotPos(i); const d=Math.hypot(x-cx,y-cy); if(d<18 && d<bd){ bd=d; best=i;} } return best; }
  patternCanvas?.addEventListener('mousedown',(e)=>{ drawing=true; patInput=[]; const r=patternCanvas.getBoundingClientRect(); const i=pickClosest(e.clientX-r.left, e.clientY-r.top); if(i>=0) patInput.push(i); });
  patternCanvas?.addEventListener('mousemove',(e)=>{ if(!drawing) return; const r=patternCanvas.getBoundingClientRect(); const i=pickClosest(e.clientX-r.left, e.clientY-r.top); if(i>=0 && patInput[patInput.length-1]!==i) patInput.push(i); drawPattern(false); pct.strokeStyle='#90caf9'; pct.lineWidth=4; pct.beginPath(); patInput.forEach((idx,k)=>{ const {cx,cy}=dotPos(idx); if(k===0) pct.moveTo(cx,cy); else pct.lineTo(cx,cy); }); pct.stroke(); });
  window.addEventListener('mouseup', ()=>{ if(!drawing) return; drawing=false; const ok = patInput.length===pat.length && patInput.every((v,i)=> v===pat[i]); setTimeout(()=> { if(ok) closePatternOverlay(false); else genPattern(); }, 300); });
  function openPatternOverlay(){ closeAnyOverlay(); overlayPattern.setAttribute('aria-hidden','false'); overlayOpen=true; genPattern(); }
  function closePatternOverlay(silent){ overlayPattern.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; }
  closeBtnPattern?.addEventListener('click', ()=> closePatternOverlay(false));
  patternStart?.addEventListener('click', ()=> genPattern());

  // ===========================================================
  // 14) Lights Out
  // ===========================================================
  const overlayLights = document.getElementById('miniOverlayLights');
  const closeBtnLights = document.getElementById('btnCloseMiniLights');
  const lightsCanvas = document.getElementById('lightsCanvas');
  const lctx = lightsCanvas?.getContext('2d');
  const lightsShuffle = document.getElementById('lightsShuffle');
  const L_N = 5; // 5x5 grid
  let lights = Array.from({length:L_N},()=> Array.from({length:L_N},()=> false));

  function drawLights(){
    if(!lctx) return;
    const w=lightsCanvas.width,h=lightsCanvas.height; const cw=w/L_N,ch=h/L_N;
    lctx.clearRect(0,0,w,h); lctx.fillStyle='#0e1330'; lctx.fillRect(0,0,w,h);
    for(let y=0;y<L_N;y++){
      for(let x=0;x<L_N;x++){
        lctx.fillStyle = lights[y][x] ? '#ffd54f' : '#1a2342';
        lctx.fillRect(x*cw+2, y*ch+2, cw-4, ch-4);
      }
    }
  }
  function toggleAt(x,y){ if(x<0||y<0||x>=L_N||y>=L_N) return; lights[y][x]=!lights[y][x]; }
  function clickLights(ev){
    const r=lightsCanvas.getBoundingClientRect(); const x=Math.floor((ev.clientX-r.left)/(r.width/L_N)); const y=Math.floor((ev.clientY-r.top)/(r.height/L_N));
    toggleAt(x,y); toggleAt(x-1,y); toggleAt(x+1,y); toggleAt(x,y-1); toggleAt(x,y+1);
    drawLights();
    // win check (all off)
    const anyOn = lights.some(row=> row.some(v=> v));
    if(!anyOn){ try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'lights' }); } catch{} setTimeout(()=> closeLightsOverlay(false), 80); }
  }
  function shuffleLights(){
    // randomize by clicking random cells to ensure solvable
    lights = Array.from({length:L_N},()=> Array.from({length:L_N},()=> false));
    for(let i=0;i<12;i++){ const x=Math.floor(Math.random()*L_N); const y=Math.floor(Math.random()*L_N); toggleAt(x,y); toggleAt(x-1,y); toggleAt(x+1,y); toggleAt(x,y-1); toggleAt(x,y+1); }
    drawLights();
  }
  function openLightsOverlay(){ closeAnyOverlay(); overlayLights.setAttribute('aria-hidden','false'); overlayOpen=true; shuffleLights(); lightsCanvas?.addEventListener('mousedown', clickLights); }
  function closeLightsOverlay(silent){ overlayLights.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; lightsCanvas?.removeEventListener('mousedown', clickLights); }
  closeBtnLights?.addEventListener('click', ()=> closeLightsOverlay(false));
  lightsShuffle?.addEventListener('click', ()=> shuffleLights());

  // ===========================================================
  // 15) Whack-a-Mole
  // ===========================================================
  const overlayMole = document.getElementById('miniOverlayMole');
  const closeBtnMole = document.getElementById('btnCloseMiniMole');
  const moleCanvas = document.getElementById('moleCanvas');
  const moctx = moleCanvas?.getContext('2d');
  const moleStart = document.getElementById('moleStart');
  const moleTime = document.getElementById('moleTime');
  const moleScoreEl = document.getElementById('moleScore');
  let moRaf=null, moLast=0, moCd=0, moTime=20, moScore=0, moOn=false, moles=[]; // moles: {x,y,up}

  function layoutMoles(){
    moles=[]; const cols=3, rows=3; const w=moleCanvas.width, h=moleCanvas.height; const pad=40; const cw=(w-2*pad)/(cols-1); const ch=(h-2*pad)/(rows-1);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) moles.push({ x: pad+c*cw, y: pad+r*ch, up:false });
  }
  function drawMole(){
    if(!moctx) return; const w=moleCanvas.width,h=moleCanvas.height; moctx.clearRect(0,0,w,h);
    // background
    moctx.fillStyle='#0e1330'; moctx.fillRect(0,0,w,h);
    // holes
    for(const m of moles){
      moctx.fillStyle='#26385f'; moctx.beginPath(); moctx.arc(m.x, m.y, 38, 0, Math.PI*2); moctx.fill();
      if(m.up){ moctx.fillStyle='#ff7043'; moctx.beginPath(); moctx.arc(m.x, m.y-10, 24, 0, Math.PI*2); moctx.fill(); moctx.fillStyle='#3e2723'; moctx.fillRect(m.x-20, m.y+6, 40, 8); }
    }
  }
  function pickUp(){ const downs=moles.filter(m=> !m.up); if(!downs.length) return; const m=downs[Math.floor(Math.random()*downs.length)]; m.up=true; setTimeout(()=> m.up=false, 700+Math.random()*400); }
  function onMoleClick(ev){ const r=moleCanvas.getBoundingClientRect(); const x=ev.clientX-r.left, y=ev.clientY-r.top; for(const m of moles){ if(m.up && Math.hypot(x-m.x, y-m.y) < 28){ m.up=false; moScore++; moleScoreEl.textContent=String(moScore); break; } } drawMole(); }
  function mLoop(ts){ moRaf=requestAnimationFrame(mLoop); const dt=Math.min((ts-(moLast||ts))/1000,0.05); moLast=ts; if(!moOn) return; moTime=Math.max(0, moTime-dt); moleTime.textContent=moTime.toFixed(1); moCd-=dt; if(moCd<=0){ pickUp(); moCd=0.5+Math.random()*0.4; } drawMole(); if(moTime<=0){ moOn=false; try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'mole' }); } catch{} setTimeout(()=> closeMoleOverlay(false), 80); } }
  function startMole(){ moOn=true; moTime=20; moScore=0; moleScoreEl.textContent='0'; moleTime.textContent='20.0'; drawMole(); }
  function openMoleOverlay(){ closeAnyOverlay(); overlayMole.setAttribute('aria-hidden','false'); overlayOpen=true; layoutMoles(); drawMole(); if(!moRaf) moRaf=requestAnimationFrame(mLoop); moleCanvas?.addEventListener('mousedown', onMoleClick); }
  function closeMoleOverlay(silent){ overlayMole.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; moleCanvas?.removeEventListener('mousedown', onMoleClick); if(moRaf){ cancelAnimationFrame(moRaf); moRaf=null; } }
  closeBtnMole?.addEventListener('click', ()=> closeMoleOverlay(false));
  moleStart?.addEventListener('click', ()=> startMole());

  // ===========================================================
  // 16) Slider Puzzle (15-puzzle)
  // ===========================================================
  const overlaySlider = document.getElementById('miniOverlaySlider');
  const closeBtnSlider = document.getElementById('btnCloseMiniSlider');
  const sliderCanvas = document.getElementById('sliderCanvas');
  const sctx = sliderCanvas?.getContext('2d');
  const sliderShuffle = document.getElementById('sliderShuffle');
  const S_N = 4; // 4x4
  let tiles = Array.from({length:S_N*S_N}, (_,i)=> i); // 0..15, 0 = blank

  function drawSlider(){
    if(!sctx) return; const w=sliderCanvas.width,h=sliderCanvas.height; const cw=w/S_N,ch=h/S_N; sctx.clearRect(0,0,w,h); sctx.fillStyle='#0e1330'; sctx.fillRect(0,0,w,h);
    sctx.textAlign='center'; sctx.textBaseline='middle'; sctx.font='28px system-ui';
    for(let i=0;i<tiles.length;i++){
      const v=tiles[i]; const x=(i%S_N)*cw, y=Math.floor(i/S_N)*ch; if(v===0){ sctx.fillStyle='#0e1330'; sctx.fillRect(x+2,y+2,cw-4,ch-4); continue; }
      sctx.fillStyle='#546e7a'; sctx.fillRect(x+2,y+2,cw-4,ch-4); sctx.fillStyle='#fff'; sctx.fillText(String(v), x+cw/2, y+ch/2);
    }
  }
  function indexOfBlank(){ return tiles.indexOf(0); }
  function swap(i,j){ const t=tiles[i]; tiles[i]=tiles[j]; tiles[j]=t; }
  function neighbors(i){ const x=i%S_N,y=Math.floor(i/S_N); const arr=[]; if(x>0) arr.push(i-1); if(x<S_N-1) arr.push(i+1); if(y>0) arr.push(i-S_N); if(y<S_N-1) arr.push(i+S_N); return arr; }
  function clickSlider(ev){ const r=sliderCanvas.getBoundingClientRect(); const cw=r.width/S_N, ch=r.height/S_N; const cx=Math.floor((ev.clientX-r.left)/cw); const cy=Math.floor((ev.clientY-r.top)/ch); const i=cy*S_N+cx; const b=indexOfBlank(); if(neighbors(i).includes(b)){ swap(i,b); drawSlider(); if(isSolved()){ try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key: 'slider' }); } catch{} setTimeout(()=> closeSliderOverlay(false), 80); } } }
  function isSolved(){ for(let i=1;i<tiles.length;i++){ if(tiles[i-1]!==i) return false; } return true; }
  function shuffleSlider(){
    // Perform random valid moves from solved state to ensure solvable
    tiles = Array.from({length:S_N*S_N}, (_,i)=> i);
    let b=indexOfBlank();
    for(let k=0;k<200;k++){ const n=neighbors(b); const pick=n[Math.floor(Math.random()*n.length)]; swap(b,pick); b=pick; }
    drawSlider();
  }
  function openSliderOverlay(){ closeAnyOverlay(); overlaySlider.setAttribute('aria-hidden','false'); overlayOpen=true; shuffleSlider(); sliderCanvas?.addEventListener('mousedown', clickSlider); }
  function closeSliderOverlay(silent){ overlaySlider.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; sliderCanvas?.removeEventListener('mousedown', clickSlider); }
  closeBtnSlider?.addEventListener('click', ()=> closeSliderOverlay(false));
  sliderShuffle?.addEventListener('click', ()=> shuffleSlider());


  // ===========================================================
  // 17) Mop The Floor
  // ===========================================================
  const overlayMop = document.getElementById('miniOverlayMop');
  const closeBtnMop = document.getElementById('btnCloseMiniMop');
  const mopCanvas = document.getElementById('mopCanvas');
  const mopCtx = mopCanvas?.getContext('2d');
  const mopStart = document.getElementById('mopStart');
  const mopReset = document.getElementById('mopReset');
  const mopPctEl = document.getElementById('mopPct');
  let mopDragging=false, mopStarted=false, mopSeed=Math.floor(Math.random()*1e9), mopThreshold=0.999, mopDryRate=0.75, mopCoverage=0.30;
  const MOP_CELL = 8; // bigger cell -> easier
  let mopGridW = Math.floor((mopCanvas?.width||800)/MOP_CELL);
  let mopGridH = Math.floor((mopCanvas?.height||450)/MOP_CELL);
  let mopWet = new Float32Array(mopGridW*mopGridH); // 0..1 water film
  let mopInitial=0, mopRemain=0; // sum wetness
  let mopRad = 28; // px, easier
  let mopLastX = (mopCanvas?.width||800)/2, mopLastY = (mopCanvas?.height||450)/2;
  let mopHeld = false;
  let mopPos = { x: 120, y: (mopCanvas?.height||450) - 80 };
  let mopAngle = -0.6;

  function mopSRand(seed){ let s=seed|0; if(s<=0) s=1; s>>>=0; return function(){ s^=s<<13; s^=s>>>17; s^=s<<5; s>>>=0; return (s & 0x7fffffff)/0x80000000; }; }
  function setMopProgress(p){ try { MGBridge && MGBridge.progress && MGBridge.progress(p|0); } catch{} if(mopPctEl) mopPctEl.textContent=String(p|0); }
  function mopComplete(){ try { MGBridge && MGBridge.progress && MGBridge.progress(100); } catch{} try { MGBridge && MGBridge.complete && MGBridge.complete({ key:'mop' }); } catch{} setTimeout(()=> closeMopOverlay(false), 80); }
  function genMopWater(){
    const rnd=mopSRand(mopSeed); mopWet.fill(0);
    const targetCells = Math.max(1, Math.floor(mopGridW*mopGridH*mopCoverage));
    let wetCells = 0; let safety=0;
    while (wetCells < targetCells && safety++ < 200){
      const cx=Math.floor(rnd()*mopGridW), cy=Math.floor(rnd()*mopGridH);
      const rr=Math.floor(6 + rnd()*12);
      const amp=0.7 + rnd()*0.3;
      for(let y=-rr;y<=rr;y++) for(let x=-rr;x<=rr;x++){
        const gx=cx+x, gy=cy+y; if(gx<0||gy<0||gx>=mopGridW||gy>=mopGridH) continue; const d2=x*x+y*y; if(d2>rr*rr) continue;
        const fall = 1 - Math.pow(d2, 0.7)/Math.pow(rr*rr, 0.7);
        const idx=gy*mopGridW+gx; mopWet[idx]=Math.min(1, Math.max(mopWet[idx], amp*fall));
      }
      wetCells = 0; for(let i=0;i<mopWet.length;i++){ if(mopWet[i]>0.02) wetCells++; }
    }
    mopInitial=0; for(let i=0;i<mopWet.length;i++) mopInitial+=mopWet[i]; mopRemain=mopInitial; setMopProgress(0);
  }
  function drawMop(){
    if(!mopCtx) return; const W=mopCanvas.width,H=mopCanvas.height; mopCtx.clearRect(0,0,W,H);
    const tile=40; mopCtx.fillStyle='#141c33';
    for(let y=0;y<H;y+=tile){ for(let x=0;x<W;x+=tile){ mopCtx.globalAlpha=((x/tile+y/tile)%2)?0.82:0.88; mopCtx.fillRect(x,y,tile,tile); } }
    mopCtx.globalAlpha=1;
    // wetter, more visible
    for(let gy=0;gy<mopGridH;gy++){
      for(let gx=0;gx<mopGridW;gx++){
        const w=mopWet[gy*mopGridW+gx]; if(w<=0.01) continue; const x=gx*MOP_CELL, y=gy*MOP_CELL;
        mopCtx.fillStyle='rgba(80,170,255,'+(0.42*w).toFixed(3)+')';
        mopCtx.fillRect(x,y,MOP_CELL,MOP_CELL);
      }
    }
    mopCtx.globalAlpha=1;
    // edge highlight to make puddles pop
    mopCtx.save();
    mopCtx.globalCompositeOperation='lighter';
    for(let gy=1;gy<mopGridH-1;gy++){
      for(let gx=1;gx<mopGridW-1;gx++){
        const w=mopWet[gy*mopGridW+gx]; if(w<0.2) continue; const n=mopWet[(gy-1)*mopGridW+gx], s=mopWet[(gy+1)*mopGridW+gx], e=mopWet[gy*mopGridW+gx+1], ww=mopWet[gy*mopGridW+gx-1];
        if(n<0.08||s<0.08||e<0.08||ww<0.08){ const x=gx*MOP_CELL, y=gy*MOP_CELL; mopCtx.fillStyle='rgba(200,230,255,0.25)'; mopCtx.fillRect(x,y,MOP_CELL,MOP_CELL); }
      }
    }
    mopCtx.restore();

    const avg=mopInitial?(mopRemain/mopInitial):0;
    if(avg>0.02){ mopCtx.save(); mopCtx.globalAlpha=0.05+0.15*avg; mopCtx.strokeStyle='rgba(255,255,255,0.9)'; mopCtx.lineWidth=2; for(let x=-H;x<W+H;x+=28){ mopCtx.beginPath(); mopCtx.moveTo(x,0); mopCtx.lineTo(x+H,H); mopCtx.stroke(); } mopCtx.restore(); }
    // glow while dragging around mop head
    if(mopDragging && mopHeld){ const t=performance.now()/1000; const r=mopRad*(1+0.05*Math.sin(t*8)); mopCtx.save(); mopCtx.globalCompositeOperation='lighter'; const g=mopCtx.createRadialGradient(mopLastX,mopLastY,0,mopLastX,mopLastY,r); g.addColorStop(0,'rgba(120,200,255,0.25)'); g.addColorStop(1,'rgba(120,200,255,0.0)'); mopCtx.fillStyle=g; mopCtx.beginPath(); mopCtx.arc(mopLastX,mopLastY,r,0,Math.PI*2); mopCtx.fill(); mopCtx.restore(); }
    drawMopTool();
  }

  function drawMopTool(){
    const x = mopHeld ? mopLastX : mopPos.x; const y = mopHeld ? mopLastY : mopPos.y; const ang = mopHeld ? mopAngle : -0.6;
    mopCtx.save(); mopCtx.translate(x,y); mopCtx.rotate(ang);

    // shadow under head
    mopCtx.save();
    mopCtx.fillStyle='rgba(0,0,0,0.32)';
    mopCtx.beginPath(); mopCtx.ellipse(0,42,mopRad*1.1,mopRad*0.55,0,0,Math.PI*2); mopCtx.fill();
    mopCtx.restore();

    // wooden handle
    const handleLen=160; const grad=mopCtx.createLinearGradient(0,-handleLen,0,20); grad.addColorStop(0,'#6d4c41'); grad.addColorStop(1,'#4e342e');
    mopCtx.strokeStyle=grad; mopCtx.lineWidth=10; mopCtx.lineCap='round';
    mopCtx.beginPath(); mopCtx.moveTo(-2,-handleLen); mopCtx.lineTo(-2,24); mopCtx.stroke();

    // ferrule
    mopCtx.fillStyle='#795548'; mopCtx.strokeStyle='rgba(0,0,0,0.35)'; mopCtx.lineWidth=2; mopCtx.fillRect(-16,16,32,16); mopCtx.strokeRect(-16,16,32,16);

    // head pad
    const rHead=Math.max(12,mopRad*0.55); const g2=mopCtx.createRadialGradient(0,28,rHead*0.15,0,28,rHead); g2.addColorStop(0,'#e1ffff'); g2.addColorStop(1,'#b0bec5');
    mopCtx.fillStyle=g2; mopCtx.beginPath(); mopCtx.arc(0,28,rHead,0,Math.PI*2); mopCtx.fill(); mopCtx.strokeStyle='rgba(255,255,255,0.6)'; mopCtx.lineWidth=1.5; mopCtx.stroke();

    // cloth fibers
    const cols=['#e0e0e0','#cfd8dc','#b0bec5','#8d6e63'];
    mopCtx.lineCap='round';
    for(let i=0;i<12;i++){
      const off=(i-5.5)*2.8; const len=32+(i%4)*6; const spread=off*0.9;
      mopCtx.strokeStyle=cols[i%cols.length]; mopCtx.lineWidth=4+(i%3===0?1:0);
      mopCtx.beginPath(); mopCtx.moveTo(off,32);
      mopCtx.bezierCurveTo(off+spread*0.2,42, off+spread*0.65,52, off+spread,32+len);
      mopCtx.stroke();
    }

    mopCtx.restore();
    if(!mopHeld){ mopCtx.save(); mopCtx.strokeStyle='rgba(80,170,255,0.7)'; mopCtx.setLineDash([6,6]); mopCtx.beginPath(); mopCtx.arc(mopPos.x,mopPos.y,24,0,Math.PI*2); mopCtx.stroke(); mopCtx.restore(); }
  }
  function mopCleanup(px,py){ const r=Math.max(10,mopRad|0); const minGX=Math.max(0,Math.floor((px-r)/MOP_CELL)); const maxGX=Math.min(mopGridW-1,Math.floor((px+r)/MOP_CELL)); const minGY=Math.max(0,Math.floor((py-r)/MOP_CELL)); const maxGY=Math.min(mopGridH-1,Math.floor((py+r)/MOP_CELL)); const rr=r*r; let delta=0; for(let gy=minGY;gy<=maxGY;gy++){ for(let gx=minGX;gx<=maxGX;gx++){ const cx=gx*MOP_CELL+MOP_CELL/2, cy=gy*MOP_CELL+MOP_CELL/2; const dx=cx-px, dy=cy-py; if(dx*dx+dy*dy>rr) continue; const idx=gy*mopGridW+gx; if(mopWet[idx]>0){ const before=mopWet[idx]; mopWet[idx]=Math.max(0, mopWet[idx]-mopDryRate); delta += (before - mopWet[idx]); } } } if(delta>0){ mopRemain=Math.max(0,mopRemain-delta); mopUpdateProgress(); } }
  function mopUpdateProgress(){ const dried=mopInitial?(mopInitial-mopRemain)/mopInitial:1; const pct=Math.floor(dried*100); setMopProgress(pct); if(dried>=mopThreshold) mopComplete(); }
  function mopPointer(ev){ const r=mopCanvas.getBoundingClientRect(); const x=(ev.clientX-r.left)*(mopCanvas.width/r.width); const y=(ev.clientY-r.top)*(mopCanvas.height/r.height); const ox=mopLastX, oy=mopLastY; mopLastX=x; mopLastY=y; mopAngle = Math.atan2(y-oy, x-ox) - Math.PI/2; if(mopHeld){ mopCleanup(x,y); } drawMop(); }
  function openMopOverlay(){ closeAnyOverlay(); overlayMop.setAttribute('aria-hidden','false'); overlayOpen=true; mopStarted=false; mopDragging=false; mopHeld=false; mopPos={ x:120, y:(mopCanvas?.height||450)-80 }; mopSeed=Math.floor(Math.random()*1e9); genMopWater(); drawMop(); mopCanvas?.addEventListener('mousedown', onMopDown); window.addEventListener('mouseup', onMopUp); mopCanvas?.addEventListener('mousemove', onMopMove); window.addEventListener('keydown', onMopKey); }
  function closeMopOverlay(silent){ overlayMop.setAttribute('aria-hidden','true'); if(!silent) overlayOpen=false; mopCanvas?.removeEventListener('mousedown', onMopDown); window.removeEventListener('mouseup', onMopUp); mopCanvas?.removeEventListener('mousemove', onMopMove); window.removeEventListener('keydown', onMopKey); }
  function onMopDown(ev){ if(!mopStarted) mopStarted=true; const r=mopCanvas.getBoundingClientRect(); const x=(ev.clientX-r.left)*(mopCanvas.width/r.width); const y=(ev.clientY-r.top)*(mopCanvas.height/r.height); if(!mopHeld){ const dx=x-mopPos.x, dy=y-mopPos.y; if(Math.hypot(dx,dy)<=30){ mopHeld=true; drawMop(); return; } } mopDragging=true; mopPointer(ev); }
  function onMopUp(){ mopDragging=false; }
  function onMopMove(ev){ if(!mopDragging) return; mopPointer(ev); }
  function onMopKey(e){ if(!overlayOpen) return; if(e.key==='d'||e.key==='D'){ if(mopHeld){ mopHeld=false; mopPos.x=mopLastX; mopPos.y=mopLastY; drawMop(); } } }
  closeBtnMop?.addEventListener('click', ()=> closeMopOverlay(false));
  mopStart?.addEventListener('click', ()=> { if(!mopStarted) mopStarted=true; });
  mopReset?.addEventListener('click', ()=> { mopHeld=false; mopPos={ x:120, y:(mopCanvas?.height||450)-80 }; genMopWater(); drawMop(); });


  // Auto-open specific overlay if 'game' query is provided or via mg:init/mg:open
  (function autoOpenSpecific(){
    try {
      const map = {
        dodge: openDodgeOverlay, react: openReactOverlay, aim: openAimOverlay, tap: openTapOverlay,
        wires: openWiresOverlay, upload: openUploadOverlay, mix: openMixOverlay, switch: openSwitchOverlay,
        card: openCardOverlay, timer: openTimerOverlay, align: openAlignOverlay, simon: openSimonOverlay,
        pipes: openPipesOverlay, math: openMathOverlay, rhythm: openRhythmOverlay, pattern: openPatternOverlay,
        lights: openLightsOverlay, mole: openMoleOverlay, slider: openSliderOverlay, mop: openMopOverlay, broom: openMopOverlay
      };
      const openKey = (k)=>{ const fn = map[String(k||'').toLowerCase()]; if (typeof fn==='function') fn(); };
      const qs = new URLSearchParams(location.search).get('game');
      if (qs) setTimeout(()=> openKey(qs), 0);
      document.addEventListener('mg:open', (e)=> openKey(e?.detail?.key || e?.detail || ''));
      window.addEventListener('message', (ev)=>{ const d=ev?.data||{}; if(d && d.type==='mg:init' && (d.game||d.id)) setTimeout(()=> openKey(d.game||d.id), 0); });
    } catch {}
  })();
})();






