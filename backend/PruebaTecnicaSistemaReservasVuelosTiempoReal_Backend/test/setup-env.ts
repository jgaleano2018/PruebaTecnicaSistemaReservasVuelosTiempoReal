// Silencia los logs de la aplicación durante las pruebas
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.NODE_ENV = 'test';
