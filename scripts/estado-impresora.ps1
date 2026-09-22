param(
    [Parameter(Mandatory = $true)][string]$PrinterName
)

# Lee el estado de la impresora que Windows conoce (el driver Epson lo reporta al
# servicio de impresión) y lo devuelve como JSON en una sola línea:
#   {"ok":true,"problemas":[{"codigo":"SIN_PAPEL","mensaje":"...","bloqueante":true}]}
#
# Windows solo distingue "sin tinta" / "poca tinta" en general; NO informa de qué
# color. Para ver el color exacto hay que abrir el monitor de estado de Epson.

$ErrorActionPreference = 'Stop'
$script:problemas = New-Object System.Collections.ArrayList

function Add-Problema([string]$codigo, [string]$mensaje, [bool]$bloqueante) {
    foreach ($p in $script:problemas) { if ($p.codigo -eq $codigo) { return } }
    [void]$script:problemas.Add([pscustomobject]@{ codigo = $codigo; mensaje = $mensaje; bloqueante = $bloqueante })
}

function Salir {
    $lista = @($script:problemas)
    $salida = [pscustomobject]@{ ok = ($lista.Count -eq 0); problemas = $lista }
    # -InputObject evita que PowerShell 5.1 convierta un arreglo vacío en null.
    Write-Output (ConvertTo-Json -InputObject $salida -Compress -Depth 4)
    exit 0
}

try {
    $spooler = Get-Service -Name Spooler
    if ($spooler.Status -ne 'Running') {
        Add-Problema 'SPOOLER' 'El servicio de impresión de Windows está detenido.' $true
        Salir
    }

    Add-Type -AssemblyName System.Printing
    $servidor = New-Object System.Printing.LocalPrintServer
    $cola = $null
    try { $cola = $servidor.GetPrintQueue($PrinterName) } catch { $cola = $null }
    if (-not $cola) {
        Add-Problema 'NO_ENCONTRADA' "Windows no encuentra la impresora '$PrinterName'." $true
        Salir
    }
    $cola.Refresh()
    $estado = $cola.QueueStatus.ToString()
    $tiene = { param($n) return ($estado -split ',\s*') -contains $n }

    if (& $tiene 'PaperOut')         { Add-Problema 'SIN_PAPEL'      'La impresora se quedó sin papel. Coloca papel para continuar.' $true }
    if (& $tiene 'PaperProblem')     { Add-Problema 'PROBLEMA_PAPEL' 'Hay un problema con el papel de la impresora.' $true }
    if (& $tiene 'PaperJam')         { Add-Problema 'ATASCO'         'Hay papel atascado en la impresora.' $true }
    if (& $tiene 'NoToner')          { Add-Problema 'SIN_TINTA'      'La impresora se quedó sin tinta. Revisa cuál cartucho en el monitor de estado de Epson.' $true }
    if (& $tiene 'TonerLow')         { Add-Problema 'POCA_TINTA'     'Queda poca tinta en la impresora. Revisa cuál cartucho en el monitor de estado de Epson.' $false }
    if (& $tiene 'DoorOpen')         { Add-Problema 'TAPA_ABIERTA'   'La tapa de la impresora está abierta.' $true }
    if (& $tiene 'Offline')          { Add-Problema 'DESCONECTADA'   'La impresora está desconectada o apagada.' $true }
    if (& $tiene 'NotAvailable')     { Add-Problema 'NO_DISPONIBLE'  'La impresora no está disponible.' $true }
    if (& $tiene 'OutputBinFull')    { Add-Problema 'BANDEJA_LLENA'  'La bandeja de salida está llena. Retira las etiquetas.' $false }
    if (& $tiene 'UserIntervention') { Add-Problema 'ATENCION'       'La impresora necesita atención.' $true }
    if (& $tiene 'Error')            { Add-Problema 'ERROR'          'La impresora reporta un error.' $true }

    # El driver también informa por WMI; sirve de respaldo si el estado anterior no lo dijo.
    $wmi = Get-CimInstance -ClassName Win32_Printer -Filter ("Name='" + $PrinterName.Replace("'", "''") + "'") -ErrorAction SilentlyContinue
    if ($wmi) {
        switch ([int]$wmi.DetectedErrorState) {
            4  { Add-Problema 'POCO_PAPEL'    'Queda poco papel en la impresora.' $false }
            5  { Add-Problema 'SIN_PAPEL'     'La impresora se quedó sin papel. Coloca papel para continuar.' $true }
            6  { Add-Problema 'POCA_TINTA'    'Queda poca tinta en la impresora. Revisa cuál cartucho en el monitor de estado de Epson.' $false }
            7  { Add-Problema 'SIN_TINTA'     'La impresora se quedó sin tinta. Revisa cuál cartucho en el monitor de estado de Epson.' $true }
            8  { Add-Problema 'TAPA_ABIERTA'  'La tapa de la impresora está abierta.' $true }
            9  { Add-Problema 'ATASCO'        'Hay papel atascado en la impresora.' $true }
            10 { Add-Problema 'DESCONECTADA'  'La impresora está desconectada o apagada.' $true }
            11 { Add-Problema 'ATENCION'      'La impresora necesita atención.' $true }
            12 { Add-Problema 'BANDEJA_LLENA' 'La bandeja de salida está llena. Retira las etiquetas.' $false }
        }
        if ($wmi.WorkOffline) { Add-Problema 'DESCONECTADA' 'La impresora está desconectada o apagada.' $true }
    }
} catch {
    Add-Problema 'ESTADO_NO_DISPONIBLE' ('No se pudo leer el estado de la impresora: ' + $_.Exception.Message) $false
}

Salir
