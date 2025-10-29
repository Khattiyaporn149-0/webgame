/* Lightweight bridge for syncing minigames with the main page via postMessage.
 * - Zero network. Only iframe <-> parent communication.
 * - Non‑intrusive: if parent is absent, everything still works (dev mode).
 * - Auto-detects overlay open/close in dodge-square/world.html and completes on close.
 */
(function(){
  const U = {
    now: () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
    inIframe: () => { try { return window.self !== window.top; } catch(_) { return true; } },
    onReady: (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn()),
    post(type, payload={}){ try { parent.postMessage({ type, ...payload }, '*'); } catch(_){} },
  // debug: log outgoing messages from minigame to parent
  // (temporary - remove later)
  debugPost(type, payload){ try { console.log('[MGBridge] post', type, payload); parent.postMessage({ type, ...payload }, '*'); } catch(e){ console.warn('MGBridge.post failed', e); } },
    param(name){ try { return new URLSearchParams(location.search).get(name); } catch(_) { return null; } },
    throttle(fn, ms){ let t=0; return function(...a){ const n=U.now(); if (n-t>=ms){ t=n; return fn.apply(this,a);} }; },
  };

  const Bridge = {
    protocol: 1,
    activeKey: null,
    openedAt: 0,
    progressThrottled: null,
    // lifecycle
    ready(){ U.post('mg:ready', { protocol: Bridge.protocol }); },
    init(data){ if (typeof Bridge._onInit === 'function') Bridge._onInit(data||{}); },
    onInit(cb){ Bridge._onInit = cb; },
    progress(p){ if (!Bridge.progressThrottled){ Bridge.progressThrottled = U.throttle((v)=>U.post('mg:progress',{ percent: v|0 }), 120);} Bridge.progressThrottled(p); },
    complete(extra={}){ const elapsed = Math.max(0, Math.round((U.now() - (Bridge.openedAt||U.now()))/10)/100); U.post('mg:complete', { success: true, elapsed, ...extra }); },
    cancel(extra={}){ U.post('mg:cancel', { ...extra }); },
    // overlay helpers
    setActive(key){ Bridge.activeKey = key || null; Bridge.openedAt = U.now(); },
  };

  // Expose
  window.MGBridge = Bridge;

  // Auto ready
  U.onReady(() => Bridge.ready());

  // Listen parent messages
  window.addEventListener('message', (e) => {
    const d = e && e.data || {}; if (!d || typeof d !== 'object') return;
    if (d.type === 'mg:init') return Bridge.init(d);
    if (d.type === 'mg:pause') return document.dispatchEvent(new CustomEvent('mg:pause'));
    if (d.type === 'mg:resume') return document.dispatchEvent(new CustomEvent('mg:resume'));
    if (d.type === 'mg:abort') return Bridge.cancel();
  });

  // Integration for dodge-square/world.html without touching its JS internals:
  // Observe overlays by aria-hidden attribute changes and auto-complete when an overlay closes.
  function observeOverlays(){
    const map = {
      'miniOverlayDodge':'dodge', 'miniOverlayReact':'react', 'miniOverlayAim':'aim', 'miniOverlayTap':'tap',
      'miniOverlayWires':'wires','miniOverlayUpload':'upload','miniOverlayMix':'mix','miniOverlaySwitch':'switch',
      'miniOverlayCard':'card','miniOverlayTimer':'timer','miniOverlayAlign':'align','miniOverlaySimon':'simon',
      'miniOverlayPipes':'pipes','miniOverlayMath':'math','miniOverlayRhythm':'rhythm','miniOverlayPattern':'pattern',
      'miniOverlayLights':'lights','miniOverlayMole':'mole','miniOverlaySlider':'slider','miniOverlayMop':'mop'
    };
    const targets = Object.keys(map).map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    const was = new Map();
    for (const el of targets) was.set(el, el.getAttribute('aria-hidden') !== 'false');
    const mo = new MutationObserver((mutList)=>{
      for (const m of mutList){
        if (m.type !== 'attributes' || m.attributeName !== 'aria-hidden') continue;
        const el = m.target; const hidden = el.getAttribute('aria-hidden') !== 'false';
        const prev = was.get(el); was.set(el, hidden);
        const key = map[el.id];
        if (prev === true && hidden === false){ // became visible
          Bridge.setActive(key);
          Bridge.progress(0);
        } else if (prev === false && hidden === true){ // became hidden
          // Default: complete on close, EXCEPT some games that must signal success explicitly
          if (Bridge.activeKey === key) {
            const requireSelfComplete = { mop:1, wires:1 };
            if (!requireSelfComplete[key]) { // these games must signal success explicitly
              Bridge.progress(100);
              Bridge.complete({ key });
            }
            Bridge.setActive(null);
          }
        }
      }
    });
    mo.observe(document.body || document.documentElement, { subtree:true, attributes:true, attributeFilter:['aria-hidden'] });
  }

  U.onReady(observeOverlays);

  // Dev convenience: if not inside iframe and ?dev=1, simulate a simple init so minigame can start quickly.
  U.onReady(() => {
    if (!U.inIframe() && U.param('dev') === '1') {
      setTimeout(() => Bridge.init({ id: 'dev', game: U.param('game') || 'dodge', seed: 1234, difficulty: 'easy' }), 80);
    }
  });
})();
