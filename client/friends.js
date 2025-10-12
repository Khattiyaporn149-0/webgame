// Friends modal and logic
// Firebase RTDB structure:
// - users/{uid}: { name, friendCode, updatedAt }
// - userCodes/{code}: uid
// - friends/{uid}/{friendUid}: true  (mutual on add)

import { rtdb, ref, set, update, onValue, get } from "./firebase.js";

(function(){
  const MODAL_ID = 'friendsModal';
  const BTN_ID = 'btnFriends';

  const state = {
    uid: localStorage.getItem('ggd.uid') || null,
    name: localStorage.getItem('ggd.name') || 'Guest',
    code: null,
    friends: {},
  };

  function uuidLike(){
    const u = state.uid || (Math.random().toString(36).slice(2) + Date.now().toString(36));
    return String(u);
  }
  function generateCode(){
    const base = uuidLike().replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
    const hash = [...base].reduce((a,c)=> (a*31 + c.charCodeAt(0))>>>0, 0).toString(36).toUpperCase();
    const pick = (base + hash + 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    let out = '';
    for (let i=0;i<6;i++) out += pick[(i*7 + hash.charCodeAt(i%hash.length)) % pick.length];
    return out.replace(/O/g,'0').replace(/I/g,'1');
  }

  async function ensureUserProfile(){
    state.uid = localStorage.getItem('ggd.uid') || state.uid;
    state.name = localStorage.getItem('ggd.name') || state.name || 'Guest';
    if (!state.uid) return;

    try {
      const userSnap = await get(ref(rtdb, `users/${state.uid}`));
      let code = userSnap.exists() && userSnap.val()?.friendCode;
      if (code) {
        // Verify mapping consistency
        try {
          const mapSnap = await get(ref(rtdb, `userCodes/${code}`));
          const mapped = mapSnap.exists() ? mapSnap.val() : null;
          if (mapped && mapped !== state.uid) code = null;
        } catch {}
      }

      if (!code) {
        // Find an unused code (few attempts)
        for (let i=0;i<5;i++) {
          const candidate = generateCode();
          const mapSnap = await get(ref(rtdb, `userCodes/${candidate}`));
          if (!mapSnap.exists() || mapSnap.val() === state.uid) {
            code = candidate;
            await update(ref(rtdb), {
              [`users/${state.uid}`]: {
                name: state.name,
                friendCode: code,
                updatedAt: Date.now()
              },
              [`userCodes/${code}`]: state.uid,
            });
            break;
          }
        }
      }

      if (code) {
        await update(ref(rtdb, `users/${state.uid}`), {
          name: state.name,
          updatedAt: Date.now(),
        });
      }
      state.code = code || state.code;
      renderMyCode();
    } catch (e) {
      console.warn('ensureUserProfile failed', e);
    }
  }

  function ensureModal(){
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = `
      <div class=\"dialog\">
        <div class=\"dialog-head\">
          <h3>👥 Friends</h3>
          <button class=\"x\" id=\"closeFriends\">✕</button>
        </div>
        <div class=\"dialog-body\">
          <div class=\"row\" style=\"gap:8px; align-items:flex-end\">
            <div style=\"flex:1\">
              <div style=\"opacity:.8; font-size:13px; margin-bottom:6px\">Your Friend Code</div>
              <div id=\"myFriendCode\" style=\"font-weight:800; font-size:18px\">—</div>
            </div>
            <button id=\"copyFriendCode\" class=\"sec-btn\" style=\"white-space:nowrap\">Copy</button>
          </div>

          <div class=\"row\" style=\"gap:8px; align-items:flex-end\">
            <div style=\"flex:1\">
              <div style=\"opacity:.8; font-size:13px; margin-bottom:6px\">Add by Code</div>
              <input id=\"friendCodeInput\" type=\"text\" placeholder=\"Enter 6-char code\" maxlength=\"16\" style=\"width:100%; padding:10px; border-radius:10px; border:1px solid var(--stroke); background: var(--panel-2); color:var(--fg)\" />
            </div>
            <button id=\"btnAddFriend\" class=\"sec-btn\" style=\"white-space:nowrap\">Add</button>
          </div>

          <div style=\"opacity:.8; font-size:13px\">Friends List</div>
          <div id=\"friendsList\" style=\"display:grid; gap:8px\"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e)=>{ if (e.target===modal) close(); });
    modal.querySelector('#closeFriends')?.addEventListener('click', close);
    modal.querySelector('#copyFriendCode')?.addEventListener('click', copyCode);
    modal.querySelector('#btnAddFriend')?.addEventListener('click', addFriendByCode);
    const input = modal.querySelector('#friendCodeInput');
    input?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') addFriendByCode(); });
    return modal;
  }

  function open(){ ensureModal(); ensureUserProfile(); bindFriendsStream(); const m=document.getElementById(MODAL_ID); m.setAttribute('aria-hidden','false'); m.classList.add('show'); }
  function close(){ const m=document.getElementById(MODAL_ID); if (m){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); } }

  function renderMyCode(){
    const el = document.getElementById('myFriendCode');
    if (!el) return;
    el.textContent = state.code || '—';
  }

  async function copyCode(){
    try {
      const code = state.code || '';
      if (!code) return;
      await navigator.clipboard.writeText(code);
      window.showToast && showToast('Copied your friend code!', 'success');
    } catch { window.showToast && showToast('Copy failed', 'error'); }
  }

  function normalizeCode(v){
    return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, 16);
  }

  async function addFriendByCode(){
    if (!state.uid) { window.showToast && showToast('Please start the game first', 'warning'); return; }
    await ensureUserProfile();
    const input = document.getElementById('friendCodeInput');
    const raw = input?.value || '';
    const code = normalizeCode(raw);
    if (!code || code.length < 4) { window.showToast && showToast('Invalid code', 'error'); return; }
    if (code === state.code) { window.showToast && showToast('You cannot add yourself', 'warning'); return; }

    try {
      const mapSnap = await get(ref(rtdb, `userCodes/${code}`));
      if (!mapSnap.exists()) { window.showToast && showToast('Code not found', 'error'); return; }
      const otherUid = mapSnap.val();
      if (otherUid === state.uid) { window.showToast && showToast('You cannot add yourself', 'warning'); return; }

      await update(ref(rtdb), {
        [`friends/${state.uid}/${otherUid}`]: true,
        [`friends/${otherUid}/${state.uid}`]: true,
      });
      window.showToast && showToast('Friend added!', 'success');
      input.value = '';
    } catch (e) {
      console.warn('addFriendByCode failed', e);
      window.showToast && showToast('Failed to add friend', 'error');
    }
  }

  function renderFriends(){
    const list = document.getElementById('friendsList');
    if (!list) return;
    const entries = Object.keys(state.friends||{});
    if (!entries.length) { list.innerHTML = '<div style="opacity:.7">No friends yet. Share your code!</div>'; return; }
    list.innerHTML = entries.map(uid=> `
      <div class="row" style="gap:8px; align-items:center; background: var(--panel-2); border:1px solid var(--stroke); padding:10px; border-radius:10px">
        <div style="flex:1" data-fuid="${uid}">Loading...</div>
        <button class="sec-btn" data-rm="${uid}">Remove</button>
      </div>
    `).join('');
    entries.forEach(async (uid)=>{
      try {
        const snap = await get(ref(rtdb, `users/${uid}`));
        const name = (snap.exists() && snap.val()?.name) || uid.slice(0,6);
        const el = document.querySelector(`[data-fuid="${uid}"]`);
        if (el) el.textContent = name;
      } catch {}
    });
    list.querySelectorAll('button[data-rm]')?.forEach(btn=>{
      if (btn.dataset.bound==='1') return; btn.dataset.bound='1';
      btn.addEventListener('click', ()=> removeFriend(btn.getAttribute('data-rm')));
    });
  }

  async function removeFriend(friendUid){
    if (!friendUid || !state.uid) return;
    try {
      await update(ref(rtdb), {
        [`friends/${state.uid}/${friendUid}`]: null,
        [`friends/${friendUid}/${state.uid}`]: null,
      });
      window.showToast && showToast('Removed friend', 'success');
    } catch {
      window.showToast && showToast('Failed to remove', 'error');
    }
  }

  let friendsUnsub = null;
  function bindFriendsStream(){
    if (!state.uid) return;
    const path = ref(rtdb, `friends/${state.uid}`);
    if (friendsUnsub) { try { friendsUnsub(); } catch {} friendsUnsub=null; }
    const off = onValue(path, (snap)=>{
      state.friends = snap.exists()? (snap.val()||{}) : {};
      renderFriends();
    });
    friendsUnsub = () => off();
  }

  function bindOpenButton(){
    const btn = document.getElementById(BTN_ID);
    if (!btn || btn.dataset.friendsBound==='1') return;
    btn.dataset.friendsBound='1';
    btn.addEventListener('click', (e)=>{ try { e.preventDefault(); e.stopImmediatePropagation(); } catch {}; open(); });
  }

  function init(){ ensureModal(); ensureUserProfile(); bindOpenButton(); }
  if (document.readyState==='complete' || document.readyState==='interactive') init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();

