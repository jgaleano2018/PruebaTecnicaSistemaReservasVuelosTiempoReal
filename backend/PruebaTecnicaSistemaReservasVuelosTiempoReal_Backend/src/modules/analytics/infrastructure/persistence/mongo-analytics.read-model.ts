import { DemandReportDto, ReservationStatus } from '@reservas-vuelos/shared';
import { AnalyticsReadModel, SummaryReport } from '../../domain/analytics.ports';
import { ReservationModel } from '../../../reservation/infrastructure/persistence/reservation.schemas';
import { FlightModel } from '../../../flight/infrastructure/persistence/flight.schemas';

export class MongoAnalyticsReadModel implements AnalyticsReadModel {
  async reservationStatsByFlight(flightId: string) {
    const rows = await ReservationModel.aggregate<{ _id: string; count: number; revenue: number }>([
      { $match: { flightId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$status', ReservationStatus.CONFIRMED] }, '$price', 0] } },
        },
      },
    ]);
    const byStatus: Record<string, number> = {};
    let revenue = 0;
    for (const r of rows) {
      byStatus[r._id] = r.count;
      revenue += r.revenue;
    }
    return { byStatus, revenue, currency: 'COP' };
  }

  async demandByRoute(from: Date, to: Date): Promise<DemandReportDto[]> {
    return ReservationModel.aggregate<DemandReportDto>([
      { $match: { status: ReservationStatus.CONFIRMED, confirmedAt: { $gte: from, $lt: to } } },
      { $lookup: { from: 'vuelos', localField: 'flightId', foreignField: '_id', as: 'flight' } },
      { $unwind: '$flight' },
      {
        $group: {
          _id: { $concat: ['$flight.originCode', '-', '$flight.destinationCode'] },
          reservations: { $sum: 1 },
          revenue: { $sum: '$price' },
          currency: { $first: '$currency' },
        },
      },
      { $project: { _id: 0, route: '$_id', reservations: 1, revenue: 1, currency: 1 } },
      { $sort: { reservations: -1 } },
    ]);
  }

  async summary(): Promise<SummaryReport> {
    const [byRes, byFlight] = await Promise.all([
      ReservationModel.aggregate<{ _id: string; count: number; revenue: number }>([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ['$status', ReservationStatus.CONFIRMED] }, '$price', 0] } },
          },
        },
      ]),
      FlightModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const reservationsByStatus = Object.fromEntries(byRes.map((r) => [r._id, r.count]));
    const flightsByStatus = Object.fromEntries(byFlight.map((r) => [r._id, r.count]));
    return {
      totalFlights: byFlight.reduce((s, r) => s + r.count, 0),
      confirmedReservations: reservationsByStatus[ReservationStatus.CONFIRMED] ?? 0,
      revenue: byRes.reduce((s, r) => s + r.revenue, 0),
      currency: 'COP',
      reservationsByStatus,
      flightsByStatus,
    };
  }
}
