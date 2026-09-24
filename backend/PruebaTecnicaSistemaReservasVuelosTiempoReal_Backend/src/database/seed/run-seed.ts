import { env } from '../../config/env';
import { connectMongo, disconnectMongo } from '@reservas-vuelos/service-kernel/database';
import { seedDatabase } from './seed';

/** npm run seed            -> carga si está vacía
 *  npm run seed -- --reset -> borra y recarga */
(async () => {
  await connectMongo(env.MONGO_URI);
  await seedDatabase({ reset: process.argv.includes('--reset'), onlyIfEmpty: !process.argv.includes('--reset') });
  await disconnectMongo();
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
