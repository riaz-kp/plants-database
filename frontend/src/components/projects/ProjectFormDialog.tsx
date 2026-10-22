import { useState } from 'react';
import type { Project, ProjectCreate } from '../../types/project';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

interface ProjectFormDialogProps {
    open: boolean;
    /** The project being edited, or null to create a new one. */
    project: Project | null;
    isSaving: boolean;
    onClose: () => void;
    onSubmit: (data: ProjectCreate) => void;
}

/* ─── Create / edit project dialog (shared by the list and details pages) ─── */
export const ProjectFormDialog = ({ open, project, isSaving, onClose, onSubmit }: ProjectFormDialogProps) => (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{project ? 'Edit Project' : 'New Project'}</DialogTitle>
            </DialogHeader>
            {/* Content unmounts while closed, so the form starts from the project on every open */}
            <ProjectForm project={project} isSaving={isSaving} onClose={onClose} onSubmit={onSubmit} />
        </DialogContent>
    </Dialog>
);

const ProjectForm = ({ project, isSaving, onClose, onSubmit }: Omit<ProjectFormDialogProps, 'open'>) => {
    const [name, setName] = useState(project?.name ?? '');
    const [clientName, setClientName] = useState(project?.client_name ?? '');
    const [location, setLocation] = useState(project?.location ?? '');
    const [landscapeArchitect, setLandscapeArchitect] = useState(project?.landscape_architect ?? '');
    const [architect, setArchitect] = useState(project?.architect ?? '');
    const [description, setDescription] = useState(project?.description ?? '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            name,
            client_name: clientName,
            location,
            landscape_architect: landscapeArchitect,
            architect,
            description,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
                <Label htmlFor="proj-name">Project Name <span className="text-destructive">*</span></Label>
                <Input
                    id="proj-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Riverside Park Redesign"
                    required
                    autoFocus
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label htmlFor="proj-client">Client</Label>
                    <Input
                        id="proj-client"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Client name"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="proj-location">Location</Label>
                    <Input
                        id="proj-location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="City or site"
                    />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label htmlFor="proj-landscape-architect">Landscape Architect</Label>
                    <Input
                        id="proj-landscape-architect"
                        value={landscapeArchitect}
                        onChange={(e) => setLandscapeArchitect(e.target.value)}
                        placeholder="Shown on the BOQ"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="proj-architect">Architect</Label>
                    <Input
                        id="proj-architect"
                        value={architect}
                        onChange={(e) => setArchitect(e.target.value)}
                        placeholder="Shown on the BOQ"
                    />
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="proj-desc">Description</Label>
                <Textarea
                    id="proj-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief project overview…"
                    rows={3}
                    className="resize-none"
                />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSaving || !name.trim()}>
                    {isSaving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
                </Button>
            </DialogFooter>
        </form>
    );
};
