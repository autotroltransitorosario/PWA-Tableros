// ============================================================
// CONFIGURACIÓN — reemplazá esta URL por la de tu Apps Script
// publicado como aplicación web (ver README.md, paso "Backend").
// Tiene forma: https://script.google.com/macros/s/XXXXXXXX/exec
// ============================================================
const API_URL = 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec';

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function setConnStatus() {
  const el = document.getElementById('connStatus');
  if (!el) return;
  if (navigator.onLine) {
    el.textContent = '🟢 En línea';
    el.className = 'online';
  } else {
    el.textContent = '🔴 Sin conexión (mostrando último dato guardado)';
    el.className = 'offline';
  }
}
window.addEventListener('online', setConnStatus);
window.addEventListener('offline', setConnStatus);
setConnStatus();

/**
 * Carga los datos de un tablero usando JSONP (una etiqueta <script>) en vez
 * de fetch(). Apps Script no agrega el header de CORS que fetch() exige
 * para leer respuestas de otro dominio, así que fetch() falla con
 * "Failed to fetch" aunque el servidor responda bien. Cargar un <script>
 * no está sujeto a esa restricción, por eso funciona.
 */
function cargarTableroJSONP(id) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonpTablero_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    const script = document.createElement('script');

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera agotado'));
    }, 12000);

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('No se pudo conectar con el servidor'));
    };

    script.src = API_URL + '?api=tablero&id=' + encodeURIComponent(id) + '&callback=' + callbackName;
    document.body.appendChild(script);
  });
}

async function cargarTablero(id) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando tablero ' + escapeHtml(id) + '...</div>';

  try {
    const data = await cargarTableroJSONP(id);

    if (!data.found) {
      app.innerHTML = '<div class="error">No se encontró ningún tablero con ID <strong>' + escapeHtml(id) + '</strong>.<br>Verificá el código QR.</div>';
      return;
    }

    renderTablero(data);
    try { localStorage.setItem('tablero_' + id, JSON.stringify(data)); } catch (e) { /* almacenamiento no disponible */ }
  } catch (err) {
    // Sin conexión (u otro error): mostramos el último dato guardado de este tablero, si existe.
    let cached = null;
    try { cached = localStorage.getItem('tablero_' + id); } catch (e) { /* no-op */ }

    if (cached) {
      renderTablero(JSON.parse(cached), true);
    } else {
      app.innerHTML = '<div class="error">⚠️ No se pudo obtener la información (sin conexión y sin datos guardados).<br><small>' + escapeHtml(err.message) + '</small></div>';
    }
  }
}

function renderTablero(data, esOffline) {
  const app = document.getElementById('app');
  const mapsLink = (data.lat && data.lng)
    ? 'https://www.google.com/maps?q=' + encodeURIComponent(data.lat) + ',' + encodeURIComponent(data.lng)
    : null;

  const estadoClass = data.estado === 'MAL' ? 'MAL' : data.estado === 'BIEN' ? 'BIEN' : '';

  app.innerHTML = `
    ${esOffline ? '<div class="error" style="margin-bottom:10px;">⚠️ Sin conexión: mostrando el último dato guardado en este dispositivo.</div>' : ''}
    <div class="card">
      ${data.estado ? '<span class="badge ' + estadoClass + '">Estado: ' + escapeHtml(data.estado) + '</span>' : ''}
      <h1>Tablero N.° ${escapeHtml(data.nombre)}</h1>
      <p class="direccion">📍 ${escapeHtml(data.direccion || 'Dirección no registrada')}</p>
      ${data.ultimaInspeccion ? '<p class="fecha">Última inspección: ' + escapeHtml(data.ultimaInspeccion) + '</p>' : ''}
      ${data.plano && data.plano.dataUrl
        ? '<img class="plano" src="' + data.plano.dataUrl + '" alt="Plano del tablero ' + escapeHtml(data.nombre) + '">'
        : '<div class="sinplano">No hay plano cargado para este tablero.</div>'}
      ${mapsLink ? '<a class="btn-maps" href="' + mapsLink + '" target="_blank" rel="noopener">🗺️ Cómo llegar</a>' : ''}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------- Arranque -------
const idTablero = getIdFromUrl();
if (idTablero) {
  cargarTablero(idTablero);
}

// ------- Instalación como PWA -------
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('installBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.classList.add('hidden');
    });
  }
});

// ------- Service worker -------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
