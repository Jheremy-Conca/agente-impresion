# agente-impresion

Agente de impresión de etiquetas para Windows. Consulta periódicamente un backend por trabajos de impresión pendientes, renderiza cada etiqueta como imagen (HTML/Handlebars → PNG vía Chrome headless) y la envía a una impresora Epson TM-C3500 mediante un script de PowerShell.

## Requisitos

- Node.js 20+
- Windows, con la impresora Epson TM-C3500 (u otra) instalada y configurada con el tamaño de papel deseado
- Una copia de Google Chrome/Chromium disponible para Puppeteer (se descarga automáticamente al instalar dependencias)

## Instalación

```bash
npm install
```

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Descripción | Requerida |
|---|---|---|
| `BACKEND_URL` | URL base del backend que expone los trabajos de impresión | Sí |
| `AGENT_TOKEN` | Token enviado en el header `x-agent-token` para autenticar al agente | Sí |
| `EPSON_PRINTER_NAME` | Nombre exacto de la impresora en Windows | No (default `EPSON TM-C3500 Ver2`) |
| `EPSON_PAPER_SIZE` | Nombre del tamaño de papel configurado en el driver | No (default `Mate Brilloso 10x6 cm`) |
| `POLL_INTERVAL_MS` | Intervalo de consulta al backend, en ms | No (default `3000`) |

## Uso

```bash
npm run dev     # ejecuta el agente directamente con tsx
npm run build   # compila TypeScript a dist/
npm run start   # ejecuta la versión compilada (dist/index.js)
```

## Cómo funciona

1. **Consulta** el backend (`GET /etiquetas/trabajos/pendientes`) por trabajos pendientes.
2. **Renderiza** cada trabajo eligiendo una plantilla Handlebars (`assets/templates/*.hbs`) según el tipo de etiqueta, y la convierte en una imagen PNG usando Puppeteer.
3. **Imprime** la imagen invocando `scripts/imprimir-etiqueta.ps1`, que usa GDI+ para enviarla a la impresora con el tamaño de papel y resolución correctos.
4. **Reporta** el resultado al backend (`PATCH /etiquetas/trabajos/:id/estado`) como `IMPRESO` o `ERROR`.

## Agregar una nueva plantilla de etiqueta

Agrega un archivo `.hbs` en `assets/templates/` y, si necesita un fondo distinto al predeterminado, súmalo al mapa `FONDOS` en `src/etiqueta-generator.ts`.
