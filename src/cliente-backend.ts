import axios from 'axios';
import { CONFIG } from './config';
import type { EstadoImpresora } from './estado-impresora';

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
  proforma: string;
  nfpaSalud: number | null;
  nfpaInflamabilidad: number | null;
  nfpaReactividad: number | null;
  qrUrl: string | null;
  coaValidado: boolean;
}

export async function obtenerPendientes(): Promise<TrabajoPendiente[]> {
  const { data } = await api.get<TrabajoPendiente[]>('/etiquetas/trabajos/pendientes');
  return data;
}

export async function reportarEstado(id: number, estado: 'IMPRESO' | 'ERROR', mensajeError?: string) {
  await api.patch(`/etiquetas/trabajos/${id}/estado`, { estado, mensajeError });
}

// Avisa al backend que el agente está vivo y cómo está la impresora.
export async function reportarEstadoAgente(impresora: EstadoImpresora) {
  await api.post('/etiquetas/agente/estado', { impresora });
}

export type DatosVistaPrevia = Omit<TrabajoPendiente, 'id'> & { id: string };

export async function obtenerVistasPrevias(): Promise<DatosVistaPrevia[]> {
  const { data } = await api.get<DatosVistaPrevia[]>('/etiquetas/vista-previa/pendientes');
  return data;
}

export async function enviarVistaPrevia(id: string, imagen: Buffer) {
  await api.post(`/etiquetas/vista-previa/${id}/imagen`, { imagenBase64: imagen.toString('base64') }, { timeout: 30000 });
}

export async function fallarVistaPrevia(id: string, error: string) {
  await api.post(`/etiquetas/vista-previa/${id}/imagen`, { error });
}
