# Tableros QR — PWA + Backend (Google Apps Script)

Sistema de dos partes para que, al escanear el QR de un tablero, se vea su
**número, dirección y el plano (croquis)** que tenés cargado en la columna
"Plano" de tu planilla.

```
┌───────────────┐        fetch (JSON)        ┌─────────────────────────┐
│   PWA (QR)    │ ─────────────────────────▶ │ Google Apps Script      │
│ pwa-tableros/ │ ◀───────────────────────── │ (Code.gs, ligado a tu   │
│  index.html   │       datos + imagen       │  Google Sheet)          │
└───────────────┘                            └─────────────────────────┘
       ▲
       │ escanea QR → abre .../?id=10101
  📱 Técnico en el campo
```

- **La PWA** (`pwa-tableros/`) es la app instalable que ve el técnico al
  escanear el QR. Se aloja en un hosting estático (GitHub Pages, Firebase
  Hosting, Netlify, etc.) — eso es lo que le da soporte real de "Instalar
  app" y caché offline.
- **El backend** (`apps_script_v2/Code.gs` + `index.html`) sigue viviendo
  en Apps Script, ligado a tu planilla. Expone una mini-API JSON que la PWA
  consulta, y además genera los QR y una hoja de etiquetas para imprimir.

---

## Parte 1 — Backend en Apps Script

1. Abrí tu planilla → **Extensiones → Apps Script**.
2. Reemplazá el contenido de `Code.gs` por el archivo `apps_script_v2/Code.gs`
   de este proyecto (incluye todo: el formulario de inspección que ya
   tenías + la nueva API + el generador de QR).
3. Si todavía no existe, creá el archivo HTML `index` y pegá
   `apps_script_v2/index.html` (es el mismo formulario de inspección de
   antes, sin cambios).
4. Guardá. **Implementar → Nueva implementación**:
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier usuario** (necesario para que la PWA pueda
     consultar la API desde otro dominio)
5. Copiá la URL que te da (`https://script.google.com/macros/s/XXXX/exec`).
   La vas a necesitar en el paso siguiente.

> 💡 Las imágenes del plano se devuelven ya convertidas a base64 desde el
> propio Apps Script (usando tu acceso a Drive), así que **no hace falta**
> cambiar los permisos de los archivos de Drive a "público".

---

## Parte 2 — Publicar la PWA

1. En `pwa-tableros/app.js`, reemplazá:
   ```js
   const API_URL = 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec';
   ```
   por la URL que copiaste en el paso 5 de la Parte 1.

2. Subí la carpeta `pwa-tableros/` completa a un hosting estático. Opciones
   simples y gratuitas:

   **GitHub Pages**
   ```bash
   cd pwa-tableros
   git init
   git add .
   git commit -m "PWA tableros QR"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/tableros-pwa.git
   git push -u origin main
   ```
   Luego en el repo: **Settings → Pages → Branch: main → Save**. Tu URL
   quedará como `https://TU-USUARIO.github.io/tableros-pwa/`.

   **Firebase Hosting** (alternativa)
   ```bash
   npm install -g firebase-tools
   cd pwa-tableros
   firebase login
   firebase init hosting   # elegí esta carpeta como "public"
   firebase deploy
   ```

3. Probá abriendo `https://TU-USUARIO.github.io/tableros-pwa/?id=10101` (o
   el ID de un tablero real de tu planilla) — debería mostrar el número, la
   dirección y el plano.

---

## Parte 3 — Generar los QR y las etiquetas

1. Volvé al editor de Apps Script, en `Code.gs` actualizá:
   ```js
   const PWA_BASE_URL = 'https://TU-USUARIO.github.io/tableros-pwa/';
   ```
   con la URL real donde publicaste la PWA (Parte 2). Guardá y volvé a
   **Implementar → Administrar implementaciones → Nueva versión**.

2. Recargá la planilla (F5). Va a aparecer un nuevo menú **"Tableros QR"**:
   - **"1) Generar QR para todos los tableros (Drive)"** → crea un PNG de
     QR por cada fila (nombrado `<ID>.png`) en la carpeta de Drive
     **QR_Tableros**. Cada QR apunta a `PWA_BASE_URL/?id=<ID>`.
   - **"2) Abrir hoja de etiquetas para imprimir"** → abre una página con
     todos los QR + número + dirección en tarjetas, lista para
     `Ctrl+P` → imprimir y recortar/plastificar para pegar en cada tablero.

---

## Qué ve el técnico al escanear

1. Escanea el QR pegado en el tablero (o impreso desde la hoja de etiquetas).
2. Se abre la PWA en `.../?id=10101`.
3. La app muestra:
   - Estado (BIEN / MAL) como una etiqueta de color.
   - **Tablero N.° 10101**
   - Dirección (calle + altura)
   - Fecha de la última inspección
   - La **imagen del plano** (la que está linkeada en la columna "Plano")
   - Un botón **"Cómo llegar"** con las coordenadas (columnas latitud/longitud)
4. Si en algún momento aparece el botón **"📲 Instalar"** en la barra
   superior, el técnico puede agregar la app a la pantalla de inicio del
   celular como si fuera una app nativa.

---

## Notas técnicas

- **CORS:** las respuestas JSON de Apps Script (`ContentService`) admiten
  `fetch` desde otro dominio en solicitudes GET cuando el despliegue tiene
  acceso "Cualquier usuario" — no hace falta configuración adicional.
- **Offline:** el *service worker* cachea el "shell" de la app (HTML, CSS,
  JS, íconos) y guarda en caché la última respuesta de cada tablero
  consultado, para poder mostrarla si no hay conexión en el momento.
- **Columna "Plano" con `#N/D` o vacía:** la API simplemente responde sin
  imagen (`plano: null`) y la PWA muestra "No hay plano cargado para este
  tablero" — no rompe la página.
- **Cambiar/actualizar QR:** si cambiás `PWA_BASE_URL` (por ejemplo si
  migrás de GitHub Pages a un dominio propio), solo hace falta volver a
  correr "Generar QR para todos los tableros" — los QR viejos pegados en
  campo dejarían de funcionar, así que convenga definir la URL final antes
  de imprimir y pegar las etiquetas.
- **Íconos:** incluidos en `icons/` (192x192 y 512x512). Si querés tu propio
  logo, reemplazá esos dos archivos manteniendo el mismo nombre y tamaño.
