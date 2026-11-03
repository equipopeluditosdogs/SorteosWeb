// Abre la publicación en una PESTAÑA EN SEGUNDO PLANO, deja que instagram-main.js lea los comentarios
// y reenvía el resultado a la página del sorteo.
const guardar = (k, v) => chrome.storage.session.set({ [k]: v });
const leer = async k => (await chrome.storage.session.get(k))[k];

chrome.runtime.onMessage.addListener((m, sender) => {
  (async () => {
    if (m.tipo === 'extraer' && sender.tab) {
      const tab = await chrome.tabs.create({ url: m.url, active: false });
      await guardar('t' + tab.id, { origen: sender.tab.id });
      iniciar(tab.id);
    } else if (m.tipo === 'primer-plano' && sender.tab) {
      // la vía rápida ha fallado: el método de scroll necesita la pestaña visible
      chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {});
      chrome.windows.update(sender.tab.windowId, { focused: true }).catch(() => {});
    } else if (['progreso', 'resultado', 'error'].includes(m.tipo) && sender.tab) {
      const info = await leer('t' + sender.tab.id);
      if (!info) return;
      chrome.tabs.sendMessage(info.origen, { sorteo: m.tipo, texto: m.texto }).catch(() => {});
      if (m.tipo !== 'progreso') chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
  })();
});

// el content script de Instagram tarda en estar listo: se le llama hasta que responda
async function iniciar(tabId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const r = await chrome.tabs.sendMessage(tabId, { tipo: 'iniciar' });
      if (r && r.ok) return;
    } catch (e) {}
  }
  const info = await leer('t' + tabId);
  if (info) {
    chrome.tabs.sendMessage(info.origen, { sorteo: 'error', texto: 'No he podido abrir la publicación. ¿Has iniciado sesión en Instagram en este Chrome?' }).catch(() => {});
    chrome.tabs.remove(tabId).catch(() => {});
  }
}
