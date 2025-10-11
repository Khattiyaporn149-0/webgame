// Common Settings and Audio Utility
// Unifies settings across pages and keeps BGM seamless between pages

(function(){
  const KEY = 'gameSettings';
  const TIME_KEY = 'bgmTime';
  const SHOULD_PLAY_KEY = 'bgmShouldPlay';
  const defaults = { master: 1.0, music: 0.5, sfx: 0.5, region: 'asia' };

  function readSettings() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults };
      const obj = JSON.parse(raw);
      return { ...defaults, ...obj };
    } catch {
      return { ...defaults };
    }
  }

  function writeSettings(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent('gameSettingsChanged', { detail: s }));
  }

  // Public API: GameSettings
  const GameSettings = {
    get() { return readSettings(); },
    set(partial) {
      const cur = readSettings();
      const next = { ...cur, ...partial };
      writeSettings(next);
      // update audio volumes if initialized
      if (window.GameAudio) window.GameAudio.applyVolumes();
    },
    onChange(cb) {
      window.addEventListener('gameSettingsChanged', (e) => cb(e.detail));
      window.addEventListener('storage', (e) => {
        if (e.key === KEY && e.newValue) {
          try { cb(JSON.parse(e.newValue)); } catch {}
        }
        // Bridge legacy 'settings' key -> gameSettings
        if (e.key === 'settings' && e.newValue) {
          try {
            const legacy = JSON.parse(e.newValue);
            const mapped = {
              master: legacy.master ?? defaults.master,
              music:  legacy.music  ?? defaults.music,
              sfx:    legacy.sfx    ?? defaults.sfx,
              region: legacy.region ?? defaults.region,
            };
            writeSettings(mapped);
            cb(mapped);
          } catch {}
        }
      });
    },
    bindUI(ids) {
      const s = readSettings();
      const rangeMaster = document.getElementById(ids.rangeMaster || 'rangeMaster');
      const rangeMusic = document.getElementById(ids.rangeMusic || 'rangeMusic');
      const rangeSfx = document.getElementById(ids.rangeSfx || 'rangeSfx');
      const regionSel  = document.getElementById(ids.regionSel  || 'regionSel');

      if (rangeMaster) rangeMaster.value = s.master;
      if (rangeMusic)  rangeMusic.value  = s.music;
      if (rangeSfx)    rangeSfx.value    = s.sfx;
      if (regionSel)   regionSel.value   = s.region;

      rangeMaster && rangeMaster.addEventListener('input', (e) => GameSettings.set({ master: +e.target.value }));
      rangeMusic  && rangeMusic .addEventListener('input', (e) => GameSettings.set({ music:  +e.target.value }));
      rangeSfx    && rangeSfx   .addEventListener('input', (e) => GameSettings.set({ sfx:    +e.target.value }));
      regionSel   && regionSel  .addEventListener('change', (e) => GameSettings.set({ region: e.target.value }));
    }
  };

  // Public API: GameAudio
  const GameAudio = {
    bgm: null,
    click: null,
    init() {
      // Reuse existing if any (same-page scripts)
      // Serve from the static client root; express serves ../client as '/'
      this.bgm = window.bgm || new Audio('assets/sounds/galaxy-283941.mp3');
      this.click = window.clickSound || new Audio('assets/sounds/click.mp3');

      this.bgm.loop = true;

      // Restore last position
      const last = parseFloat(localStorage.getItem(TIME_KEY) || '0');
      if (!isNaN(last)) {
        try { this.bgm.currentTime = last; } catch {}
      }

      // Apply volumes from settings
      this.applyVolumes();

      // Persist on leave
      window.addEventListener('beforeunload', () => {
        try {
          localStorage.setItem(TIME_KEY, String(this.bgm.currentTime || 0));
          localStorage.setItem(SHOULD_PLAY_KEY, String(this.bgm && !this.bgm.paused ? 1 : 0));
        } catch {}
      });

      // Resume automatically if allowed, else on first user gesture
      const shouldPlay = localStorage.getItem(SHOULD_PLAY_KEY) === '1';
      const tryPlay = () => { this.bgm.play().catch(() => {}); };
      if (shouldPlay) {
        // Try immediately after DOM is ready, may be blocked
        if (document.readyState === 'complete' || document.readyState === 'interactive') tryPlay();
        else document.addEventListener('DOMContentLoaded', tryPlay, { once: true });
      }
      // Always ensure one-time gesture starts audio
      document.addEventListener('click', tryPlay, { once: true });

      // Expose globally for other scripts
      window.bgm = this.bgm;
      window.clickSound = this.click;
      window.GameAudio = this;

      return this;
    },
    applyVolumes() {
      const s = readSettings();
      if (this.bgm)   this.bgm.volume   = Math.max(0, Math.min(1, s.master * s.music));
      if (this.click) this.click.volume = Math.max(0, Math.min(1, s.master * s.sfx));
    },
    playClick() {
      if (!this.click) return;
      // Debounce rapid clicks slightly
      const now = Date.now();
      if (this._last && now - this._last < 80) return;
      this._last = now;
      this.applyVolumes();
      try { this.click.currentTime = 0; this.click.play(); } catch {}
    }
  };

  // Attach to window
  window.GameSettings = GameSettings;
  window.GameAudio = GameAudio;

  // Initialize early so audio objects/volumes are ready across pages
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    try { window.GameAudio.init(); } catch {}
  } else {
    document.addEventListener('DOMContentLoaded', () => { try { window.GameAudio.init(); } catch {} }, { once: true });
  }

  // One-time migration from legacy 'settings' key
  try {
    const legacyRaw = localStorage.getItem('settings');
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const mapped = {
        master: legacy.master ?? defaults.master,
        music:  legacy.music  ?? defaults.music,
        sfx:    legacy.sfx    ?? defaults.sfx,
        region: legacy.region ?? defaults.region,
      };
      writeSettings(mapped);
      // optional: clean old key
      // localStorage.removeItem('settings');
    }
  } catch {}

  // Global click SFX helper: ensure audio initialized, then play click
  document.addEventListener('click', () => {
    try {
      if (!window.GameAudio) return;
      if (!window.bgm || !window.clickSound) window.GameAudio.init();
      window.GameAudio.playClick();
    } catch {}
  });
})();
