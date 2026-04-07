import { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus, Pencil, Trash2, Search, ListTree, XCircle, ExternalLink, Leaf
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { plantsApi } from '../../api/plants';

import { taxonomyApi } from '../../api/taxonomy';
import { Rank } from '../../types/taxon';
import type { TaxonTree } from '../../types/taxon';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib-frontend/utils';

import {
    Files,
    FolderItem,
    FolderTrigger,
    FolderContent,
    FileItem,
    SubFiles,
} from '@/components/animate-ui/components/radix/files';

/* ─── Tree Node ─────────────────────────────────────────── */
interface TreeNodeProps {
    node: TaxonTree;
    onSelect: (node: TaxonTree) => void;
    selectedId?: string;
    searchTerm?: string;
    open?: string[];
    onOpenChange?: (open: string[]) => void;
}

const rankColor: Record<string, string> = {
    KINGDOM: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400',
    PHYLUM: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    CLASS: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400',
    ORDER: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
    FAMILY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    GENUS: 'bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-400',
    SPECIES: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
};

const TreeNode = memo(({ node, onSelect, selectedId, searchTerm, open, onOpenChange }: TreeNodeProps) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = node.id === selectedId;

    const lowerSearch = searchTerm?.toLowerCase() || '';
    const isMatch =
        !!searchTerm &&
        (node.name.toLowerCase().includes(lowerSearch) || node.rank.toLowerCase().includes(lowerSearch));

    const content = (
        <div className="flex items-center gap-2 min-w-0">
            <span
                className={cn(
                    'shrink-0 text-[10px] w-5 h-5 flex items-center justify-center font-bold uppercase tracking-wider rounded-md border border-current opacity-80',
                    rankColor[node.rank] ?? 'bg-muted text-muted-foreground',
                )}
            >
                {node.rank[0]}
            </span>
            <span className={cn(
                "text-sm font-medium truncate",
                isSelected ? "text-primary font-semibold" : "text-foreground/80",
                isMatch && "text-amber-600 dark:text-amber-400"
            )}>
                {node.name}
            </span>
        </div>
    );

    if (hasChildren) {
        return (
            <FolderItem value={node.id}>
                <FolderTrigger 
                    className={cn(
                        "rounded-lg transition-colors group px-1",
                        isSelected && "bg-primary/5 shadow-sm ring-1 ring-primary/20",
                        isMatch && !isSelected && "bg-amber-50 dark:bg-amber-950/20"
                    )}
                    onClick={() => onSelect(node)}
                >
                    {content}
                </FolderTrigger>
                <FolderContent>
                    <SubFiles
                        className="space-y-0.5"
                        open={open}
                        onOpenChange={onOpenChange}
                    >
                        {node.children.map((child) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                onSelect={onSelect}
                                selectedId={selectedId}
                                searchTerm={searchTerm}
                                open={open}
                                onOpenChange={onOpenChange}
                            />
                        ))}
                    </SubFiles>
                </FolderContent>
            </FolderItem>
        );
    }

    return (
        <FileItem
            value={node.id}
            className={cn(
                "rounded-lg transition-colors group px-1",
                isSelected && "bg-primary/5 shadow-sm ring-1 ring-primary/20",
                isMatch && !isSelected && "bg-amber-50 dark:bg-amber-950/20"
            )}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(node)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(node);
                }
            }}
        >
            {content}
        </FileItem>
    );
});

/* ─── TaxonomyManager ────────────────────────────────────── */
export const TaxonomyManager = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();

    const [selectedNode, setSelectedNode] = useState<TaxonTree | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false); // mobile detail panel

    const [newName, setNewName] = useState('');
    const [newRank, setNewRank] = useState<Rank>(Rank.KINGDOM);
    const [description, setDescription] = useState('');
    const [openIds, setOpenIds] = useState<string[]>([]);

    const { data: tree, isLoading, error } = useQuery({
        queryKey: ['taxonomy', 'tree'],
        queryFn: () => taxonomyApi.getTree(),
    });

    const isSpecies = selectedNode?.rank === Rank.SPECIES;
    const { data: associatedPlants } = useQuery({
        queryKey: ['plants', 'by-taxon', selectedNode?.id],
        queryFn: () => plantsApi.getAll({ taxon_id: selectedNode?.id }),
        enabled: !!selectedNode && isSpecies,
    });

    const createMutation = useMutation({
        mutationFn: taxonomyApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            showAlert('Taxon created successfully', 'success');
            setIsCreating(false);
            setNewName('');
            setDescription('');
        },
        onError: (error: any) => {
            showAlert('Failed to create taxon: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => taxonomyApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            showAlert('Taxon updated successfully', 'success');
            setIsEditing(false);
            if (selectedNode) setSelectedNode({ ...selectedNode, name: newName, description });
        },
        onError: (error: any) => {
            showAlert('Failed to update taxon: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: taxonomyApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            showAlert('Taxon deleted successfully', 'success');
            setSelectedNode(null);
            setPanelOpen(false);
        },
        onError: (error: any) => {
            showAlert('Failed to delete taxon: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const getNextRank = useCallback((rank: Rank): Rank | null => {
        const ranks = Object.values(Rank);
        const idx = ranks.indexOf(rank);
        return idx >= 0 && idx < ranks.length - 1 ? ranks[idx + 1] : null;
    }, []);

    const startCreateChild = useCallback(() => {
        if (selectedNode) {
            const next = getNextRank(selectedNode.rank);
            if (!next) { showAlert('Cannot create child of Species', 'warning'); return; }
            setNewRank(next);
        } else {
            setNewRank(Rank.KINGDOM);
        }
        setNewName('');
        setDescription('');
        setIsCreating(true);
        setIsEditing(false);
    }, [selectedNode, getNextRank, showAlert]);

    const startEdit = useCallback(() => {
        if (!selectedNode) return;
        setNewName(selectedNode.name);
        setNewRank(selectedNode.rank);
        setDescription(selectedNode.description || '');
        setIsEditing(true);
        setIsCreating(false);
    }, [selectedNode]);

    const handleDelete = useCallback(() => {
        if (!selectedNode) return;
        if (selectedNode.children?.length) {
            showAlert('Cannot delete a taxon that has children.', 'warning');
            return;
        }
        confirm({
            title: 'Delete Taxon',
            message: 'Are you sure you want to delete this taxon?',
            confirmText: 'Delete',
            onConfirm: () => deleteMutation.mutate(selectedNode.id),
        });
    }, [selectedNode, confirm, deleteMutation, showAlert]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isEditing && selectedNode) {
            updateMutation.mutate({ id: selectedNode.id, data: { name: newName, description } });
        } else {
            createMutation.mutate({
                name: newName,
                rank: newRank,
                description,
                parent_id: selectedNode?.id,
            });
        }
    };

    const handleNodeSelect = useCallback((node: TaxonTree) => {
        setSelectedNode(node);
        setIsEditing(false);
        setIsCreating(false);
        setPanelOpen(true);
    }, []);

    const filterTree = (nodes: TaxonTree[], term: string): TaxonTree[] => {
        if (!term) return nodes;
        const lowerTerm = term.toLowerCase();
        return nodes.reduce((acc: TaxonTree[], node) => {
            const matchesSelf =
                node.name.toLowerCase().includes(lowerTerm) ||
                node.rank.toLowerCase().includes(lowerTerm);

            const filteredChildren = filterTree(node.children || [], term);
            const hasMatchingChildren = filteredChildren.length > 0;

            if (matchesSelf || hasMatchingChildren) {
                acc.push({
                    ...node,
                    children: hasMatchingChildren ? filteredChildren : node.children
                });
            }
            return acc;
        }, []);
    };

    const filteredTree = useMemo(() => {
        if (!tree) return [];
        return filterTree(tree, searchTerm);
    }, [tree, searchTerm]);

    // Auto-expand tree on search
    useEffect(() => {
        if (searchTerm) {
            const ids: string[] = [];
            const collectIds = (nodes: TaxonTree[]) => {
                nodes.forEach(node => {
                    if (node.children?.length) {
                        ids.push(node.id);
                        collectIds(node.children);
                    }
                });
            };
            collectIds(filteredTree);
            setOpenIds(ids);
        } else {
            setOpenIds([]);
        }
    }, [searchTerm, filteredTree]);

    /* ── Panels ── */
    const DetailPanel = () => (
        <div className="flex flex-col h-full">
            {(isCreating || isEditing) ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 overflow-y-auto">
                    <div>
                        <h3 className="font-semibold text-foreground">
                            {isEditing ? `Edit ${selectedNode?.rank}` : `Add New ${newRank}`}
                        </h3>
                        {isCreating && selectedNode && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Parent: <strong>{selectedNode.name}</strong> ({selectedNode.rank})
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="tax-name">Name <span className="text-destructive">*</span></Label>
                        <Input
                            id="tax-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                            autoFocus
                            placeholder={`Enter ${newRank.toLowerCase()} name`}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Rank</Label>
                        <Input value={newRank} disabled className="bg-muted text-muted-foreground" />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="tax-desc">Description</Label>
                        <Textarea
                            id="tax-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="resize-none"
                            placeholder="Optional notes..."
                        />
                    </div>

                    <div className="flex gap-2 mt-2">
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !newName.trim()}>
                            {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => { setIsCreating(false); setIsEditing(false); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            ) : selectedNode ? (
                <div className="flex flex-col gap-4 p-4 overflow-y-auto">
                    <div className="flex items-start gap-3">
                        <div
                            className={cn(
                                'shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-1 rounded mt-0.5',
                                rankColor[selectedNode.rank] ?? 'bg-muted text-muted-foreground',
                            )}
                        >
                            {selectedNode.rank}
                        </div>
                        <h2 className="text-xl font-semibold text-foreground leading-tight">{selectedNode.name}</h2>
                    </div>

                    {selectedNode.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{selectedNode.description}</p>
                    )}

                    {selectedNode.children?.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Children:</span>
                            <Badge variant="secondary">{selectedNode.children.length}</Badge>
                        </div>
                    )}

                    {isSpecies && associatedPlants && associatedPlants.items.length > 0 && (
                        <div className="mt-2 space-y-3">
                            <Separator />
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Linked Plant</h4>
                                {associatedPlants.items.slice(0, 1).map(plant => (
                                    <div key={plant.id} className="flex gap-4 items-center bg-muted/30 p-3 rounded-xl border border-border/50 shadow-sm transition-all hover:bg-muted/50 group">
                                        {plant.icon_url ? (
                                            <img src={plant.icon_url} alt={plant.common_name} className="w-12 h-12 rounded-lg object-cover bg-muted ring-1 ring-border/50" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/40 ring-1 ring-border/50">
                                                <Leaf size={20} opacity={0.5} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate text-foreground mb-0.5 group-hover:text-primary transition-colors">{plant.common_name}</p>
                                            {plant.scientific_name && (
                                                <p className="text-[10px] italic text-muted-foreground mb-1.5 truncate">{plant.scientific_name}</p>
                                            )}
                                            <Button
                                                variant="link"
                                                size="sm"
                                                className="h-auto p-0 text-[11px] text-primary gap-1 font-semibold opacity-80 hover:opacity-100"
                                                onClick={() => navigate({ to: `/plants/${plant.id}` as any })}
                                            >
                                                View Plant Detail <ExternalLink size={10} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Separator />

                    <div className="flex flex-col gap-2">
                        {getNextRank(selectedNode.rank) && (
                            <Button size="sm" onClick={startCreateChild} className="w-full">
                                <Plus className="w-3.5 h-3.5 mr-2" />
                                Add {getNextRank(selectedNode.rank)}
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={startEdit} className="w-full">
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={handleDelete} className="w-full">
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
                    <ListTree className="w-10 h-10 mb-3 opacity-25" />
                    <p className="text-sm">Select a taxon to view details, or create a new Kingdom.</p>
                </div>
            )}
        </div>
    );

    return (
        <div>
            {/* Page Header */}
            <div className="flex flex-col gap-1 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Taxonomy</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage the hierarchical classification of plants.
                    </p>
                </div>
                <Button
                    onClick={() => { setSelectedNode(null); startCreateChild(); }}
                    className="mt-3 sm:mt-0 w-full sm:w-auto"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Kingdom
                </Button>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                {/* Tree Panel */}
                <div className="lg:col-span-3 rounded-xl border border-border bg-white shadow-sm flex flex-col">
                    {/* Search */}
                    <div className="p-4 border-b border-border sticky top-0 bg-white/95 backdrop-blur-md z-30 rounded-t-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search taxonomy…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-8"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                                >
                                    <XCircle size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tree */}
                    <div className="flex-1 p-3 space-y-0.5">
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-2 px-3 py-2">
                                    <Skeleton className="h-4 w-4 rounded" />
                                    <Skeleton className="h-4 w-16 rounded" />
                                    <Skeleton className="h-4 w-32 rounded" />
                                </div>
                            ))
                        ) : error ? (
                            <p className="text-sm text-destructive px-3 py-2">Error loading taxonomy tree.</p>
                        ) : filteredTree.length === 0 ? (
                            <p className="text-sm text-muted-foreground px-3 py-6 text-center">
                                {searchTerm ? 'No results found.' : 'No taxonomy data yet.'}
                            </p>
                        ) : (
                            <Files
                                className="w-full"
                                open={openIds}
                                onOpenChange={setOpenIds}
                            >
                                {filteredTree.map((node) => (
                                    <TreeNode
                                        key={node.id}
                                        node={node}
                                        onSelect={handleNodeSelect}
                                        selectedId={selectedNode?.id}
                                        searchTerm={searchTerm}
                                        open={openIds}
                                        onOpenChange={setOpenIds}
                                    />
                                ))}
                            </Files>
                        )}
                    </div>
                </div>

                {/* Detail Panel — hidden on mobile unless a node is selected */}
                <div
                    className={cn(
                        'lg:col-span-2 sticky top-0 rounded-xl border border-border bg-white shadow-sm overflow-hidden flex flex-col h-fit max-h-[calc(100vh-20px)] z-20',
                        !panelOpen && !isCreating && 'hidden lg:flex',
                        (panelOpen || isCreating) && 'flex',
                    )}
                >
                    {(panelOpen || isCreating || selectedNode) && !!(selectedNode || isCreating) && (
                        <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-border">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={() => { setPanelOpen(false); setSelectedNode(null); setIsCreating(false); setIsEditing(false); }}
                            >
                                ← Back to Tree
                            </Button>
                        </div>
                    )}
                    <DetailPanel />
                </div>
            </div>
        </div>
    );
};
