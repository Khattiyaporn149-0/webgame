(() => {
  const U = {
    $(id){ return document.getElementById(id); },
    clamp(v,a,b){ return Math.max(a, Math.min(b, v)); },
    lerp(a,b,t){ return a + (b-a)*t; },
  };

  const canvas = U.$('mopCanvas');
  const ctx = canvas.getContext('2d');
  const btnStart = U.$('btnStart');
  const btnReset = U.$('btnReset');
  const btnExit = U.$('btnExit');
  const progBar = U.$('progBar');
  const progText = U.$('progText');

  // Game state
  let started = false;
  let dragging = false;
  let cell = 8; // larger cell -> fewer cells -> easier
  let gridW = Math.floor((canvas.width||800)/cell), gridH = Math.floor((canvas.height||450)/cell);
  let wet = new Float32Array(gridW * gridH); // 0..1 amount of water
  let initialWet = 0, remainWet = 0; // sum of wetness
  let coverage = 0.30; // portion of area initially wet (easier than full)
  let mopRadius = 28; // easier: larger mop head in px
  let seed = Math.floor(Math.random()*1e9);
  let threshold = 0.999; // require 100% (effectively) to complete
  let dryRate = 0.75; // how much wetness removed per pass (0..1)
  let paused = false;
  let raf = 0;
  // Mop tool (must pick up first)
  let mopHeld = false;
  let mopPos = { x: 120, y: (canvas.height||450) - 80 };
  let mopAngle = -0.6; // radians

  function SRand(seed){
    let s = seed|0; if (s<=0) s = 1; s >>>= 0;
    return function(){ // xorshift32
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return (s & 0x7fffffff) / 0x80000000;
    };
  }

  function setProgress(p){
    const pct = U.clamp(p|0, 0, 100);
    progBar.style.width = pct + '%';
    progText.textContent = pct + '%';
    if (window.MGBridge && typeof MGBridge.progress === 'function') MGBridge.progress(pct);
  }

  function complete(){
    setProgress(100);
    started = false; dragging = false;
    toast('✅ สะอาดเรียบร้อย!');
    try { window.MGBridge?.complete?.({ key:'mop' }); } catch {}
  }

  function toast(msg){
    try {
      const t = document.createElement('div');
      t.textContent = msg; t.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);background:#0e1631;color:#fff;border:1px solid #2a3560;padding:6px 10px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .15s';
      document.body.appendChild(t); requestAnimationFrame(()=>{ t.style.opacity='1'; });
      setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=> t.remove(), 200); }, 1200);
    } catch {}
  }

  function genWet(){
    const rnd = SRand(seed);
    wet.fill(0);
    const targetCells = Math.max(1, Math.floor(gridW*gridH*coverage));
    let wetCells = 0;
    // paint watery blobs until hitting targetCells
    let safety = 0;
    while (wetCells < targetCells && safety++ < 200) {
      const cx = Math.floor(rnd()*gridW);
      const cy = Math.floor(rnd()*gridH);
      const rr = Math.floor(6 + rnd()*12); // radius in cells
      const amp = 0.7 + rnd()*0.3; // 0.7..1.0 center wetness
      for (let y=-rr; y<=rr; y++){
        for (let x=-rr; x<=rr; x++){
          const gx=cx+x, gy=cy+y; if (gx<0||gy<0||gx>=gridW||gy>=gridH) continue;
          const d2 = x*x + y*y; if (d2 > rr*rr) continue;
          const fall = 1 - Math.pow(d2, 0.7) / Math.pow(rr*rr, 0.7);
          const idx = gy*gridW + gx;
          const before = wet[idx];
          wet[idx] = Math.min(1, Math.max(wet[idx], amp * fall));
        }
      }
      // recount roughly; acceptable cost at this grid size
      wetCells = 0; for (let i=0;i<wet.length;i++){ if (wet[i] > 0.02) wetCells++; }
    }
    initialWet = 0; for (let i=0;i<wet.length;i++) initialWet += wet[i];
    remainWet = initialWet;
  }

  function draw(){
    // Floor background tiles
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    const tile = 40; ctx.fillStyle = '#141c33';
    for (let y=0;y<H;y+=tile){ for (let x=0;x<W;x+=tile){
      ctx.globalAlpha = ((x/tile + y/tile) % 2) ? 0.82 : 0.88;
      ctx.fillRect(x,y,tile,tile);
    }}
    ctx.globalAlpha = 1;

    // Wet film (bluish, alpha by wetness) — stronger alpha for visibility
    for (let gy=0; gy<gridH; gy++){
      for (let gx=0; gx<gridW; gx++){
        const w = wet[gy*gridW + gx]; if (w <= 0.01) continue;
        const x = gx * cell, y = gy * cell;
        ctx.fillStyle = 'rgba(80,170,255,' + (0.42 * w).toFixed(3) + ')';
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.globalAlpha = 1;

    // Edge highlight to make puddle boundaries pop
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let gy=1; gy<gridH-1; gy++){
      for (let gx=1; gx<gridW-1; gx++){
        const w = wet[gy*gridW + gx]; if (w < 0.2) continue;
        const n = wet[(gy-1)*gridW + gx], s = wet[(gy+1)*gridW + gx], e = wet[gy*gridW + gx+1], wv = wet[gy*gridW + gx-1];
        if (n < 0.08 || s < 0.08 || e < 0.08 || wv < 0.08){
          const x = gx*cell, y = gy*cell;
          ctx.fillStyle = 'rgba(200,230,255,0.25)';
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
    ctx.restore();

    // Subtle specular sheen based on average wetness
    const avg = initialWet ? (remainWet/initialWet) : 0;
    if (avg > 0.02){
      ctx.save();
      ctx.globalAlpha = 0.05 + 0.15 * avg;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      for (let x=-H; x<W+H; x+=28){
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x+H, H);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Wet swipe glow around mop head while dragging
    if (dragging && mopHeld){
      const t = performance.now()/1000;
      const r = mopRadius * (1 + 0.05*Math.sin(t*8));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, r);
      g.addColorStop(0, 'rgba(120,200,255,0.25)');
      g.addColorStop(1, 'rgba(120,200,255,0.0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lastX,lastY,r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Draw mop tool (pickup when not held, follow pointer when held)
    drawMopTool();
  }

  function drawMopTool(){
    const x = mopHeld ? lastX : mopPos.x;
    const y = mopHeld ? lastY : mopPos.y;
    const angle = mopHeld ? mopAngle : -0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // soft shadow under head
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 42, mopRadius*1.1, mopRadius*0.55, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // wooden handle
    const handleLen = 160;
    const grad = ctx.createLinearGradient(0, -handleLen, 0, 20);
    grad.addColorStop(0, '#6d4c41');
    grad.addColorStop(1, '#4e342e');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -handleLen);
    ctx.lineTo(-2, 24);
    ctx.stroke();

    // metal clamp / ferrule
    ctx.fillStyle = '#795548';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.fillRect(-16, 16, 32, 16);
    ctx.strokeRect(-16, 16, 32, 16);

    // round head pad (subtle)
    const rHead = Math.max(12, mopRadius*0.55);
    const g2 = ctx.createRadialGradient(0, 28, rHead*0.15, 0, 28, rHead);
    g2.addColorStop(0, '#e1ffff');
    g2.addColorStop(1, '#b0bec5');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, 28, rHead, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();

    // cloth fibers
    const cols = ['#e0e0e0','#cfd8dc','#b0bec5','#8d6e63'];
    ctx.lineCap = 'round';
    for (let i=0;i<12;i++){
      const off = (i-5.5)*2.8; // x offset at clamp
      const len = 32 + (i%4)*6; // fiber length
      const spread = off*0.9;   // horizontal spread
      ctx.strokeStyle = cols[i%cols.length];
      ctx.lineWidth = 4 + (i%3===0?1:0);
      ctx.beginPath();
      ctx.moveTo(off, 32); // start just below clamp
      // bezier control for a soft curved strand
      ctx.bezierCurveTo(off+spread*0.2, 42,
                        off+spread*0.65, 52,
                        off+spread, 32+len);
      ctx.stroke();
    }

    ctx.restore();

    if (!mopHeld){
      // hint ring near pickup
      ctx.save();
      ctx.strokeStyle = 'rgba(80,170,255,0.7)';
      ctx.setLineDash([6,6]);
      ctx.beginPath(); ctx.arc(mopPos.x, mopPos.y, 24, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  function cleanupAt(px, py){
    // px,py are canvas coords; affect cells within mopRadius by reducing wetness
    const r = Math.max(10, mopRadius|0);
    const minGX = Math.max(0, Math.floor((px - r) / cell));
    const maxGX = Math.min(gridW-1, Math.floor((px + r) / cell));
    const minGY = Math.max(0, Math.floor((py - r) / cell));
    const maxGY = Math.min(gridH-1, Math.floor((py + r) / cell));
    const rr = r*r;
    let delta = 0;
    for (let gy=minGY; gy<=maxGY; gy++){
      for (let gx=minGX; gx<=maxGX; gx++){
        const cx = gx*cell + cell/2, cy = gy*cell + cell/2;
        const dx = cx - px, dy = cy - py; if (dx*dx + dy*dy > rr) continue;
        const idx = gy*gridW + gx;
        if (wet[idx] > 0){ const before = wet[idx]; wet[idx] = Math.max(0, wet[idx] - dryRate); delta += (before - wet[idx]); }
      }
    }
    if (delta>0){ remainWet = Math.max(0, remainWet - delta); updateProgress(); }
  }

  function updateProgress(){
    const dried = initialWet ? (initialWet - remainWet) / initialWet : 1;
    const pct = Math.floor(dried * 100);
    setProgress(pct);
    if (dried >= threshold){ complete(); }
  }

  function start(){
    if (started) return;
    started = true; dragging = false;
    try { window.MGBridge?.setActive?.('mop'); } catch {}
    toast('เริ่มถูพื้น!');
  }

  let lastX = canvas.width/2, lastY = canvas.height/2;
  function reset(){
    genWet();
    draw();
    setProgress(0);
    started = false; dragging = false; mopHeld = false; mopPos = { x: 120, y: (canvas.height||450)-80 };
  }

  function onPointerDown(e){
    if (!started) return start();
    const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width/rect.width); const y = (e.clientY - rect.top) * (canvas.height/rect.height);
    lastX=x; lastY=y;
    // Pick up mop if clicking near it
    if (!mopHeld){
      const dx = x - mopPos.x, dy = y - mopPos.y;
      if (Math.hypot(dx,dy) <= 30){ mopHeld = true; toast('หยิบไม้ถูแล้ว!'); draw(); return; }
    }
    dragging = true; handlePointer(e);
  }
  function onPointerUp(){ dragging = false; }
  function onPointerMove(e){ if (!dragging) return; handlePointer(e); }
  function handlePointer(e){ if (paused) return; const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left) * (canvas.width/rect.width); const y = (e.clientY - rect.top) * (canvas.height/rect.height); const ox=lastX, oy=lastY; lastX=x; lastY=y; mopAngle = Math.atan2(y-oy, x-ox) - Math.PI/2; if (mopHeld){ cleanupAt(x,y); } draw(); }

  // Keyboard
  function onKey(e){
    if (e.key === 'Escape') { try { window.MGBridge?.cancel?.(); } catch {} }
    if ((e.key === ' ' || e.key === 'Enter') && !started) start();
    if (e.key === 'd' || e.key === 'D'){ if (mopHeld){ mopHeld=false; mopPos.x=lastX; mopPos.y=lastY; toast('วางไม้ถูแล้ว'); draw(); } }
  }

  function loop(){ if (!paused){ /* could animate wet trails, etc. */ } raf = requestAnimationFrame(loop); }

  // Bind UI
  btnStart?.addEventListener('click', start);
  btnReset?.addEventListener('click', reset);
  btnExit?.addEventListener('click', ()=>{ try { window.MGBridge?.cancel?.(); } catch {} });

  // Pointer events
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKey, true);

  // Listen to bridge pauses
  document.addEventListener('mg:pause', ()=>{ paused = true; });
  document.addEventListener('mg:resume', ()=>{ paused = false; });

  function applyDifficulty(diff){
    // Adjust mop size and completion threshold by difficulty
    const d = String(diff||'normal').toLowerCase();
    if (d === 'easy'){ mopRadius = 34; threshold = 0.999; dryRate = 0.85; coverage = 0.22; }
    else if (d === 'hard'){ mopRadius = 22; threshold = 0.999; dryRate = 0.6; coverage = 0.45; }
    else { mopRadius = 28; threshold = 0.999; dryRate = 0.75; coverage = 0.30; }
  }

  function initWith(data){
    try { seed = (data && data.seed) ? data.seed : seed; } catch {}
    try { applyDifficulty(data && data.difficulty); } catch {}
    reset();
  }

  // Bridge handshake
  if (window.MGBridge){
    try { MGBridge.onInit(initWith); } catch {}
  }

  // Initial draw
  reset();
  loop();
})();
