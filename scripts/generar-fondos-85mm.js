// Script de una sola vez: genera los 4 fondos placeholder de 85mm de alto
// (1531x1205px) a partir de los originales de 60mm, insertando una banda
// blanca en la zona ya vacía de cada diseño (entre la franja celeste/header
// y la fila de teléfono/email + "APROBADO"), sin escalar ni tocar ningún
// elemento gráfico existente. Placeholder — reemplazar por el arte real de
// Illustrator cuando esté listo (mismas dimensiones finales).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// cutFraction: fracción del alto nativo de la imagen ORIGINAL donde se corta
// (justo debajo de la franja celeste/header, antes de la fila de footer).
// insertRatio: cuánto crece el alto nativo para que, al estirarse con
// background-size:100% 100% sobre el label nuevo (1205px en vez de 850px),
// el header y el footer terminen exactamente en el mismo tamaño final que
// tenían antes (insertRatio = 1205/850 - 1).
const INSERT_RATIO = 1205 / 850 - 1;

const IMAGENES = [
  { archivo: 'etiqueta-fondo.png', salida: 'etiqueta-fondo-85mm.png', cutFraction: 0.47 },
  { archivo: 'etiqueta-fondo-rombo.png', salida: 'etiqueta-fondo-rombo-85mm.png', cutFraction: 0.47 },
  { archivo: 'etiqueta-fondo-muestras.png', salida: 'etiqueta-fondo-muestras-85mm.png', cutFraction: 0.5 },
];

function leerDimensionesPng(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function generarUna(page, { archivo, salida, cutFraction }) {
  const rutaOrigen = path.join(ASSETS_DIR, archivo);
  const buf = fs.readFileSync(rutaOrigen);
  const { width, height } = leerDimensionesPng(buf);
  const base64 = buf.toString('base64');

  const cutPx = Math.round(height * cutFraction);
  const insertPx = Math.round(height * INSERT_RATIO);
  const nuevoAlto = height + insertPx;

  const html = `<!DOCTYPE html><html><head><style>
    * { margin:0; padding:0; }
    body { width:${width}px; height:${nuevoAlto}px; }
    .slice { width:${width}px; overflow:hidden; position:relative; }
    .top { height:${cutPx}px; }
    .bottom { height:${height - cutPx}px; }
    .filler { width:${width}px; height:${insertPx}px; background:#ffffff; }
    img { position:absolute; left:0; width:${width}px; height:${height}px; }
    .top img { top:0; }
    .bottom img { top:-${cutPx}px; }
  </style></head><body>
    <div class="slice top"><img src="data:image/png;base64,${base64}"></div>
    <div class="filler"></div>
    <div class="slice bottom"><img src="data:image/png;base64,${base64}"></div>
  </body></html>`;

  await page.setViewport({ width, height: nuevoAlto, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const rutaSalida = path.join(ASSETS_DIR, salida);
  await page.screenshot({ path: rutaSalida, type: 'png' });
  console.log(`${archivo} (${width}x${height}) -> ${salida} (${width}x${nuevoAlto})`);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  for (const img of IMAGENES) {
    await generarUna(page, img);
  }
  await browser.close();
})();
