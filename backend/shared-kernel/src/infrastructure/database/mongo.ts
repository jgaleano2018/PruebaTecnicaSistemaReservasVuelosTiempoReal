import mongoose, { Model } from 'mongoose';
import { logger } from '../logging/logger';

export async function connectMongo(uri: string): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const maxAttempts = 20;
  for (let attempt = 1; ; attempt++) {
    try {
      const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info({ db: conn.connection.name }, 'Conectado a MongoDB');
      return conn;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      logger.warn({ attempt }, 'MongoDB no disponible, reintentando...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

/** Crea explícitamente las colecciones (si no existen) y sincroniza sus índices. */
export async function ensureCollections(models: Array<Model<any>>): Promise<void> {
  for (const model of models) {
    await model.createCollection().catch(() => undefined);
    await model.syncIndexes();
  }
}
