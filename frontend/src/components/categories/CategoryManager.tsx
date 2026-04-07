import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, Tags } from 'lucide-react';

import { categoriesApi } from '../../api/categories';
import { categoriesQueryOptions } from '../../api/queryOptions';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { Category } from '../../types/category';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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

export const CategoryManager = () => {
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

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

    const categoriesParams = {
        skip: (currentPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined
    };

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
        onError: (error: any) => {
            showAlert('Error creating category: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => categoriesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            showAlert('Category updated successfully', 'success');
            closeDialog();
        },
        onError: (error: any) => {
            showAlert('Error updating category: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: categoriesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            showAlert('Category deleted successfully', 'success');
        },
        onError: (error: any) => {
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

    const handleDelete = (id: string) => {
        confirm({
            title: 'Delete Category',
            message: 'Are you sure you want to delete this category? Plants using it must be updated first.',
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

    return (
        <div>
            {/* Page Header */}
            <div className="flex flex-col gap-1 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Categories</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Organise your plants into custom groups.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Input
                            placeholder="Search categories..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-10 pl-9"
                        />
                        <Tags className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    </div>
                    <Button onClick={openCreate} className="w-full sm:w-auto">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Category
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40">
                            <TableHead className="font-semibold">Name</TableHead>
                            <TableHead className="font-semibold hidden sm:table-cell">Description</TableHead>
                            <TableHead className="font-semibold">Plants</TableHead>
                            <TableHead className="text-right font-semibold">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-8 rounded-full" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : categories?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                    <Tags className="w-8 h-8 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No categories yet. Create your first one.</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            categories?.map((cat) => (
                                <TableRow key={cat.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-medium">
                                        <button
                                            onClick={() => navigate({ to: '/plants', search: { category: cat.name } })}
                                            className="text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left"
                                            title={`View plants in ${cat.name}`}
                                        >
                                            {cat.name}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                                        {cat.description || <span className="text-muted-foreground/50 italic">No description</span>}
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => navigate({ to: '/plants', search: { category: cat.name } })}
                                            title={`View plants in ${cat.name}`}
                                        >
                                            <Badge variant="secondary" className="text-xs tabular-nums cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors">
                                                {cat.plant_count ?? 0}
                                            </Badge>
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => openEdit(cat)}
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(cat.id)}
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground bg-white p-3 rounded-lg border border-border">
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
