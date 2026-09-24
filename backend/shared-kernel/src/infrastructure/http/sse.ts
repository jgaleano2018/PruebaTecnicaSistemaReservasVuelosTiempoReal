import { Request, Response } from 'express';
import { Observable } from 'rxjs';

/** Adaptador genérico Observable -> Server-Sent Events con heartbeat. */
export function streamSse<T>(req: Request, res: Response, source$: Observable<{ event: string; data: T; id?: string }>): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`retry: 3000\n\n`);

  const heartbeat = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 15000);
  const sub = source$.subscribe({
    next: ({ event, data, id }) => {
      if (id) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    complete: () => res.end(),
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    sub.unsubscribe();
  });
}
