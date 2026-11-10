import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, Tags, Search, ChevronRight, Leaf } from 'lucide-react';

import { categoriesApi } from '../../api/categories';
import { categoriesQueryOptions } from '../../api/queryOptions';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { Category, CategoryUpdate } from '../../types/category';
import { rowLinkProps } from '@/lib-frontend/utils';

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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

type ApiError = Error & { response?: { data?: { detail?: string } } };

export const CategoryManager = () => {
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();
    const queryClient = useQueryClient();

    const [isOpen, setIsOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 20;

    React.useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const categoriesParams = React.useMemo(() => ({
        skip: (currentPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined
    }), [currentPage, debouncedSearch]);

    const { data: categoriesData, isLoading } = useQuery(categoriesQueryOptions(categoriesParams));

    const categories = categoriesData?.items || [];
    const totalCategories = categoriesData?.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalCategories / PAGE_SIZE));

    // Prefetch logic
    React.useEffect(() => {
        if (currentPage < totalPages) {
            const nextPage = currentPage + 1;
            const nextParams = {
                ...categoriesParams,
                skip: (nextPage - 1) * PAGE_SIZE,
            };
            queryClient.prefetchQuery(categoriesQueryOptions(nextParams));
        }
    }, [currentPage, totalPages, categoriesParams, queryClient]);

    React.useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    const createMutation = useMutation({
        mutationFn: categoriesApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            showAlert('Category created successfully', 'success');
            closeDialog();
        },
        onError: (error: ApiError) => {
            showAlert('Error creating category: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: CategoryUpdate }) => categoriesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            showAlert('Category updated successfully', 'success');
            closeDialog();
        },
        onError: (error: ApiError) => {
            showAlert('Error updating category: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: categoriesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            showAlert('Category deleted successfully', 'success');
        },
        onError: (error: ApiError) => {
            showAlert('Error deleting category: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const openCreate = () => {
        setEditingCategory(null);
        setName('');
        setDescription('');
        setIsOpen(true);
    };

    const openEdit = (cat: Category) => {
        setEditingCategory(cat);
        setName(cat.name);
        setDescription(cat.description || '');
        setIsOpen(true);
    };

    const closeDialog = () => {
        setIsOpen(false);
        setEditingCategory(null);
        setName('');
        setDescription('');
    };

    const handleDelete = (cat: Category) => {
        const id = cat.id;
        confirm({
            title: 'Delete Category',
            message: cat.plant_count
                ? `"${cat.name}" still has ${cat.plant_count} ${cat.plant_count === 1 ? 'plant' : 'plants'}. Move them to another category before deleting it.`
                : `Delete "${cat.name}"? This can't be undone.`,
            onConfirm: () => deleteMutation.mutate(id),
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingCategory) {
            updateMutation.mutate({ id: editingCategory.id, data: { name, description } });
        } else {
            createMutation.mutate({ name, description });
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    // Bars in the Plants column are relative to the largest category on this page
    const maxCount = Math.max(1, ...categories.map(c => c.plant_count ?? 0));

    return (
        <div>
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0">
                    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                        Categories
                        {totalCategories > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                                {totalCategories}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Group your plants. Open a category to see its plants.
                    </p>
                </div>
                <Button onClick={openCreate} className="shrink-0 gap-1.5 shadow-sm">
                    <Plus className="w-4 h-4" />
                    <span className="hidden xs:inline">New category</span>
                    <span className="xs:hidden">New</span>
                </Button>
            </div>

            {/* Toolbar */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search categories…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-card"
                />
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="h-10 text-xs font-medium uppercase tracking-wide">Category</TableHead>
                            <TableHead className="h-10 text-xs font-medium uppercase tracking-wide hidden md:table-cell">Description</TableHead>
                            <TableHead className="h-10 text-xs font-medium uppercase tracking-wide">Plants</TableHead>
                            <TableHead className="h-10 w-28" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="w-9 h-9 rounded-lg" />
                                            <Skeleton className="h-4 w-28" />
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : categories.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={4} className="py-16">
                                    <div className="flex flex-col items-center gap-3 text-center">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                                            <Tags className="w-6 h-6 text-muted-foreground" />
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {searchTerm ? 'No categories match your search.' : 'No categories yet. Create your first one.'}
                                        </p>
                                        {!searchTerm && (
                                            <Button size="sm" onClick={openCreate} className="gap-1.5">
                                                <Plus className="w-4 h-4" /> New category
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            categories.map((cat) => {
                                const count = cat.plant_count ?? 0;
                                return (
                                    <TableRow key={cat.id} {...rowLinkProps} className="group cursor-pointer hover:bg-muted/40 transition-colors">
                                        {/* Below md the name column takes the leftover width and truncates */}
                                        <TableCell className="py-3 w-full max-w-0 md:w-auto md:max-w-none">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/25 shrink-0">
                                                    <Tags className="w-4 h-4 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <Link
                                                        to="/plants"
                                                        search={{ category: cat.name } as never}
                                                        title={`View plants in ${cat.name}`}
                                                        data-row-link
                                                        className="block font-medium text-foreground truncate group-hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
                                                    >
                                                        {cat.name}
                                                    </Link>
                                                    {cat.description && (
                                                        <p className="text-xs text-muted-foreground truncate md:hidden">{cat.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground hidden md:table-cell max-w-md">
                                            {cat.description
                                                ? <span className="line-clamp-2">{cat.description}</span>
                                                : <span className="text-muted-foreground/50">—</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground tabular-nums w-10">
                                                    <Leaf className="w-3.5 h-3.5 text-secondary shrink-0" />
                                                    {count}
                                                </span>
                                                <div className="hidden sm:block w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-secondary group-hover:bg-primary transition-colors"
                                                        style={{ width: `${count ? Math.max(4, (count / maxCount) * 100) : 0}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="pl-0 pr-3">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                    onClick={() => openEdit(cat)}
                                                    title="Edit"
                                                    aria-label={`Edit ${cat.name}`}
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDelete(cat)}
                                                    title="Delete"
                                                    aria-label={`Delete ${cat.name}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                                <ChevronRight className="hidden sm:block w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground bg-card px-4 py-3 rounded-xl border border-border shadow-sm">
                    <span>
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCategories)} of {totalCategories}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                        >
                            Previous
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <Button
                                    key={p}
                                    variant={currentPage === p ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setCurrentPage(p)}
                                >
                                    {p}
                                </Button>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Dialog */}
            <Dialog open={isOpen} onOpenChange={(o) => !o && closeDialog()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingCategory ? 'Edit Category' : 'New Category'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="cat-name">Name <span className="text-destructive">*</span></Label>
                            <Input
                                id="cat-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Shade Plants"
                                required
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cat-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Textarea
                                id="cat-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief description of this category..."
                                rows={3}
                                className="resize-none"
                            />
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving || !name.trim()}>
                                {isSaving ? 'Saving…' : editingCategory ? 'Save Changes' : 'Create Category'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};
