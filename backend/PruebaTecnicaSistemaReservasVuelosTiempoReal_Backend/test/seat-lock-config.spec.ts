describe('Tiempo límite del bloqueo temporal (5-10 minutos)', () => {
  const load = (value?: string) => {
    if (value === undefined) delete process.env.SEAT_LOCK_MINUTES;
    else process.env.SEAT_LOCK_MINUTES = value;
    let env: any;
    jest.isolateModules(() => {
      env = require('../src/config/env').env;
    });
    return env;
  };

  afterAll(() => delete process.env.SEAT_LOCK_MINUTES);

  it('usa 7 minutos por defecto', () => expect(load().SEAT_LOCK_MINUTES).toBe(7));
  it('acepta valores entre 5 y 10', () => expect(load('10').SEAT_LOCK_MINUTES).toBe(10));
  it('rechaza valores fuera del rango al arrancar', () => {
    expect(() => load('12')).toThrow();
    expect(() => load('3')).toThrow();
  });
});
