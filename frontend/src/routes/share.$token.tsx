import { createFileRoute } from '@tanstack/react-router';
import { ProjectPublicView as OriginalProjectPublicView } from '@/components/projects/ProjectPublicView';

export const Route = createFileRoute('/share/$token')({
  component: ProjectPublicView,
});

function ProjectPublicView() {
  return <OriginalProjectPublicView />;
}
