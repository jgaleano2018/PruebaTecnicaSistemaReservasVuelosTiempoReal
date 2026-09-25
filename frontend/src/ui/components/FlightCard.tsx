import { memo } from 'react';
import { Link } from 'react-router-dom';
import { FlightStatus, type CabinClass, type FlightDto } from '@reservas-vuelos/shared';
import { airportCity, airportCode, formatDuration, formatMoney, formatTime } from '@/domain/format';
import { isBookable, lowestFare } from '@/domain/flights';
import { cabinLabel, flightStatusLabel } from '@/domain/labels';
import { ArrowRightIcon, PlaneIcon } from './icons';
import { OccupancyBar } from './Occupancy';
import { Badge, cx } from './primitives';

/** Tarjeta de resultado de búsqueda (HU1): tarifas, horarios, estado y disponibilidad en vivo. */
export const FlightCard = memo(function FlightCard({ flight, cabin }: { flight: FlightDto; cabin?: CabinClass }) {
  const status = flightStatusLabel[flight.status];
  const fare = lowestFare(flight, cabin);
  const bookable = isBookable(flight);
  const origin = airportCode(flight.origin);
  const destination = airportCode(flight.destination);
  const headingId = `flight-${flight.id}-title`;

  return (
    <article className={cx('flight-card', !bookable && 'flight-card--inactive')} aria-labelledby={headingId}>
      <header className="flight-card__head">
        <h3 id={headingId} className="flight-card__number">
          <span className="visually-hidden">Vuelo </span>
          {flight.flightNumber}
          <span className="flight-card__airline"> · {flight.airline}</span>
        </h3>
        <Badge tone={status.tone}>
          {status.label}
          {flight.status === FlightStatus.DELAYED && flight.delayMinutes ? ` ${flight.delayMinutes} min` : ''}
        </Badge>
      </header>

      <div className="flight-card__route">
        <div className="flight-card__endpoint">
          <time className="flight-card__time" dateTime={flight.departureTime}>
            {formatTime(flight.departureTime)}
          </time>
          <span className="flight-card__code">{origin}</span>
          <span className="flight-card__city">{airportCity(flight.origin)}</span>
        </div>
        <div className="flight-card__path" aria-hidden="true">
          <span className="flight-card__duration">{formatDuration(flight.durationMinutes)}</span>
          <span className="flight-card__line">
            <PlaneIcon size={16} />
          </span>
          <span className="flight-card__aircraft">{flight.aircraft}</span>
        </div>
        <span className="visually-hidden">Duración {formatDuration(flight.durationMinutes)}, aeronave {flight.aircraft}.</span>
        <div className="flight-card__endpoint flight-card__endpoint--end">
          <time className="flight-card__time" dateTime={flight.arrivalTime}>
            {formatTime(flight.arrivalTime)}
          </time>
          <span className="flight-card__code">{destination}</span>
          <span className="flight-card__city">{airportCity(flight.destination)}</span>
        </div>
      </div>

      <div className="flight-card__fares">
        {flight.fares.map((f) => (
          <div key={f.cabinClass} className="flight-card__fare">
            <span className="flight-card__fare-cabin">{cabinLabel[f.cabinClass]}</span>
            <span className="flight-card__fare-price tabular">{formatMoney(f.price, f.currency)}</span>
          </div>
        ))}
      </div>

      <footer className="flight-card__foot">
        <div className="flight-card__availability">
          <OccupancyBar counts={flight.availability} showLegend={false} size="sm" label={`Vuelo ${flight.flightNumber}`} />
          <span className="flight-card__seats tabular">
            <strong>{flight.availability.available}</strong> asientos libres
            {flight.availability.locked > 0 && <> · {flight.availability.locked} en proceso de compra</>}
          </span>
        </div>
        {bookable ? (
          <Link className="btn btn--primary btn--md" to={`/flights/${flight.id}`} aria-describedby={headingId}>
            <span>{fare ? `Desde ${formatMoney(fare.price, fare.currency)}` : 'Elegir asiento'}</span>
            <ArrowRightIcon size={18} />
          </Link>
        ) : (
          <span className="flight-card__unavailable">No disponible para reserva</span>
        )}
      </footer>
    </article>
  );
});
