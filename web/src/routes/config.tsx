import { createFileRoute } from '@tanstack/react-router';
import { ConfigView } from '../views/ConfigView';

export const Route = createFileRoute('/config')({
  component: ConfigRoute,
});

function ConfigRoute() {
  return <ConfigView />;
}
