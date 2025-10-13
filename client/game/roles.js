// roles.js — role reveal + HUD + API
const ROLE_REVEAL_DURATION = 5000;

const VISITOR_ABILITIES = {
  Engineer: 'ซ่อมแซมได้เร็วขึ้น',
  Scientist: 'มองเห็นจุดภารกิจได้ไกลขึ้น',
  Janitor: 'สามารถซ่อนหลักฐานที่ถูกขโมยได้ 1 ครั้ง',
};
const THIEF_ABILITIES = {
  Hacker: 'สามารถสุ่มปิดไฟในห้องหนึ่งเป็นเวลาสั้นๆ',
};

let _role = null;          // 'Visitor' | 'Thief'
let _abilityName = null;   // e.g. 'Engineer'
let _abilityDesc = null;   // e.g. 'ซ่อม...'
let _revealed = false;

export function getRole(){ return _role; }
export function getAbility(){ return { name:_abilityName, desc:_abilityDesc }; }
export function isRoleRevealed(){ return _revealed; }

function byId(id){ return document.getElementById(id); }

function setHudIcon(role, abilityName){
  const hud = byId('role-icon-hud');
  const img = byId('role-icon-img');
  const txt = byId('role-icon-text');
  if (!hud || !img || !txt) return;

  img.src = `assets/role/${abilityName}.png`;
  txt.textContent = `${abilityName} (${role})`;
  hud.style.boxShadow = role === 'Thief'
    ? '0 0 15px 3px #ff3333'
    : '0 0 15px 3px #00ff80';

  hud.style.transition = 'transform .25s, box-shadow .3s';
  hud.style.transform = 'scale(1.2)';
  setTimeout(()=> hud.style.transform = 'scale(1)', 250);
}

export async function initRoles(){
  // สุ่มบทบาท + ความสามารถ
  _role = Math.random() < 0.5 ? 'Visitor' : 'Thief';
  const pool = _role === 'Visitor' ? VISITOR_ABILITIES : THIEF_ABILITIES;
  const keys = Object.keys(pool);
  _abilityName = keys[Math.floor(Math.random()*keys.length)];
  _abilityDesc = pool[_abilityName];

  // เข้าถึง modal
  const modal = byId('role-reveal-modal');
  const nameEl = byId('role-name-text');
  const teamEl = byId('role-team-text');
  const abilityEl = byId('role-ability-text');
  const charImg = byId('role-character-image');
  const charWrap = byId('role-character-display');

  // set texts/colors/visuals
  if (nameEl) nameEl.textContent = _abilityName.toUpperCase();
  if (teamEl){
    teamEl.textContent = _role === 'Visitor' ? 'ฝ่าย: ผู้เยี่ยมชม' : 'ฝ่าย: หัวขโมย';
    teamEl.style.color  = _role === 'Visitor' ? '#4CAF50' : '#FF0000';
  }
  if (abilityEl) abilityEl.textContent = _abilityDesc;

  if (charWrap){
    charWrap.classList.remove('character-glow-visitor', 'character-glow-thief');
    charWrap.classList.add(_role === 'Visitor' ? 'character-glow-visitor' : 'character-glow-thief');
  }
  if (charImg){
    // ใช้รูปผู้เล่นปัจจุบัน ถ้ามีใน DOM
    const player = byId('player');
    if (player?.src) charImg.src = player.src;
  }

  // แสดง modal + บล็อกการเดินชั่วคราว
  _revealed = true;
  if (modal){
    modal.style.opacity = '1';
    modal.style.display = 'flex';
  }

  // แถบภารกิจซ่อนถ้าเป็นโจร
  const missionHud = byId('mission-status-container');
  if (missionHud) missionHud.style.display = _role === 'Thief' ? 'none' : 'block';

  // HUD ไอคอน
  setHudIcon(_role, _abilityName);

  // ปิด modal อัตโนมัติ
setTimeout(async () => {
  if (modal){
    modal.style.opacity = '0';
    setTimeout(()=> { modal.style.display = 'none'; }, 1000);
  }
  _revealed = false;

  // 🟢 โหลด chat.js ตอนนี้จริง ๆ
  const { initChat } = await import('./chat.js');
  initChat();

    // log บอกผู้เล่น (ถ้ามีกล่อง log)
    const box = byId('log-container');
    if (box){
      const p1 = document.createElement('p'); p1.className = 'log-message';
      p1.textContent = `คุณได้รับบทบาทเป็น: ${_role} (${_abilityName})`;
      box.insertBefore(p1, box.firstChild || null);
      const p2 = document.createElement('p'); p2.className = 'log-message';
      p2.textContent = `สิ่งที่ทำได้: ${_abilityDesc}`;
      box.insertBefore(p2, p1);
      setTimeout(()=>{ p1.style.opacity='0'; p2.style.opacity='0'; }, 10000);
      setTimeout(()=>{ p1.remove(); p2.remove(); }, 11000);
    }
    
  }, ROLE_REVEAL_DURATION);
}
