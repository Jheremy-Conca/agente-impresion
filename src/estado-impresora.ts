import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { CONFIG } from './config';

const execFileAsync = promisify(execFile);
const SCRIPT_ESTADO = path.join(__dirname, '..', 'scripts', 'estado-impresora.ps1');

export interface ProblemaImpresora {
  codigo: string;
  mensaje: string;
  // Impide imprimir (sin papel, sin tinta, tapa abierta...).
  bloqueante: boolean;
}

export interface EstadoImpresora {
  ok: boolean;
  problemas: ProblemaImpresora[];
}

// Pregunta a Windows cómo está la impresora. Si no se puede saber, no se frena la
// impresión: se devuelve un aviso no bloqueante.
export async function leerEstadoImpresora(): Promise<EstadoImpresora> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_ESTADO, '-PrinterName', CONFIG.printerName],
      { timeout: 15000 },
    );
    return interpretarEstado(stdout);
  } catch (error: any) {
    return {
      ok: false,
      problemas: [
        {
          codigo: 'ESTADO_NO_DISPONIBLE',
          mensaje: `No se pudo leer el estado de la impresora: ${error.message}`,
          bloqueante: false,
        },
      ],
    };
  }
}

export function interpretarEstado(salida: string): EstadoImpresora {
  // Por si PowerShell escribió algo más antes del JSON, se toma la última línea con llaves.
  const linea = salida
    .split(/\r?\n/)
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.startsWith('{') && l.endsWith('}'));
  if (!linea) throw new Error('el script no devolvió el estado');
  const datos = JSON.parse(linea) as { problemas?: ProblemaImpresora[] };
  const problemas = Array.isArray(datos.problemas) ? datos.problemas : [];
  return { ok: problemas.length === 0, problemas };
}

export function bloqueaImpresion(estado: EstadoImpresora): ProblemaImpresora[] {
  return estado.problemas.filter((p) => p.bloqueante);
}
