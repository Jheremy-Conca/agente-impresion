import axios from 'axios';
import { CONFIG } from './config';

const api = axios.create({
  baseURL: CONFIG.backendUrl,
  headers: { 'x-agent-token': CONFIG.agentToken },
  timeout: 15000,
});

export interface TrabajoPendiente {
  id: number;
  plantillaArchivo: string;
  producto: string;
  numeroLote: string;
  fabricante: string;
  fechaFabricacion: string;
  fechaVencimiento: string;
  pesoBruto: string;
  unidadBruto: string;
  cantidadNeta: string | null;
  unidadNeta: string;
  tara: string | null;
  envaseNumero: number | null;
  envaseTotal: number | null;
  proforma: string;
  nfpaSalud: number | null;
  nfpaInflamabilidad: number | null;
  nfpaReactividad: number | null;
  qrUrl: string | null;
  pictogramasGhs?: string[];
  coaValidado: boolean;
}

export async function obtenerPendientes(): Promise<TrabajoPendiente[]> {
  const { data } = await api.get<TrabajoPendiente[]>('/etiquetas/trabajos/pendientes');
  return data;
}

export async function reportarEstado(id: number, estado: 'IMPRESO' | 'ERROR', mensajeError?: string) {
  await api.patch(`/etiquetas/trabajos/${id}/estado`, { estado, mensajeError });
}