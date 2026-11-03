// Mensajero: recibe las órdenes del fondo y las pasa al código que corre dentro de la página (instagram-main.js),
// y reenvía su progreso y su resultado al fondo.
const dadas = {};
chrome.runtime.onMessage.addListener((m, sender, responder) => {
  if (m && (m.tipo === 'iniciar' || m.tipo === 'comprobar')) {
    responder({ ok: true });
    if (!dadas[m.tipo]) {
      dadas[m.tipo] = true;
      window.postMessage({ sorteoCmd: m.tipo, datos: m.datos }, '*');
    }
  }
});
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || !e.data.sorteoExt) return;
  chrome.runtime.sendMessage({ tipo: e.data.tipo, texto: e.data.texto });
});
