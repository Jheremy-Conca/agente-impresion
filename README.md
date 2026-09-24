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

### Verificación al arrancar

Antes de imprimir nada, el agente comprueba que `BACKEND_URL` es realmente el backend (`GET /salud`) y que `AGENT_TOKEN` es aceptado. Si algo falla, lo explica en la consola y reintenta cada 10 s en lugar de quedarse mudo: URL del frontend en vez del backend, token distinto al de Render, sin internet o backend con la base caída. `BACKEND_URL` es la del **backend** (Render) terminada en `/api`, no la de Vercel.

### Arranque automático (Windows)

Para que el agente arranque solo al iniciar sesión, y se reinicie si se cae:

```bash
powershell -ExecutionPolicy Bypass -File scripts\instalar-inicio-automatico.ps1
```

Crea la tarea programada `AgenteImpresionExcellence` para el usuario actual (no pide administrador). Para quitarla, el mismo comando con `-Quitar`. `scripts/ejecutar-agente.ps1` es el lanzador: reinicia el agente a los 10 s si termina, guarda su salida en `logs/agente.log` (se rota a los 5 MB) y **nunca abre un segundo agente** — si ya hay uno corriendo espera a que termine, para no imprimir cada etiqueta duplicada.

Es una tarea al iniciar sesión y no un servicio de Windows a propósito: un servicio corre en una sesión aislada donde las impresoras del usuario y el driver Epson suelen no verse. La consecuencia es que la PC de la impresora debe tener la sesión iniciada; conviene configurar el inicio de sesión automático de Windows y que la PC arranque sola tras un corte de luz.

## Cómo funciona

1. **Consulta** el backend (`GET /etiquetas/trabajos/pendientes`) por trabajos pendientes.
2. **Renderiza** cada trabajo eligiendo una plantilla Handlebars (`assets/templates/*.hbs`) según el tipo de etiqueta, y la convierte en una imagen PNG usando Puppeteer.
   La etiqueta impresa no incluye pictogramas GHS ni número de envase: eso se ve al escanear el QR.
3. **Imprime** la imagen invocando `scripts/imprimir-etiqueta.ps1`, que usa GDI+ para enviarla a la impresora con el tamaño de papel y resolución correctos.
4. **Reporta** el resultado al backend (`PATCH /etiquetas/trabajos/:id/estado`) como `IMPRESO` o `ERROR`.

Además, en paralelo:

- **Cada ~15s** avisa al backend (`POST /etiquetas/agente/estado`) que está vivo y el estado de la impresora (`scripts/estado-impresora.ps1`, vía `System.Printing`/WMI): sin papel, sin tinta, tapa abierta, atasco, etc. Si hay algo bloqueante, los trabajos pendientes se dejan en espera (no se marcan `ERROR`) hasta que se resuelva.
  ⚠️ Windows solo distingue "sin tinta"/"poca tinta" en general, **no informa de qué color** — para eso hay que mirar el monitor de estado de Epson en la PC de la impresora.
- **Vistas previas** (`GET /etiquetas/vista-previa/pendientes`): dibuja la etiqueta igual que para imprimir, pero la devuelve como imagen (`POST /etiquetas/vista-previa/:id/imagen`) en vez de mandarla a la impresora. No pasa por `scripts/imprimir-etiqueta.ps1`.

## Agregar una nueva plantilla de etiqueta

Agrega un archivo `.hbs` en `assets/templates/` y, si necesita un fondo distinto al predeterminado, súmalo al mapa `FONDOS` en `src/etiqueta-generator.ts`.
