<#
.SYNOPSIS
  Prueba de punta a punta del Sistema de Reservas de Vuelos (requiere `docker compose up -d`).
  Recorre: login -> búsqueda (HU1) -> mapa y asiento (HU2) -> bloqueo temporal (HU2) ->
  intento de doble reserva por otro usuario (409) -> pago rechazado y aprobado (HU3) ->
  boleto con código único (HU3) -> dashboard de ocupación (HU4).
.EXAMPLE
  .\probar-flujo.ps1
  .\probar-flujo.ps1 -Origen BOG -Destino CTG -ConPausa
#>
param(
  [string]$Origen = 'BOG',
  [string]$Destino = 'MDE',
  [string]$Monolito = 'http://127.0.0.1:3000/api/v1',
  [string]$Fms = 'http://127.0.0.1:3001/api/v1',
  [string]$Pagos = 'http://127.0.0.1:3002/api/v1',
  [switch]$ConPausa
)
$ErrorActionPreference = 'Stop'

function Invoke-Api {
  param([string]$Method, [string]$Url, $Body = $null, [string]$Token = $null)
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  $params = @{ Method = $Method; Uri = $Url; Headers = $headers }
  if ($null -ne $Body) {
    $params['ContentType'] = 'application/json; charset=utf-8'
    $params['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10))
  }
  try {
    $data = Invoke-RestMethod @params
    return @{ Status = 200; Body = $data }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $raw = $_.ErrorDetails.Message
    $parsed = $null
    if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $raw } }
    return @{ Status = $status; Body = $parsed; Error = $_.Exception.Message }
  }
}

function Paso([string]$Texto) { Write-Host "`n=== $Texto ===" -ForegroundColor Cyan }
function Ok([string]$Texto) { Write-Host "  [OK] $Texto" -ForegroundColor Green }
function Info([string]$Texto) { Write-Host "  $Texto" }
function Falla([string]$Texto, $Resp) {
  Write-Host "  [ERROR] $Texto (HTTP $($Resp.Status))" -ForegroundColor Red
  if ($Resp.Body) { Write-Host ("  " + ($Resp.Body | ConvertTo-Json -Depth 6 -Compress)) -ForegroundColor DarkRed }
  elseif ($Resp.Error) { Write-Host "  $($Resp.Error)" -ForegroundColor DarkRed }
  exit 1
}

# 0. Salud de los servicios
Paso '0. Verificando servicios'
foreach ($svc in @(@('Monolito', 'http://127.0.0.1:3000/health'), @('Flight Management', 'http://127.0.0.1:3001/health'), @('Payment', 'http://127.0.0.1:3002/health'), @('Realtime Gateway', 'http://127.0.0.1:4000/health'))) {
  $r = Invoke-Api GET $svc[1]
  if ($r.Status -ne 200) { Falla "$($svc[0]) no responde en $($svc[1]). Ejecute 'docker compose up -d' en la carpeta backend" $r }
  Ok "$($svc[0]) activo"
}

# 1. Login
Paso '1. Login del cliente'
$login = Invoke-Api POST "$Monolito/auth/login" @{ email = 'cliente@skyandes.com'; password = 'Cliente123*' }
if ($login.Status -ne 200) { Falla 'Login fallido' $login }
$token = $login.Body.data.accessToken
Ok "Sesión iniciada como $($login.Body.data.user.fullName) (rol $($login.Body.data.user.role))"

# 2. Búsqueda (HU1)
Paso "2. HU1 - Búsqueda de vuelos $Origen -> $Destino"
$vuelo = $null
for ($d = 1; $d -le 5 -and -not $vuelo; $d++) {
  $fecha = (Get-Date).AddDays($d).ToString('yyyy-MM-dd')
  $busqueda = Invoke-Api GET "$Monolito/flights/search?origin=$Origen&destination=$Destino&date=$fecha"
  if ($busqueda.Status -ne 200) { Falla 'Error en la búsqueda' $busqueda }
  Info "$fecha : $($busqueda.Body.data.Count) vuelos encontrados"
  $vuelo = $busqueda.Body.data | Where-Object { $_.status -in @('SCHEDULED', 'DELAYED') -and $_.availability.available -gt 0 } | Select-Object -First 1
}
if (-not $vuelo) { Write-Host '  No hay vuelos disponibles para la ruta' -ForegroundColor Red; exit 1 }
$eco = ($vuelo.fares | Where-Object { $_.cabinClass -eq 'ECONOMY' }).price
Ok ("Vuelo {0} ({1}) sale {2} | estado {3} | económica {4:N0} COP | disponibles {5}/{6}" -f $vuelo.flightNumber, $vuelo.id, ([datetime]$vuelo.departureTime).ToLocalTime().ToString('yyyy-MM-dd HH:mm'), $vuelo.status, $eco, $vuelo.availability.available, $vuelo.availability.total)

Info "Dashboard en vivo (ábralo en el navegador para ver los cambios en tiempo real):"
Info "  $Fms/dashboard/flights/$($vuelo.id)/stream"
if ($ConPausa) { Read-Host '  Presione Enter para continuar' | Out-Null }

# 3. Mapa de asientos (HU2)
Paso '3. HU2 - Mapa de asientos'
$mapa = Invoke-Api GET "$Monolito/flights/$($vuelo.id)/seats" $null $token
if ($mapa.Status -ne 200) { Falla 'No se pudo obtener el mapa' $mapa }
$s = $mapa.Body.data.summary
Ok "Aeronave $($mapa.Body.data.aircraft): $($s.total) asientos | disponibles $($s.available) | bloqueados $($s.locked) | ocupados $($s.occupied)"
$asiento = $mapa.Body.data.seats | Where-Object { $_.status -eq 'AVAILABLE' -and $_.cabinClass -eq 'ECONOMY' } | Select-Object -First 1
$info = Invoke-Api GET "$Monolito/flights/$($vuelo.id)/seats/$($asiento.seatNumber)" $null $token
Ok ("Asiento elegido {0} ({1}, {2}) precio {3:N0} COP - estado {4}" -f $info.Body.data.seatNumber, $info.Body.data.position, $info.Body.data.cabinClass, $info.Body.data.price, $info.Body.data.status)

# 4. Bloqueo temporal vía Payment Service (HU2)
Paso '4. HU2 - Bloqueo temporal del asiento (Payment Service)'
$hold = Invoke-Api POST "$Pagos/checkout/holds" @{ flightId = $vuelo.id; seatNumber = $asiento.seatNumber } $token
if ($hold.Status -ne 200) { Falla 'No se pudo bloquear el asiento' $hold }
$reservaId = $hold.Body.data.hold.reservationId
$intentId = $hold.Body.data.paymentIntent.id
$expira = ([datetime]$hold.Body.data.hold.expiresAt).ToLocalTime()
Ok "Asiento $($asiento.seatNumber) bloqueado hasta $($expira.ToString('HH:mm:ss')) ($([math]::Round(($expira - (Get-Date)).TotalMinutes, 1)) min) - evento SeatLocked emitido"
Info "Reserva $reservaId | intención de pago $intentId"
$ver = Invoke-Api GET "$Monolito/flights/$($vuelo.id)/seats/$($asiento.seatNumber)" $null $token
Info "Estado del asiento ahora: $($ver.Body.data.status) (bloqueado por mí: $($ver.Body.data.lockedByMe))"

# 5. Otro usuario intenta el mismo asiento
Paso '5. Anti double booking - otro usuario intenta el mismo asiento'
$login2 = Invoke-Api POST "$Monolito/auth/login" @{ email = 'cliente2@skyandes.com'; password = 'Cliente123*' }
$otro = Invoke-Api POST "$Pagos/checkout/holds" @{ flightId = $vuelo.id; seatNumber = $asiento.seatNumber } $login2.Body.data.accessToken
if ($otro.Status -eq 409) { Ok "Rechazado correctamente: HTTP 409 $($otro.Body.error.code) - $($otro.Body.error.message)" }
else { Falla 'Se esperaba 409 SEAT_NOT_AVAILABLE' $otro }

# 6. Pago (HU3)
Paso '6. HU3 - Pago con datos ficticios'
$pasajero = @{ firstName = 'Laura'; lastName = 'Gomez'; documentType = 'CC'; documentNumber = '1037600123'; email = 'laura.gomez@example.com'; phone = '+573001234567' }
$rechazo = Invoke-Api POST "$Pagos/payments" @{ paymentIntentId = $intentId; passenger = $pasajero; card = @{ number = '4000000000000002'; holderName = 'LAURA GOMEZ'; expiryMonth = 12; expiryYear = 2030; cvv = '123' } } $token
if ($rechazo.Status -eq 402) { Ok "Tarjeta 4000...0002 rechazada (HTTP 402: $($rechazo.Body.data.declineReason)); el asiento sigue bloqueado" }
else { Info "Respuesta inesperada al pago rechazado: HTTP $($rechazo.Status)" }
$pago = Invoke-Api POST "$Pagos/payments" @{ paymentIntentId = $intentId; passenger = $pasajero; card = @{ number = '4111111111111111'; holderName = 'LAURA GOMEZ'; expiryMonth = 12; expiryYear = 2030; cvv = '123' } } $token
if ($pago.Status -ne 200) { Falla 'El pago no fue aprobado' $pago }
Ok ("Pago {0} APROBADO | {1} ****{2} | autorización {3} | {4:N0} COP - evento PaymentProcessed emitido" -f $pago.Body.data.id, $pago.Body.data.cardBrand, $pago.Body.data.cardLast4, $pago.Body.data.authorizationCode, $pago.Body.data.amount)

# 7. Boleto (HU3) - la confirmación es asíncrona (Kafka)
Paso '7. HU3 - Boleto con código de reserva'
$boleto = $null
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  $t = Invoke-Api GET "$Monolito/reservations/$reservaId/ticket" $null $token
  if ($t.Status -eq 200 -and $t.Body.data.status -eq 'CONFIRMED') { $boleto = $t.Body.data; break }
}
if (-not $boleto) { Falla 'La reserva no se confirmó en 10 s (revise: docker compose logs monolith payment-service)' $t }
Ok "RESERVA CONFIRMADA - código $($boleto.reservationCode)"
Info ("Vuelo {0} {1} -> {2} | sale {3} | asiento {4} ({5})" -f $boleto.flight.flightNumber, $boleto.flight.origin, $boleto.flight.destination, ([datetime]$boleto.flight.departureTime).ToLocalTime().ToString('yyyy-MM-dd HH:mm'), $boleto.seatNumber, $boleto.cabinClass)
Info "Pasajero $($boleto.passenger.firstName) $($boleto.passenger.lastName) - $($boleto.passenger.documentType) $($boleto.passenger.documentNumber)"
$final = Invoke-Api GET "$Monolito/flights/$($vuelo.id)/seats/$($asiento.seatNumber)"
Ok "Estado final del asiento: $($final.Body.data.status) (evento global ReservationConfirmed / seat:occupied)"

# 8. Dashboard (HU4)
Paso '8. HU4 - Dashboard de ocupación (Flight Management Service)'
Start-Sleep -Seconds 1
$occ = Invoke-Api GET "$Fms/dashboard/flights/$($vuelo.id)/occupancy"
if ($occ.Status -ne 200) { Falla 'No se pudo consultar el dashboard' $occ }
$o = $occ.Body.data
Ok "Vuelo $($o.flightNumber): total $($o.total) | disponibles $($o.available) | bloqueados $($o.locked) | ocupados $($o.occupied) | ocupación $($o.occupancyRate)%"

Write-Host "`nFlujo completo OK. Código de reserva: $($boleto.reservationCode)`n" -ForegroundColor Green
