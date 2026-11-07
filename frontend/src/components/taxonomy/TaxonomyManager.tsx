import { useState, useMemo, useEffect, useRef, useDeferredValue, memo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus, Pencil, Trash2, Search, ListTree, XCircle, ExternalLink, Leaf,
    ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, ChevronsDownUp, X,
    Sparkles, Loader2, AlertCircle,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { plantsApi } from '../../api/plants';

import { taxonomyApi } from '../../api/taxonomy';
import { taxonomyTreeQueryOptions } from '../../api/queryOptions';
import { Rank } from '../../types/taxon';
import type { TaxonTree } from '../../types/taxon';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn, cloudinaryThumb } from '@/lib-frontend/utils';

import {
    Files,
    FolderItem,
    FolderTrigger,
    FolderContent,
    FileItem,
    SubFiles,
} from '@/components/animate-ui/components/radix/files';

/* ─── Ranks ─────────────────────────────────────────────── */
const RANKS = Object.values(Rank);

const rankColor: Record<Rank, string> = {
    [Rank.KINGDOM]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    [Rank.DIVISION]: 'bg-blue-50 text-blue-700 border-blue-200',
    [Rank.CLASS]: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    [Rank.ORDER]: 'bg-teal-50 text-teal-700 border-teal-200',
    [Rank.FAMILY]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    [Rank.GENUS]: 'bg-lime-50 text-lime-800 border-lime-200',
    [Rank.SPECIES]: 'bg-amber-50 text-amber-700 border-amber-200',
};

const rankPlural: Record<Rank, string> = {
    [Rank.KINGDOM]: 'Kingdoms',
    [Rank.DIVISION]: 'Divisions',
    [Rank.CLASS]: 'Classes',
    [Rank.ORDER]: 'Orders',
    [Rank.FAMILY]: 'Families',
    [Rank.GENUS]: 'Genera',
    [Rank.SPECIES]: 'Species',
};

// What AI-autofilled taxa used to get instead of a description
const LEGACY_PLACEHOLDER = 'Auto-generated via AI autofill.';
const hasDescription = (description?: string) =>
    !!description?.trim() && description.trim() !== LEGACY_PLACEHOLDER;

const nextRank = (rank: Rank): Rank | null => {
    const idx = RANKS.indexOf(rank);
    return idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
};

function RankBadge({ rank, full = false, className }: { rank: Rank; full?: boolean; className?: string }) {
    return (
        <span
            title={rank}
            className={cn(
                'shrink-0 inline-flex items-center justify-center rounded-md border font-bold uppercase',
                full ? 'h-6 px-2 text-[10px] tracking-wider' : 'w-5 h-5 text-[10px]',
                rankColor[rank] ?? 'bg-muted text-muted-foreground border-border',
                className,
            )}
        >
            {full ? rank : rank[0]}
        </span>
    );
}

/** Renders `text` with the first occurrence of `term` highlighted. */
function MatchText({ text, term }: { text: string; term?: string }) {
    const idx = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
    if (!term || idx < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-amber-200/70 text-foreground rounded-sm">{text.slice(idx, idx + term.length)}</mark>
            {text.slice(idx + term.length)}
        </>
    );
}

/* ─── Tree helpers ──────────────────────────────────────── */
const matchesTerm = (node: TaxonTree, lowerTerm: string) =>
    node.name.toLowerCase().includes(lowerTerm) || node.rank.toLowerCase().includes(lowerTerm);

/** Keeps matching nodes and the branches leading to them. */
const filterTree = (nodes: TaxonTree[], lowerTerm: string): TaxonTree[] => {
    if (!lowerTerm) return nodes;
    return nodes.reduce((acc: TaxonTree[], node) => {
        const filteredChildren = filterTree(node.children || [], lowerTerm);
        if (matchesTerm(node, lowerTerm) || filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
        }
        return acc;
    }, []);
};

const collectFolderIds = (nodes: TaxonTree[], ids: string[] = []): string[] => {
    for (const node of nodes) {
        if (node.children?.length) {
            ids.push(node.id);
            collectFolderIds(node.children, ids);
        }
    }
    return ids;
};

/* ─── Tree Node ─────────────────────────────────────────── */
interface TreeNodeProps {
    node: TaxonTree;
    onSelect: (id: string) => void;
    selectedId?: string | null;
    searchTerm?: string;
    open?: string[];
    onOpenChange?: (open: string[]) => void;
}

const TreeNode = memo(({ node, onSelect, selectedId, searchTerm, open, onOpenChange }: TreeNodeProps) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = node.id === selectedId;

    const content = (
        <span className="flex items-center gap-2 min-w-0">
            <RankBadge rank={node.rank} />
            <span className={cn(
                'text-sm truncate',
                isSelected ? 'text-primary font-semibold' : 'text-foreground/85 font-medium',
            )}>
                <MatchText text={node.name} term={searchTerm} />
            </span>
            {hasChildren && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">{node.children.length}</span>
            )}
        </span>
    );

    const rowClass = cn(
        // Scrolling a row into view keeps it clear of the sticky search bar and the phone bottom sheet
        'rounded-lg transition-colors px-1 scroll-mt-28 scroll-mb-[calc(var(--sheet-h,0px)_+_0.75rem)] lg:scroll-mb-0',
        isSelected && 'bg-primary/5 ring-1 ring-primary/25',
    );

    if (hasChildren) {
        return (
            <FolderItem value={node.id}>
                <FolderTrigger className={rowClass} data-taxon-id={node.id} onClick={() => onSelect(node.id)}>
                    {content}
                </FolderTrigger>
                <FolderContent>
                    <SubFiles className="space-y-0.5" open={open} onOpenChange={onOpenChange}>
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
            icon={Leaf}
            className={rowClass}
            data-taxon-id={node.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(node.id)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(node.id);
                }
            }}
        >
            {content}
        </FileItem>
    );
});

/* ─── TaxonomyManager ────────────────────────────────────── */
type FormMode = 'create' | 'edit' | null;
// Phones show the detail panel as a bottom sheet: a one-line peek, or expanded
type MobileSheet = 'closed' | 'peek' | 'full';

export const TaxonomyManager = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const search = useDeferredValue(searchTerm.trim().toLowerCase());
    const [formMode, setFormMode] = useState<FormMode>(null);
    const [createParentId, setCreateParentId] = useState<string | null>(null);
    const [mobileSheet, setMobileSheet] = useState<MobileSheet>('closed');
    // The phone sheet's height, so the page can leave room below the tree to scroll past it
    const sheetRef = useRef<HTMLElement>(null);
    const [sheetHeight, setSheetHeight] = useState(0);
    useEffect(() => {
        const el = sheetRef.current;
        if (!el) return;
        const update = () => setSheetHeight(Math.round(el.getBoundingClientRect().height));
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const [newName, setNewName] = useState('');
    const [newRank, setNewRank] = useState<Rank>(Rank.KINGDOM);
    const [description, setDescription] = useState('');
    const [openIds, setOpenIds] = useState<string[]>([]);

    // Missing descriptions are written by AI in the background; poll while that runs
    const { data: descriptionStatus } = useQuery({
        queryKey: ['taxonomy', 'descriptions'],
        queryFn: taxonomyApi.getDescriptionStatus,
        refetchInterval: (query) => (query.state.data?.running ? 5000 : false),
    });
    const writingDescriptions = !!descriptionStatus?.running;

    const { data: tree, isLoading, error } = useQuery({
        ...taxonomyTreeQueryOptions(),
        refetchInterval: writingDescriptions ? 10000 : false,
    });

    const descriptionError = writingDescriptions ? null : descriptionStatus?.error ?? null;

    // One last tree refresh once the background run finishes, and say so if it failed
    const wasWritingRef = useRef(false);
    useEffect(() => {
        if (wasWritingRef.current && !writingDescriptions) {
            queryClient.invalidateQueries({ queryKey: ['taxonomy', 'tree'] });
            if (descriptionError) showAlert(`Couldn't write all descriptions. ${descriptionError}`, 'error');
        }
        wasWritingRef.current = writingDescriptions;
    }, [writingDescriptions, descriptionError, queryClient, showAlert]);

    const fillDescriptionsMutation = useMutation({
        mutationFn: taxonomyApi.fillDescriptions,
        onSuccess: (status) => {
            queryClient.setQueryData(['taxonomy', 'descriptions'], status);
            showAlert(
                status.missing
                    ? `Writing ${status.missing} description(s) in the background. This can take a few minutes.`
                    : 'Every taxon already has a description.',
                'success',
            );
        },
        onError: (error: any) => {
            showAlert('Failed to start writing descriptions: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    /* ── Lookups over the full tree ── */
    const index = useMemo(() => {
        const byId = new Map<string, TaxonTree>();
        const parentOf = new Map<string, string>();
        const rankCounts = new Map<Rank, number>();
        const walk = (nodes: TaxonTree[], parentId?: string) => {
            for (const node of nodes) {
                byId.set(node.id, node);
                if (parentId) parentOf.set(node.id, parentId);
                rankCounts.set(node.rank, (rankCounts.get(node.rank) ?? 0) + 1);
                if (node.children?.length) walk(node.children, node.id);
            }
        };
        walk(tree ?? []);
        return { byId, parentOf, rankCounts, folderIds: collectFolderIds(tree ?? []) };
    }, [tree]);

    const ancestorsOf = useCallback((id: string): TaxonTree[] => {
        const path: TaxonTree[] = [];
        let parentId = index.parentOf.get(id);
        while (parentId) {
            const parent = index.byId.get(parentId);
            if (!parent) break;
            path.unshift(parent);
            parentId = index.parentOf.get(parentId);
        }
        return path;
    }, [index]);

    // Derived from the latest tree, so edits and new children show up without reselecting
    const selectedNode = selectedId ? index.byId.get(selectedId) ?? null : null;
    const createParent = createParentId ? index.byId.get(createParentId) ?? null : null;
    const isSpecies = selectedNode?.rank === Rank.SPECIES;

    const { data: associatedPlants } = useQuery({
        queryKey: ['plants', 'by-taxon', selectedId],
        queryFn: () => plantsApi.getAll({ taxon_id: selectedId! }),
        enabled: !!selectedId && isSpecies,
    });

    const filteredTree = useMemo(() => filterTree(tree ?? [], search), [tree, search]);
    const matchCount = useMemo(() => {
        if (!search) return 0;
        let count = 0;
        index.byId.forEach(node => { if (matchesTerm(node, search)) count++; });
        return count;
    }, [index, search]);

    /* ── Expansion ── */
    const rootFolderIds = useMemo(() => (tree ?? []).filter(n => n.children?.length).map(n => n.id), [tree]);

    // Start with the top level open, so the tree isn't a single collapsed row
    const initializedRef = useRef(false);
    useEffect(() => {
        if (!tree || initializedRef.current) return;
        initializedRef.current = true;
        setOpenIds(rootFolderIds);
    }, [tree, rootFolderIds]);

    // Searching opens every matching branch; clearing the search goes back to the selection's branch.
    // Only reacts to the search changing, so a refetch after an edit keeps the current expansion.
    const lastSearchRef = useRef('');
    useEffect(() => {
        if (search === lastSearchRef.current) return;
        lastSearchRef.current = search;
        if (search) {
            setOpenIds(collectFolderIds(filteredTree));
        } else {
            const branch = selectedId ? ancestorsOf(selectedId).map(n => n.id) : [];
            setOpenIds(Array.from(new Set([...rootFolderIds, ...branch])));
        }
    }, [search, filteredTree, selectedId, ancestorsOf, rootFolderIds]);

    const expandAll = () => setOpenIds(search ? collectFolderIds(filteredTree) : index.folderIds);
    const collapseAll = () => setOpenIds([]);

    /** Opens the branch down to a node and scrolls it into view in the tree. */
    const revealInTree = useCallback((id: string) => {
        const branch = ancestorsOf(id).map(n => n.id);
        setOpenIds(prev => Array.from(new Set([...prev, ...branch])));
        // After the folders' open animation
        window.setTimeout(() => {
            document.querySelector(`[data-taxon-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 350);
    }, [ancestorsOf]);

    /* ── Selection ── */
    const handleTreeSelect = useCallback((id: string) => {
        setSelectedId(id);
        setFormMode(null);
        setMobileSheet(s => (s === 'full' ? 'full' : 'peek'));
        // On phones the sheet that opens may cover the tapped row; nudge it back into view
        window.setTimeout(() => {
            document.querySelector(`[data-taxon-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 50);
    }, []);

    /** Selecting from the detail panel (breadcrumb, child list) also reveals the node in the tree. */
    const selectFromPanel = (id: string) => {
        setSelectedId(id);
        setFormMode(null);
        revealInTree(id);
    };

    const clearSelection = () => {
        setSelectedId(null);
        setFormMode(null);
        setMobileSheet('closed');
    };

    /* ── Mutations ── */
    const createMutation = useMutation({
        mutationFn: taxonomyApi.create,
        onSuccess: (_created, variables) => {
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            showAlert(`${variables.rank} "${variables.name}" created`, 'success');
            setFormMode(null);
            setNewName('');
            setDescription('');
            // Keep the parent selected and open, so the new child is visible under it
            if (variables.parent_id) {
                setOpenIds(prev => prev.includes(variables.parent_id!) ? prev : [...prev, variables.parent_id!]);
            } else if (!selectedId) {
                setMobileSheet('closed');
            }
        },
        onError: (error: any) => {
            showAlert('Failed to create taxon: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name: string; description: string } }) => taxonomyApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            showAlert('Taxon updated', 'success');
            setFormMode(null);
        },
        onError: (error: any) => {
            showAlert('Failed to update taxon: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: taxonomyApi.delete,
        onSuccess: (_data, deletedId) => {
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            showAlert('Taxon deleted', 'success');
            // Move up to the parent, if there is one
            const parentId = index.parentOf.get(deletedId) ?? null;
            setSelectedId(parentId);
            if (!parentId) setMobileSheet('closed');
        },
        onError: (error: any) => {
            showAlert('Failed to delete taxon: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    /* ── Form ── */
    const startCreate = (parent: TaxonTree | null) => {
        const rank = parent ? nextRank(parent.rank) : Rank.KINGDOM;
        if (!rank) { showAlert('Species cannot have child taxa', 'warning'); return; }
        setCreateParentId(parent?.id ?? null);
        setNewRank(rank);
        setNewName('');
        setDescription('');
        setFormMode('create');
        setMobileSheet('full');
    };

    const startEdit = () => {
        if (!selectedNode) return;
        setNewName(selectedNode.name);
        setNewRank(selectedNode.rank);
        setDescription(hasDescription(selectedNode.description) ? selectedNode.description!.trim() : '');
        setFormMode('edit');
        setMobileSheet('full');
    };

    const cancelForm = () => {
        setFormMode(null);
        if (!selectedId) setMobileSheet('closed');
    };

    const handleDelete = () => {
        if (!selectedNode) return;
        if (selectedNode.children?.length) {
            showAlert('Remove its child taxa first.', 'warning');
            return;
        }
        confirm({
            title: `Delete ${selectedNode.rank}`,
            message: `Delete "${selectedNode.name}"? This cannot be undone.`,
            confirmText: 'Delete',
            onConfirm: () => deleteMutation.mutate(selectedNode.id),
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        if (formMode === 'edit' && selectedNode) {
            updateMutation.mutate({ id: selectedNode.id, data: { name, description } });
        } else {
            createMutation.mutate({ name, rank: newRank, description, parent_id: createParent?.id });
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    /* ── Detail panel pieces ── */
    const renderBreadcrumb = (nodes: TaxonTree[]) => nodes.length > 0 && (
        <nav aria-label="Classification" className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
            {nodes.map((n, i) => (
                <span key={n.id} className="inline-flex items-center gap-1 min-w-0">
                    {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
                    <button
                        type="button"
                        onClick={() => selectFromPanel(n.id)}
                        className="truncate max-w-[160px] hover:text-primary hover:underline underline-offset-2"
                        title={`${n.rank}: ${n.name}`}
                    >
                        {n.name}
                    </button>
                </span>
            ))}
        </nav>
    );

    const renderForm = () => {
        const parentPath = createParent ? [...ancestorsOf(createParent.id), createParent] : [];
        return (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
                <div className="space-y-2">
                    {formMode === 'create' ? renderBreadcrumb(parentPath)
                        : selectedNode && renderBreadcrumb(ancestorsOf(selectedNode.id))}
                    <div className="flex items-center gap-2">
                        <RankBadge rank={newRank} full />
                        <h3 className="font-semibold text-foreground">
                            {formMode === 'edit' ? `Edit ${newRank.toLowerCase()}` : `New ${newRank.toLowerCase()}`}
                        </h3>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="tax-name">Name <span className="text-destructive">*</span></Label>
                    <Input
                        id="tax-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        required
                        autoFocus
                        placeholder={`${newRank} name`}
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="tax-desc">Description</Label>
                    <Textarea
                        id="tax-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        className="resize-none"
                        placeholder="Optional notes…"
                    />
                </div>

                <div className="flex gap-2">
                    <Button type="submit" disabled={isSaving || !newName.trim()} className="flex-1 sm:flex-none">
                        {isSaving ? 'Saving…' : formMode === 'edit' ? 'Save changes' : `Add ${newRank.toLowerCase()}`}
                    </Button>
                    <Button type="button" variant="outline" onClick={cancelForm} disabled={isSaving}>
                        Cancel
                    </Button>
                </div>
            </form>
        );
    };

    const renderDetails = (node: TaxonTree) => {
        const childRank = nextRank(node.rank);
        const children = node.children ?? [];
        const hasChildren = children.length > 0;
        return (
            <div className="flex flex-col gap-4 p-5">
                <div className="space-y-2">
                    {renderBreadcrumb(ancestorsOf(node.id))}
                    <div className="flex items-start gap-2.5">
                        <RankBadge rank={node.rank} full className="mt-1" />
                        <h2 className={cn('text-xl font-semibold text-foreground leading-tight break-words', isSpecies && 'italic')}>
                            {node.name}
                        </h2>
                    </div>
                    {hasDescription(node.description) ? (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{node.description}</p>
                    ) : writingDescriptions ? (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground/70 italic">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing description…
                        </p>
                    ) : (
                        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground/60 italic">
                            No description.
                            {renderFillButton('link')}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {childRank && (
                        <Button size="sm" onClick={() => startCreate(node)} className="flex-1">
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            Add {childRank.toLowerCase()}
                        </Button>
                    )}
                    {/* Edit only needs its label when there's no Add button (species) */}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={startEdit}
                        title={`Edit this ${node.rank.toLowerCase()}`}
                        aria-label={`Edit this ${node.rank.toLowerCase()}`}
                        className={cn(childRank ? 'w-9 px-0 shrink-0' : 'flex-1')}
                    >
                        <Pencil className={cn('w-3.5 h-3.5', !childRank && 'mr-1.5')} />
                        {!childRank && 'Edit'}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDelete}
                        disabled={hasChildren || deleteMutation.isPending}
                        title={hasChildren ? 'Remove its child taxa first' : `Delete this ${node.rank.toLowerCase()}`}
                        aria-label={`Delete this ${node.rank.toLowerCase()}`}
                        className="w-9 px-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>

                {/* Children */}
                {childRank && (
                    <div className="space-y-2">
                        <Separator />
                        <h4 className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">
                            {rankPlural[childRank]}
                            <span className="tabular-nums">{children.length}</span>
                        </h4>
                        {hasChildren ? (
                            <ul className="max-h-72 overflow-y-auto -mx-1 space-y-0.5">
                                {children.map(child => (
                                    <li key={child.id}>
                                        <button
                                            type="button"
                                            onClick={() => selectFromPanel(child.id)}
                                            className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/60 transition-colors"
                                        >
                                            <span className={cn('text-sm text-foreground truncate', child.rank === Rank.SPECIES && 'italic')}>{child.name}</span>
                                            {child.children?.length > 0 && (
                                                <span className="text-[11px] tabular-nums text-muted-foreground/70">{child.children.length}</span>
                                            )}
                                            <ChevronRight className="ml-auto w-3.5 h-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-muted-foreground">No {rankPlural[childRank].toLowerCase()} yet.</p>
                        )}
                    </div>
                )}

                {/* Plants linked to a species */}
                {isSpecies && associatedPlants && associatedPlants.items.length > 0 && (
                    <div className="space-y-2">
                        <Separator />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">
                            Linked {associatedPlants.items.length === 1 ? 'plant' : 'plants'}
                        </h4>
                        {associatedPlants.items.map(plant => (
                            <button
                                key={plant.id}
                                type="button"
                                onClick={() => navigate({ to: '/plants/$id', params: { id: plant.id } })}
                                className="group w-full flex gap-3 items-center bg-muted/30 p-2.5 rounded-xl border border-border/50 text-left transition-colors hover:bg-muted/60"
                            >
                                {plant.icon_url ? (
                                    <img src={cloudinaryThumb(plant.icon_url, 48)} alt="" className="w-11 h-11 rounded-lg object-cover bg-muted ring-1 ring-border/50" />
                                ) : (
                                    <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/40 ring-1 ring-border/50">
                                        <Leaf size={18} />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">{plant.common_name}</p>
                                    {plant.scientific_name && (
                                        <p className="text-xs italic text-muted-foreground truncate">{plant.scientific_name}</p>
                                    )}
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderFillButton = (variant: 'link' | 'outline') => (
        <Button
            type="button"
            variant={variant}
            size="sm"
            onClick={() => fillDescriptionsMutation.mutate()}
            disabled={fillDescriptionsMutation.isPending || writingDescriptions}
            className={cn(variant === 'link' ? 'h-auto p-0 not-italic' : 'h-8 bg-white')}
        >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Write with AI
        </Button>
    );

    const renderOverview = () => (
        <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-col items-center text-center text-muted-foreground pt-4">
                <ListTree className="w-10 h-10 mb-3 opacity-25" />
                <p className="text-sm">Select a taxon to see its details.</p>
            </div>
            {!!descriptionStatus?.missing && (
                <div className={cn(
                    'flex items-center gap-3 rounded-lg border p-3',
                    descriptionError ? 'border-destructive/30 bg-destructive/5' : 'border-primary/20 bg-primary/5',
                )}>
                    {writingDescriptions
                        ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary" />
                        : descriptionError
                            ? <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                            : <Sparkles className="w-4 h-4 shrink-0 text-primary" />}
                    <div className="flex-1 min-w-0 text-xs text-foreground/80">
                        <p>
                            {writingDescriptions
                                ? <>Writing descriptions… <span className="tabular-nums font-semibold">{descriptionStatus.missing}</span> left</>
                                : <><span className="tabular-nums font-semibold">{descriptionStatus.missing}</span> {descriptionStatus.missing === 1 ? 'taxon has' : 'taxa have'} no description</>}
                        </p>
                        {descriptionError && (
                            <p className="mt-0.5 text-destructive">Last attempt failed: {descriptionError}</p>
                        )}
                    </div>
                    {!writingDescriptions && renderFillButton('outline')}
                </div>
            )}
            {index.byId.size > 0 && (
                <div className="space-y-2">
                    <Separator />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">Overview</h4>
                    <ul className="space-y-1">
                        {RANKS.map(rank => (
                            <li key={rank} className="flex items-center gap-2 text-sm">
                                <RankBadge rank={rank} />
                                <span className="text-foreground/85">{rankPlural[rank]}</span>
                                <span className="ml-auto tabular-nums text-muted-foreground">{index.rankCounts.get(rank) ?? 0}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );

    // Title on the phone sheet's handle row
    const sheetTitle = formMode === 'create' ? `New ${newRank.toLowerCase()}`
        : formMode === 'edit' ? `Edit ${newRank.toLowerCase()}`
        : selectedNode?.name ?? '';
    const sheetRank = formMode ? newRank : selectedNode?.rank;

    return (
        <div
            className="pb-[calc(var(--sheet-h)_+_1rem)] lg:pb-0"
            style={{ '--sheet-h': `${sheetHeight}px` } as React.CSSProperties}
        >
            {/* Page Header */}
            <div className="flex flex-col gap-1 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Taxonomy</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage the hierarchical classification of plants.
                    </p>
                </div>
                <Button onClick={() => startCreate(null)} className="mt-3 sm:mt-0 w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Kingdom
                </Button>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                {/* Tree Panel */}
                <div className="lg:col-span-3 rounded-xl border border-border bg-white shadow-sm flex flex-col">
                    {/* Search + expand controls */}
                    <div className="px-4 pt-4 pb-2 border-b border-border sticky top-0 bg-white/95 backdrop-blur-md z-30 rounded-t-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search by name or rank…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') setSearchTerm(''); }}
                                className="pl-9 pr-8"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    aria-label="Clear search"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                                >
                                    <XCircle size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {search
                                    ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`
                                    : `${index.byId.size} taxa`}
                            </span>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={expandAll}
                                    disabled={filteredTree.length === 0}
                                >
                                    <ChevronsUpDown className="w-3.5 h-3.5 mr-1" />
                                    Expand all
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={collapseAll}
                                    disabled={openIds.length === 0}
                                >
                                    <ChevronsDownUp className="w-3.5 h-3.5 mr-1" />
                                    Collapse all
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Tree */}
                    <div className="flex-1 p-2 sm:p-3">
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-2 px-3 py-2">
                                    <Skeleton className="h-4 w-4 rounded" />
                                    <Skeleton className="h-4 w-5 rounded" />
                                    <Skeleton className="h-4 w-32 rounded" />
                                </div>
                            ))
                        ) : error ? (
                            <p className="text-sm text-destructive px-3 py-2">Error loading taxonomy tree.</p>
                        ) : filteredTree.length === 0 ? (
                            <div className="flex flex-col items-center text-center px-3 py-10 text-muted-foreground">
                                <Search className="w-8 h-8 mb-2 opacity-20" />
                                <p className="text-sm">
                                    {searchTerm ? <>No taxa match “{searchTerm.trim()}”.</> : 'No taxonomy data yet.'}
                                </p>
                                {searchTerm && (
                                    <Button variant="link" size="sm" onClick={() => setSearchTerm('')}>Clear search</Button>
                                )}
                            </div>
                        ) : (
                            <Files className="w-full p-0" open={openIds} onOpenChange={setOpenIds}>
                                {filteredTree.map((node) => (
                                    <TreeNode
                                        key={node.id}
                                        node={node}
                                        onSelect={handleTreeSelect}
                                        selectedId={selectedId}
                                        searchTerm={search}
                                        open={openIds}
                                        onOpenChange={setOpenIds}
                                    />
                                ))}
                            </Files>
                        )}
                    </div>

                    {/* Rank legend */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 border-t border-border bg-muted/20 rounded-b-xl">
                        {RANKS.map(rank => (
                            <span key={rank} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <RankBadge rank={rank} /> {rank}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Detail panel — a sticky side panel on desktop, a bottom sheet on phones */}
                <aside
                    ref={sheetRef}
                    className={cn(
                        'flex flex-col bg-white border border-border overflow-hidden',
                        // Details take at most half the phone screen so the tree stays usable above;
                        // the create / edit form gets more room
                        'fixed inset-x-0 bottom-0 z-40 rounded-t-2xl shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.3)]',
                        formMode ? 'max-h-[85dvh]' : 'max-h-[50dvh]',
                        mobileSheet === 'closed' && 'hidden',
                        'lg:flex lg:sticky lg:inset-auto lg:top-0 lg:z-20 lg:col-span-2 lg:max-h-[calc(100vh-5rem)] lg:rounded-xl lg:shadow-sm',
                    )}
                >
                    {/* Phone handle row: tap to expand / shrink */}
                    <div className="lg:hidden flex items-center gap-2 pl-4 pr-2 py-2.5 border-b border-border">
                        <button
                            type="button"
                            onClick={() => setMobileSheet(s => (s === 'full' ? 'peek' : 'full'))}
                            className="flex flex-1 items-center gap-2 min-w-0 text-left"
                            aria-expanded={mobileSheet === 'full'}
                        >
                            {sheetRank && <RankBadge rank={sheetRank} />}
                            <span className="font-semibold text-sm text-foreground truncate">{sheetTitle}</span>
                            {mobileSheet === 'full'
                                ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                                : <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" />}
                        </button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearSelection} aria-label="Close">
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className={cn('flex-1 overflow-y-auto', mobileSheet !== 'full' && 'hidden lg:block')}>
                        {formMode ? renderForm() : selectedNode ? renderDetails(selectedNode) : renderOverview()}
                    </div>
                </aside>
            </div>
        </div>
    );
};
