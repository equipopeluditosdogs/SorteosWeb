// Corre en el MISMO mundo que la página de Instagram. Lee todos los comentarios pidiéndolos a la API
// interna que usa la propia web (completo y repetible, funciona con la pestaña en segundo plano).
// Si esa vía falla, usa el método de scroll (necesita la pestaña al frente).
// Habla con instagram.js (el mensajero) mediante window.postMessage.
(() => {
  let enMarcha = false, comprobando = false;
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data) return;
    if (e.data.sorteoCmd === 'iniciar' && !enMarcha) { enMarcha = true; extraer(); }
    if (e.data.sorteoCmd === 'comprobar' && !comprobando) { comprobando = true; comprobar(e.data.datos || {}); }
  });

  const informar = (tipo, texto) => window.postMessage({ sorteoExt: 1, tipo, texto }, '*');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PAUSA = 450; // entre peticiones al leer comentarios, para no saturar a Instagram
  const ritmo = { pausa: 300, hilos: 3 }; // al comprobar seguidores: varias consultas a la vez; si Instagram se queja, se frena solo

  async function extraer() {
    try {
      let texto;
      try {
        texto = await porAPI();
      } catch (e) {
        informar('progreso', 'La vía rápida de Instagram no ha respondido (' + e.message + '). Uso el método lento: la pestaña pasa al frente.');
        informar('primer-plano', '');
        await sleep(1500);
        texto = await porScroll();
      }
      informar('resultado', texto);
    } catch (e) {
      informar('error', 'Error al extraer: ' + e.message);
    }
  }

  /* ---------- 1. Vía rápida: la API que usa la propia web de Instagram ---------- */
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function idDeCodigo(codigo) {
    let id = 0n;
    for (const c of codigo) {
      const v = ALFABETO.indexOf(c);
      if (v < 0) throw new Error('código de publicación no válido');
      id = id * 64n + BigInt(v);
    }
    return id.toString();
  }
  const cookie = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1] || '';
  const claim = () => { try { return sessionStorage.getItem('www-claim-v2') || '0'; } catch (e) { return '0'; } };

  async function api(ruta) {
    for (let intento = 0; intento < 6; intento++) {
      const r = await fetch(ruta, {
        credentials: 'include',
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-csrftoken': cookie('csrftoken'),
          'x-requested-with': 'XMLHttpRequest',
          'x-asbd-id': '129477',
          'x-ig-www-claim': claim(),
          accept: '*/*'
        }
      });
      if (r.status === 429 || r.status === 560) {
        ritmo.hilos = 1; ritmo.pausa = Math.max(ritmo.pausa, 1200); // frena: una consulta cada vez y más despacio
        informar('progreso', 'Instagram pide esperar un poco... reintentando en 30 s');
        await sleep(30000);
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
    throw new Error('Instagram limita las peticiones');
  }

  async function porAPI() {
    const m = location.pathname.match(/\/(?:p|reel|tv)\/([\w-]+)/);
    if (!m) throw new Error('esta pestaña no es una publicación');
    const id = idDeCodigo(m[1]);
    const info = await api('/api/v1/media/' + id + '/info/');
    const item = info && info.items && info.items[0];
    if (!item) throw new Error('sin datos de la publicación');
    const esperados = item.comment_count || 0;
    const autor = (item.user && item.user.username) || '';

    const vistos = new Map();
    const anadir = c => {
      if (!c || !c.pk || !c.user || vistos.has(String(c.pk))) return;
      vistos.set(String(c.pk), c.user.username + '\t' + String(c.text || '').replace(/\s+/g, ' ').trim());
    };
    const conRespuestas = [];

    /* comentarios principales, de página en página */
    let cursor = '', clave = '', previo = null;
    for (let pag = 0; pag < 1000; pag++) {
      const j = await api('/api/v1/media/' + id + '/comments/?can_support_threading=true&permalink_enabled=false' +
        (cursor ? '&' + clave + '=' + encodeURIComponent(cursor) : ''));
      if (!Array.isArray(j.comments)) throw new Error('respuesta inesperada');
      j.comments.forEach(c => {
        anadir(c);
        (c.preview_child_comments || []).forEach(anadir);
        if (c.child_comment_count > 0) conRespuestas.push(c);
      });
      informar('progreso', 'Leyendo comentarios con la vía rápida de Instagram... ' + vistos.size + (esperados ? ' de ' + esperados : ''));
      let sig = '', k = '';
      if (j.next_min_id) { sig = j.next_min_id; k = 'min_id'; }
      else if (j.next_max_id) { sig = j.next_max_id; k = 'max_id'; }
      if (!sig) break;
      if (typeof sig !== 'string') sig = JSON.stringify(sig);
      if (sig === previo) break;
      previo = cursor = sig; clave = k;
      await sleep(PAUSA);
    }
    if (!vistos.size && esperados > 0) throw new Error('no devolvió comentarios');

    /* respuestas a cada comentario */
    let hechos = 0;
    for (const c of conRespuestas) {
      let cur = '';
      for (let pag = 0; pag < 200; pag++) {
        const j = await api('/api/v1/media/' + id + '/comments/' + c.pk + '/child_comments/' + (cur ? '?max_id=' + encodeURIComponent(cur) : ''));
        (j.child_comments || []).forEach(anadir);
        let sig = j.next_max_child_cursor || '';
        if (typeof sig !== 'string') sig = JSON.stringify(sig);
        if (!j.has_more_tail_child_comments || !sig || sig === cur) break;
        cur = sig;
        await sleep(PAUSA);
      }
      if (++hechos % 8 === 0) informar('progreso', 'Leyendo respuestas... ' + vistos.size + (esperados ? ' de ' + esperados : ''));
      await sleep(PAUSA);
    }

    return ['#autor\t' + autor, '#diag\t' + esperados + '\t' + vistos.size, 'usuario\tcomentario', ...vistos.values()].join('\n');
  }


  /* ---------- 3. Comprobar quién sigue a unas cuentas ---------- */
  /* "1,201" · "1.201" · "12.5K" · "1,2 M" -> número */
  function contarSeguidores(txt) {
    if (!txt) return 0;
    const t = String(txt).trim();
    const k = /k/i.test(t) ? 1e3 : /m/i.test(t) ? 1e6 : 1;
    if (k > 1) return Math.round(parseFloat(t.replace(/[KkMm\s]/g, '').replace(',', '.')) * k) || 0;
    return parseInt(t.replace(/[.,\s]/g, ''), 10) || 0;
  }

  /* Identificador y nº de seguidores leyendo la página de perfil, que sí responde cuando la consulta de perfil está limitada. */
  async function datosCuenta(nombre) {
    const r = await fetch('/' + encodeURIComponent(nombre) + '/', { credentials: 'include' });
    if (!r.ok) throw new Error(r.status === 404 ? 'cuenta no encontrada' : 'HTTP ' + r.status);
    const html = await r.text();
    const id = (html.match(/profilePage_(\d+)/) || [])[1];
    if (!id) throw new Error('cuenta no encontrada');
    const m = html.match(/content="([\d.,]+\s*[KkMm]?)\s*(?:seguidores|followers)/i);
    return { id, total: contarSeguidores(m && m[1]) };
  }

  /* Reparte la lista en varios trabajadores que van a la vez (se reducen a uno si Instagram pide frenar). */
  async function enPool(items, fn) {
    let i = 0;
    const trabajar = async k => { while (i < items.length && k < ritmo.hilos) await fn(items[i++]); };
    await Promise.all(Array.from({ length: Math.min(ritmo.hilos, items.length) }, (_, k) => trabajar(k)));
    while (i < items.length) await fn(items[i++]); // por si el freno dejó trabajo pendiente
  }

  /* Mira si UNA persona sigue a la cuenta, buscándola entre sus seguidores. */
  async function sigueA(id, usuario) {
    let max = '';
    for (let pag = 0; pag < 3; pag++) {
      const j = await api('/api/v1/friendships/' + id + '/followers/?count=50&search_surface=follow_list_page&query=' + encodeURIComponent(usuario) + (max ? '&max_id=' + encodeURIComponent(max) : ''));
      const us = Array.isArray(j.users) ? j.users : [];
      if (us.some(x => String(x.username).toLowerCase() === usuario)) return true;
      // si devuelve una lista larga sin nada parecido, Instagram ha ignorado la búsqueda: no se puede fiar el "no"
      if (us.length >= 10 && !us.some(x => (String(x.username) + ' ' + String(x.full_name || '')).toLowerCase().includes(usuario.slice(0, 2)))) {
        throw new Error('Instagram no permite buscar entre los seguidores de esta cuenta');
      }
      if (!j.next_max_id || us.length === 0) return false;
      max = j.next_max_id;
      await sleep(ritmo.pausa);
    }
    return false;
  }

  /* Lee la lista de seguidores de la cuenta por páginas (mucho más rápido si no es enorme). */
  async function listaSeguidores(c, maxPaginas) {
    const set = new Set();
    let max = '', previo = null;
    for (let pag = 0; pag < 600; pag++) {
      const j = await api('/api/v1/friendships/' + c.id + '/followers/?count=100' + (max ? '&max_id=' + encodeURIComponent(max) : ''));
      (Array.isArray(j.users) ? j.users : []).forEach(x => set.add(String(x.username).toLowerCase()));
      informar('progreso', 'Leyendo seguidores de @' + c.nombre + '... ' + set.size + (c.total ? ' de ' + c.total : ''));
      let sig = j.next_max_id || '';
      if (typeof sig !== 'string') sig = JSON.stringify(sig);
      if (!sig || sig === previo) break;
      // con el tamaño real de página se recalcula: si salen demasiadas consultas, mejor buscar persona a persona
      if (pag === 0 && c.total && maxPaginas && Math.ceil(c.total / Math.max(1, set.size)) > maxPaginas) return null;
      previo = max = sig;
      await sleep(ritmo.pausa);
    }
    return set;
  }

  async function comprobar(datos) {
    try {
      informar('progreso', 'Buscando las cuentas en Instagram…');
      const todos = [...new Set((datos.usuarios || []).map(u => String(u).toLowerCase()))];
      const cuentas = (datos.cuentas || []).map(n => ({ nombre: n, ok: false, motivo: '', siguen: [], total: 0 }));
      await enPool(cuentas, async c => {
        try {
          const d = await datosCuenta(c.nombre);
          c.id = d.id; c.total = d.total; c.ok = true;
        } catch (e) {
          c.motivo = e.message;
          if (e.message === 'cuenta no encontrada') return; // no existe: no hace falta insistir por otra vía
          try { // plan B: la consulta de perfil (Instagram la limita a menudo)
            const j = await api('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(c.nombre));
            const u = j && j.data && j.data.user;
            if (u && u.id) { c.id = u.id; c.ok = true; c.motivo = ''; c.total = (u.edge_followed_by && u.edge_followed_by.count) || u.follower_count || 0; }
          } catch (e2) { /* se queda el motivo del primer intento */ }
        }
        await sleep(ritmo.pausa);
      });
      const buenas = cuentas.filter(c => c.ok).sort((a, b) => a.total - b.total);

      // 1) las cuentas cuya lista compensa leer (bastantes menos consultas que ir persona por persona), todas a la vez
      const compensa = c => c.total > 0 && Math.ceil(c.total / 25) * 3 <= todos.length; // páginas de 25: leer la lista solo si son pocas consultas
      const conLista = buenas.filter(compensa);
      await Promise.all(conLista.map(async c => {
        try { c.lista = await listaSeguidores(c, Math.ceil(todos.length / 2)); c.completa = !!c.lista && c.lista.size >= c.total * 0.9; }
        catch (e) { c.lista = null; }
      }));

      // 2) se resuelve primero lo que ya tiene lista (descarta rápido) y luego las cuentas grandes, persona a persona
      let vivos = todos;
      for (const c of [...conLista, ...buenas.filter(x => !compensa(x))]) {
        const mirar = datos.cortar ? vivos : todos;
        const dudosos = [];
        for (const usr of mirar) {
          if (c.lista && c.lista.has(usr)) c.siguen.push(usr);
          else if (!c.lista || !c.completa) dudosos.push(usr); // sin lista, o lista incompleta: se confirma buscándola a ella
        }
        let hechos = 0;
        await enPool(dudosos, async usr => {
          if (c.fallo) return;
          try { if (await sigueA(c.id, usr)) c.siguen.push(usr); }
          catch (e) { c.fallo = e.message; return; }
          if (++hechos % 5 === 0 || hechos === dudosos.length) informar('progreso', 'Comprobando @' + c.nombre + '... ' + hechos + ' de ' + dudosos.length + ' personas');
          await sleep(ritmo.pausa);
        });
        if (c.fallo) { c.ok = false; c.motivo = c.fallo; }
        if (datos.cortar && c.ok) { const f = new Set(c.siguen); vivos = vivos.filter(u => f.has(u)); }
      }
      informar('seguidores', JSON.stringify(cuentas.map(c => ({ nombre: c.nombre, ok: c.ok, motivo: c.motivo, siguen: c.siguen }))));
    } catch (e) {
      informar('error', 'Error al comprobar seguidores: ' + e.message);
    }
  }

  /* ---------- 2. Método de reserva: hacer scroll en el panel (necesita la pestaña al frente) ---------- */
  async function porScroll() {
    const BTN = /cargar m[aá]s comentarios|load more comments|view more comments/i;
    const NOISE = /^(responder|reply|me gusta|like|likes?|(ver|view)\b.{0,30}(respuesta|repl).*|ocultar respuestas.*|hide replies|ver traducci[oó]n|see translation|editado|edited|autor|author|fijado|pinned|\d+ (me gusta|likes?)|cargar m[aá]s comentarios|load more comments)$/i;
    const TIME = /^(\d+\s*(s|seg|min|h|d|sem|w|a|y|m|mes(es)?|semanas?|d[ií]as?|horas?|minutos?|segundos?|weeks?|days?|hours?|minutes?|years?|a[ñn]os?))\.?(\s*·.*)?$/i;
    const resp = t => (t.match(/\b(Responder|Reply)\b/g) || []).length;
    const scrollers = () => [...document.querySelectorAll('div,ul')].filter(e => {
      const o = getComputedStyle(e).overflowY;
      return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 50 && /responder|reply/i.test(e.innerText);
    });
    // el panel real es el contenedor con scroll más interno (los envoltorios no cargan nada al hacer scroll)
    const elegir = () => {
      const c = scrollers();
      return c.filter(e => !c.some(o => o !== e && e.contains(o))).sort((a, b) => resp(b.innerText) - resp(a.innerText))[0];
    };
    let sinCambios = 0, ultimo = 0, esperaPanel = 0, quietos = 0, vueltas = 0;
    while (sinCambios < 15 && quietos < 45 && ++vueltas < 900) {
      const s = elegir();
      if (!s) {
        if (++esperaPanel > 15) throw new Error('No encuentro el panel de comentarios. ¿La publicación es pública o has iniciado sesión?');
        await sleep(1500); continue;
      }
      s.scrollTop = s.scrollHeight;
      s.dispatchEvent(new Event('scroll', { bubbles: true }));
      s.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
      let pulsados = 0;
      document.querySelectorAll('[aria-label]').forEach(b => { if (BTN.test(b.getAttribute('aria-label'))) { (b.closest('button,[role=button]') || b).click(); pulsados++; } });
      document.querySelectorAll('button,[role=button],span').forEach(b => {
        const t = (b.innerText || '').trim();
        if (t.length < 45 && /^(ver|view)\b.{0,30}(respuesta|repl)/i.test(t)) { b.click(); pulsados++; }
      });
      await sleep(2000);
      const n = s.innerText.length;
      sinCambios = (n === ultimo && !pulsados) ? sinCambios + 1 : 0;
      quietos = n === ultimo ? quietos + 1 : 0;
      ultimo = n;
      informar('progreso', 'Cargando comentarios de Instagram (método lento)... ~' + resp(s.innerText) + ' comentarios' + (document.hidden ? ' (ventana oculta: tráela al frente)' : ''));
    }
    const panel = elegir();
    const autor = (panel.innerText.split('\n').map(x => x.trim()).find(Boolean) || '').replace(/^@/, '').split(/\s+/)[0];
    const filas = ['#autor\t' + autor, 'usuario\tcomentario'];
    let buf = [], actual = null;
    const cerrar = () => { if (actual) filas.push(actual + '\t' + buf.join(' ').replace(/\s+/g, ' ')); };
    for (const l of panel.innerText.split('\n').map(x => x.trim()).filter(Boolean)) {
      if (TIME.test(l)) {
        if (!buf.length) continue;
        const usuario = buf.pop();
        cerrar();
        actual = usuario.replace(/^@/, '').replace(/\s*·.*$/, '').split(/\s+/)[0];
        buf = [];
      } else if (!NOISE.test(l)) buf.push(l);
    }
    cerrar();
    return filas.join('\n');
  }
})();
