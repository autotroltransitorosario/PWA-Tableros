/**
 * Relevamiento de Tableros — Backend (Google Apps Script)
 * ---------------------------------------------------------------
 * Este script cumple TRES funciones sobre la misma planilla:
 *
 *  1) Formulario de inspección (el que ya tenías): doGet() sin parámetros
 *     sirve index.html para cargar Estado/Columna/Cierre Puerta/ID/Circuito
 *     con PAT/Observaciones/Fotos.
 *
 *  2) API JSON para la PWA de QR: doGet(?api=tablero&id=NNNNN) devuelve
 *     el número de tablero, la dirección, el estado y la imagen del plano
 *     (columna "Plano") ya convertida a base64 — así la PWA no necesita
 *     que los archivos de Drive sean públicos.
 *
 *  3) Generador de QR y hoja de etiquetas: desde el menú "Tableros QR" en
 *     la planilla, podés generar un QR por tablero (guardado en Drive) y
 *     una hoja imprimible con todos los QR + número + dirección, lista
 *     para pegar en cada tablero físico.
 *
 * INSTALACIÓN: ver README.md
 */

// ============ CONFIGURACIÓN ============
const SPREADSHEET_ID = '1seHYNRSghq4bNg8RaVPt6pxj0tHpXJtlqqz9WCwRqik';
const SHEET_GID = 268485048; // pestaña "Relevamiento Tableros"
const DRIVE_FOLDER_NAME = 'Tablero_form';
const QR_FOLDER_NAME = 'QR_Tableros';

// ⚠️ Reemplazá esto por la URL pública donde publiques la carpeta pwa-tableros
// (GitHub Pages, Firebase Hosting, Netlify, etc.). Debe terminar en "/".
// Ejemplo: 'https://tu-usuario.github.io/tableros-pwa/'
const PWA_BASE_URL = 'https://TU-USUARIO.github.io/tableros-pwa/';

// Nombres EXACTOS de columnas, tal cual figuran en la fila 1 de la planilla.
const COL = {
  ID_TABLERO: 'Nombre',
  CALLE: 'Calle',
  ALTURA: 'Altura',
  PLANO: 'Plano',
  ESTADO: 'Estado',
  COLUMNA: 'Columna',
  CIERRE_PUERTA: 'Cierre Puerta',
  ID: 'ID',
  CIRCUITO_PAT: 'Circuito con PAT',
  FOTO_EXT: 'Foto Externa',
  FOTO_INT: 'Foto Interna',
  OBS: 'Observaciones',
  ULT_INSP: 'Última Inspección',
  LAT: 'latitud',
  LNG: 'longitud'
};

// ============ MENÚ EN LA PLANILLA ============

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tableros QR')
    .addItem('1) Generar QR para todos los tableros (Drive)', 'generarQRsParaTodosLosTableros')
    .addItem('2) Abrir hoja de etiquetas para imprimir', 'mostrarLinkEtiquetas')
    .addSeparator()
    .addItem('Reiniciar progreso de generación de QR', 'reiniciarProgresoQR')
    .addToUi();
}

function mostrarLinkEtiquetas() {
  const url = ScriptApp.getService().getUrl() + '?etiquetas=1';
  const html = HtmlService.createHtmlOutput(
    '<p style="font-family:Arial">Abrí este link para ver e imprimir todas las etiquetas QR:</p>' +
    '<p><a href="' + url + '" target="_blank">' + url + '</a></p>'
  ).setWidth(420).setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'Hoja de etiquetas QR');
}

// ============ SERVIDOR WEB ============

function doGet(e) {
  const p = (e && e.parameter) || {};

  // --- 2) API JSON para la PWA (llamada por app.js con fetch) ---
  if (p.api === 'tablero') {
    return apiTablero_(p.id, p.callback);
  }

  // --- 3) Hoja imprimible de etiquetas QR ---
  if (p.etiquetas === '1') {
    return generarHojaEtiquetas_();
  }

  // --- 1) Formulario de inspección original ---
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Relevamiento de Tableros')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============ HELPERS DE PLANILLA ============

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  for (const sh of sheets) {
    if (sh.getSheetId() === SHEET_GID) return sh;
  }
  throw new Error('No se encontró la pestaña con gid ' + SHEET_GID + '. Revisá SHEET_GID en Code.gs.');
}

function getHeaderMap_(sheet) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headerRow.forEach((h, i) => {
    if (h) map[h.toString().trim()] = i + 1; // columna 1-indexada
  });
  return map;
}

function encontrarFila_(sheet, headerMap, idTablero) {
  const colId = headerMap[COL.ID_TABLERO];
  if (!colId) throw new Error('No se encontró la columna "' + COL.ID_TABLERO + '" en la planilla.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const ids = sheet.getRange(2, colId, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const cellVal = ids[i][0];
    if (cellVal !== '' && cellVal.toString().trim() === idTablero.toString().trim()) {
      return i + 2; // fila real en la planilla
    }
  }
  return -1;
}

function getOrCreateFolder_(nombre) {
  const folders = DriveApp.getFoldersByName(nombre);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(nombre);
}

// ============ API JSON PARA LA PWA DE QR ============

function jsonOutput_(obj, callback) {
  // Si viene "callback" (JSONP), devolvemos JavaScript ejecutable en vez de
  // JSON plano. Esto evita el bloqueo de CORS que hace fetch() al llamar
  // a Apps Script desde otro dominio (GitHub Pages, etc.), porque cargar
  // un <script> no está sujeto a esa restricción del navegador.
  if (callback) {
    const js = callback + '(' + JSON.stringify(obj) + ');';
    return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Extrae el ID de archivo de un link de Drive y devuelve la imagen
 * como base64, para poder mostrarla en la PWA sin depender de que el
 * archivo sea público.
 */
function convertirImagenDrive_(url) {
  if (!url) return null;
  const texto = url.toString();
  if (texto.indexOf('drive.google.com') === -1) return null;

  const match = texto.match(/[-\w]{25,}/); // el ID de Drive tiene 25+ caracteres
  if (!match) return null;

  try {
    const file = DriveApp.getFileById(match[0]);
    const blob = file.getBlob();
    const mime = blob.getContentType();
    if (mime.indexOf('image') === -1) return null; // por si el link no es una imagen
    const base64 = Utilities.base64Encode(blob.getBytes());
    return { dataUrl: 'data:' + mime + ';base64,' + base64, nombreArchivo: file.getName() };
  } catch (err) {
    return null; // archivo inexistente, sin permiso, o link tipo "#N/D"
  }
}

function apiTablero_(id, callback) {
  try {
    if (!id) return jsonOutput_({ found: false, error: 'Falta el parámetro id' }, callback);

    const sheet = getSheet_();
    const headerMap = getHeaderMap_(sheet);
    const row = encontrarFila_(sheet, headerMap, id);

    if (row === -1) {
      return jsonOutput_({ found: false }, callback);
    }

    const get = (colName) => {
      const c = headerMap[colName];
      return c ? sheet.getRange(row, c).getValue() : '';
    };

    const ultInsp = get(COL.ULT_INSP);
    const planoUrl = get(COL.PLANO);

    const data = {
      found: true,
      nombre: get(COL.ID_TABLERO).toString(),
      direccion: (get(COL.CALLE) + ' ' + get(COL.ALTURA)).toString().trim(),
      estado: get(COL.ESTADO).toString(),
      ultimaInspeccion: ultInsp instanceof Date
        ? Utilities.formatDate(ultInsp, Session.getScriptTimeZone(), 'dd/MM/yyyy')
        : ultInsp.toString(),
      lat: get(COL.LAT),
      lng: get(COL.LNG),
      plano: convertirImagenDrive_(planoUrl),
      planoLinkOriginal: planoUrl ? planoUrl.toString() : ''
    };

    return jsonOutput_(data, callback);
  } catch (err) {
    return jsonOutput_({ found: false, error: err.message }, callback);
  }
}

// ============ GENERADOR DE QR (menú "Tableros QR") ============

/**
 * Genera un PNG de QR por cada tablero (apuntando a la PWA con ?id=NNNNN)
 * y lo guarda en la carpeta de Drive "QR_Tableros".
 *
 * Procesa en LOTES EN PARALELO (UrlFetchApp.fetchAll) en vez de pedir los
 * QR uno por uno, y guarda el progreso en PropertiesService: si Apps Script
 * corta la ejecución por el límite de 6 minutos (típico con planillas de
 * varios cientos de filas), simplemente volvés a correr la misma función
 * desde el menú y continúa donde se quedó, en vez de arrancar de cero.
 *
 * Si querés forzar que arranque de cero, corré primero reiniciarProgresoQR().
 */
const QR_BATCH_SIZE = 25;           // cuántos QR se piden en paralelo por lote
const QR_TIEMPO_MAX_MS = 4.5 * 60 * 1000; // corta antes de llegar al límite de 6 min

function generarQRsParaTodosLosTableros() {
  if (PWA_BASE_URL.indexOf('TU-USUARIO') !== -1) {
    SpreadsheetApp.getUi().alert(
      'Antes de generar los QR, reemplazá la constante PWA_BASE_URL en Code.gs ' +
      'por la URL real donde publicaste la carpeta pwa-tableros.'
    );
    return;
  }

  const inicio = new Date().getTime();
  const sheet = getSheet_();
  const headerMap = getHeaderMap_(sheet);
  const colId = headerMap[COL.ID_TABLERO];
  const lastRow = sheet.getLastRow();
  const idsRaw = sheet.getRange(2, colId, lastRow - 1, 1).getValues();
  const ids = idsRaw.map((r) => r[0]).filter((v) => v !== '' && v != null);
  const folder = getOrCreateFolder_(QR_FOLDER_NAME);

  const props = PropertiesService.getScriptProperties();
  let desde = Number(props.getProperty('QR_PROGRESO') || 0);
  let generados = Number(props.getProperty('QR_GENERADOS') || 0);
  let errores = 0;

  while (desde < ids.length) {
    // Chequeo de tiempo: si ya casi llegamos al límite, guardamos y salimos.
    if (new Date().getTime() - inicio > QR_TIEMPO_MAX_MS) {
      props.setProperty('QR_PROGRESO', String(desde));
      props.setProperty('QR_GENERADOS', String(generados));
      SpreadsheetApp.getUi().alert(
        'Se generaron ' + generados + ' de ' + ids.length + ' códigos QR hasta ahora.\n\n' +
        'El script se detuvo para no exceder el tiempo máximo de ejecución de Google. ' +
        'Volvé a ejecutar "Generar QR para todos los tableros" desde el menú y va a ' +
        'continuar automáticamente desde el tablero ' + ids[desde] + '.'
      );
      return;
    }

    const lote = ids.slice(desde, desde + QR_BATCH_SIZE);
    const requests = lote.map((id) => {
      const targetUrl = PWA_BASE_URL + '?id=' + encodeURIComponent(id);
      return {
        url: 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(targetUrl),
        muteHttpExceptions: true
      };
    });

    let respuestas;
    try {
      respuestas = UrlFetchApp.fetchAll(requests); // pide todo el lote EN PARALELO
    } catch (err) {
      Logger.log('Error en el lote desde ' + desde + ': ' + err.message);
      errores += lote.length;
      desde += QR_BATCH_SIZE;
      continue;
    }

    for (let i = 0; i < lote.length; i++) {
      const id = lote[i];
      const resp = respuestas[i];
      try {
        if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());
        const blob = resp.getBlob().setName(id + '.png');

        const existentes = folder.getFilesByName(id + '.png');
        while (existentes.hasNext()) existentes.next().setTrashed(true);

        folder.createFile(blob);
        generados++;
      } catch (err) {
        Logger.log('Error generando QR para ' + id + ': ' + err.message);
        errores++;
      }
    }

    desde += QR_BATCH_SIZE;
    // Guardamos progreso después de cada lote, por si la siguiente vuelta se corta.
    props.setProperty('QR_PROGRESO', String(desde));
    props.setProperty('QR_GENERADOS', String(generados));
  }

  // Terminado: limpiamos el progreso guardado para la próxima corrida completa.
  props.deleteProperty('QR_PROGRESO');
  props.deleteProperty('QR_GENERADOS');

  SpreadsheetApp.getUi().alert(
    'Listo ✅ Se generaron ' + generados + ' códigos QR en la carpeta "' + QR_FOLDER_NAME + '" de tu Drive.' +
    (errores > 0 ? '\n⚠️ ' + errores + ' tableros dieron error (revisá el registro de ejecución para más detalle).' : '')
  );
}

/** Corré esta función manualmente si querés que la próxima vez arranque de cero. */
function reiniciarProgresoQR() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('QR_PROGRESO');
  props.deleteProperty('QR_GENERADOS');
  SpreadsheetApp.getUi().alert('Progreso reiniciado. La próxima corrida empieza desde el primer tablero.');
}

/**
 * Página HTML imprimible con el QR + número + dirección de cada tablero.
 * Se abre visitando la URL de la app publicada + "?etiquetas=1".
 */
function generarHojaEtiquetas_() {
  const sheet = getSheet_();
  const headerMap = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  const filas = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  const colIdIdx = headerMap[COL.ID_TABLERO] - 1;
  const colCalleIdx = headerMap[COL.CALLE] - 1;
  const colAlturaIdx = headerMap[COL.ALTURA] - 1;

  const avisoUrlPendiente = PWA_BASE_URL.indexOf('TU-USUARIO') !== -1
    ? '<p style="color:#c62828;text-align:center">⚠️ Todavía no configuraste PWA_BASE_URL en Code.gs — los QR apuntan a una URL de ejemplo.</p>'
    : '';

  let items = '';
  filas.forEach((fila) => {
    const id = fila[colIdIdx];
    if (!id) return;
    const calle = fila[colCalleIdx] || '';
    const altura = fila[colAlturaIdx] || '';
    const targetUrl = PWA_BASE_URL + '?id=' + encodeURIComponent(id);
    const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(targetUrl);

    items +=
      '<div class="etiqueta">' +
        '<img src="' + qrImgUrl + '" alt="QR ' + id + '">' +
        '<div class="tid">' + id + '</div>' +
        '<div class="dir">' + calle + ' ' + altura + '</div>' +
      '</div>';
  });

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
      'body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#f3f5f7;}' +
      '.toolbar{text-align:center;margin-bottom:20px;}' +
      '.toolbar button{padding:10px 18px;font-size:14px;cursor:pointer;border-radius:6px;border:1px solid #1F4E78;background:#1F4E78;color:#fff;}' +
      '.grid{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;}' +
      '.etiqueta{width:180px;background:#fff;border:1px solid #999;border-radius:8px;padding:10px;text-align:center;page-break-inside:avoid;}' +
      '.etiqueta img{width:140px;height:140px;}' +
      '.tid{font-weight:bold;font-size:15px;margin-top:6px;color:#123146;}' +
      '.dir{font-size:11px;color:#333;}' +
      '@media print{.no-print{display:none;} body{background:#fff;padding:0;}}' +
    '</style></head><body>' +
      '<div class="toolbar no-print"><button onclick="window.print()">🖨️ Imprimir todas las etiquetas</button></div>' +
      avisoUrlPendiente +
      '<div class="grid">' + items + '</div>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('Etiquetas QR - Tableros');
}

// ============ FORMULARIO DE INSPECCIÓN (funciones ya existentes) ============

function buscarTablero(idTablero) {
  const sheet = getSheet_();
  const headerMap = getHeaderMap_(sheet);
  const row = encontrarFila_(sheet, headerMap, idTablero);

  if (row === -1) return { found: false };

  const get = (colName) => {
    const c = headerMap[colName];
    return c ? sheet.getRange(row, c).getValue() : '';
  };

  const ultInsp = get(COL.ULT_INSP);

  return {
    found: true,
    idTablero: get(COL.ID_TABLERO).toString(),
    calle: get(COL.CALLE),
    altura: get(COL.ALTURA),
    estado: get(COL.ESTADO),
    columna: get(COL.COLUMNA),
    cierrePuerta: get(COL.CIERRE_PUERTA),
    idCol: get(COL.ID),
    circuitoPAT: get(COL.CIRCUITO_PAT),
    observaciones: get(COL.OBS),
    ultimaInspeccion: ultInsp instanceof Date
      ? Utilities.formatDate(ultInsp, Session.getScriptTimeZone(), 'dd/MM/yyyy')
      : ultInsp
  };
}

function guardarInspeccion(data) {
  const sheet = getSheet_();
  const headerMap = getHeaderMap_(sheet);
  const row = encontrarFila_(sheet, headerMap, data.idTablero);

  if (row === -1) {
    throw new Error('No se encontró ningún tablero con ID "' + data.idTablero + '". Verificá el número antes de guardar.');
  }

  const setVal = (colName, value) => {
    const c = headerMap[colName];
    if (c) sheet.getRange(row, c).setValue(value);
  };

  setVal(COL.ESTADO, data.estado);
  setVal(COL.COLUMNA, data.columna);
  setVal(COL.CIERRE_PUERTA, data.cierrePuerta);
  setVal(COL.ID, data.idCol);
  setVal(COL.CIRCUITO_PAT, data.circuitoPAT);
  setVal(COL.OBS, data.observaciones || '');

  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  if (data.fotoExterna && data.fotoExterna.base64) {
    const url = subirFoto_(folder, data.fotoExterna, data.idTablero, 'E');
    setVal(COL.FOTO_EXT, url);
  }
  if (data.fotoInterna && data.fotoInterna.base64) {
    const url = subirFoto_(folder, data.fotoInterna, data.idTablero, 'I');
    setVal(COL.FOTO_INT, url);
  }

  const ahora = new Date();
  const colUlt = headerMap[COL.ULT_INSP];
  if (colUlt) {
    sheet.getRange(row, colUlt).setValue(ahora);
    sheet.getRange(row, colUlt).setNumberFormat('dd/mm/yyyy');
  }

  return {
    success: true,
    fila: row,
    fecha: Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
  };
}

function subirFoto_(folder, fotoObj, idTablero, sufijo) {
  const base64Data = fotoObj.base64.indexOf(',') > -1 ? fotoObj.base64.split(',').pop() : fotoObj.base64;
  const bytes = Utilities.base64Decode(base64Data);
  const mime = fotoObj.mimeType || 'image/jpeg';
  const ext = mime.split('/').pop();
  const nombreArchivo = idTablero + '-' + sufijo + '_' + new Date().getTime() + '.' + ext;
  const blob = Utilities.newBlob(bytes, mime, nombreArchivo);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}
