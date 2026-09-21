// Pictogramas GHS/SGA oficiales de la ONU (UNECE), en assets/ghs/GHSxx.png.
import * as fs from 'fs';
import * as path from 'path';

const DIR = path.join(__dirname, '..', 'assets', 'ghs');
const cache = new Map<string, string>();

function dataUri(codigo: string): string | null {
  if (cache.has(codigo)) return cache.get(codigo)!;
  const archivo = path.join(DIR, `${codigo}.png`);
  if (!/^GHS0[1-9]$/.test(codigo) || !fs.existsSync(archivo)) return null;
  const uri = `data:image/png;base64,${fs.readFileSync(archivo).toString('base64')}`;
  cache.set(codigo, uri);
  return uri;
}

export function pictogramasHtml(codigos: string[] | null | undefined, tamano = 112): string {
  return (codigos ?? [])
    .map((c) => ({ c, uri: dataUri(c) }))
    .filter((x) => x.uri)
    .map((x) => `<img src="${x.uri}" width="${tamano}" height="${tamano}" style="display:block">`)
    .join('');
}
