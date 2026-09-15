import 'dotenv/config';

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const CONFIG = {
  backendUrl: requerida('BACKEND_URL'),
  agentToken: requerida('AGENT_TOKEN'),
  printerName: process.env.EPSON_PRINTER_NAME ?? 'EPSON TM-C3500 Ver2',
  paperSize: process.env.EPSON_PAPER_SIZE ?? 'Mate Brilloso 10x6 cm',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
};