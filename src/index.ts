import { CONFIG } from './config';
import { obtenerPendientes, reportarEstado } from './cliente-backend';
import { generarImagen, formatoDe } from './etiqueta-generator';
import { imprimir } from './imprimir';

async function procesarPendientes() {
  const pendientes = await obtenerPendientes();

  for (const trabajo of pendientes) {
    try {
      const imagen = await generarImagen(trabajo.plantillaArchivo, {
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
      });
      await imprimir(imagen, formatoDe(trabajo.plantillaArchivo).paperSize);
      await reportarEstado(trabajo.id, 'IMPRESO');
      console.log(`[agente] trabajo ${trabajo.id} impreso OK`);
    } catch (error: any) {
      console.error(`[agente] fallo el trabajo ${trabajo.id}:`, error.message);
      await reportarEstado(trabajo.id, 'ERROR', error.message).catch(() => {});
    }
  }
}

async function loop() {
  try {
    await procesarPendientes();
  } catch (error: any) {
    console.error('[agente] error consultando pendientes:', error.message);
  } finally {
    setTimeout(loop, CONFIG.pollIntervalMs);
  }
}

console.log(`[agente] iniciado, consultando cada ${CONFIG.pollIntervalMs}ms`);
loop();