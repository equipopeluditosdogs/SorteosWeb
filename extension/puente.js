// Corre en la página del sorteo: une la página con la extensión.
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || !e.data.sorteo) return;
  if (e.data.sorteo === 'ping') window.postMessage({ sorteo: 'ext-listo', version: 2 }, '*');
  if (e.data.sorteo === 'extraer') chrome.runtime.sendMessage({ tipo: 'extraer', url: e.data.url });
  if (e.data.sorteo === 'cancelar') chrome.runtime.sendMessage({ tipo: 'cancelar' });
  if (e.data.sorteo === 'comprobar') chrome.runtime.sendMessage({ tipo: 'comprobar', datos: { cuentas: e.data.cuentas, usuarios: e.data.usuarios, cortar: !!e.data.cortar } });
});
chrome.runtime.onMessage.addListener(m => {
  if (m && m.sorteo) window.postMessage(m, '*');
});
window.postMessage({ sorteo: 'ext-listo', version: 2 }, '*');
