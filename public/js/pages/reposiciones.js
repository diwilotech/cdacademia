// Reposiciones: fallas por reponer y espacios (la lógica está en reposiciones-vista.js; cada curso también la muestra en su pestaña).
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  AC.vistas([['fallas', 'Fallas por reponer', 'bi-arrow-repeat'], ['espacios', 'Espacios', 'bi-calendar-plus'], ['grabadas', 'Clases grabadas', 'bi-camera-video']], AC.reposiciones(me));
});
