// Abre la publicación en una PESTAÑA EN SEGUNDO PLANO, deja que instagram-main.js lea los comentarios
// y reenvía el resultado a la página del sorteo.
const guardar = (k, v) => chrome.storage.session.set({ [k]: v });
const leer = async k => (await chrome.storage.session.get(k))[k];

chrome.runtime.onMessage.addListener((m, sender, responder) => {
  responder({ ok: true }); // acuse de recibo para la página
  (async () => {
    if (m.tipo === 'extraer' && sender.tab) {
      const tab = await chrome.tabs.create({ url: m.url, active: false });
      await guardar('t' + tab.id, { origen: sender.tab.id });
      iniciar(tab.id, { tipo: 'iniciar' });
    } else if (m.tipo === 'comprobar' && sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, { sorteo: 'progreso', texto: 'Abriendo Instagram en segundo plano…' }).catch(() => {});
      const tab = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: false });
      await guardar('t' + tab.id, { origen: sender.tab.id });
      iniciar(tab.id, { tipo: 'comprobar', datos: m.datos });
    } else if (m.tipo === 'cancelar' && sender.tab) {
      // cierra las pestañas de Instagram que abrió esta página: el trabajo se detiene
      const todo = await chrome.storage.session.get(null);
      for (const [k, v] of Object.entries(todo)) {
        if (k[0] === 't' && v && v.origen === sender.tab.id) { chrome.tabs.remove(Number(k.slice(1))).catch(() => {}); chrome.storage.session.remove(k); }
      }
    } else if (m.tipo === 'primer-plano' && sender.tab) {
      // la vía rápida ha fallado: el método de scroll necesita la pestaña visible
      chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {});
      chrome.windows.update(sender.tab.windowId, { focused: true }).catch(() => {});
    } else if (['progreso', 'resultado', 'error', 'seguidores'].includes(m.tipo) && sender.tab) {
      const info = await leer('t' + sender.tab.id);
      if (!info) return;
      chrome.tabs.sendMessage(info.origen, { sorteo: m.tipo, texto: m.texto }).catch(() => {});
      if (m.tipo !== 'progreso') chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
  })();
});

// el content script de Instagram tarda en estar listo: se le llama hasta que responda
async function iniciar(tabId, mensaje) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const r = await chrome.tabs.sendMessage(tabId, mensaje);
      if (r && r.ok) return;
    } catch (e) {}
  }
  const info = await leer('t' + tabId);
  if (info) {
    chrome.tabs.sendMessage(info.origen, { sorteo: 'error', texto: 'No he podido hablar con la pestaña de Instagram. ¿Has iniciado sesión en Instagram en este Chrome?' }).catch(() => {});
    chrome.tabs.remove(tabId).catch(() => {});
  }
}
