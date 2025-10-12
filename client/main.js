// Minimal home-page helpers (no sockets here)
(function(){
  const btnJoin = document.getElementById('btnJoin');
  const btnCreate = document.getElementById('btnCreate');

  btnJoin?.addEventListener('click', () => {
    // Go to room list (Firebase-based flow)
    window.location.href = 'roomlist.html';
  });

  btnCreate?.addEventListener('click', () => {
    // Go to create room page
    window.location.href = 'createroom.html';
  });
  
})();
