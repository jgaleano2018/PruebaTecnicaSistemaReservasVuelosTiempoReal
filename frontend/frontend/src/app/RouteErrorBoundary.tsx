import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { toUserMessage } from '@/domain/errors';

/** Captura errores de renderizado no controlados en cualquier ruta. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : toUserMessage(error);
  console.error(error);
  return (
    <div className="container page page--narrow">
      <div className="alert alert--danger" role="alert">
        <div className="alert__body">
          <p className="alert__title">Algo salió mal</p>
          <p className="alert__text">{message}</p>
        </div>
      </div>
      <p className="center">
        <Link to="/" reloadDocument>
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
