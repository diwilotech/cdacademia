// Editor de Material: una sola superficie editable (como Notas). El documento se edita como HTML y al guardar se convierte a bloques.
// Archivos y enlaces son «átomos» (islas no editables con sus propios campos). El formato se aplica donde está el cursor o la selección.
// AC.editorMaterial({ me, areas }) devuelve abrir(material|null, alCambiar).
window.AC.editorMaterial = function ({ me, areas }) {
  const { api, esc, toast, confirm, modal } = window.App;
  const D = window.AC.doc;
  const { uid, inlineMd, lineas, urlArchivo, esImagen } = D;
  const MAX_ARCHIVO = 20 * 1024 * 1024;
  const BLOQUE_TAG = { titulo: 'H2', subtitulo: 'H3', texto: 'P', destacado: 'BLOCKQUOTE', lista: 'UL', numerada: 'OL' };
  const ATAJOS = { '# ': 'titulo', '## ': 'subtitulo', '- ': 'lista', '* ': 'lista', '1. ': 'numerada', '> ': 'destacado' };
  const esAtomo = (n) => !!n && n.nodeType === 1 && n.classList.contains('ed-atom');
  const parrafoVacio = () => { const p = document.createElement('p'); p.appendChild(document.createElement('br')); return p; };
  const esVacio = (el) => !esAtomo(el) && el.tagName !== 'HR' && !el.textContent.trim() && !el.querySelector('img,iframe');
  const autoAlto = (ta) => { ta.style.height = 'auto'; if (ta.scrollHeight) ta.style.height = `${ta.scrollHeight}px`; };
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) { /* navegador sin soporte */ }

  return function abrir(row, changed) {
    const RO = me.business.readOnly;
    if (RO) return;
    const m = row || { bloques: [] };
    let atomos = {}, nuevos = [], guardado = false;
    const antes = (m.bloques || []).filter((b) => b.tipo === 'archivo').map((b) => b.key);

    const { el, m: mm } = modal(`<form>
      <div class="modal-header py-2"><h2 class="modal-title h6 mb-0">${row ? 'Editar material' : 'Nuevo material'}</h2>
        <div class="ms-auto d-flex gap-2 align-items-center"><span class="small text-body-secondary d-none d-md-inline" data-estado></span><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div></div>
      <div class="doc-barra-herr" data-barra role="toolbar" aria-label="Formato del documento">
        <button type="button" class="btn btn-sm fw-bold" data-conv="titulo" title="Título (también: # y espacio)">Título</button>
        <button type="button" class="btn btn-sm fw-semibold" data-conv="subtitulo" title="Encabezado (también: ## y espacio)">Encabezado</button>
        <button type="button" class="btn btn-sm" data-conv="texto" title="Cuerpo de texto">Cuerpo</button>
        <span class="sep"></span>
        <button type="button" class="btn btn-sm" data-conv="lista" title="Lista con viñetas (también: - y espacio)" aria-label="Lista con viñetas"><i class="bi bi-list-ul"></i></button>
        <button type="button" class="btn btn-sm" data-conv="numerada" title="Lista numerada (también: 1. y espacio)" aria-label="Lista numerada"><i class="bi bi-list-ol"></i></button>
        <button type="button" class="btn btn-sm" data-conv="destacado" title="Nota destacada (también: > y espacio)" aria-label="Nota destacada"><i class="bi bi-lightbulb"></i></button>
        <span class="sep"></span>
        <button type="button" class="btn btn-sm" data-cmd="bold" title="Negrita" aria-label="Negrita"><i class="bi bi-type-bold"></i></button>
        <button type="button" class="btn btn-sm" data-cmd="italic" title="Cursiva" aria-label="Cursiva"><i class="bi bi-type-italic"></i></button>
        <span class="sep"></span>
        <label class="btn btn-sm mb-0" title="Subir PDF, Word, imagen, audio o video"><i class="bi bi-paperclip"></i> <span class="d-none d-md-inline">Archivo</span><input type="file" data-archivos multiple hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,image/*,video/mp4,video/webm,audio/*"></label>
        <button type="button" class="btn btn-sm" data-ins="enlace" title="Enlace o video de YouTube/Vimeo"><i class="bi bi-link-45deg"></i> <span class="d-none d-md-inline">Enlace</span></button>
        <button type="button" class="btn btn-sm" data-ins="separador" title="Línea separadora" aria-label="Línea separadora"><i class="bi bi-hr"></i></button>
        <span class="sep ms-auto"></span>
        <button type="button" class="btn btn-sm" data-mover="-1" title="Subir el párrafo o bloque" aria-label="Subir"><i class="bi bi-arrow-up"></i></button>
        <button type="button" class="btn btn-sm" data-mover="1" title="Bajar el párrafo o bloque" aria-label="Bajar"><i class="bi bi-arrow-down"></i></button>
        <button type="button" class="btn btn-sm" data-cmd="undo" title="Deshacer" aria-label="Deshacer"><i class="bi bi-arrow-counterclockwise"></i></button>
        <button type="button" class="btn btn-sm" data-cmd="redo" title="Rehacer" aria-label="Rehacer"><i class="bi bi-arrow-clockwise"></i></button>
      </div>
      <div class="modal-body doc-fondo" data-fondo>
        <div class="doc-papel" data-papel>
          <input class="doc-titulo" data-titulo placeholder="Título del material" maxlength="120" required aria-label="Título del material" value="${esc(m.titulo || '')}">
          <div class="d-flex flex-wrap gap-2 align-items-center mb-3 small text-body-secondary">
            <select class="form-select form-select-sm w-auto" data-area aria-label="Área">${AC.opts(areas, 'Sin área').map(([v, l]) => `<option value="${v}" ${String(v) === String(m.area_id ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <select class="form-select form-select-sm w-auto" data-nivel aria-label="Nivel"><option value="">Todos los niveles</option>${AC.NIVELES.map((n) => `<option ${m.nivel === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
            ${m.cursos?.length ? `<span class="ms-auto">En ${m.cursos.length === 1 ? 'el curso' : 'los cursos'}: ${m.cursos.map((c) => esc(c.nombre)).join(', ')} · los cambios se reflejan en todos</span>` : ''}</div>
          <div class="ed doc" data-ed contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Contenido del material"></div>
          <div class="doc-pie" data-pie><span>Escribe como en Notas. Cambia el formato con la barra o con atajos: <code>#</code> título, <code>##</code> encabezado, <code>-</code> lista, <code>1.</code> numerada, <code>&gt;</code> nota. Pega o arrastra imágenes y archivos aquí.</span></div>
        </div>
      </div>
      <div class="modal-footer py-2 justify-content-between"><span>${row && me.canManage ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar material</button></span></div></form>`, { size: 'modal-xl modal-dialog-scrollable' });

    const q = (s) => el.querySelector(s);
    const ED = () => q('[data-ed]');
    const estado = q('[data-estado]');

    /* --- bloques <-> HTML --- */
    function atomoHtml(b) {
      let cuerpo;
      if (b.tipo === 'archivo' && esImagen(b)) {
        const lay = b.diseno || 'izq', btn = (v, ic, t) => `<button type="button" class="btn btn-sm ${lay === v ? 'btn-primary' : 'btn-outline-secondary'}" data-lay="${v}" title="${t}" aria-label="${t}"><i class="bi ${ic}"></i></button>`;
        const campos = `<input class="form-control form-control-sm mb-1" data-f="titulo" value="${esc(b.titulo || '')}" placeholder="Título junto a la imagen (opcional)" aria-label="Título junto a la imagen"><textarea class="form-control form-control-sm" rows="3" data-f="texto" placeholder="Texto junto a la imagen… (**negrita**, *cursiva*)" aria-label="Texto junto a la imagen">${esc(b.texto || '')}</textarea>`;
        const img = `<figure class="doc-fig"><img src="${urlArchivo(b.key)}" alt="${esc(b.nombre)}" data-prev></figure>`;
        cuerpo = `<div class="d-flex flex-wrap align-items-center gap-1 mb-1 small text-body-secondary"><span>Diseño:</span><div class="btn-group btn-group-sm">${btn('izq', 'bi-layout-sidebar', 'Imagen a la izquierda, texto a la derecha')}${btn('der', 'bi-layout-sidebar-reverse', 'Texto a la izquierda, imagen a la derecha')}${btn('completo', 'bi-image', 'Imagen sola, de lado a lado')}</div>
          <input class="form-control form-control-sm ms-auto" style="max-width:220px" data-f="nombre" value="${esc(b.nombre)}" placeholder="Nombre del archivo" aria-label="Nombre del archivo"></div>
          ${lay === 'completo' ? `<div class="doc-fig">${img}</div><div class="mt-2">${campos}</div>` : `<div class="doc-split ${lay === 'der' ? 'der' : ''}">${img}<div class="doc-split-txt">${campos}</div></div>`}`;
      } else if (b.tipo === 'archivo') {
        cuerpo = `${D.archivoHtml(b)}<input class="form-control form-control-sm mt-1" data-f="nombre" value="${esc(b.nombre)}" placeholder="Nombre o pie del archivo" aria-label="Nombre del archivo">`;
      } else {
        cuerpo = `<div class="row g-1"><div class="col-md-4"><input class="form-control form-control-sm" data-f="nombre" value="${esc(b.nombre || '')}" placeholder="Nombre del enlace" aria-label="Nombre del enlace"></div>
          <div class="col-md-8"><input class="form-control form-control-sm" data-f="url" data-recarga value="${esc(b.url || '')}" placeholder="https://… (YouTube y Vimeo se ven aquí mismo)" aria-label="Dirección"></div></div>${D.enlaceHtml(b)}`;
      }
      return `<div class="ed-atom" contenteditable="false" data-id="${b.id}" data-b="${b.id}"><div class="bl-ctrl" role="group" aria-label="Bloque">
          <button type="button" data-a="up" title="Subir" aria-label="Subir"><i class="bi bi-arrow-up"></i></button><button type="button" data-a="down" title="Bajar" aria-label="Bajar"><i class="bi bi-arrow-down"></i></button>
          <button type="button" data-a="par" title="Agregar un párrafo debajo" aria-label="Agregar un párrafo debajo"><i class="bi bi-text-paragraph"></i></button>
          <button type="button" data-a="del" title="Quitar" aria-label="Quitar"><i class="bi bi-trash"></i></button></div>${cuerpo}</div>`;
    }
    function editorDesde(bloques) {
      atomos = {};
      const li = (t) => lineas(t).map((x) => `<li>${inlineMd(x) || '<br>'}</li>`).join('');
      return bloques.map((b) => {
        b.id = b.id || `b${uid()}`;
        if (b.tipo === 'video') b = { ...b, tipo: 'enlace' };   // los videos de antes son enlaces
        const t = inlineMd(b.texto || '') || '<br>';
        switch (b.tipo) {
          case 'titulo': return `<h2>${t}</h2>`;
          case 'subtitulo': return `<h3>${t}</h3>`;
          case 'destacado': return `<blockquote>${t}</blockquote>`;
          case 'lista': return `<ul>${li(b.texto) || '<li><br></li>'}</ul>`;
          case 'numerada': return `<ol>${li(b.texto) || '<li><br></li>'}</ol>`;
          case 'separador': return '<hr>';
          case 'archivo': case 'enlace': atomos[b.id] = b; return atomoHtml(b);
          default: return `${b.titulo ? `<h3>${inlineMd(b.titulo)}</h3>` : ''}<p>${t}</p>`;
        }
      }).join('');
    }
    const tipoDe = (n) => (esAtomo(n) ? 'atomo' : ({ H1: 'titulo', H2: 'titulo', H3: 'subtitulo', H4: 'subtitulo', BLOCKQUOTE: 'destacado', UL: 'lista', OL: 'numerada', HR: 'separador' })[n.tagName] || 'texto');
    function domAMd(n) {
      let o = '';
      n.childNodes.forEach((c) => {
        if (c.nodeType === 3) { o += c.nodeValue; return; }
        if (c.nodeType !== 1) return;
        const t = c.tagName;
        if (t === 'BR') o += '\n';
        else if (t === 'B' || t === 'STRONG') { const i = domAMd(c); o += i.trim() ? `**${i}**` : i; }
        else if (t === 'I' || t === 'EM') { const i = domAMd(c); o += i.trim() ? `*${i}*` : i; }
        else if (t === 'SPAN' && (c.classList.contains('sz-t') || c.classList.contains('sz-h'))) { const i = domAMd(c), mk = c.classList.contains('sz-t') ? '^^' : '~~'; o += i.trim() ? `${mk}${i}${mk}` : i; }
        else { if ((t === 'DIV' || t === 'P') && o && !o.endsWith('\n')) o += '\n'; o += domAMd(c); }
      });
      return o.replace(/ /g, ' ');
    }
    function bloquesDesdeEditor() {
      const out = [];
      [...ED().children].forEach((e) => {
        const t = tipoDe(e);
        if (t === 'atomo') { const b = atomos[e.dataset.id]; if (b) out.push(b); return; }
        if (t === 'separador') { out.push({ tipo: 'separador' }); return; }
        if (t === 'lista' || t === 'numerada') {
          const items = [...e.children].filter((c) => c.tagName === 'LI').map((x) => domAMd(x).replace(/\n+$/, '').replace(/\n/g, ' ')).filter((x) => x.trim());
          if (items.length) out.push({ tipo: t, texto: items.join('\n') });
          return;
        }
        const texto = domAMd(e).replace(/\n+$/, '');
        if (texto.trim()) out.push({ tipo: t, texto: t === 'titulo' || t === 'subtitulo' ? texto.replace(/\n+/g, ' ') : texto });
      });
      return out;
    }

    /* --- selección y cursor --- */
    function colocarCursor(e, alFinal) {
      if (!e) return;
      const r = document.createRange(), sel = window.getSelection(); if (!sel) return;
      if (alFinal) { const l = e.lastChild; if (l && l.nodeName === 'BR') r.setStartBefore(l); else { r.selectNodeContents(e); r.collapse(false); } if (l && l.nodeName === 'BR') r.collapse(true); }
      else { r.selectNodeContents(e); r.collapse(true); }
      sel.removeAllRanges(); sel.addRange(r);
    }
    function bloquesSel() {
      const sel = window.getSelection(), ed = ED(); if (!sel || !sel.rangeCount) return [];
      const r = sel.getRangeAt(0); if (!ed.contains(r.startContainer) || !ed.contains(r.endContainer)) return [];
      const top = (n, off) => { if (n === ed) return ed.children[Math.min(off, ed.children.length - 1)]; while (n && n.parentNode !== ed) n = n.parentNode; return n; };
      const a = top(r.startContainer, r.startOffset), z = top(r.endContainer, Math.max(0, r.endOffset - 1)); if (!a || !z) return [];
      const out = []; for (let n = a; n; n = n.nextElementSibling) { out.push(n); if (n === z) break; }
      if (!r.collapsed && r.endOffset === 0 && out.length > 1 && out.at(-1).contains(r.endContainer) && !out.at(-1).contains(r.startContainer)) out.pop();
      return out.filter((n) => !esAtomo(n));
    }
    const mover = (a, b) => { while (a.firstChild) b.appendChild(a.firstChild); if (!b.firstChild) b.appendChild(document.createElement('br')); };
    // Al mover el contenido a otro elemento el navegador pierde la selección: se guarda como (línea, carácter) y se restaura
    function marcaSel(unidades, nodo, off) {
      const u = unidades.findIndex((x) => x.contains(nodo)); if (u < 0) return null;
      const r = document.createRange(); r.selectNodeContents(unidades[u]); r.setEnd(nodo, off); return { u, n: r.toString().length };
    }
    function puntoEn(e, n) {
      const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let acum = 0, ult = null;
      while (w.nextNode()) { const t = w.currentNode; ult = t; if (acum + t.length >= n) return [t, n - acum]; acum += t.length; }
      return ult ? [ult, ult.length] : [e, 0];
    }
    function lineaDe(nodo) {
      let n = nodo.nodeType === 1 ? nodo : nodo.parentElement;
      while (n && n !== ED()) { if (n.tagName === 'LI' || n.parentNode === ED()) return n; n = n.parentElement; }
      return null;
    }
    // Partes de la selección dentro de una lista: solo los elementos tocados cambian; la lista se parte en dos
    function partirLista(lst, rango) {
      const lis = [...lst.children].filter((c) => c.tagName === 'LI');
      const tocadas = lis.filter((li) => rango.intersectsNode(li));
      if (!rango.collapsed && rango.endOffset === 0 && tocadas.length > 1) { const u = tocadas.at(-1); if (u.contains(rango.endContainer) && !u.contains(rango.startContainer)) tocadas.pop(); }
      if (!tocadas.length || tocadas.length === lis.length) return;
      const i = lis.indexOf(tocadas[0]), f = lis.indexOf(tocadas.at(-1));
      const copia = (items, inicio) => { const l = document.createElement(lst.tagName); if (inicio) l.start = inicio; items.forEach((x) => l.appendChild(x)); return l; };
      if (f < lis.length - 1) lst.after(copia(lis.slice(f + 1), lst.tagName === 'OL' ? (lst.start || 1) + f + 1 : 0));
      if (i > 0) lst.before(copia(lis.slice(0, i), lst.tagName === 'OL' ? (lst.start || 1) : 0));
    }
    // Tamaño de título/encabezado solo a lo seleccionado dentro de una línea (una palabra, una frase…)
    function corridas(e, fl = {}) {
      const out = [];
      e.childNodes.forEach((n) => {
        if (n.nodeType === 3) out.push({ t: n.nodeValue, ...fl });
        else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { out.push({ br: true }); return; }
          const f = { ...fl }, T = n.tagName;
          if (T === 'B' || T === 'STRONG') f.b = true;
          if (T === 'I' || T === 'EM') f.i = true;
          if (n.classList.contains('sz-t')) f.sz = 'sz-t'; else if (n.classList.contains('sz-h')) f.sz = 'sz-h';
          out.push(...corridas(n, f));
        }
      });
      return out;
    }
    function construirCorridas(runs) {
      const mz = []; runs.forEach((r) => { const u = mz.at(-1); if (u && !r.br && !u.br && u.b === r.b && u.i === r.i && u.sz === r.sz) u.t += r.t; else mz.push({ ...r }); });
      return mz.map((r) => { if (r.br) return '<br>'; let h = esc(r.t); if (r.sz) h = `<span class="${r.sz}">${h}</span>`; if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`; return h; }).join('') || '<br>';
    }
    function aplicarTamano(linea, rango, clase) {
      const pre = document.createRange(); pre.selectNodeContents(linea);
      pre.setEnd(rango.startContainer, rango.startOffset); const a = pre.toString().length;
      pre.setEnd(rango.endContainer, rango.endOffset); const z = pre.toString().length;
      const runs = corridas(linea), res = []; let pos = 0; const dentro = [];
      runs.forEach((r) => {
        if (r.br) { res.push(r); return; }
        const ini = pos, fin = pos + r.t.length; pos = fin;
        const x = Math.max(a, ini), y = Math.min(z, fin);
        if (x >= y) { res.push(r); return; }
        if (x > ini) res.push({ ...r, t: r.t.slice(0, x - ini) });
        const mid = { ...r, t: r.t.slice(x - ini, y - ini) }; dentro.push(mid); res.push(mid);
        if (y < fin) res.push({ ...r, t: r.t.slice(y - ini) });
      });
      const quitar = !clase || (dentro.length && dentro.every((r) => r.sz === clase));   // repetir el mismo tamaño lo quita
      dentro.forEach((r) => { if (quitar) delete r.sz; else r.sz = clase; });
      linea.innerHTML = construirCorridas(res);
      const [n1, o1] = puntoEn(linea, a), [n2, o2] = puntoEn(linea, z), r = document.createRange();
      r.setStart(n1, o1); r.setEnd(n2, o2); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    // Cambia el formato de lo seleccionado, en su lugar
    function aTipo(tipo) {
      const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
      const rango = sel.getRangeAt(0);
      if (!rango.collapsed && (tipo === 'titulo' || tipo === 'subtitulo' || tipo === 'texto')) {   // texto seleccionado que no es toda la línea: el tamaño se aplica solo a esa parte
        const l1 = lineaDe(rango.startContainer), l2 = lineaDe(rango.endContainer);
        if (l1 && l1 === l2 && !esAtomo(l1) && l1.tagName !== 'HR') {
          const pre = document.createRange(); pre.selectNodeContents(l1); const total = pre.toString().length;
          pre.setEnd(rango.startContainer, rango.startOffset); const a = pre.toString().length; pre.setEnd(rango.endContainer, rango.endOffset);
          const z = pre.toString().length;
          if (z - a > 0 && z - a < total) { aplicarTamano(l1, rango, tipo === 'titulo' ? 'sz-t' : tipo === 'subtitulo' ? 'sz-h' : null); marcarVacio(); actualizarBarra(); return; }
        }
      }
      const bs = bloquesSel(); if (!bs.length) return;
      bs.forEach((b) => { if (b.tagName === 'UL' || b.tagName === 'OL') partirLista(b, rango); });
      const destino = tipo !== 'texto' && bs.every((b) => tipoDe(b) === tipo) ? 'texto' : tipo;   // pulsarlo otra vez lo quita
      const unidades = [];
      bs.forEach((b) => { if (b.tagName === 'UL' || b.tagName === 'OL') [...b.children].filter((c) => c.tagName === 'LI').forEach((x) => unidades.push(x)); else unidades.push(b); });
      const ini = marcaSel(unidades, rango.startContainer, rango.startOffset), fin = marcaSel(unidades, rango.endContainer, rango.endOffset);
      const nuevosEl = [], destinos = [];
      if (destino === 'lista' || destino === 'numerada') {
        const l = document.createElement(destino === 'lista' ? 'ul' : 'ol');
        unidades.forEach((u) => { const li = document.createElement('li'); mover(u, li); l.appendChild(li); destinos.push(li); }); nuevosEl.push(l);
      } else unidades.forEach((u) => { const e = document.createElement(BLOQUE_TAG[destino]); mover(u, e); nuevosEl.push(e); destinos.push(e); });
      bs[0].before(...nuevosEl); bs.forEach((b) => b.remove());
      if (ini && fin) {
        const r = document.createRange(), [a, ao] = puntoEn(destinos[ini.u], ini.n), [z, zo] = puntoEn(destinos[fin.u], fin.n);
        r.setStart(a, ao); r.setEnd(z, zo); sel.removeAllRanges(); sel.addRange(r);
      } else colocarCursor(destinos[0], true);
      marcarVacio(); actualizarBarra();
    }
    function asegurarCola() {
      const ed = ED(), u = ed.lastElementChild;
      if (!u || esAtomo(u) || u.tagName === 'HR') ed.appendChild(parrafoVacio());   // solo hace falta un párrafo al final para seguir escribiendo
    }
    function normalizar() {
      const ed = ED();
      [...ed.childNodes].forEach((n) => {   // texto suelto en la raíz -> párrafo
        if ((n.nodeType === 3 && n.nodeValue.trim()) || (n.nodeType === 1 && /^(B|I|STRONG|EM|SPAN|A|BR)$/.test(n.tagName))) { const p = document.createElement('p'); n.before(p); p.appendChild(n); }
        else if (n.nodeType === 3) n.remove();
      });
      asegurarCola();
    }
    function marcarVacio() { const ed = ED(); ed.dataset.vacio = ed.children.length === 1 && esVacio(ed.firstElementChild) && ed.firstElementChild.tagName === 'P' ? '1' : '0'; }
    function actualizarBarra() {
      const bs = bloquesSel(), t = bs.length && bs.every((b) => tipoDe(b) === tipoDe(bs[0])) ? tipoDe(bs[0]) : null;
      el.querySelectorAll('[data-barra] [data-conv]').forEach((b) => b.classList.toggle('activo', b.dataset.conv === t));
      ['bold', 'italic'].forEach((c) => { let on = false; try { on = bs.length > 0 && document.queryCommandState(c); } catch (_) { /* sin soporte */ } q(`[data-barra] [data-cmd="${c}"]`)?.classList.toggle('activo', on); });
    }
    const onSel = () => actualizarBarra();
    document.addEventListener('selectionchange', onSel);

    /* --- barra de herramientas --- */
    const enEditor = () => { const s = window.getSelection(); return s && s.rangeCount && ED().contains(s.getRangeAt(0).startContainer); };
    q('[data-barra]').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // no pierde el cursor ni la selección
    q('[data-barra]').addEventListener('click', (e) => {
      const ed = ED(); if (!enEditor()) { ed.focus(); colocarCursor(ed.lastElementChild, true); }
      const cv = e.target.closest('[data-conv]'); if (cv) { aTipo(cv.dataset.conv); return; }
      const cmd = e.target.closest('[data-cmd]'); if (cmd) { try { document.execCommand(cmd.dataset.cmd); } catch (_) { /* sin soporte */ } actualizarBarra(); return; }
      const mv = e.target.closest('[data-mover]'); if (mv) { moverSel(+mv.dataset.mover); return; }
      const ins = e.target.closest('[data-ins]');
      if (ins) {
        if (ins.dataset.ins === 'separador') { const cur = bloquesSel().at(-1), hr = document.createElement('hr'); (cur || ed.lastElementChild).after(hr); asegurarCola(); colocarCursor(hr.nextElementSibling, false); }
        else insertarAtomo({ id: `b${uid()}`, tipo: 'enlace', nombre: '', url: '' }, true);
      }
    });
    function moverSel(dir) {   // sube o baja el bloque (o bloques) donde está el cursor
      const sel = window.getSelection(), rango = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null, bs = bloquesSel(); if (!bs.length) return;
      if (dir < 0) { const p = bs[0].previousElementSibling; if (!p) return; bs.at(-1).after(p); }
      else { const n = bs.at(-1).nextElementSibling; if (!n) return; bs[0].before(n); }
      if (rango) { sel.removeAllRanges(); sel.addRange(rango); }
      asegurarCola();
    }
    function insertarAtomo(b, enfocarCampo) {
      atomos[b.id] = b;
      const tmp = document.createElement('div'); tmp.innerHTML = atomoHtml(b); const e = tmp.firstElementChild;
      const cur = enEditor() ? bloquesSel().at(-1) : null;
      if (cur && esVacio(cur)) cur.replaceWith(e); else if (cur) cur.after(e); else ED().append(e);
      asegurarCola(); marcarVacio(); ajustarAlturas();
      if (enfocarCampo) e.querySelector('input')?.focus();
      else { const n = e.nextElementSibling; if (n && !esAtomo(n)) colocarCursor(n, false); }
    }
    function recargarAtomo(e) { const b = atomos[e.dataset.id], tmp = document.createElement('div'); tmp.innerHTML = atomoHtml(b); e.replaceWith(tmp.firstElementChild); ajustarAlturas(); }
    function ajustarAlturas() { el.querySelectorAll('[data-ed] textarea').forEach(autoAlto); }

    /* --- escritura --- */
    ED().addEventListener('input', (e) => {
      const at = e.target.closest('.ed-atom');
      if (at) { const b = atomos[at.dataset.id], f = e.target.dataset.f; if (b && f) { b[f] = e.target.value; if (e.target.tagName === 'TEXTAREA') autoAlto(e.target); } return; }
      const bs = bloquesSel();
      if (bs.length === 1 && tipoDe(bs[0]) === 'texto') {
        const t = bs[0].textContent.replace(/ /g, ' ');
        if (ATAJOS[t]) { bs[0].innerHTML = '<br>'; colocarCursor(bs[0], false); aTipo(ATAJOS[t]); }   // atajos estilo Markdown
      }
      normalizar(); marcarVacio();
    });
    ED().addEventListener('change', (e) => { const at = e.target.closest('.ed-atom'); if (at && e.target.hasAttribute('data-recarga')) recargarAtomo(at); });
    ED().addEventListener('keydown', (e) => {
      if (e.target.closest('.ed-atom') || e.isComposing) return;
      const sel = window.getSelection(); if (!sel.rangeCount) return;
      const bs = bloquesSel(); if (bs.length !== 1) return;
      const b = bs[0], t = tipoDe(b), r = sel.getRangeAt(0);
      const alInicio = r.collapsed && (() => { const pre = document.createRange(); pre.selectNodeContents(b); pre.setEnd(r.startContainer, r.startOffset); return pre.toString() === ''; })();
      const alFinal = r.collapsed && (() => { const post = document.createRange(); post.selectNodeContents(b); post.setStart(r.startContainer, r.startOffset); return post.toString() === ''; })();
      const prev = b.previousElementSibling, next = b.nextElementSibling;
      const libre = (n) => n && !esAtomo(n) && n.tagName !== 'HR';
      if (e.key === 'Backspace' && alInicio && t === 'texto' && esVacio(b) && ED().children.length > 1) {   // borra un párrafo vacío (también entre dos archivos)
        e.preventDefault(); b.remove();
        const dest = libre(prev) ? prev : libre(next) ? next : null;
        asegurarCola(); marcarVacio(); if (dest) colocarCursor(dest, dest === prev); return;
      }
      if (e.key === 'Delete' && alFinal && t === 'texto' && esVacio(b) && ED().children.length > 1) {
        e.preventDefault(); b.remove(); asegurarCola(); marcarVacio();
        const dest = libre(next) ? next : libre(prev) ? prev : null; if (dest) colocarCursor(dest, dest === prev); return;
      }
      if (e.key === 'Backspace' && alInicio && prev && (esAtomo(prev) || prev.tagName === 'HR') && !esVacio(b) && t === 'texto') { e.preventDefault(); return; }   // no borrar el archivo de arriba por accidente
      if (e.key === 'Delete' && alFinal && next && esAtomo(next)) { e.preventDefault(); return; }
      if (e.key === 'Backspace' && alInicio && (t === 'titulo' || t === 'subtitulo' || t === 'destacado')) { e.preventDefault(); aTipo('texto'); return; }   // quita el formato
      if (e.key === 'Enter' && !e.shiftKey && (t === 'titulo' || t === 'subtitulo' || t === 'destacado')) {   // Enter en un título/nota: siguiente párrafo normal
        e.preventDefault(); r.deleteContents();
        const resto = document.createRange(); resto.setStart(r.endContainer, r.endOffset); if (b.lastChild) resto.setEndAfter(b.lastChild); else resto.setEnd(b, 0);
        const p = document.createElement('p'); p.appendChild(resto.extractContents());
        if (!p.firstChild || (!p.textContent && !p.querySelector('br'))) p.innerHTML = '<br>';
        if (!b.firstChild || (!b.textContent && !b.querySelector('br'))) b.innerHTML = '<br>';
        b.after(p); colocarCursor(p, false); marcarVacio(); actualizarBarra();
      }
    });
    // Pegar: solo texto plano (sin estilos de otras páginas) o archivos/imágenes
    ED().addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); agregarArchivos(files); return; }
      if (e.target.closest('.ed-atom')) return;
      const txt = e.clipboardData?.getData('text/plain'); if (txt === undefined || txt === '') return;
      e.preventDefault();
      if (document.execCommand && document.execCommand('insertText', false, txt)) return;
      const r = window.getSelection().getRangeAt(0); r.deleteContents(); r.insertNode(document.createTextNode(txt)); r.collapse(false);
    });
    // Clics en los átomos (ampliar, ver PDF, diseño, subir/bajar/quitar)
    ED().addEventListener('click', (e) => {
      const at = e.target.closest('.ed-atom'); if (!at) return; const b = atomos[at.dataset.id];
      const lay = e.target.closest('[data-lay]'); if (lay && b) { b.diseno = lay.dataset.lay; recargarAtomo(at); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'up') { const p = at.previousElementSibling; if (p) at.after(p); asegurarCola(); return; }
      if (a === 'down') { const n = at.nextElementSibling; if (n) at.before(n); asegurarCola(); return; }
      if (a === 'par') { const p = parrafoVacio(); at.after(p); colocarCursor(p, false); return; }
      if (a === 'del') { at.remove(); asegurarCola(); marcarVacio(); return; }
      D.click(e, (id) => atomos[id]);
    });

    /* --- archivos: botón, arrastrar y soltar, o pegar una imagen --- */
    async function subir(file) {
      if (file.size > MAX_ARCHIVO) throw new Error(`«${file.name}» pesa ${D.fmtTam(file.size)}; el máximo es 20 MB.`);
      const r = await fetch(`/api/material/archivos?nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': file.type || 'application/octet-stream', 'x-app': '1' }, body: file });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'No se pudo subir el archivo.');
      return d;
    }
    async function agregarArchivos(files) {
      files = [...files]; if (!files.length) return;
      estado.textContent = `Subiendo ${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}…`;
      for (const f of files) {
        try { const it = await subir(f); nuevos.push(it.key); insertarAtomo({ id: `b${uid()}`, tipo: 'archivo', nombre: it.nombre, key: it.key, tipoArchivo: it.tipoArchivo, size: it.size, ...(esImagen(it) ? { diseno: 'izq' } : {}) }); }
        catch (x) { toast(x.message, false); }
      }
      estado.textContent = '';
    }
    q('[data-archivos]').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; ED().focus(); agregarArchivos(f); });
    const fondo = q('[data-fondo]');
    ['dragover', 'dragleave', 'drop'].forEach((ev) => fondo.addEventListener(ev, (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      e.preventDefault(); fondo.style.outline = ev === 'dragover' ? '2px dashed var(--dw-p)' : '';
      if (ev === 'drop') agregarArchivos(e.dataTransfer.files);
    }));
    // Clic en el espacio en blanco: cursor al final
    const enfocarFinal = () => { asegurarCola(); ED().focus(); colocarCursor(ED().lastElementChild, true); };
    q('[data-pie]').addEventListener('click', enfocarFinal);
    q('[data-papel]').addEventListener('click', (e) => { if (e.target === q('[data-papel]')) enfocarFinal(); });

    /* --- abrir, guardar, borrar, cerrar --- */
    ED().innerHTML = editorDesde(structuredClone(m.bloques?.length ? m.bloques : [{ tipo: 'texto', texto: '' }]));
    normalizar(); marcarVacio();
    el.addEventListener('shown.bs.modal', () => {
      ajustarAlturas();
      const t = q('[data-titulo]'); if (!t.value.trim()) { t.focus(); return; }   // material nuevo: primero el título
      const e = ED(); e.focus(); colocarCursor(e.lastElementChild, true);
    });
    const soltar = (key) => api(`/api/material/archivos/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});   // solo si ningún material lo usa
    q('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirm({ title: `¿Borrar «${row.titulo}»?`, text: 'Se borran también sus archivos. Si está en clases de un curso, se quita de ellas.' }))) return;
      try { await api(`/api/material/material/${row.id}`, { method: 'DELETE' }); guardado = true; mm.hide(); toast('Material borrado'); changed(); } catch (x) { toast(x.message, false); }
    });
    const f = el.querySelector('form'), titulo = q('[data-titulo]');
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!titulo.value.trim()) { titulo.focus(); return; }
      const bloques = bloquesDesdeEditor().filter((b) => b.tipo !== 'enlace' || (b.url || '').trim());
      if (bloques.some((b) => b.tipo === 'enlace' && !/^https:\/\//i.test(b.url.trim()))) { toast('Los enlaces deben empezar por https://', false); return; }
      bloques.forEach((b) => { delete b.id; if (b.tipo === 'enlace') { b.url = b.url.trim(); if (!(b.nombre || '').trim()) b.nombre = b.url; } if (b.tipo === 'archivo' && !(b.nombre || '').trim()) b.nombre = 'Archivo'; });
      const primero = bloques.find((b) => b.tipo === 'texto' && b.texto.trim());
      const body = { titulo: titulo.value.trim(), area_id: q('[data-area]').value, nivel: q('[data-nivel]').value, descripcion: primero ? primero.texto.trim().replace(/[*^~]+/g, '').slice(0, 300) : '', bloques };
      try {
        await api(row ? `/api/material/material/${row.id}` : '/api/material/material', { method: row ? 'PATCH' : 'POST', body });
        guardado = true;
        const quedan = new Set(bloques.filter((b) => b.tipo === 'archivo').map((b) => b.key));
        [...antes, ...nuevos].filter((k) => !quedan.has(k)).forEach(soltar);   // archivos que ya no están en el documento
        mm.hide(); toast('Material guardado'); changed();
      } catch (x) { toast(x.message, false); }
    };
    el.addEventListener('hidden.bs.modal', () => {
      document.removeEventListener('selectionchange', onSel);
      if (!guardado) nuevos.forEach(soltar);   // si cierra sin guardar, se borran los archivos que acababa de subir
    });
  };
};
