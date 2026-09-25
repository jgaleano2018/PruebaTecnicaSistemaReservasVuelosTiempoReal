<#
  Diagnóstico del flujo de pago -> confirmación de reserva.
  Uso (desde la carpeta backend):  powershell -ExecutionPolicy Bypass -File .\scripts\diagnostico-pago.ps1
  Genera diagnostico-pago.txt con: estado de contenedores, logs relevantes, últimas reservas/pagos en MongoDB
  y el retraso (lag) de los consumidores Kafka.
#>
$out = Join-Path (Get-Location) 'diagnostico-pago.txt'
function Seccion($t) { "`n==================== $t ====================" }

& {
  Seccion 'CONTENEDORES'
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

  Seccion 'MONOLITO (ultimos 30 min: pagos, confirmaciones, errores)'
  docker logs reservas-monolith --since 30m 2>&1 | Select-String -Pattern 'PaymentProcessed|Reserva no confirmada|ReservationConfirmed|Handler|"level":(40|50|60)|Consumidor Kafka|error' | Select-Object -Last 40

  Seccion 'PAYMENT SERVICE (ultimos 30 min)'
  docker logs reservas-payment --since 30m 2>&1 | Select-String -Pattern 'PaymentProcessed|payments|Handler|"level":(40|50|60)|Consumidor Kafka|error' | Select-Object -Last 40

  Seccion 'MONGO - ultimas 5 reservas (no semilla)'
  docker exec reservas-mongo mongosh --quiet reservas_vuelos_db --eval "db.reservas.find({_id:{`$not:/^seed/}},{status:1,flightId:1,seatNumber:1,reservationCode:1,paymentId:1,holdExpiresAt:1,createdAt:1,confirmedAt:1,failureReason:1}).sort({createdAt:-1}).limit(5).toArray()"

  Seccion 'MONGO - asientos bloqueados/ocupados de esas reservas'
  docker exec reservas-mongo mongosh --quiet reservas_vuelos_db --eval "var ids=db.reservas.find({_id:{`$not:/^seed/}}).sort({createdAt:-1}).limit(5).map(r=>r._id); db.asientos.find({`$or:[{lockedByReservationId:{`$in:ids}},{occupiedByReservationId:{`$in:ids}}]},{flightId:1,seatNumber:1,status:1,lockExpiresAt:1,lockedByReservationId:1,occupiedByReservationId:1}).toArray()"

  Seccion 'MONGO - ultimos 5 pagos e intenciones'
  docker exec reservas-mongo mongosh --quiet payment-db --eval "printjson(db.pagos.find({},{status:1,reservationId:1,reservationCode:1,declineReason:1,createdAt:1}).sort({createdAt:-1}).limit(5).toArray()); printjson(db.intenciones_pago.find({},{status:1,reservationId:1,expiresAt:1,attempts:1}).sort({createdAt:-1}).limit(5).toArray())"

  Seccion 'KAFKA - consumidores (LAG > 0 = eventos sin procesar)'
  foreach ($g in 'monolith-group','payment-service-group','flight-management-service-group') {
    docker exec reservas-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group $g 2>&1 | Select-String -Pattern 'TOPIC|reservas\.'
  }

  Seccion 'KAFKA - mensajes en reservas.payment.processed'
  docker exec reservas-kafka /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic reservas.payment.processed 2>&1
} *>&1 | Out-File -FilePath $out -Encoding utf8

Write-Host "Diagnostico guardado en $out" -ForegroundColor Green
