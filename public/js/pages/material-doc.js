// Documento de Material (lectura): convierte los bloques de un material en HTML y atiende los clics del lector
// (ver PDF dentro de la página, ampliar imágenes, reproducir). Lo usan la biblioteca, el editor y las clases de un curso.
//   bloques = [{ tipo: titulo|subtitulo|texto|destacado|lista|numerada|separador|enlace|archivo, texto | nombre,url | nombre,key,tipoArchivo,size,diseno }]
window.AC = window.AC || {};
window.AC.doc = (function () {
  const { esc, modal } = window.App;
  const uid = () => Math.random().toString(36).slice(2, 9);
  const urlArchivo = (k) => `/api/material/archivos/${encodeURIComponent(k)}`;
  const urlDescarga = (b) => `${urlArchivo(b.key)}?dl=1`;
  const extDe = (n) => (String(n).match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase();
  const fmtTam = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const mime = (b) => b.tipoArchivo || b.mime || '';
  const esImagen = (b) => /^image\/(png|jpe?g|gif|webp)$/.test(mime(b));
  const esPdf = (b) => mime(b) === 'application/pdf';
  const iconoArchivo = (b) => {
    const m = mime(b), e = extDe(b.nombre);
    return m.startsWith('image/') ? 'bi-file-earmark-image' : m === 'application/pdf' ? 'bi-file-earmark-pdf' : /\.docx?$/.test(e) ? 'bi-file-earmark-word'
      : /\.(xlsx?|csv)$/.test(e) ? 'bi-file-earmark-excel' : /\.pptx?$/.test(e) ? 'bi-file-earmark-slides' : m.startsWith('video/') ? 'bi-file-earmark-play'
      : m.startsWith('audio/') ? 'bi-file-earmark-music' : e === '.zip' ? 'bi-file-earmark-zip' : 'bi-file-earmark';
  };
  const inlineMd = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/\^\^(.+?)\^\^/g, '<span class="sz-t">$1</span>').replace(/~~(.+?)~~/g, '<span class="sz-h">$1</span>').replace(/\n/g, '<br>');
  const lineas = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const embedVideo = (url) => {
    const y = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/), v = String(url).match(/vimeo\.com\/(\d+)/);
    return y ? `https://www.youtube-nocookie.com/embed/${y[1]}` : v ? `https://player.vimeo.com/video/${v[1]}` : null;
  };
  const barraArchivo = (b, extra = '') => `<div class="doc-barra"><i class="bi ${iconoArchivo(b)}"></i><span class="text-truncate" title="${esc(b.nombre)}">${esc(b.nombre || 'Archivo')}</span><small class="text-body-secondary">${fmtTam(b.size || 0)}</small>${extra}
    <button type="button" class="btn btn-sm btn-outline-secondary py-0" data-prev title="Ampliar"><i class="bi bi-arrows-fullscreen"></i></button>
    <a class="btn btn-sm btn-outline-secondary py-0" href="${urlDescarga(b)}" download title="Descargar"><i class="bi bi-download"></i></a></div>`;
  const imagenTexto = (b) => `${b.titulo ? `<h3 class="doc-h2">${inlineMd(b.titulo)}</h3>` : ''}${b.texto ? `<p>${inlineMd(b.texto)}</p>` : ''}`;
  function archivoHtml(b) {
    const u = urlArchivo(b.key);
    if (esImagen(b)) {
      const img = `<img src="${u}" loading="lazy" alt="${esc(b.nombre)}" data-prev>`, lay = b.diseno || 'izq', conTexto = b.titulo || b.texto;
      if (lay === 'completo') return `<figure class="doc-fig">${img}${conTexto ? `<figcaption class="mt-2">${imagenTexto(b)}</figcaption>` : ''}</figure>`;
      return `<div class="doc-split ${lay === 'der' ? 'der' : ''} ${conTexto ? '' : 'solo'}"><figure class="doc-fig">${img}</figure>${conTexto ? `<div class="doc-split-txt">${imagenTexto(b)}</div>` : ''}</div>`;
    }
    if (/^video\/(mp4|webm)$/.test(mime(b))) return `<figure class="doc-fig"><video src="${u}" controls preload="metadata"></video><figcaption class="small text-body-secondary mt-1">${esc(b.nombre)}</figcaption></figure>`;
    if (/^audio\//.test(mime(b))) return `<div class="doc-archivo">${barraArchivo(b)}<audio src="${u}" controls preload="none" class="w-100 px-2 pb-2"></audio></div>`;
    if (esPdf(b)) return `<div class="doc-archivo">${barraArchivo(b, '<button type="button" class="btn btn-sm btn-primary py-0" data-embed>Ver documento</button>')}<div class="doc-embed" hidden><iframe data-src="${u}" title="${esc(b.nombre)}"></iframe></div></div>`;
    return `<div class="doc-archivo">${barraArchivo(b)}<div class="px-3 pb-2 small text-body-secondary">Este tipo de archivo se abre descargándolo.</div></div>`;
  }
  function enlaceHtml(b) {
    const e = embedVideo(b.url);
    if (e) return `<div class="doc-video"><iframe src="${e}" loading="lazy" title="${esc(b.nombre || 'Video')}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    return /^https?:\/\//i.test(b.url || '') ? `<a class="doc-enlace" href="${esc(b.url)}" target="_blank" rel="noopener"><i class="bi bi-link-45deg fs-4" style="color:var(--marca)"></i><span class="text-truncate">${esc(b.nombre || b.url)}</span><i class="bi bi-box-arrow-up-right ms-auto"></i></a>` : '';
  }
  function bloqueHtml(b) {
    const t = b.texto;
    switch (b.tipo) {
      case 'titulo': return `<h2 class="doc-h1">${inlineMd(t)}</h2>`;
      case 'subtitulo': return `<h3 class="doc-h2">${inlineMd(t)}</h3>`;
      case 'texto': return `${b.titulo ? `<h3 class="doc-h2">${inlineMd(b.titulo)}</h3>` : ''}<p>${inlineMd(t)}</p>`;   // «titulo» viene de los materiales de antes
      case 'lista': return `<ul>${lineas(t).map((x) => `<li>${inlineMd(x)}</li>`).join('')}</ul>`;
      case 'numerada': return `<ol>${lineas(t).map((x) => `<li>${inlineMd(x)}</li>`).join('')}</ol>`;
      case 'destacado': return `<div class="doc-callout"><i class="bi bi-lightbulb" style="color:var(--marca)"></i> ${inlineMd(t)}</div>`;
      case 'separador': return '<hr>';
      case 'archivo': return archivoHtml(b);
      case 'video': case 'enlace': return `${b.titulo ? `<h3 class="doc-h2">${inlineMd(b.titulo)}</h3>` : ''}${enlaceHtml(b)}`;
    }
    return '';
  }
  const html = (bloques) => ((bloques || []).length ? `<div class="doc">${bloques.map((x, k) => `<div data-b="${k}">${bloqueHtml(x)}</div>`).join('')}</div>` : '<div class="small text-body-secondary">Este material aún no tiene contenido.</div>');

  // Vista ampliada de un archivo (imagen, PDF, video, audio) con descarga.
  function vista(b) {
    if (b.tipo === 'enlace' || b.tipo === 'video') { window.open(b.url, '_blank', 'noopener'); return; }
    const u = urlArchivo(b.key);
    modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h6 text-truncate">${esc(b.nombre || 'Archivo')}</h2><a class="btn btn-sm btn-outline-secondary ms-auto me-2" href="${urlDescarga(b)}" download><i class="bi bi-download me-1"></i>Descargar</a><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body p-0">${esImagen(b) ? `<img src="${u}" class="img-fluid d-block mx-auto" alt="${esc(b.nombre)}">`
        : esPdf(b) ? `<iframe src="${u}" title="${esc(b.nombre)}" style="width:100%;height:75vh;border:0"></iframe>`
        : /^video\/(mp4|webm)$/.test(mime(b)) ? `<video src="${u}" controls class="w-100"></video>`
        : /^audio\//.test(mime(b)) ? `<div class="p-4"><audio src="${u}" controls class="w-100"></audio></div>`
        : `<div class="text-center text-body-secondary py-5"><i class="bi ${iconoArchivo(b)} display-3"></i><p class="mt-2 mb-0">Este tipo de archivo no tiene vista previa.<br>Descárgalo para abrirlo.</p></div>`}</div>`, { size: 'modal-xl' });
  }

  // Clics dentro de un documento: ver PDF y ampliar. `get(i)` devuelve el bloque i. Devuelve true si lo atendió.
  function click(e, get) {
    const bl = e.target.closest('[data-b]'); if (!bl) return false;
    const b = get(bl.dataset.b); if (!b) return false;
    if (e.target.closest('[data-embed]')) { const em = bl.querySelector('.doc-embed'), f = em.querySelector('iframe'); em.hidden = !em.hidden; if (!f.src) f.src = f.dataset.src; return true; }
    if (e.target.closest('[data-prev]')) { vista(b); return true; }
    return false;
  }

  return { uid, urlArchivo, urlDescarga, extDe, fmtTam, mime, esImagen, esPdf, iconoArchivo, inlineMd, lineas, embedVideo, archivoHtml, enlaceHtml, bloqueHtml, html, vista, click };
})();
