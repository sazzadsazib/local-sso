import { createFileRoute } from '@tanstack/react-router';
import { ProjectsView } from '../views/ProjectsView';

export const Route = createFileRoute('/projects')({
  component: ProjectsRoute,
});

function ProjectsRoute() {
  return <ProjectsView />;
}
