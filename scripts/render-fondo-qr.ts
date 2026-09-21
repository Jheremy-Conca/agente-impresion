// Renderiza la plantilla qr.hbs SIN datos variables (solo lo fijo), para ver
// o exportar el "fondo". Salida: scripts/out/qr-fondo.png
import * as fs from 'fs';
import * as path from 'path';
import { generarImagen } from '../src/etiqueta-generator';

(async () => {
  const png = await generarImagen('qr.hbs', {
    producto: '', numeroLote: '', fabricante: '', fechaFabricacion: '', fechaVencimiento: '',
    pesoBruto: '', unidadBruto: '', cantidadNeta: '', unidadNeta: '', tara: '', proforma: '',
    coaValidado: true,
  });
  fs.writeFileSync(path.join(__dirname, 'out', 'qr-fondo.png'), png);
  process.exit(0);
})();
