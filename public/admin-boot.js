/* Arranque: va al final, cuando todas las funciones ya están definidas */
if(BOOT){ const u=document.getElementById('lblUsuario'); if(u) u.textContent=BOOT.usuario||''; }
if(BOOT?.readOnly) document.getElementById('barraVencida').hidden=false;
/* Pasa los datos viejos al esquema nuevo (áreas, profesionales, módulos, horarios) y los guarda una vez */
if(migrarEsquema() && BOOT && !BOOT.readOnly) guardar();
cargarConfig(); render(); cargarPersonal();
