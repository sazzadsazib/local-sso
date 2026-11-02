import { createFileRoute } from '@tanstack/react-router';
import { LoginView } from '../views/LoginView';

export const Route = createFileRoute('/callback')({
  component: CallbackRoute,
});

function CallbackRoute() {
  return <LoginView />;
}
