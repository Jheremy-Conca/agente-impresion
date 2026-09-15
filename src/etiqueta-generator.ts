import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import puppeteer, { Browser } from 'puppeteer';

const ETIQUETA_LABEL_CONFIG = { widthMm: 108, heightMm: 60, dpi: 360 };
const ETIQUETA_LABEL_PX = {
  width: Math.round((ETIQUETA_LABEL_CONFIG.widthMm / 25.4) * ETIQUETA_LABEL_CONFIG.dpi),
  height: Math.round((ETIQUETA_LABEL_CONFIG.heightMm / 25.4) * ETIQUETA_LABEL_CONFIG.dpi),
};

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const TEMPLATES_DIR = path.join(ASSETS_DIR, 'templates');

const FONDOS: Record<string, string> = {
  'con-rombo.hbs': path.join(ASSETS_DIR, 'etiqueta-fondo-rombo.png'),
  'blanco.hbs': path.join(ASSETS_DIR, 'etiqueta-fondo-blanco.png'),
  'muestras.hbs': path.join(ASSETS_DIR, 'etiqueta-fondo-muestras.png'),
};
const FONDO_DEFAULT = path.join(ASSETS_DIR, 'etiqueta-fondo.png');

export interface EtiquetaParaRenderizar {
  producto: string;
  numeroLote: string;
  fabricante: string;
  fechaFabricacion: string;
  fechaVencimiento: string;
  pesoBruto: string;
  unidadBruto: string;
  cantidadNeta?: string | null;
  unidadNeta: string;
  proforma: string;
  nfpaSalud?: number | null;
  nfpaInflamabilidad?: number | null;
  nfpaReactividad?: number | null;
}

let browser: Browser | null = null;
const fondosCache = new Map<string, string>();

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({ headless: true });
  }
  return browser;
}

function getTemplate(archivo: string): HandlebarsTemplateDelegate {
  const ruta = path.join(TEMPLATES_DIR, archivo);
  const html = fs.readFileSync(ruta, 'utf-8');
  return Handlebars.compile(html); // siempre lee el archivo actual, sin cache
}

function getFondoBase64(archivo: string): string {
  const rutaFondo = FONDOS[archivo] ?? FONDO_DEFAULT;
  if (!fondosCache.has(rutaFondo)) {
    fondosCache.set(rutaFondo, fs.readFileSync(rutaFondo).toString('base64'));
  }
  return fondosCache.get(rutaFondo)!;
}

function construirHtml(archivo: string, etiqueta: EtiquetaParaRenderizar): string {
  const esVolumen = etiqueta.unidadNeta === 'ML' || etiqueta.unidadNeta === 'L';
  const labelNeto = esVolumen ? 'CANT. NETO' : 'PESO NETO';

  const template = getTemplate(archivo);
  const fondoBase64 = getFondoBase64(archivo);

  // Corre siempre en la PC Windows de la impresora: Segoe UI real ya está
  // instalada, así que fontBase64 nunca se manda y los .hbs caen solos al
  // 'Segoe UI' real por nombre (nunca más hace falta Selawik).
  return template({
    widthPx: ETIQUETA_LABEL_PX.width,
    heightPx: ETIQUETA_LABEL_PX.height,
    fondoBase64,
    fallbackFontFamily: 'Arial, sans-serif',
    producto: etiqueta.producto,
    numeroLote: etiqueta.numeroLote,
    fabricante: etiqueta.fabricante,
    fechaFabricacion: etiqueta.fechaFabricacion,
    fechaVencimiento: etiqueta.fechaVencimiento,
    pesoBruto: etiqueta.pesoBruto,
    unidadBruto: etiqueta.unidadBruto,
    pesoNeto: etiqueta.cantidadNeta ?? '—',
    unidadNeto: etiqueta.unidadNeta,
    labelNeto,
    proforma: etiqueta.proforma,
    nfpaSalud: etiqueta.nfpaSalud ?? 0,
    nfpaInflamabilidad: etiqueta.nfpaInflamabilidad ?? 0,
    nfpaReactividad: etiqueta.nfpaReactividad ?? 0,
  });
}

export async function generarImagen(
  archivo: string,
  etiqueta: EtiquetaParaRenderizar,
): Promise<Buffer> {
  const html = construirHtml(archivo, etiqueta);
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({
      width: ETIQUETA_LABEL_PX.width,
      height: ETIQUETA_LABEL_PX.height,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');
    await page.evaluate(() => {
      const w = window as unknown as { ajustarNombreProducto?: () => void };
      if (typeof w.ajustarNombreProducto === 'function') {
        w.ajustarNombreProducto();
      }
    });
    return (await page.screenshot({ type: 'png' })) as Buffer;
  } finally {
    await page.close();
  }
}