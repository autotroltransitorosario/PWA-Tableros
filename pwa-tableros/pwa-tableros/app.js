// ============================================================
// CONFIGURACIÓN — reemplazá esta URL por la de tu Apps Script
// publicado como aplicación web (ver README.md, paso "Backend").
// Tiene forma: https://script.google.com/macros/s/XXXXXXXX/exec
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbywxfV3ENWjJgoJ35RK_6F8gG4IcFcekkGOke9qssXfS5JKJdifWYUctwZpu3c1H5ZU/exec';

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

async function cargarTablero(id) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando tablero ' + escapeHtml(id) + '...</div>';

  try {
    const res = await fetch(API_URL + '?api=tablero&id=' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Respuesta del servidor: ' + res.status);
    const data = await res.json();

    if (!data.found) {
      app.innerHTML = '<div class="error">No se encontró ningún tablero con ID <strong>' + escapeHtml(id) + '</strong>.<br>Verificá el código QR.</div>';
      return;
    }
    renderTablero(data);
  } catch (err) {
    app.innerHTML = '<div class="error">⚠️ No se pudo obtener la información (sin conexión o sin datos guardados).<br><small>' + escapeHtml(err.message) + '</small></div>';
  }
}

function renderTablero(data) {
  const app = document.getElementById('app');
  const mapsLink = (data.lat && data.lng)
    ? 'https://www.google.com/maps?q=' + encodeURIComponent(data.lat) + ',' + encodeURIComponent(data.lng)
    : null;

  const estadoClass = data.estado === 'MAL' ? 'MAL' : data.estado === 'BIEN' ? 'BIEN' : '';

  app.innerHTML = `
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
