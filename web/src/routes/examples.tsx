import { createFileRoute } from '@tanstack/react-router';
import { ExamplesView } from '../views/ExamplesView';

export const Route = createFileRoute('/examples')({
  component: ExamplesRoute,
});

function ExamplesRoute() {
  return <ExamplesView />;
}
