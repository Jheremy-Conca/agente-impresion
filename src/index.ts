import { CONFIG } from './config';
import {
  obtenerPendientes,
  reportarEstado,
  reportarEstadoAgente,
  obtenerVistasPrevias,
  enviarVistaPrevia,
  fallarVistaPrevia,
  type TrabajoPendiente,
} from './cliente-backend';
import { generarImagen, formatoDe } from './etiqueta-generator';
import { imprimir } from './imprimir';
import { bloqueaImpresion, leerEstadoImpresora, type EstadoImpresora } from './estado-impresora';

const INTERVALO_ESTADO_MS = 15000;

function aEtiqueta(trabajo: Omit<TrabajoPendiente, 'id'>) {
  return {
    producto: trabajo.producto,
    numeroLote: trabajo.numeroLote,
    fabricante: trabajo.fabricante,
    fechaFabricacion: trabajo.fechaFabricacion,
    fechaVencimiento: trabajo.fechaVencimiento,
    pesoBruto: trabajo.pesoBruto,
    unidadBruto: trabajo.unidadBruto,
    cantidadNeta: trabajo.cantidadNeta,
    unidadNeta: trabajo.unidadNeta,
    tara: trabajo.tara,
    proforma: trabajo.proforma,
    nfpaSalud: trabajo.nfpaSalud,
    nfpaInflamabilidad: trabajo.nfpaInflamabilidad,
    nfpaReactividad: trabajo.nfpaReactividad,
    qrUrl: trabajo.qrUrl,
    coaValidado: trabajo.coaValidado,
  };
}

// --- Estado de la impresora: se avisa al backend cada pocos segundos ---

let ultimoBloqueo = '';

async function avisarEstado(): Promise<EstadoImpresora> {
  const estado = await leerEstadoImpresora();
  await reportarEstadoAgente(estado).catch((e: any) =>
    console.error('[agente] no se pudo avisar el estado al backend:', e.message),
  );
  return estado;
}

async function ciclosDeEstado() {
  try {
    await avisarEstado();
  } finally {
    setTimeout(ciclosDeEstado, INTERVALO_ESTADO_MS);
  }
}

// --- Cola de impresión ---

async function procesarPendientes() {
  const pendientes = await obtenerPendientes();
  if (pendientes.length === 0) {
    ultimoBloqueo = '';
    return;
  }

  // Si la impresora no puede imprimir (sin papel, sin tinta, tapa abierta...) los
  // trabajos se dejan PENDIENTES: así no se marcan como error ni se pierden, y se
  // imprimen solos cuando se resuelva.
  const estado = await avisarEstado();
  const bloqueos = bloqueaImpresion(estado);
  if (bloqueos.length > 0) {
    const resumen = bloqueos.map((p) => p.mensaje).join(' | ');
    if (resumen !== ultimoBloqueo) {
      console.warn(`[agente] ${pendientes.length} etiqueta(s) en espera. ${resumen}`);
      ultimoBloqueo = resumen;
    }
    return;
  }
  ultimoBloqueo = '';

  for (const trabajo of pendientes) {
    try {
      const imagen = await generarImagen(trabajo.plantillaArchivo, aEtiqueta(trabajo));
      await imprimir(imagen, formatoDe(trabajo.plantillaArchivo).paperSize);
      await reportarEstado(trabajo.id, 'IMPRESO');
      console.log(`[agente] trabajo ${trabajo.id} impreso OK`);
    } catch (error: any) {
      console.error(`[agente] fallo el trabajo ${trabajo.id}:`, error.message);
      await reportarEstado(trabajo.id, 'ERROR', error.message).catch(() => {});
    }
  }
}

// --- Vistas previas: se dibuja la etiqueta pero NO se imprime ---

async function procesarVistasPrevias() {
  const previas = await obtenerVistasPrevias();
  for (const previa of previas) {
    try {
      const imagen = await generarImagen(previa.plantillaArchivo, aEtiqueta(previa));
      await enviarVistaPrevia(previa.id, imagen);
    } catch (error: any) {
      console.error(`[agente] fallo la vista previa ${previa.id}:`, error.message);
      await fallarVistaPrevia(previa.id, error.message).catch(() => {});
    }
  }
}

async function loop() {
  try {
    await procesarVistasPrevias();
  } catch (error: any) {
    console.error('[agente] error atendiendo vistas previas:', error.message);
  }
  try {
    await procesarPendientes();
  } catch (error: any) {
    console.error('[agente] error consultando pendientes:', error.message);
  } finally {
    setTimeout(loop, CONFIG.pollIntervalMs);
  }
}

console.log(`[agente] iniciado, consultando cada ${CONFIG.pollIntervalMs}ms`);
ciclosDeEstado();
loop();
