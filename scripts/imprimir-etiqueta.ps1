param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath,

    [Parameter(Mandatory=$true)]
    [string]$PrinterName,

    [Parameter(Mandatory=$false)]
    [string]$PaperSizeName = "Mate Brilloso 10x6 cm"
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

function Read-FileBytesWithRetry {
    param(
        [string]$Path,
        [int]$MaxRetries = 8,
        [int]$DelayMs = 250
    )

    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $fs = [System.IO.File]::Open(
                $Path,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read,
                [System.IO.FileShare]::ReadWrite
            )
            try {
                [byte[]]$bytes = New-Object byte[] $fs.Length
                $totalRead = 0
                while ($totalRead -lt $fs.Length) {
                    $read = $fs.Read($bytes, $totalRead, $fs.Length - $totalRead)
                    if ($read -eq 0) { break }
                    $totalRead += $read
                }
                if ($totalRead -lt 100) {
                    throw "Archivo sospechosamente pequeño ($totalRead bytes), posible escritura incompleta."
                }
                # CLAVE: la coma evita que PowerShell desenrolle el array
                # al devolverlo por el pipeline. Sin esto, $bytes llega
                # del otro lado como Object[] en vez de byte[], y
                # Image.FromStream falla con "parámetro no válido".
                return ,$bytes
            }
            finally {
                $fs.Close()
            }
        }
        catch {
            if ($i -eq $MaxRetries) {
                throw "No se pudo leer el archivo tras $MaxRetries intentos: $($_.Exception.Message)"
            }
            Start-Sleep -Milliseconds $DelayMs
        }
    }
}

try {
    if (-not (Test-Path $ImagePath)) {
        throw "El archivo de imagen no existe: $ImagePath"
    }

    $bytes = Read-FileBytesWithRetry -Path $ImagePath
    Write-Host "Bytes leidos: $($bytes.Length) | Tipo: $($bytes.GetType().FullName)"

    # Uso ::new() en vez de New-Object(...) para evitar el parseo
    # ambiguo de paréntesis que termina llamando al constructor vacío
    # de MemoryStream (bug que causaba "parametro no valido" en FromStream).
    $ms = [System.IO.MemoryStream]::new($bytes)
    Write-Host "MemoryStream longitud: $($ms.Length)"

    try {
        $imgOriginal = [System.Drawing.Image]::FromStream($ms)
        $imagen = [System.Drawing.Bitmap]::new($imgOriginal)
        $imgOriginal.Dispose()
    }
    finally {
        $ms.Dispose()
    }

    Write-Host "Imagen cargada OK: $($imagen.Width)x$($imagen.Height) px"

    $printDoc = New-Object System.Drawing.Printing.PrintDocument
    $printDoc.PrinterSettings.PrinterName = $PrinterName

    if (-not $printDoc.PrinterSettings.IsValid) {
        throw "La impresora '$PrinterName' no es válida o no está disponible."
    }

    $paperSize = $null
    foreach ($ps in $printDoc.PrinterSettings.PaperSizes) {
        if ($ps.PaperName -eq $PaperSizeName) {
            $paperSize = $ps
            break
        }
    }

    if ($null -eq $paperSize) {
        $disponibles = ($printDoc.PrinterSettings.PaperSizes | ForEach-Object { $_.PaperName }) -join ", "
        throw "No se encontró el tamaño de papel '$PaperSizeName'. Disponibles: $disponibles"
    }

    $printDoc.DefaultPageSettings.PaperSize = $paperSize
    $printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

    # CLAVE (fix de nitidez de texto): el PNG viene renderizado a 360dpi
    # exactos (ver ETIQUETA_LABEL_PX / comentarios en el .service.ts —
    # se cambió de 300 a 360 porque esa es la resolución nativa real del
    # driver de la Epson TM-C3500). Si dejamos que la impresora use su
    # resolución por defecto, casi nunca coincide pixel-a-pixel con esos
    # 360dpi, y DrawImage() termina reescalando la imagen con
    # interpolación para que "quepa" en el tamaño físico del papel. Ese
    # reescalado es justo lo que difumina/deforma levemente los números
    # (trazos finos = lo más sensible al blur/dentado). Intentamos forzar
    # 360x360dpi si el driver lo soporta, para acercarnos a un mapeo 1:1
    # y minimizar ese efecto.
    $dpiObjetivo = 360
    $resolucionExacta = $printDoc.PrinterSettings.PrinterResolutions |
        Where-Object { $_.X -eq $dpiObjetivo -and $_.Y -eq $dpiObjetivo } |
        Select-Object -First 1

    if ($null -ne $resolucionExacta) {
        $printDoc.DefaultPageSettings.PrinterResolution = $resolucionExacta
        Write-Host "Resolucion de impresion fijada a ${dpiObjetivo}x${dpiObjetivo}dpi (match exacto)."
    } else {
        $disponibles = ($printDoc.PrinterSettings.PrinterResolutions | ForEach-Object { "$($_.X)x$($_.Y)" }) -join ", "
        Write-Host "AVISO: el driver no reporta ${dpiObjetivo}x${dpiObjetivo}dpi exacto. Disponibles: $disponibles. Se usara la resolucion por defecto del driver."
    }

    $printDoc.add_PrintPage({
        param($sender, $e)

        # BUG DE LA VERSION ANTERIOR: asumiamos ciegamente que la
        # resolucion activa iba a ser 300dpi y dibujabamos la imagen a
        # su tamaño en pixeles tal cual (imagen.Width x imagen.Height).
        # Si el driver NO acepto el match de 300dpi de arriba (cayo al
        # bloque de AVISO) y quedo con una resolucion mas alta por
        # defecto (ej. 600dpi), la MISMA cantidad de pixeles ocupa
        # MENOS espacio fisico -> la etiqueta salio mas chica.
        #
        # FIX: en vez de asumir el dpi, lo leemos de $e.PageSettings
        # (la resolucion REAL que el driver termino usando para este
        # trabajo) y calculamos el rectangulo destino en pixeles a
        # partir del tamaño FISICO real del papel ($paperSize, que
        # viene en centesimas de pulgada). Asi el tamaño impreso
        # siempre es correcto, sin importar que dpi eligio el driver;
        # y si coincide con los 300dpi del PNG, el mapeo queda 1:1
        # (o lo mas cercano posible), minimizando el blur.
        $resActual = $e.PageSettings.PrinterResolution
        $anchoPulgadas = $paperSize.Width / 100.0
        $altoPulgadas = $paperSize.Height / 100.0
        $destWidthPx = $anchoPulgadas * $resActual.X
        $destHeightPx = $altoPulgadas * $resActual.Y

        Write-Host "Resolucion real usada por el driver: $($resActual.X)x$($resActual.Y)dpi | Destino: ${destWidthPx}x${destHeightPx}px (imagen origen: $($imagen.Width)x$($imagen.Height)px)"

        $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
        $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor

        # FIX DENTADO: aunque el dpi del PNG coincida con el del driver,
        # el redondeo de mm a px (Math.round en el .service.ts) y el
        # redondeo del tamaño de papel guardado en Windows casi nunca dan
        # un destino EXACTAMENTE igual al tamaño de la imagen (ej. imagen
        # 1531x850 vs destino 1530x849.6). Con NearestNeighbor, hasta un
        # desfase de 1px produce columnas/filas donde se salta o duplica
        # un pixel de forma abrupta, y eso cae justo sobre trazos finos
        # de texto -> dentado visible al imprimir. Como ese desfase es
        # fisicamente imperceptible (menos de un pixel de diferencia en
        # ~1500), si es minimo (<=2px) dibujamos la imagen en su tamano
        # NATIVO sin escalar, en vez de forzar el tamano de destino.
        $diffW = [Math]::Abs($imagen.Width - $destWidthPx)
        $diffH = [Math]::Abs($imagen.Height - $destHeightPx)

        if ($diffW -le 2 -and $diffH -le 2) {
            Write-Host "Diferencia despreciable (${diffW}x${diffH}px) - dibujando 1:1 sin escalar."
            $e.Graphics.DrawImage($imagen, 0, 0, $imagen.Width, $imagen.Height)
        } else {
            $e.Graphics.DrawImage($imagen, 0, 0, $destWidthPx, $destHeightPx)
        }
    })

    $printDoc.Print()

    Write-Host "IMPRESION_OK"
    $imagen.Dispose()
    exit 0
}
catch {
    Write-Error "IMPRESION_ERROR: $($_.Exception.Message)"
    exit 1
}