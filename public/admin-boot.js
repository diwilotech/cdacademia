/* Arranque: va al final, cuando todas las funciones ya están definidas */
if(BOOT){ const u=document.getElementById('lblUsuario'); if(u) u.textContent=BOOT.usuario||''; }
cargarConfig(); render();
