// Corre en la página del sorteo: une la página con la extensión.
function enviar(msg) {
  try {
    chrome.runtime.sendMessage(msg, resp => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        window.postMessage({ sorteo: 'error', texto: 'La extensión no responde. Recarga esta página (F5) y vuelve a intentarlo.' }, '*');
      } else {
        window.postMessage({ sorteo: 'recibido', tipo: msg.tipo }, '*');
      }
    });
  } catch (e) {
    // pasa cuando la extensión se ha recargado y esta página sigue con la copia anterior
    window.postMessage({ sorteo: 'error', texto: 'La extensión se ha actualizado. Recarga esta página (F5) y vuelve a intentarlo.' }, '*');
  }
}
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || !e.data.sorteo) return;
  if (e.data.sorteo === 'ping') window.postMessage({ sorteo: 'ext-listo', version: 3, ver: chrome.runtime.getManifest().version }, '*');
  if (e.data.sorteo === 'extraer') enviar({ tipo: 'extraer', url: e.data.url });
  if (e.data.sorteo === 'cancelar') enviar({ tipo: 'cancelar' });
  if (e.data.sorteo === 'comprobar') enviar({ tipo: 'comprobar', datos: { cuentas: e.data.cuentas, usuarios: e.data.usuarios, cortar: !!e.data.cortar } });
});
chrome.runtime.onMessage.addListener(m => {
  if (m && m.sorteo) window.postMessage(m, '*');
});
window.postMessage({ sorteo: 'ext-listo', version: 3, ver: chrome.runtime.getManifest().version }, '*');
