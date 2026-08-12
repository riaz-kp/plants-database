import { useState, useMemo, useEffect, memo, useCallback, Fragment } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft, Download, Plus, Pencil, Trash2, Leaf,
    User, MapPin, ExternalLink, Search, ChevronUp, ChevronDown,
    ChevronsUpDown, ChevronLeft, ChevronRight,
    Link2, Copy, Check, RefreshCw, FileSpreadsheet
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { exportProjectBoqPdf } from './ProjectBoqPdfDocument';
import { exportProjectQuotationPdf } from './ProjectQuotationPdfDocument';

import { projectsApi } from '../../api/projects';
import type { ShareLinkInfo } from '../../api/projects';
import { plantsApi } from '../../api/plants';
import { taxonomyApi } from '../../api/taxonomy';
import type { ProjectPlantCreate } from '../../types/project';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

/* ── types ── */
type SortKey = 'common_name' | 'scientific_name' | 'category' | 'planting_place' | 'notes';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/* ── SortHeader helper ── */
function SortTh({
    label, col, sortKey, sortDir, onSort, className = '',
}: {
    label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
    onSort: (col: SortKey) => void; className?: string;
}) {
    const active = sortKey === col;
    return (
        <TableHead
            className={`font-semibold cursor-pointer select-none hover:bg-muted/40 transition-colors ${className}`}
            onClick={() => onSort(col)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {active
                    ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
            </span>
        </TableHead>
    );
}


/* ─── Memoized Row ─── */
interface ProjectPlantRowProps {
    pp: any;
    idx: number;
    safePage: number;
    pageSize: number;
    onEdit: (plantId: string, notes: string) => void;
    onDelete: (plantId: string, plantName: string) => void;
}

const ProjectPlantRowMemo = memo(({ pp, idx, safePage, pageSize, onEdit, onDelete }: ProjectPlantRowProps) => {
    return (
        <TableRow key={pp.plant_id} className="hover:bg-muted/20 transition-colors">
            {/* # */}
            <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                {(safePage - 1) * pageSize + idx + 1}
            </TableCell>

            {/* Plant */}
            <TableCell>
                <div className="flex items-center gap-3">
                    {/* Icon/Image */}
                    <div className="shrink-0">
                        {pp.plant?.icon_url ? (
                            <img
                                src={pp.plant.icon_url}
                                alt=""
                                className="w-10 h-10 object-cover rounded-lg border border-border/50"
                            />
                        ) : (
                            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center border border-border/50 shadow-sm">
                                <Leaf size={16} className="text-muted-foreground/50" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <Link
                            to="/plants/$id"
                            params={{ id: pp.plant_id }}
                            className="group/plant inline-flex items-start gap-1 font-medium text-foreground hover:text-primary transition-colors leading-tight"
                        >
                            <span className="truncate">{pp.plant?.common_name}</span>
                            <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-0 group-hover/plant:opacity-50 transition-opacity" />
                        </Link>

                        {/* Mobile details: Scientific + Category */}
                        <div className="flex flex-col gap-1 mt-1 sm:hidden">
                            <p className="text-xs text-muted-foreground italic truncate">
                                {pp.plant?.scientific_name || pp.plant?.taxon?.name || 'Unknown species'}
                            </p>
                            {pp.plant?.category && (
                                <div>
                                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                                        {pp.plant.category}
                                    </Badge>
                                </div>
                            )}
                        </div>

                        {/* Desktop scientific fallback */}
                        <p className="hidden sm:block text-xs text-muted-foreground italic truncate md:hidden">
                            {pp.plant?.scientific_name || pp.plant?.taxon?.name}
                        </p>
                    </div>
                </div>

                {/* notes on mobile */}
                {pp.notes && (
                    <p className="text-xs text-muted-foreground mt-2 md:hidden pl-[52px]">
                        {pp.notes}
                    </p>
                )}
            </TableCell>

            {/* Scientific */}
            <TableCell className="hidden sm:table-cell text-xs text-muted-foreground italic">
                {pp.plant?.scientific_name || pp.plant?.taxon?.name || <span className="opacity-30">—</span>}
            </TableCell>

            {/* Category */}
            <TableCell className="hidden md:table-cell">
                {pp.plant?.category
                    ? <Badge variant="outline" className="text-xs">{pp.plant.category}</Badge>
                    : <span className="text-muted-foreground/40 text-sm">—</span>}
            </TableCell>

            {/* Place */}
            <TableCell className="hidden lg:table-cell">
                {pp.plant?.planting_place
                    ? <Badge variant="secondary" className="text-xs">{pp.plant.planting_place}</Badge>
                    : <span className="text-muted-foreground/40 text-sm">—</span>}
            </TableCell>

            {/* Notes */}
            <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[180px] truncate">
                {pp.notes || <span className="opacity-30">—</span>}
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => onEdit(pp.plant_id, pp.notes || '')}
                        title="Edit notes"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(pp.plant_id, pp.plant?.common_name || 'Plant')}
                        title="Remove plant"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
});

const ProjectBoqRow = ({
    pp,
    idx,
    onDelete,
    onUpdate,
    isSelected,
    onSelectChange
}: {
    pp: any;
    idx: number;
    onDelete: (plantId: string, plantName: string) => void;
    onUpdate: (plantId: string, data: any) => Promise<void>;
    isSelected: boolean;
    onSelectChange: (plantId: string, selected: boolean) => void;
}) => {
    const [localQty, setLocalQty] = useState(pp.quantity !== undefined && pp.quantity !== null ? String(pp.quantity) : '');
    const [localUnit, setLocalUnit] = useState(pp.unit ?? '');
    const [localSize, setLocalSize] = useState(pp.optimum_height_size ?? '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocalQty(pp.quantity !== undefined && pp.quantity !== null ? String(pp.quantity) : '');
        setLocalUnit(pp.unit ?? '');
        setLocalSize(pp.optimum_height_size ?? '');
    }, [pp.quantity, pp.unit, pp.optimum_height_size]);

    const handleBlur = async (field: 'quantity' | 'unit' | 'optimum_height_size', value: string) => {
        const trimmed = value.trim();
        let hasChanged = false;
        if (field === 'quantity') {
            const parsed = trimmed ? parseFloat(trimmed) : null;
            const original = pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : null;
            hasChanged = parsed !== original;
        } else if (field === 'unit') {
            const original = pp.unit ?? '';
            hasChanged = trimmed !== original;
        } else if (field === 'optimum_height_size') {
            const original = pp.optimum_height_size ?? '';
            hasChanged = trimmed !== original;
        }

        if (!hasChanged) return;

        setSaving(true);
        try {
            const parsedQty = field === 'quantity' ? (trimmed ? parseFloat(trimmed) : null) : (localQty.trim() ? parseFloat(localQty) : null);
            const currentUnit = field === 'unit' ? trimmed : localUnit;
            const currentSize = field === 'optimum_height_size' ? trimmed : localSize;
            
            await onUpdate(pp.plant_id, {
                plant_id: pp.plant_id,
                notes: pp.notes,
                quantity: parsedQty === null ? undefined : parsedQty,
                unit: currentUnit || undefined,
                optimum_height_size: currentSize || undefined
            });
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
            const currentCell = input.closest('td');
            const currentRow = input.closest('tr');
            if (!currentCell || !currentRow) return;

            const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
            const direction = e.key === 'ArrowUp' ? 'up' : 'down';
            
            e.preventDefault();

            let targetRow = direction === 'up' 
                ? currentRow.previousElementSibling as HTMLTableRowElement | null 
                : currentRow.nextElementSibling as HTMLTableRowElement | null;

            while (targetRow) {
                const targetInput = targetRow.cells[cellIndex]?.querySelector('input') as HTMLInputElement | null;
                if (targetInput && !targetInput.disabled) {
                    targetInput.focus();
                    if (targetInput.type !== 'checkbox') {
                        targetInput.select();
                    }
                    break;
                }
                targetRow = direction === 'up' 
                    ? targetRow.previousElementSibling as HTMLTableRowElement | null 
                    : targetRow.nextElementSibling as HTMLTableRowElement | null;
            }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const currentRow = input.closest('tr');
            if (!currentRow) return;

            let isAtEdge = true;
            try {
                if (input.selectionStart !== null && input.selectionEnd !== null) {
                    if (e.key === 'ArrowLeft') {
                        isAtEdge = input.selectionStart === 0;
                    } else {
                        isAtEdge = input.selectionEnd === input.value.length;
                    }
                }
            } catch (err) {
                isAtEdge = true;
            }

            if (isAtEdge) {
                const rowInputs = Array.from(currentRow.querySelectorAll('input')) as HTMLInputElement[];
                const currentInputIdx = rowInputs.indexOf(input);
                const targetInput = e.key === 'ArrowLeft' 
                    ? rowInputs[currentInputIdx - 1] 
                    : rowInputs[currentInputIdx + 1];

                if (targetInput) {
                    e.preventDefault();
                    targetInput.focus();
                    if (targetInput.type !== 'checkbox') {
                        targetInput.select();
                    }
                }
            }
        }
    };

    return (
        <TableRow className={`hover:bg-muted/10 transition-colors focus-within:bg-primary/[0.04] ${saving ? 'opacity-70 bg-muted/5' : ''}`}>
            {/* # */}
            <TableCell className="text-center font-medium text-xs tabular-nums text-muted-foreground w-8">
                {idx + 1}
            </TableCell>
            
            {/* Checkbox */}
            <TableCell className="w-10 text-center">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        onSelectChange(pp.plant_id, e.target.checked);
                        e.target.focus();
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none accent-primary"
                />
            </TableCell>

            {/* Image */}
            <TableCell className="w-14">
                <div className="flex justify-center">
                    {pp.plant?.icon_url ? (
                        <img
                            src={pp.plant.icon_url}
                            alt=""
                            className="w-12 h-12 object-cover rounded-lg border border-border/50 shadow-sm"
                        />
                    ) : (
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center border border-border/50">
                            <Leaf size={18} className="text-muted-foreground/40" />
                        </div>
                    )}
                </div>
            </TableCell>

            {/* Common Name */}
            <TableCell className="font-semibold text-foreground w-36 max-w-[144px] truncate">
                {pp.plant?.common_name || '—'}
            </TableCell>

            {/* Scientific Name */}
            <TableCell className="italic text-muted-foreground text-xs w-40 max-w-[160px] truncate">
                {pp.plant?.scientific_name || pp.plant?.taxon?.name || '—'}
            </TableCell>

            {/* Quantity */}
            <TableCell className="w-20 min-w-[70px]">
                <input
                    type="number"
                    step="any"
                    min="0"
                    value={localQty}
                    onChange={(e) => setLocalQty(e.target.value)}
                    onBlur={() => handleBlur('quantity', localQty)}
                    onKeyDown={handleKeyDown}
                    placeholder="—"
                    className="w-full text-sm font-semibold bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none tabular-nums text-center"
                />
            </TableCell>

            {/* Unit */}
            <TableCell className="w-20 min-w-[70px]">
                <input
                    type="text"
                    value={localUnit}
                    onChange={(e) => setLocalUnit(e.target.value)}
                    onBlur={() => handleBlur('unit', localUnit)}
                    onKeyDown={handleKeyDown}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-muted-foreground focus:text-foreground focus:outline-none text-center"
                />
            </TableCell>

            {/* Height/Size */}
            <TableCell className="w-24 min-w-[90px]">
                <input
                    type="text"
                    value={localSize}
                    onChange={(e) => setLocalSize(e.target.value)}
                    onBlur={() => handleBlur('optimum_height_size', localSize)}
                    onKeyDown={handleKeyDown}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none text-center"
                />
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right w-10">
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(pp.plant_id, pp.plant?.common_name || 'Plant')}
                        title="Remove plant"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
};

const ProjectQuotationRow = ({
    pp,
    idx,
    onDelete,
    onUpdate,
    isSelected,
    onSelectChange
}: {
    pp: any;
    idx: number;
    onDelete: (plantId: string, plantName: string) => void;
    onUpdate: (plantId: string, data: any) => Promise<void>;
    isSelected: boolean;
    onSelectChange: (plantId: string, selected: boolean) => void;
}) => {
    const [localQty, setLocalQty] = useState(pp.quantity !== undefined && pp.quantity !== null ? String(pp.quantity) : '');
    const [localUnit, setLocalUnit] = useState(pp.unit ?? '');
    const [localSize, setLocalSize] = useState(pp.optimum_height_size ?? '');
    const [localRate, setLocalRate] = useState(pp.rate !== undefined && pp.rate !== null ? String(pp.rate) : '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocalQty(pp.quantity !== undefined && pp.quantity !== null ? String(pp.quantity) : '');
        setLocalUnit(pp.unit ?? '');
        setLocalSize(pp.optimum_height_size ?? '');
        setLocalRate(pp.rate !== undefined && pp.rate !== null ? String(pp.rate) : '');
    }, [pp.quantity, pp.unit, pp.optimum_height_size, pp.rate]);

    const handleBlur = async (field: 'quantity' | 'unit' | 'optimum_height_size' | 'rate', value: string) => {
        const trimmed = value.trim();
        let hasChanged = false;
        if (field === 'quantity') {
            const parsed = trimmed ? parseFloat(trimmed) : null;
            const original = pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : null;
            hasChanged = parsed !== original;
        } else if (field === 'unit') {
            const original = pp.unit ?? '';
            hasChanged = trimmed !== original;
        } else if (field === 'optimum_height_size') {
            const original = pp.optimum_height_size ?? '';
            hasChanged = trimmed !== original;
        } else if (field === 'rate') {
            const parsed = trimmed ? parseFloat(trimmed) : null;
            const original = pp.rate !== undefined && pp.rate !== null ? pp.rate : null;
            hasChanged = parsed !== original;
        }

        if (!hasChanged) return;

        setSaving(true);
        try {
            const parsedQty = field === 'quantity' ? (trimmed ? parseFloat(trimmed) : null) : (localQty.trim() ? parseFloat(localQty) : null);
            const currentUnit = field === 'unit' ? trimmed : localUnit;
            const currentSize = field === 'optimum_height_size' ? trimmed : localSize;
            const parsedRate = field === 'rate' ? (trimmed ? parseFloat(trimmed) : null) : (localRate.trim() ? parseFloat(localRate) : null);
            
            await onUpdate(pp.plant_id, {
                plant_id: pp.plant_id,
                notes: pp.notes,
                quantity: parsedQty === null ? undefined : parsedQty,
                unit: currentUnit || undefined,
                optimum_height_size: currentSize || undefined,
                rate: parsedRate === null ? undefined : parsedRate
            });
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
            const currentCell = input.closest('td');
            const currentRow = input.closest('tr');
            if (!currentCell || !currentRow) return;

            const cellIndex = Array.from(currentRow.children).indexOf(currentCell);
            const direction = e.key === 'ArrowUp' ? 'up' : 'down';
            
            e.preventDefault();

            let targetRow = direction === 'up' 
                ? currentRow.previousElementSibling as HTMLTableRowElement | null 
                : currentRow.nextElementSibling as HTMLTableRowElement | null;

            while (targetRow) {
                const targetInput = targetRow.cells[cellIndex]?.querySelector('input') as HTMLInputElement | null;
                if (targetInput && !targetInput.disabled) {
                    targetInput.focus();
                    if (targetInput.type !== 'checkbox') {
                        targetInput.select();
                    }
                    break;
                }
                targetRow = direction === 'up' 
                    ? targetRow.previousElementSibling as HTMLTableRowElement | null 
                    : targetRow.nextElementSibling as HTMLTableRowElement | null;
            }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const currentRow = input.closest('tr');
            if (!currentRow) return;

            let isAtEdge = true;
            try {
                if (input.selectionStart !== null && input.selectionEnd !== null) {
                    if (e.key === 'ArrowLeft') {
                        isAtEdge = input.selectionStart === 0;
                    } else {
                        isAtEdge = input.selectionEnd === input.value.length;
                    }
                }
            } catch (err) {
                isAtEdge = true;
            }

            if (isAtEdge) {
                const rowInputs = Array.from(currentRow.querySelectorAll('input')) as HTMLInputElement[];
                const currentInputIdx = rowInputs.indexOf(input);
                const targetInput = e.key === 'ArrowLeft' 
                    ? rowInputs[currentInputIdx - 1] 
                    : rowInputs[currentInputIdx + 1];

                if (targetInput) {
                    e.preventDefault();
                    targetInput.focus();
                    if (targetInput.type !== 'checkbox') {
                        targetInput.select();
                    }
                }
            }
        }
    };

    const amount = (pp.quantity !== undefined && pp.quantity !== null && pp.rate !== undefined && pp.rate !== null)
        ? pp.quantity * pp.rate
        : null;

    return (
        <TableRow className={`hover:bg-muted/10 transition-colors focus-within:bg-primary/[0.04] ${saving ? 'opacity-70 bg-muted/5' : ''}`}>
            <TableCell className="text-center font-medium text-xs tabular-nums text-muted-foreground w-8">
                {idx + 1}
            </TableCell>
            
            <TableCell className="w-10 text-center">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        onSelectChange(pp.plant_id, e.target.checked);
                        e.target.focus();
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none accent-primary"
                />
            </TableCell>

            <TableCell className="w-14">
                <div className="flex justify-center">
                    {pp.plant?.icon_url ? (
                        <img
                            src={pp.plant.icon_url}
                            alt=""
                            className="w-12 h-12 object-cover rounded-lg border border-border/50 shadow-sm"
                        />
                    ) : (
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center border border-border/50">
                            <Leaf size={18} className="text-muted-foreground/40" />
                        </div>
                    )}
                </div>
            </TableCell>

            <TableCell className="font-semibold text-foreground w-36 max-w-[144px] truncate">
                {pp.plant?.common_name || '—'}
            </TableCell>

            <TableCell className="italic text-muted-foreground text-xs w-40 max-w-[160px] truncate">
                {pp.plant?.scientific_name || pp.plant?.taxon?.name || '—'}
            </TableCell>

            <TableCell className="w-20 min-w-[70px]">
                <input
                    type="number"
                    step="any"
                    min="0"
                    value={localQty}
                    onChange={(e) => setLocalQty(e.target.value)}
                    onBlur={() => handleBlur('quantity', localQty)}
                    onKeyDown={handleKeyDown}
                    placeholder="—"
                    className="w-full text-sm font-semibold bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none tabular-nums text-center"
                />
            </TableCell>

            <TableCell className="w-20 min-w-[70px]">
                <input
                    type="text"
                    value={localUnit}
                    onChange={(e) => setLocalUnit(e.target.value)}
                    onBlur={() => handleBlur('unit', localUnit)}
                    onKeyDown={handleKeyDown}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-muted-foreground focus:text-foreground focus:outline-none text-center"
                />
            </TableCell>

            <TableCell className="w-24 min-w-[90px]">
                <input
                    type="text"
                    value={localSize}
                    onChange={(e) => setLocalSize(e.target.value)}
                    onBlur={() => handleBlur('optimum_height_size', localSize)}
                    onKeyDown={handleKeyDown}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none text-center"
                />
            </TableCell>

            <TableCell className="w-24 min-w-[90px]">
                <input
                    type="number"
                    step="any"
                    min="0"
                    value={localRate}
                    onChange={(e) => setLocalRate(e.target.value)}
                    onBlur={() => handleBlur('rate', localRate)}
                    onKeyDown={handleKeyDown}
                    placeholder="0.00"
                    className="w-full text-sm font-semibold bg-muted/30 border border-muted/40 hover:bg-muted/50 focus:bg-white focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none tabular-nums text-center"
                />
            </TableCell>

            <TableCell className="w-28 min-w-[110px] text-center font-bold text-sm text-primary tabular-nums">
                {amount !== null ? `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </TableCell>

            <TableCell className="text-right w-10">
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(pp.plant_id, pp.plant?.common_name || 'Plant')}
                        title="Remove plant"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
};

export const ProjectDetails = () => {
    const { id } = useParams({ strict: false }) as { id: string };
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();

    /* ── Dialog state ── */
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlantId, setEditingPlantId] = useState<string | null>(null);
    const [selectedPlantId, setSelectedPlantId] = useState('');
    const [notes, setNotes] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('');
    const [optimumHeightSize, setOptimumHeightSize] = useState('');
    const [rate, setRate] = useState('');

    /* ── Table state ── */
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('__all__');
    const [sortKey, setSortKey] = useState<SortKey>('common_name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [pdfLoading, setPdfLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'standard' | 'boq' | 'quotation'>('standard');
    const [pdfBoqLoading, setPdfBoqLoading] = useState(false);
    const [pdfQuotationLoading, setPdfQuotationLoading] = useState(false);
    const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([]);
    const [bulkUpdating, setBulkUpdating] = useState(false);
    const [bulkUnit, setBulkUnit] = useState('');
    const [bulkQty, setBulkQty] = useState('');
    const [bulkSize, setBulkSize] = useState('');
    const [bulkRate, setBulkRate] = useState('');

    useEffect(() => {
        setSelectedPlantIds([]);
    }, [viewMode]);

    /* ── Share link state ── */
    const [shareLink, setShareLink] = useState<ShareLinkInfo | null>(null);
    const [shareLinkLoaded, setShareLinkLoaded] = useState(false);
    const [copied, setCopied] = useState(false);

    const generateShareMutation = useMutation({
        mutationFn: () => projectsApi.generateShareLink(id!),
        onSuccess: (data) => setShareLink(data),
    });

    /* ── Fetch existing share link on mount ── */
    useEffect(() => {
        if (!id) return;
        projectsApi.getShareLink(id).then((link) => {
            setShareLink(link);
            setShareLinkLoaded(true);
        }).catch(() => setShareLinkLoaded(true));
    }, [id]);

    const fullShareUrl = shareLink
        ? `${window.location.origin}${shareLink.url}`
        : null;

    const handleCopyLink = async () => {
        if (!fullShareUrl) return;
        await navigator.clipboard.writeText(fullShareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    /* ── Queries ── */
    const { data: project, isLoading } = useQuery({
        queryKey: ['project', id],
        queryFn: () => projectsApi.getById(id!),
        enabled: !!id,
    });

    const { data: allPlantsData } = useQuery({
        queryKey: ['plants', 'all-picker'],
        queryFn: () => plantsApi.getAll({ limit: 1000 }), // Load more for picker
    });
    const allPlants = allPlantsData?.items || [];

    const { data: taxTree } = useQuery({
        queryKey: ['taxonomy', 'tree'],
        queryFn: () => taxonomyApi.getTree(),
    });

    const handleDownloadPdf = async () => {
        if (!project) return;
        setPdfLoading(true);
        try {
            const { prepareProjectImageCache } = await import('../../utils/pdf-images');
            const imgCache = await prepareProjectImageCache(project);
            
            const { exportProjectPdfNew } = await import('./ProjectPdfDocument');
            await exportProjectPdfNew(project, taxTree, imgCache, project.name);
        } catch (e) {
            console.error(e);
            showAlert('PDF export failed', 'error');
        } finally {
            setPdfLoading(false);
        }
    };

    const handleExportQuotationPdf = async () => {
        if (!project) return;
        setPdfQuotationLoading(true);
        try {
            const { prepareProjectImageCache } = await import('../../utils/pdf-images');
            const imgCache = await prepareProjectImageCache(project);
            await exportProjectQuotationPdf(project, imgCache, project.name);
        } catch (e) {
            console.error(e);
            showAlert('Quotation PDF export failed', 'error');
        } finally {
            setPdfQuotationLoading(false);
        }
    };

    const handleExportBoqPdf = async () => {
        if (!project) return;
        setPdfBoqLoading(true);
        try {
            const { prepareProjectImageCache } = await import('../../utils/pdf-images');
            const imgCache = await prepareProjectImageCache(project);
            await exportProjectBoqPdf(project, imgCache, project.name);
        } catch (e) {
            console.error(e);
            showAlert('BOQ PDF export failed', 'error');
        } finally {
            setPdfBoqLoading(false);
        }
    };

    // Helper to auto-crop whitespace from an HTMLImageElement
    const cropImage = (imageElement: HTMLImageElement): Promise<{ buffer: ArrayBuffer; width: number; height: number } | null> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(null);
                return;
            }
            canvas.width = imageElement.naturalWidth;
            canvas.height = imageElement.naturalHeight;
            ctx.drawImage(imageElement, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const alpha = data[idx + 3];
                    
                    // Consider pixel non-empty if it has alpha > 10 and is not pure white
                    const isWhite = r > 248 && g > 248 && b > 248;
                    const isEmpty = alpha < 10 || isWhite;
                    if (!isEmpty) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            
            // Add a small safety padding
            const padding = 15;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(canvas.width, maxX + padding);
            maxY = Math.min(canvas.height, maxY + padding);
            
            const cropWidth = maxX - minX;
            const cropHeight = maxY - minY;
            
            if (cropWidth <= 0 || cropHeight <= 0) {
                resolve(null);
                return;
            }
            
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');
            if (!cropCtx) {
                resolve(null);
                return;
            }
            cropCtx.drawImage(imageElement, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            
            cropCanvas.toBlob((blob) => {
                if (blob) {
                    blob.arrayBuffer().then((buf) => {
                        resolve({ buffer: buf, width: cropWidth, height: cropHeight });
                    });
                } else {
                    resolve(null);
                }
            }, 'image/png');
        });
    };

    // Helper to fetch remote image as array buffer for Excel insertion
    const fetchImageAsBuffer = async (url: string): Promise<{ buffer: ArrayBuffer; extension: string } | null> => {
        try {
            let fetchUrl = url;
            if (url.startsWith('//')) {
                fetchUrl = 'https:' + url;
            }
            const res = await fetch(fetchUrl, { mode: 'cors' });
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            let ext = 'png';
            if (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) {
                ext = 'jpeg';
            } else if (url.toLowerCase().includes('.gif')) {
                ext = 'gif';
            }
            return { buffer, extension: ext };
        } catch (e) {
            console.warn('CORS or fetch error for Excel image:', url, e);
            return null;
        }
    };

    const handleExportBoqExcel = async () => {
        if (!project) return;
        showAlert('Generating BOQ Excel with images...', 'info');
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('BOQ');

            // Set gridlines visible
            worksheet.views = [{ showGridLines: true }];

            // Set Column widths (first column reduced to 6)
            worksheet.columns = [
                { key: 'serial', width: 6 },
                { key: 'img', width: 14 },
                { key: 'common', width: 28 },
                { key: 'sci', width: 28 },
                { key: 'qty', width: 12 },
                { key: 'unit', width: 12 },
                { key: 'height', width: 20 },
                { key: 'notes', width: 32 }
            ];

            // Set row heights for spacious header
            worksheet.getRow(1).height = 24;
            worksheet.getRow(2).height = 15;
            worksheet.getRow(3).height = 18;
            worksheet.getRow(4).height = 18;
            worksheet.getRow(5).height = 18;
            worksheet.getRow(6).height = 18;
            worksheet.getRow(7).height = 15;

            // Hide gridlines in the header area by applying solid white fill to cells A1:H7
            for (let r = 1; r <= 7; r++) {
                const row = worksheet.getRow(r);
                for (let c = 1; c <= 8; c++) {
                    const cell = row.getCell(c);
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFFFFF' }
                    };
                }
            }

            // 1. Add Landschaft Logo PNG (Top Right in Column H)
            try {
                const logoImg = new Image();
                logoImg.crossOrigin = 'anonymous';
                const logoLoaded = new Promise<boolean>((resolve) => {
                    logoImg.onload = () => resolve(true);
                    logoImg.onerror = () => resolve(false);
                });
                logoImg.src = '/logo-color.png';
                const loaded = await logoLoaded;
                if (loaded) {
                    const cropResult = await cropImage(logoImg);
                    if (cropResult) {
                        const logoId = workbook.addImage({
                            buffer: cropResult.buffer,
                            extension: 'png',
                        });
                        
                        // Scale proportionally: width of 175 makes it larger.
                        const targetWidth = 175;
                        const targetHeight = (cropResult.height / cropResult.width) * targetWidth;
                        
                        worksheet.addImage(logoId, {
                            tl: { col: 7.32, row: 1.2 }, // Center in Column H, bottom-aligned sitting lower
                            ext: { width: targetWidth, height: targetHeight }
                        });
                    }
                }
            } catch (err) {
                console.warn('Failed to embed cropped logo in Excel:', err);
            }

            // 2. Add Header Titles and Metadata
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'BILL OF QUANTITIES';
            titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF1B3B2B' } };

            const metaRows = [
                ['Project:', project.name],
                ['Client:', project.client_name || '—'],
                ['Location:', project.location || '—'],
                ['Date:', new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })]
            ];

            metaRows.forEach((row, i) => {
                const rowIdx = i + 3;
                worksheet.mergeCells(`A${rowIdx}:C${rowIdx}`);
                const cell = worksheet.getCell(`A${rowIdx}`);
                cell.value = {
                    richText: [
                        { text: row[0] + ' ', font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF666666' } } },
                        { text: row[1], font: { name: 'Arial', size: 10, color: { argb: 'FF1A1A1A' } } }
                    ]
                };
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            });

            // 3. Add Table Headers (Row 8)
            const headerRow = worksheet.getRow(8);
            headerRow.height = 28;
            const headers = ['#', 'Img', 'Common Name', 'Scientific Name', 'Qty', 'Unit', 'Height/Size (ft)', 'Notes'];
            headers.forEach((h, colIdx) => {
                const cell = headerRow.getCell(colIdx + 1);
                cell.value = h;
                cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1B3B2B' }
                };
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: colIdx === 0 || colIdx === 1 || colIdx === 4 || colIdx === 5 || colIdx === 6 ? 'center' : 'left'
                };
                cell.border = {
                    bottom: { style: 'medium', color: { argb: 'FF1B3B2B' } }
                };
            });

            // Group by Category
            const groups = new Map<string, typeof project.plants>();
            for (const pp of project.plants) {
                if (!pp.plant) continue;
                const cat = pp.plant.category || 'Uncategorized';
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat)!.push(pp);
            }
            const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

            let currentRowIdx = 9;
            let serialIdx = 0;

            for (const [category, pps] of sortedGroups) {
                // Category Header Row
                const catRow = worksheet.getRow(currentRowIdx);
                catRow.height = 24;
                
                // Merge category header cells A-H
                worksheet.mergeCells(`A${currentRowIdx}:H${currentRowIdx}`);
                const catCell = catRow.getCell(1);
                catCell.value = `${category.toUpperCase()} (${pps.length})`;
                catCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1B3B2B' } };
                catCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF0EDE8' }
                };
                catCell.alignment = { vertical: 'middle', indent: 1 };
                catCell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E1D8' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E1D8' } }
                };

                currentRowIdx += 1;

                // Add plant rows
                for (let i = 0; i < pps.length; i++) {
                    const pp = pps[i];
                    const p = pp.plant!;
                    serialIdx += 1;
                    
                    const row = worksheet.getRow(currentRowIdx);
                    row.height = 42; // Height to fit image

                    const isAlt = i % 2 === 1;
                    const rowBgColor = isAlt ? 'FFF6F4F1' : 'FFFFFFFF';

                    // Set values
                    row.getCell(1).value = serialIdx;
                    row.getCell(3).value = p.common_name;
                    row.getCell(4).value = p.scientific_name || p.taxon?.name || '—';
                    row.getCell(5).value = pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : '—';
                    row.getCell(6).value = pp.unit || '—';
                    row.getCell(7).value = pp.optimum_height_size || '—';
                    row.getCell(8).value = pp.notes || '—';

                    // Stylings & alignments
                    for (let col = 1; col <= 8; col++) {
                        const cell = row.getCell(col);
                        cell.font = {
                            name: 'Arial',
                            size: 10,
                            bold: col === 3 || col === 5, // bold common name and quantity
                            italic: col === 4, // italic scientific name
                            color: { argb: col === 3 ? 'FF1B3B2B' : 'FF1A1A1A' }
                        };
                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: col === 1 || col === 2 || col === 5 || col === 6 || col === 7 ? 'center' : 'left',
                            wrapText: col === 8 || col === 3 || col === 4
                        };
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: rowBgColor }
                        };
                        cell.border = {
                            bottom: { style: 'thin', color: { argb: 'FFE5E1D8' } }
                        };
                    }

                    // Add Image in Column 2 (B)
                    const imgUrl = p.icon_url || p.image_url;
                    if (imgUrl) {
                        try {
                            const imgData = await fetchImageAsBuffer(imgUrl);
                            if (imgData) {
                                const imageId = workbook.addImage({
                                    buffer: imgData.buffer,
                                    extension: imgData.extension as any,
                                });
                                worksheet.addImage(imageId, {
                                    tl: { col: 1.1, row: currentRowIdx - 0.9 },
                                    ext: { width: 38, height: 38 }
                                });
                            }
                        } catch (err) {
                            console.warn('Failed to embed plant image in Excel:', imgUrl, err);
                        }
                    }

                    currentRowIdx += 1;
                }
            }

            // Write and Download Workbook
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${project.name}_BOQ.xlsx`;
            anchor.click();
            window.URL.revokeObjectURL(url);

            showAlert('BOQ Excel exported successfully', 'success');
        } catch (e) {
            console.error(e);
            showAlert('Excel export failed', 'error');
        }
    };

    const handleExportQuotationExcel = async () => {
        if (!project) return;
        showAlert('Generating Quotation Excel with images...', 'info');
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Quotation');

            // Set gridlines visible
            worksheet.views = [{ showGridLines: true }];

            // Set Column widths
            worksheet.columns = [
                { key: 'serial', width: 6 },
                { key: 'img', width: 14 },
                { key: 'common', width: 28 },
                { key: 'sci', width: 28 },
                { key: 'qty', width: 12 },
                { key: 'unit', width: 12 },
                { key: 'height', width: 20 },
                { key: 'rate', width: 14 },
                { key: 'amount', width: 16 }
            ];

            // Set row heights for spacious header
            worksheet.getRow(1).height = 24;
            worksheet.getRow(2).height = 15;
            worksheet.getRow(3).height = 18;
            worksheet.getRow(4).height = 18;
            worksheet.getRow(5).height = 18;
            worksheet.getRow(6).height = 18;
            worksheet.getRow(7).height = 15;

            // Hide gridlines in the header area by applying solid white fill to cells A1:I7
            for (let r = 1; r <= 7; r++) {
                const row = worksheet.getRow(r);
                for (let c = 1; c <= 9; c++) {
                    const cell = row.getCell(c);
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFFFFF' }
                    };
                }
            }

            // 1. Add Landschaft Logo PNG (Top Right in Column I)
            try {
                const logoImg = new Image();
                logoImg.crossOrigin = 'anonymous';
                const logoLoaded = new Promise<boolean>((resolve) => {
                    logoImg.onload = () => resolve(true);
                    logoImg.onerror = () => resolve(false);
                });
                logoImg.src = '/logo-color.png';
                const loaded = await logoLoaded;
                if (loaded) {
                    const cropResult = await cropImage(logoImg);
                    if (cropResult) {
                        const logoId = workbook.addImage({
                            buffer: cropResult.buffer,
                            extension: 'png',
                        });
                        
                        const targetWidth = 175;
                        const targetHeight = (cropResult.height / cropResult.width) * targetWidth;
                        
                        worksheet.addImage(logoId, {
                            tl: { col: 7.58, row: 1.2 }, // Center in Column I
                            ext: { width: targetWidth, height: targetHeight }
                        });
                    }
                }
            } catch (err) {
                console.warn('Failed to embed cropped logo in Excel:', err);
            }

            // 2. Add Header Titles and Metadata
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'LANDSCAPE QUOTATION';
            titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF1B3B2B' } };

            const metaRows = [
                ['Project:', project.name],
                ['Client:', project.client_name || '—'],
                ['Location:', project.location || '—'],
                ['Date:', new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })]
            ];

            metaRows.forEach((row, i) => {
                const rowIdx = i + 3;
                worksheet.mergeCells(`A${rowIdx}:C${rowIdx}`);
                const cell = worksheet.getCell(`A${rowIdx}`);
                cell.value = {
                    richText: [
                        { text: row[0] + ' ', font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF666666' } } },
                        { text: row[1], font: { name: 'Arial', size: 10, color: { argb: 'FF1A1A1A' } } }
                    ]
                };
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
            });

            // 3. Add Table Headers (Row 8)
            const headerRow = worksheet.getRow(8);
            headerRow.height = 28;
            const headers = ['#', 'Img', 'Common Name', 'Scientific Name', 'Qty', 'Unit', 'Height/Size (ft)', 'Rate', 'Amount'];
            headers.forEach((h, colIdx) => {
                const cell = headerRow.getCell(colIdx + 1);
                cell.value = h;
                cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1B3B2B' }
                };
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: colIdx === 0 || colIdx === 1 || colIdx === 4 || colIdx === 5 || colIdx === 6 || colIdx === 7 || colIdx === 8 ? 'center' : 'left'
                };
                cell.border = {
                    bottom: { style: 'medium', color: { argb: 'FF1B3B2B' } }
                };
            });

            // Group by Category
            const groups = new Map<string, typeof project.plants>();
            for (const pp of project.plants) {
                if (!pp.plant) continue;
                const cat = pp.plant.category || 'Uncategorized';
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat)!.push(pp);
            }
            const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

            let currentRowIdx = 9;
            let serialIdx = 0;

            for (const [category, pps] of sortedGroups) {
                // Category Header Row
                const catRow = worksheet.getRow(currentRowIdx);
                catRow.height = 24;
                
                worksheet.mergeCells(`A${currentRowIdx}:I${currentRowIdx}`);
                const catCell = catRow.getCell(1);
                catCell.value = `${category.toUpperCase()} (${pps.length})`;
                catCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1B3B2B' } };
                catCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF0EDE8' }
                };
                catCell.alignment = { vertical: 'middle', indent: 1 };
                catCell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E1D8' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E1D8' } }
                };

                currentRowIdx += 1;

                // Add plant rows
                for (let i = 0; i < pps.length; i++) {
                    const pp = pps[i];
                    const p = pp.plant!;
                    serialIdx += 1;
                    
                    const row = worksheet.getRow(currentRowIdx);
                    row.height = 42;

                    const isAlt = i % 2 === 1;
                    const rowBgColor = isAlt ? 'FFF6F4F1' : 'FFFFFFFF';

                    // Set values
                    row.getCell(1).value = serialIdx;
                    row.getCell(3).value = p.common_name;
                    row.getCell(4).value = p.scientific_name || p.taxon?.name || '—';
                    row.getCell(5).value = pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : '—';
                    row.getCell(6).value = pp.unit || '—';
                    row.getCell(7).value = pp.optimum_height_size || '—';
                    row.getCell(8).value = pp.rate !== undefined && pp.rate !== null ? pp.rate : '—';
                    if (pp.quantity !== undefined && pp.quantity !== null && pp.rate !== undefined && pp.rate !== null) {
                        row.getCell(9).value = pp.quantity * pp.rate;
                    } else {
                        row.getCell(9).value = '—';
                    }

                    // Stylings & alignments
                    for (let col = 1; col <= 9; col++) {
                        const cell = row.getCell(col);
                        cell.font = {
                            name: 'Arial',
                            size: 10,
                            bold: col === 3 || col === 5 || col === 9,
                            italic: col === 4,
                            color: { argb: col === 3 ? 'FF1B3B2B' : 'FF1A1A1A' }
                        };
                        
                        let alignmentHorizontal: 'center' | 'left' | 'right' = 'left';
                        if (col === 1 || col === 2 || col === 5 || col === 6 || col === 7) {
                            alignmentHorizontal = 'center';
                        } else if (col === 8 || col === 9) {
                            alignmentHorizontal = 'right';
                        }
                        
                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: alignmentHorizontal,
                            wrapText: col === 3 || col === 4
                        };
                        
                        if ((col === 8 || col === 9) && typeof cell.value === 'number') {
                            cell.numFmt = '#,##0.00';
                        }
                        
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: rowBgColor }
                        };
                        cell.border = {
                            bottom: { style: 'thin', color: { argb: 'FFE5E1D8' } }
                        };
                    }

                    // Add Image in Column 2 (B)
                    const imgUrl = p.icon_url || p.image_url;
                    if (imgUrl) {
                        try {
                            const imgData = await fetchImageAsBuffer(imgUrl);
                            if (imgData) {
                                const imageId = workbook.addImage({
                                    buffer: imgData.buffer,
                                    extension: imgData.extension as any,
                                });
                                worksheet.addImage(imageId, {
                                    tl: { col: 1.1, row: currentRowIdx - 0.9 },
                                    ext: { width: 38, height: 38 }
                                });
                            }
                        } catch (err) {
                            console.warn('Failed to embed plant image in Excel:', imgUrl, err);
                        }
                    }

                    currentRowIdx += 1;
                }
            }

            // Add Total Row at the bottom of the table
            const totalRow = worksheet.getRow(currentRowIdx);
            totalRow.height = 28;
            
            worksheet.mergeCells(`A${currentRowIdx}:D${currentRowIdx}`);
            const labelCell = totalRow.getCell(1);
            labelCell.value = 'Total Quotation Summary:';
            labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
            
            const totalQtyVal = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0), 0);
            totalRow.getCell(5).value = totalQtyVal;
            
            const totalAmtVal = project.plants.reduce((sum, pp) => sum + ((pp.quantity || 0) * (pp.rate || 0)), 0);
            totalRow.getCell(9).value = totalAmtVal;
            
            for (let col = 1; col <= 9; col++) {
                const cell = totalRow.getCell(col);
                cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1B3B2B' } };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF0EDE8' }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF1B3B2B' } },
                    bottom: { style: 'double', color: { argb: 'FF1B3B2B' } }
                };
                
                if (col === 5) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else if (col === 9) {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    cell.numFmt = '#,##0.00';
                }
            }

            // Write and Download Workbook
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${project.name}_Quotation.xlsx`;
            anchor.click();
            window.URL.revokeObjectURL(url);

            showAlert('Quotation Excel exported successfully', 'success');
        } catch (e) {
            console.error(e);
            showAlert('Excel export failed', 'error');
        }
    };

    /* ── Mutations ── */
    const addPlantMutation = useMutation({
        mutationFn: (data: ProjectPlantCreate) => projectsApi.addPlant(id!, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['project', id] }); showAlert('Plant added to project', 'success'); closeDialog(); },
        onError: (e: any) => { showAlert('Failed to add plant: ' + (e.response?.data?.detail || e.message), 'error'); },
    });

    const updatePlantMutation = useMutation({
        mutationFn: (data: ProjectPlantCreate) => projectsApi.updatePlant(id!, editingPlantId!, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['project', id] }); showAlert('Plant updated', 'success'); closeDialog(); },
        onError: (e: any) => { showAlert('Failed to update plant: ' + (e.response?.data?.detail || e.message), 'error'); },
    });

    const deletePlantMutation = useMutation({
        mutationFn: (plantId: string) => projectsApi.removePlant(id!, plantId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['project', id] }); showAlert('Plant removed', 'success'); },
        onError: (e: any) => { showAlert('Failed to remove: ' + (e.response?.data?.detail || e.message), 'error'); },
    });

    const updateBoqFieldsMutation = useMutation({
        mutationFn: (data: { plantId: string } & Partial<ProjectPlantCreate>) => {
            const { plantId, ...payload } = data;
            return projectsApi.updatePlant(id!, plantId, payload as ProjectPlantCreate);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project', id] });
        },
        onError: (e: any) => {
            showAlert('Failed to update: ' + (e.response?.data?.detail || e.message), 'error');
        }
    });

    const handleUpdateBoqFields = useCallback(async (plantId: string, data: any) => {
        try {
            await updateBoqFieldsMutation.mutateAsync({ plantId, ...data });
        } catch (e) {
            // Error already shown in mutation onError
        }
    }, [updateBoqFieldsMutation]);

    const handleBulkEdit = async (data: { quantity?: number; unit?: string; optimum_height_size?: string; rate?: number }) => {
        if (selectedPlantIds.length === 0) return;
        setBulkUpdating(true);
        try {
            const promises = selectedPlantIds.map(plantId => {
                const pp = project?.plants.find(item => item.plant_id === plantId);
                const payload: ProjectPlantCreate = {
                    plant_id: plantId,
                    notes: pp?.notes,
                    quantity: data.quantity !== undefined ? data.quantity : pp?.quantity,
                    unit: data.unit !== undefined ? data.unit : pp?.unit,
                    optimum_height_size: data.optimum_height_size !== undefined ? data.optimum_height_size : pp?.optimum_height_size,
                    rate: data.rate !== undefined ? data.rate : pp?.rate,
                };
                return projectsApi.updatePlant(id!, plantId, payload);
            });
            await Promise.all(promises);
            queryClient.invalidateQueries({ queryKey: ['project', id] });
            showAlert('Bulk update completed successfully', 'success');
            setSelectedPlantIds([]);
        } catch (e: any) {
            showAlert('Bulk update failed: ' + (e.message || 'error'), 'error');
        } finally {
            setBulkUpdating(false);
        }
    };

    const handleSelectChange = useCallback((plantId: string, selected: boolean) => {
        setSelectedPlantIds(prev => {
            if (selected) {
                return prev.includes(plantId) ? prev : [...prev, plantId];
            } else {
                return prev.filter(id => id !== plantId);
            }
        });
    }, []);

    const handleSelectAllChange = useCallback((selected: boolean, visiblePlants: any[]) => {
        if (selected) {
            const allIds = visiblePlants.map(pp => pp.plant_id);
            setSelectedPlantIds(allIds);
        } else {
            setSelectedPlantIds([]);
        }
    }, []);

    /* ── Dialog helpers ── */
    const openAdd = useCallback(() => {
        setEditingPlantId(null);
        setSelectedPlantId('');
        setNotes('');
        setQuantity('');
        setUnit('');
        setOptimumHeightSize('');
        setRate('');
        setIsDialogOpen(true);
    }, []);
    const openEdit = useCallback((plantId: string) => {
        if (!project) return;
        const pp = project.plants.find(p => p.plant_id === plantId);
        if (!pp) return;
        setEditingPlantId(plantId);
        setSelectedPlantId(plantId);
        setNotes(pp.notes ?? '');
        setQuantity(pp.quantity !== undefined && pp.quantity !== null ? String(pp.quantity) : '');
        setUnit(pp.unit ?? '');
        setOptimumHeightSize(pp.optimum_height_size ?? '');
        setRate(pp.rate !== undefined && pp.rate !== null ? String(pp.rate) : '');
        setIsDialogOpen(true);
    }, [project]);
    const closeDialog = useCallback(() => {
        setIsDialogOpen(false);
        setEditingPlantId(null);
        setSelectedPlantId('');
        setNotes('');
        setQuantity('');
        setUnit('');
        setOptimumHeightSize('');
        setRate('');
    }, []);

    const handleDeletePlant = useCallback((plantId: string, plantName: string) => {
        confirm({ title: 'Remove Plant', message: `Remove "${plantName}" from this project?`, confirmText: 'Remove', cancelText: 'Cancel', onConfirm: () => deletePlantMutation.mutate(plantId) });
    }, [confirm, deletePlantMutation]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPlantId) { showAlert('Please select a plant', 'warning'); return; }
        const parsedQty = quantity.trim() ? parseFloat(quantity) : undefined;
        const parsedRate = rate.trim() ? parseFloat(rate) : undefined;
        const payload = {
            plant_id: selectedPlantId,
            notes: notes.trim() || undefined,
            quantity: parsedQty,
            unit: unit.trim() || undefined,
            optimum_height_size: optimumHeightSize.trim() || undefined,
            rate: parsedRate
        };
        editingPlantId ? updatePlantMutation.mutate(payload) : addPlantMutation.mutate(payload);
    };

    const isSaving = addPlantMutation.isPending || updatePlantMutation.isPending;

    /* ── Sort handler ── */
    const handleSort = useCallback((col: SortKey) => {
        setSortKey(prevKey => {
            if (prevKey === col) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return prevKey;
            }
            setSortDir('asc');
            return col;
        });
        setPage(1);
    }, []);

    /* ── Derived data ── */
    const uniqueCategories = useMemo(() => {
        if (!project) return [];
        const cats = new Set(project.plants.map(pp => pp.plant?.category).filter(Boolean) as string[]);
        return Array.from(cats).sort();
    }, [project]);

    const filteredSorted = useMemo(() => {
        if (!project) return [];
        const q = search.toLowerCase();

        return [...project.plants]
            .filter(pp => {
                const matchSearch = !q
                    || pp.plant?.common_name?.toLowerCase().includes(q)
                    || pp.plant?.scientific_name?.toLowerCase().includes(q)
                    || (pp.notes || '').toLowerCase().includes(q);
                const matchCat = categoryFilter === '__all__' || pp.plant?.category === categoryFilter;
                return matchSearch && matchCat;
            })
            .sort((a, b) => {
                let av = '', bv = '';
                if (sortKey === 'common_name') { av = a.plant?.common_name || ''; bv = b.plant?.common_name || ''; }
                else if (sortKey === 'scientific_name') { av = a.plant?.scientific_name || ''; bv = b.plant?.scientific_name || ''; }
                else if (sortKey === 'category') { av = a.plant?.category || ''; bv = b.plant?.category || ''; }
                else if (sortKey === 'planting_place') { av = a.plant?.planting_place || ''; bv = b.plant?.planting_place || ''; }
                else if (sortKey === 'notes') { av = a.notes || ''; bv = b.notes || ''; }
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            });
    }, [project, search, categoryFilter, sortKey, sortDir]);

    const boqGroups = useMemo(() => {
        const groups = new Map<string, typeof filteredSorted>();
        for (const pp of filteredSorted) {
            const cat = pp.plant?.category || 'Uncategorized';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat)!.push(pp);
        }
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filteredSorted]);

    const totalQuotationAmount = useMemo(() => {
        if (!project) return 0;
        return project.plants.reduce((sum, pp) => {
            const qty = pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : 0;
            const rate = pp.rate !== undefined && pp.rate !== null ? pp.rate : 0;
            return sum + (qty * rate);
        }, 0);
    }, [project]);

    const totalQuotationQty = useMemo(() => {
        if (!project) return 0;
        return project.plants.reduce((sum, pp) => {
            const qty = pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : 0;
            return sum + qty;
        }, 0);
    }, [project]);

    const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageSlice = filteredSorted.slice((safePage - 1) * pageSize, safePage * pageSize);

    /* ── Loading states ── */
    if (isLoading) return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
        </div>
    );
    if (!project) return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">Project not found.</p>
            <Button asChild variant="link" className="mt-2"><Link to="/projects">← Back to Projects</Link></Button>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto">
            {/* Back nav */}
            <div className="mb-6">
                <Button asChild variant="outline" size="sm">
                    <Link to="/projects"><ArrowLeft className="w-4 h-4 mr-2" />Back to Projects</Link>
                </Button>
            </div>

            {/* Project header card */}
            <div className="rounded-xl border border-border bg-white shadow-sm p-5 sm:p-6 mb-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight">{project.name}</h1>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                            {project.client_name && (
                                <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><User className="w-3.5 h-3.5" /> {project.client_name}</span>
                            )}
                            {project.location && (
                                <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="w-3.5 h-3.5" /> {project.location}</span>
                            )}
                        </div>
                        {project.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed mt-3">{project.description}</p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* ── Share link group ── */}
                        {shareLinkLoaded && (
                            <div className="flex items-center gap-1.5">
                                {shareLink ? (
                                    <>
                                        <button
                                            onClick={handleCopyLink}
                                            title={fullShareUrl || ''}
                                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                                        >
                                            <Link2 className="w-3.5 h-3.5 text-primary" />
                                            <span className="hidden sm:inline max-w-[140px] truncate text-xs text-muted-foreground">
                                                {fullShareUrl}
                                            </span>
                                            {copied
                                                ? <Check className="w-3.5 h-3.5 text-green-600" />
                                                : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                                        </button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 text-muted-foreground hover:text-foreground"
                                            onClick={() => generateShareMutation.mutate()}
                                            disabled={generateShareMutation.isPending}
                                            title="Regenerate link (new 2-day expiry)"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${generateShareMutation.isPending ? 'animate-spin' : ''}`} />
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => generateShareMutation.mutate()}
                                        disabled={generateShareMutation.isPending}
                                        className="h-9 gap-1.5"
                                    >
                                        <Link2 className="w-3.5 h-3.5" />
                                        {generateShareMutation.isPending ? 'Generating…' : 'Public Link'}
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* ── Download PDF button ── */}
                        <Button
                            variant="outline" size="sm"
                            className="h-9"
                            onClick={handleDownloadPdf}
                            disabled={pdfLoading}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Plants section */}
            <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">

                {/* Section header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Leaf className="w-4 h-4 text-primary" />
                        <h2 className="font-semibold text-foreground">Plants List</h2>
                        <Badge variant="secondary" className="tabular-nums">{project.plants.length}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/20">
                            <button
                                type="button"
                                onClick={() => setViewMode('standard')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'standard' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Standard List
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('boq')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'boq' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                BOQ View
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('quotation')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'quotation' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Quotation View
                            </button>
                        </div>
                        <Button size="sm" onClick={openAdd}>
                            <Plus className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">Add Plant</span>
                            <span className="sm:hidden">Add</span>
                        </Button>
                    </div>
                </div>

                {project.plants.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Leaf className="w-8 h-8 mb-3 opacity-20" />
                        <p className="text-sm">No plants added yet.</p>
                        <Button variant="link" size="sm" className="mt-1" onClick={openAdd}>Add the first plant</Button>
                    </div>
                ) : viewMode === 'boq' || viewMode === 'quotation' ? (
                    <>
                        {/* BOQ/Quotation Header Document Section */}
                        <div className="p-5 border-b border-border bg-gradient-to-r from-background to-[#fdfcfb]">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] tracking-wider uppercase font-semibold text-primary border-primary/20 bg-primary/5">
                                            {viewMode === 'boq' ? 'Landscape BOQ' : 'Landscape Quotation'}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                                        <div>
                                            <span className="font-semibold text-foreground mr-1.5">Client Name:</span>
                                            {project.client_name || <span className="opacity-40 italic">Not Specified</span>}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-foreground mr-1.5">Date:</span>
                                            {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <span className="font-semibold text-foreground mr-1.5">Location:</span>
                                            {project.location || <span className="opacity-40 italic">Not Specified</span>}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col items-end gap-2 shrink-0 md:border-l md:border-border md:pl-6">
                                    {/* Landschaft Logo */}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <svg viewBox="0 0 400 400" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                                            <g transform="translate(-85,0)">
                                                <path fill="#2d5a27" d="M125 70 Q125 40 155 40 H245 Q275 40 275 70 V190 H125 Z" />
                                                <path fill="#8aa87f" d="M125 210 H275 V360 H155 Q125 360 125 330 V210 Z" />
                                                <path fill="#c8b8a2" d="M295 210 H415 Q445 210 445 240 V330 Q445 360 415 360 H295 V210 Z" />
                                            </g>
                                        </svg>
                                        <span className="text-[10px] font-bold tracking-[0.25em] text-[#2d5a27] leading-none">LANDSCHAFT</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-border/50 flex-wrap">
                                <div>
                                    {viewMode === 'quotation' && (
                                        <div className="text-sm font-semibold text-primary bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                            <span>Total Quotation Amount:</span>
                                            <span className="text-base font-bold tabular-nums">
                                                {totalQuotationAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-8.5 font-medium border-green-600/30 hover:border-green-600/50 hover:bg-green-50/50 text-green-700 transition-colors" onClick={viewMode === 'boq' ? handleExportBoqExcel : handleExportQuotationExcel}>
                                        <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Export Excel
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8.5 font-medium border-red-600/30 hover:border-red-600/50 hover:bg-red-50/50 text-red-700 transition-colors" onClick={viewMode === 'boq' ? handleExportBoqPdf : handleExportQuotationPdf} disabled={pdfBoqLoading || pdfQuotationLoading}>
                                        {viewMode === 'boq' ? (
                                            pdfBoqLoading ? 'Generating PDF…' : <><Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF</>
                                        ) : (
                                            pdfQuotationLoading ? 'Generating PDF…' : <><Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF</>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Bulk Edit Toolbar */}
                        {selectedPlantIds.length > 0 && (
                            <div className="mx-5 my-3 p-4 bg-primary/5 border border-primary/20 rounded-xl flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-semibold text-primary">Bulk Edit Selected</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Modifying <span className="font-semibold text-foreground">{selectedPlantIds.length}</span> plants. Leave fields blank to keep their current values.
                                    </p>
                                </div>
                                <div className={`grid ${viewMode === 'quotation' ? 'grid-cols-4' : 'grid-cols-3'} gap-3 flex-1 max-w-xl`}>
                                    <div className="space-y-1">
                                        <Label htmlFor="bulk-unit" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Unit</Label>
                                        <Input
                                            id="bulk-unit"
                                            placeholder="e.g. Nos."
                                            className="h-8 text-xs bg-white"
                                            value={bulkUnit}
                                            onChange={(e) => setBulkUnit(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="bulk-qty" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quantity</Label>
                                        <Input
                                            id="bulk-qty"
                                            type="number"
                                            step="any"
                                            placeholder="e.g. 25"
                                            className="h-8 text-xs bg-white"
                                            value={bulkQty}
                                            onChange={(e) => setBulkQty(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="bulk-size" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Height / Size</Label>
                                        <Input
                                            id="bulk-size"
                                            placeholder="e.g. 2m"
                                            className="h-8 text-xs bg-white"
                                            value={bulkSize}
                                            onChange={(e) => setBulkSize(e.target.value)}
                                        />
                                    </div>
                                    {viewMode === 'quotation' && (
                                        <div className="space-y-1">
                                            <Label htmlFor="bulk-rate" className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rate</Label>
                                            <Input
                                                id="bulk-rate"
                                                type="number"
                                                step="any"
                                                placeholder="e.g. 150"
                                                className="h-8 text-xs bg-white"
                                                value={bulkRate}
                                                onChange={(e) => setBulkRate(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => {
                                            setSelectedPlantIds([]);
                                            setBulkRate('');
                                        }}
                                        disabled={bulkUpdating}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-8 text-xs bg-primary text-white hover:bg-primary/95"
                                        onClick={async () => {
                                            const qtyVal = bulkQty.trim() ? parseFloat(bulkQty) : undefined;
                                            const unitVal = bulkUnit.trim() ? bulkUnit : undefined;
                                            const sizeVal = bulkSize.trim() ? bulkSize : undefined;
                                            const rateVal = bulkRate.trim() ? parseFloat(bulkRate) : undefined;
                                            if (qtyVal === undefined && unitVal === undefined && sizeVal === undefined && rateVal === undefined) {
                                                showAlert('Please enter at least one value to update', 'warning');
                                                return;
                                            }
                                            await handleBulkEdit({
                                                quantity: qtyVal,
                                                unit: unitVal,
                                                optimum_height_size: sizeVal,
                                                rate: rateVal
                                            });
                                            setBulkQty('');
                                            setBulkUnit('');
                                            setBulkSize('');
                                            setBulkRate('');
                                        }}
                                        disabled={bulkUpdating}
                                    >
                                        {bulkUpdating ? 'Applying…' : 'Apply'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* BOQ / Quotation Table View */}
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="w-8 font-semibold text-center">#</TableHead>
                                        <TableHead className="w-10 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filteredSorted.length > 0 && selectedPlantIds.length === filteredSorted.length}
                                                onChange={(e) => handleSelectAllChange(e.target.checked, filteredSorted)}
                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none accent-primary"
                                            />
                                        </TableHead>
                                        <TableHead className="w-14 text-center font-semibold">Image</TableHead>
                                        <TableHead className="font-semibold w-36 max-w-[144px] truncate">Common Name</TableHead>
                                        <TableHead className="font-semibold w-40 max-w-[160px] truncate">Scientific Name</TableHead>
                                        <TableHead className="font-semibold text-center w-20 min-w-[70px]">Quantity</TableHead>
                                        <TableHead className="font-semibold text-center w-20 min-w-[70px]">Unit</TableHead>
                                        <TableHead className="font-semibold text-center w-24 min-w-[90px]">Height / Size (ft)</TableHead>
                                        {viewMode === 'quotation' && (
                                            <>
                                                <TableHead className="font-semibold text-center w-24 min-w-[90px]">Rate</TableHead>
                                                <TableHead className="font-semibold text-center w-28 min-w-[110px]">Amount</TableHead>
                                            </>
                                        )}
                                        <TableHead className="text-right font-semibold w-10">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredSorted.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={viewMode === 'quotation' ? 11 : 9} className="h-24 text-center text-sm text-muted-foreground">
                                                No plants found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        boqGroups.map(([category, pps]) => (
                                            <Fragment key={category}>
                                                {/* Group Header Row */}
                                                <TableRow className="bg-muted/5 hover:bg-muted/5 border-b border-border/80">
                                                    <TableCell colSpan={viewMode === 'quotation' ? 11 : 9} className="py-2 px-5 font-bold text-primary text-xs uppercase tracking-wider bg-muted/10 border-l-[3px] border-primary/70">
                                                        {category} ({pps.length})
                                                    </TableCell>
                                                </TableRow>
                                                {pps.map((pp, idx) => {
                                                    if (viewMode === 'boq') {
                                                        return (
                                                            <ProjectBoqRow
                                                                key={pp.plant_id}
                                                                pp={pp}
                                                                idx={idx}
                                                                onDelete={handleDeletePlant}
                                                                onUpdate={handleUpdateBoqFields}
                                                                isSelected={selectedPlantIds.includes(pp.plant_id)}
                                                                onSelectChange={handleSelectChange}
                                                            />
                                                        );
                                                    } else {
                                                        return (
                                                            <ProjectQuotationRow
                                                                key={pp.plant_id}
                                                                pp={pp}
                                                                idx={idx}
                                                                onDelete={handleDeletePlant}
                                                                onUpdate={handleUpdateBoqFields}
                                                                isSelected={selectedPlantIds.includes(pp.plant_id)}
                                                                onSelectChange={handleSelectChange}
                                                            />
                                                        );
                                                    }
                                                })}
                                            </Fragment>
                                        ))
                                    )}
                                    {viewMode === 'quotation' && filteredSorted.length > 0 && (
                                        <TableRow className="bg-muted/20 border-t border-border font-bold">
                                            <TableCell colSpan={5} className="text-right py-3 px-5 text-foreground font-bold">
                                                Total Summary:
                                            </TableCell>
                                            <TableCell className="text-center py-3 tabular-nums">
                                                {totalQuotationQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell colSpan={3}></TableCell>
                                            <TableCell className="text-center py-3 tabular-nums text-primary text-base">
                                                {totalQuotationAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                ) : (
                    <>
                        {/* ── Toolbar ── */}
                        <div className="flex flex-row flex-wrap items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[180px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search plants, notes…"
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                                    className="pl-8 h-8 text-sm bg-background w-full"
                                />
                            </div>

                            {/* Filters Group */}
                            <div className="flex items-center gap-2">
                                {/* Category filter */}
                                <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
                                    <SelectTrigger className="w-[125px] sm:w-[150px] h-8 text-sm bg-background">
                                        <SelectValue placeholder="All categories" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All categories</SelectItem>
                                        {uniqueCategories.map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Page size */}
                                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                                    <SelectTrigger className="w-[75px] sm:w-[90px] h-8 text-sm bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAGE_SIZE_OPTIONS.map(n => (
                                            <SelectItem key={n} value={String(n)}>{n} / pg</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* ── Table ── */}
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="w-8 font-semibold text-center">#</TableHead>
                                        <SortTh label="Plant" col="common_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="pl-0" />
                                        <SortTh label="Scientific" col="scientific_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                                        <SortTh label="Category" col="category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                                        <SortTh label="Place" col="planting_place" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                                        <SortTh label="Notes" col="notes" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                                        <TableHead className="text-right font-semibold w-20">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pageSlice.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                                                No plants match your search.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pageSlice.map((pp, idx) => (
                                            <ProjectPlantRowMemo
                                                key={pp.plant_id}
                                                pp={pp}
                                                idx={idx}
                                                safePage={safePage}
                                                pageSize={pageSize}
                                                onEdit={openEdit}
                                                onDelete={handleDeletePlant}
                                            />
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* ── Pagination ── */}
                        <div className="flex flex-col gap-2 px-5 py-3 border-t border-border bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground order-2 sm:order-1">
                                {filteredSorted.length === 0
                                    ? 'No results'
                                    : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filteredSorted.length)} of ${filteredSorted.length} plants`}
                            </p>
                            <div className="flex items-center gap-1.5 order-1 sm:order-2">
                                <Button
                                    variant="outline" size="icon"
                                    className="h-7 w-7"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage(1)}
                                    title="First page"
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="outline" size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    <ChevronLeft className="w-3 h-3 mr-1" /> Prev
                                </Button>
                                <span className="text-xs text-muted-foreground px-1 tabular-nums">
                                    {safePage} / {totalPages}
                                </span>
                                <Button
                                    variant="outline" size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Next <ChevronRight className="w-3 h-3 ml-1" />
                                </Button>
                                <Button
                                    variant="outline" size="icon"
                                    className="h-7 w-7"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage(totalPages)}
                                    title="Last page"
                                >
                                    <ChevronRight className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Add / Edit Plant Dialog ── */}
            <Dialog open={isDialogOpen} onOpenChange={(o) => !o && closeDialog()}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingPlantId ? 'Edit Plant Entry' : 'Add Plant to Project'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="pp-plant">Plant <span className="text-destructive">*</span></Label>
                            <Select value={selectedPlantId} onValueChange={setSelectedPlantId} disabled={!!editingPlantId} required>
                                <SelectTrigger id="pp-plant">
                                    <SelectValue placeholder="Select a plant…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                    {allPlants.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.common_name}{p.taxon?.name ? ` (${p.taxon.name})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="pp-quantity">Quantity</Label>
                                <Input
                                    id="pp-quantity"
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="e.g. 15"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="pp-unit">Unit</Label>
                                <Input
                                    id="pp-unit"
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    placeholder="e.g. Nos."
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="pp-height-size">Optimum Height / Size</Label>
                                <Input
                                    id="pp-height-size"
                                    value={optimumHeightSize}
                                    onChange={(e) => setOptimumHeightSize(e.target.value)}
                                    placeholder="e.g. 1.5 - 2.0 m"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="pp-rate">Rate</Label>
                                <Input
                                    id="pp-rate"
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={rate}
                                    onChange={(e) => setRate(e.target.value)}
                                    placeholder="e.g. 150.00"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pp-notes">Notes</Label>
                            <Input
                                id="pp-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Special instructions, placement..."
                            />
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>Cancel</Button>
                            <Button type="submit" disabled={isSaving || !selectedPlantId}>
                                {isSaving ? 'Saving…' : editingPlantId ? 'Save Changes' : 'Add to Project'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
};
