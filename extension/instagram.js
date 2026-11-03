// Mensajero: recibe la orden del fondo y la pasa al código que corre dentro de la página (instagram-main.js),
// y reenvía su progreso y su resultado al fondo.
let ordenDada = false;
chrome.runtime.onMessage.addListener((m, sender, responder) => {
  if (m && m.tipo === 'iniciar') {
    responder({ ok: true });
    if (!ordenDada) { ordenDada = true; window.postMessage({ sorteoCmd: 'iniciar' }, '*'); }
  }
});
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || !e.data.sorteoExt) return;
  chrome.runtime.sendMessage({ tipo: e.data.tipo, texto: e.data.texto });
});
