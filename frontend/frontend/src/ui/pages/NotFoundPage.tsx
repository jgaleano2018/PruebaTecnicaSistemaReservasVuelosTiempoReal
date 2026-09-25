import { Link } from 'react-router-dom';
import { PlaneIcon } from '../components/icons';
import { EmptyState } from '../components/primitives';

export function NotFoundPage() {
  return (
    <div className="container page page--narrow">
      <EmptyState title="Página no encontrada" icon={<PlaneIcon size={28} />}>
        Esta ruta no existe. <Link to="/">Volver a buscar vuelos</Link>.
      </EmptyState>
    </div>
  );
}
