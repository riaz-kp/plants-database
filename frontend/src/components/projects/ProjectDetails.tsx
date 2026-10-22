import { useState, useMemo, useEffect, memo, useCallback, useRef, Fragment } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft, Download, Plus, Pencil, Trash2, Leaf,
    User, MapPin, ExternalLink, Search, ChevronUp, ChevronDown,
    ChevronsUpDown, Lock, LockOpen, LayoutGrid, LayoutList,
    Link2, Copy, Check, RefreshCw, FileSpreadsheet,
    CalendarDays, Trees, Building2, ClipboardList, Receipt, Loader2,
} from 'lucide-react';
import { exportProjectBoqPdf } from './ProjectBoqPdfDocument';
import { exportProjectQuotationPdf } from './ProjectQuotationPdfDocument';
import { exportProjectBoqExcel, exportProjectQuotationExcel } from './projectExcel';
import { pdfDate } from './ProjectPdfShared';

import { projectsApi } from '../../api/projects';
import type { ShareLinkInfo } from '../../api/projects';
import { plantsApi } from '../../api/plants';
import { taxonomyApi } from '../../api/taxonomy';
import type { ProjectPlantCreate, ProjectCreate, Project } from '../../types/project';
import type { Plant } from '../../types/plant';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { ProjectFormDialog } from './ProjectFormDialog';
import { useFloatingTableHeader } from '../../hooks/use-floating-table-header';
import { cn } from '../../lib-frontend/utils';

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

// BOQ / quotation: image + common name stay visible while scrolling sideways.
// Solid backgrounds so the scrolled columns slide underneath them.
const STICKY_IMG = 'sticky left-0 z-10 w-16 min-w-16 max-w-16 px-2';
const STICKY_NAME = 'sticky left-16 z-10 w-[120px] min-w-[120px] max-w-[120px] sm:w-36 sm:min-w-36 sm:max-w-36 border-r border-border/60 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)]';
const STICKY_ROW_BG = 'bg-[#fcfbfa] group-hover:bg-[#f9f7f4] group-focus-within:bg-[#f7f5f1]';
const STICKY_HEAD_BG = 'bg-[#f7f5f1]';

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
    locked: boolean;
    onEdit: (plantId: string, notes: string) => void;
    onDelete: (plantId: string, plantName: string) => void;
}

const ProjectPlantRowMemo = memo(({ pp, idx, locked, onEdit, onDelete }: ProjectPlantRowProps) => {
    return (
        <TableRow key={pp.plant_id} className="hover:bg-muted/20 transition-colors">
            {/* # */}
            <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                {idx + 1}
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
                {locked ? (
                    <Lock className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" aria-label="Locked" />
                ) : (
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
                )}
            </TableCell>
        </TableRow>
    );
});

/* ─── Card (standard view, card layout) ─── */
const ProjectPlantCardMemo = memo(({ pp, idx, locked, onEdit, onDelete }: ProjectPlantRowProps) => {
    const plant = pp.plant;
    const image = plant?.image_url || plant?.icon_url;
    return (
        <div className="group flex flex-col rounded-xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <Link
                to="/plants/$id"
                params={{ id: pp.plant_id }}
                className="relative block aspect-[4/3] bg-muted overflow-hidden"
                aria-label={`Open ${plant?.common_name ?? 'plant'}`}
            >
                {image ? (
                    <img src={image} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Leaf size={28} className="text-muted-foreground/30" />
                    </div>
                )}
                <span className="absolute top-2 left-2 min-w-6 h-6 px-1.5 rounded-full bg-black/45 text-white text-[11px] font-semibold tabular-nums flex items-center justify-center backdrop-blur-sm">
                    {idx + 1}
                </span>
            </Link>
            <div className="flex flex-col gap-1.5 p-3 flex-1">
                <div className="min-w-0">
                    <Link
                        to="/plants/$id"
                        params={{ id: pp.plant_id }}
                        className="block font-semibold text-sm text-foreground hover:text-primary leading-tight truncate"
                    >
                        {plant?.common_name}
                    </Link>
                    <p className="text-xs italic text-muted-foreground truncate mt-0.5">
                        {plant?.scientific_name || plant?.taxon?.name || 'Unknown species'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1">
                    {plant?.category && <Badge variant="outline" className="text-[10px] h-5 px-1.5">{plant.category}</Badge>}
                    {plant?.planting_place && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{plant.planting_place}</Badge>}
                </div>
                {pp.notes && <p className="text-xs text-muted-foreground line-clamp-2">{pp.notes}</p>}
                <div className="mt-auto pt-2 flex items-center justify-end gap-1 border-t border-border/60">
                    {locked ? (
                        <Lock className="w-3.5 h-3.5 my-1.5 text-muted-foreground/40" aria-label="Locked" />
                    ) : (
                        <>
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
                                onClick={() => onDelete(pp.plant_id, plant?.common_name || 'Plant')}
                                title="Remove plant"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});

/* ─── Searchable plant picker (add-plant dialog) ─── */
const PICKER_LIMIT = 60;

function PlantPicker({ plants, value, onChange, addedIds }: {
    plants: Plant[];
    value: string;
    onChange: (plantId: string) => void;
    addedIds: Set<string>;
}) {
    const [query, setQuery] = useState('');

    // Names starting with the query first, then names containing it
    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return plants
            .map(plant => {
                const names = [plant.common_name, plant.scientific_name, plant.taxon?.name]
                    .filter(Boolean)
                    .map(n => n!.toLowerCase());
                const rank = !q ? 1 : names.some(n => n.startsWith(q)) ? 0 : names.some(n => n.includes(q)) ? 1 : -1;
                return { plant, rank };
            })
            .filter(m => m.rank >= 0)
            .sort((a, b) => a.rank - b.rank || a.plant.common_name.localeCompare(b.plant.common_name))
            .map(m => m.plant);
    }, [plants, query]);

    const selected = plants.find(plant => plant.id === value);

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                    id="pp-plant"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter picks the best match instead of submitting the form
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const first = matches.find(plant => !addedIds.has(plant.id));
                        if (first) onChange(first.id);
                    }}
                    placeholder="Type a common or scientific name…"
                    autoComplete="off"
                    autoFocus
                    className="pl-8"
                />
            </div>
            <div role="listbox" aria-label="Plants" className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                {matches.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">No plants match “{query}”.</p>
                ) : matches.slice(0, PICKER_LIMIT).map(plant => {
                    const added = addedIds.has(plant.id);
                    const active = plant.id === value;
                    return (
                        <button
                            key={plant.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            disabled={added}
                            onClick={() => onChange(plant.id)}
                            className={cn(
                                'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                                active ? 'bg-primary/10' : 'hover:bg-muted/50',
                                added && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                            )}
                        >
                            {plant.icon_url ? (
                                <img src={plant.icon_url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                            ) : (
                                <span className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                                    <Leaf size={13} className="text-muted-foreground/50" />
                                </span>
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-foreground truncate">{plant.common_name}</span>
                                <span className="block text-xs italic text-muted-foreground truncate">
                                    {plant.scientific_name || plant.taxon?.name || '—'}
                                </span>
                            </span>
                            {added ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Added</span>
                            ) : active ? (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                            ) : null}
                        </button>
                    );
                })}
            </div>
            <p className="text-[11px] text-muted-foreground">
                {matches.length > PICKER_LIMIT
                    ? `Showing ${PICKER_LIMIT} of ${matches.length} — keep typing to narrow down.`
                    : `${matches.length} plant(s)`}
                {selected && <> · Selected: <span className="font-semibold text-foreground">{selected.common_name}</span></>}
            </p>
        </div>
    );
}

const VIEW_TABS = [
    { mode: 'standard', label: 'Standard', Icon: LayoutList },
    { mode: 'boq', label: 'BOQ', Icon: ClipboardList },
    { mode: 'quotation', label: 'Quotation', Icon: Receipt },
] as const;

/** Today as "YYYY-MM-DD" in local time (the value format of <input type="date">). */
const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ProjectBoqRow = ({
    pp,
    idx,
    onDelete,
    onUpdate,
    isSelected,
    locked,
    onSelectChange
}: {
    pp: any;
    idx: number;
    onDelete: (plantId: string, plantName: string) => void;
    onUpdate: (plantId: string, data: any) => Promise<void>;
    isSelected: boolean;
    locked: boolean;
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
        <TableRow className={`group bg-muted/10 hover:bg-muted/18 focus-within:bg-muted/25 transition-colors ${saving ? 'opacity-70 bg-muted/5' : ''}`}>
            {/* # */}
            <TableCell className="text-center font-medium text-xs tabular-nums text-muted-foreground w-8">
                {idx + 1}
            </TableCell>
            
            {/* Checkbox */}
            <TableCell className="w-10 text-center">
                <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={locked}
                    onChange={(e) => {
                        onSelectChange(pp.plant_id, e.target.checked);
                        e.target.focus();
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none accent-primary"
                />
            </TableCell>

            {/* Image */}
            <TableCell className={`${STICKY_IMG} ${STICKY_ROW_BG}`}>
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
            <TableCell className={`${STICKY_NAME} ${STICKY_ROW_BG} px-3 font-semibold text-foreground truncate`} title={pp.plant?.common_name}>
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
                    disabled={locked}
                    placeholder="—"
                    className="w-full text-sm font-semibold bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed tabular-nums text-center placeholder:text-muted-foreground/40"
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
                    disabled={locked}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed text-center placeholder:text-muted-foreground/40"
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
                    disabled={locked}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed text-center placeholder:text-muted-foreground/40"
                />
            </TableCell>

            {/* Actions */}
            <TableCell className="text-right w-10">
                <div className="flex items-center justify-end gap-1">
                    {locked ? (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground/40" aria-label="Locked" />
                    ) : (
                    <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(pp.plant_id, pp.plant?.common_name || 'Plant')}
                        title="Remove plant"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    )}
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
    locked,
    onSelectChange
}: {
    pp: any;
    idx: number;
    onDelete: (plantId: string, plantName: string) => void;
    onUpdate: (plantId: string, data: any) => Promise<void>;
    isSelected: boolean;
    locked: boolean;
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
        <TableRow className={`group bg-muted/10 hover:bg-muted/18 focus-within:bg-muted/25 transition-colors ${saving ? 'opacity-70 bg-muted/5' : ''}`}>
            <TableCell className="text-center font-medium text-xs tabular-nums text-muted-foreground w-8">
                {idx + 1}
            </TableCell>
            
            <TableCell className="w-10 text-center">
                <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={locked}
                    onChange={(e) => {
                        onSelectChange(pp.plant_id, e.target.checked);
                        e.target.focus();
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none accent-primary"
                />
            </TableCell>

            <TableCell className={`${STICKY_IMG} ${STICKY_ROW_BG}`}>
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

            <TableCell className={`${STICKY_NAME} ${STICKY_ROW_BG} px-3 font-semibold text-foreground truncate`} title={pp.plant?.common_name}>
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
                    disabled={locked}
                    placeholder="—"
                    className="w-full text-sm font-semibold bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed tabular-nums text-center placeholder:text-muted-foreground/40"
                />
            </TableCell>

            <TableCell className="w-20 min-w-[70px]">
                <input
                    type="text"
                    value={localUnit}
                    onChange={(e) => setLocalUnit(e.target.value)}
                    onBlur={() => handleBlur('unit', localUnit)}
                    onKeyDown={handleKeyDown}
                    disabled={locked}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed text-center placeholder:text-muted-foreground/40"
                />
            </TableCell>

            <TableCell className="w-24 min-w-[90px]">
                <input
                    type="text"
                    value={localSize}
                    onChange={(e) => setLocalSize(e.target.value)}
                    onBlur={() => handleBlur('optimum_height_size', localSize)}
                    onKeyDown={handleKeyDown}
                    disabled={locked}
                    placeholder="—"
                    className="w-full text-sm font-medium bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed text-center placeholder:text-muted-foreground/40"
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
                    disabled={locked}
                    placeholder="0.00"
                    className="w-full text-sm font-semibold bg-white border border-border shadow-sm hover:border-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 rounded px-1.5 py-1 transition-all h-8 text-foreground focus:outline-none disabled:bg-muted/30 disabled:shadow-none disabled:cursor-not-allowed tabular-nums text-center placeholder:text-muted-foreground/40"
                />
            </TableCell>

            <TableCell className="w-28 min-w-[110px] text-center font-bold text-sm text-primary tabular-nums">
                {amount !== null ? `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </TableCell>

            <TableCell className="text-right w-10">
                <div className="flex items-center justify-end gap-1">
                    {locked ? (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground/40" aria-label="Locked" />
                    ) : (
                    <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(pp.plant_id, pp.plant?.common_name || 'Plant')}
                        title="Remove plant"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    )}
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
    const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
    const [standardLayout, setStandardLayout] = useState<'list' | 'cards'>(() => {
        try { return localStorage.getItem('projectPlantsLayout') === 'cards' ? 'cards' : 'list'; } catch { return 'list'; }
    });
    const changeStandardLayout = (layout: 'list' | 'cards') => {
        setStandardLayout(layout);
        try { localStorage.setItem('projectPlantsLayout', layout); } catch { /* storage unavailable */ }
    };
    const boqTableRef = useRef<HTMLTableElement>(null);
    const bulkBarRef = useRef<HTMLDivElement>(null);

    const [pdfLoading, setPdfLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'standard' | 'boq' | 'quotation'>('standard');
    const [pdfBoqLoading, setPdfBoqLoading] = useState(false);
    const [pdfQuotationLoading, setPdfQuotationLoading] = useState(false);
    const [excelLoading, setExcelLoading] = useState(false);
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
            await exportProjectQuotationPdf(project, imgCache, project.name, pdfDate(project.quotation_date));
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
            await exportProjectBoqPdf(project, imgCache, project.name, pdfDate(project.boq_date));
        } catch (e) {
            console.error(e);
            showAlert('BOQ PDF export failed', 'error');
        } finally {
            setPdfBoqLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (!project) return;
        setExcelLoading(true);
        try {
            if (viewMode === 'boq') await exportProjectBoqExcel(project, pdfDate(project.boq_date));
            else await exportProjectQuotationExcel(project, pdfDate(project.quotation_date));
        } catch (e) {
            console.error(e);
            showAlert('Excel export failed', 'error');
        } finally {
            setExcelLoading(false);
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

    const updateProjectMutation = useMutation({
        mutationFn: (data: ProjectCreate) => projectsApi.update(id!, data),
        onSuccess: (updated) => {
            queryClient.setQueryData(['project', id], updated);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project updated', 'success');
            setIsEditProjectOpen(false);
        },
        onError: (e: any) => { showAlert('Failed to update project: ' + (e.response?.data?.detail || e.message), 'error'); },
    });

    // BOQ / quotation date printed on the exports, saved with the project
    const docDateMutation = useMutation({
        mutationFn: (patch: Pick<ProjectCreate, 'boq_date' | 'quotation_date'>) =>
            projectsApi.update(id!, { name: project!.name, ...patch }),
        onMutate: (patch) => {
            const previous = queryClient.getQueryData<Project>(['project', id]);
            queryClient.setQueryData<Project>(['project', id], old => old && { ...old, ...patch });
            return { previous };
        },
        onError: (e: any, _patch, ctx) => {
            queryClient.setQueryData(['project', id], ctx?.previous);
            showAlert('Failed to save date: ' + (e.response?.data?.detail || e.message), 'error');
        },
        onSuccess: (updated) => queryClient.setQueryData(['project', id], updated),
    });

    const lockMutation = useMutation({
        mutationFn: (isLocked: boolean) => projectsApi.setLocked(id!, isLocked),
        onSuccess: (updated) => {
            queryClient.setQueryData(['project', id], updated);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setSelectedPlantIds([]);
            showAlert(updated.is_locked ? 'Project locked — editing is disabled' : 'Project unlocked', 'success');
        },
        onError: (e: any) => { showAlert('Failed to change lock: ' + (e.response?.data?.detail || e.message), 'error'); },
    });

    const handleToggleLock = () => {
        if (!project) return;
        if (project.is_locked) {
            confirm({
                title: 'Unlock Project',
                message: `Unlock "${project.name}"? Plants, quantities and project details can be edited again.`,
                confirmText: 'Unlock',
                cancelText: 'Cancel',
                onConfirm: () => lockMutation.mutate(false),
            });
        } else {
            lockMutation.mutate(true);
        }
    };

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


    // BOQ / quotation column headers float under the page top (or the bulk edit bar)
    const getHeaderTop = useCallback(() => {
        const main = boqTableRef.current?.closest('main');
        let top = main ? main.getBoundingClientRect().top : 0;
        if (bulkBarRef.current) top = Math.max(top, bulkBarRef.current.getBoundingClientRect().bottom + 6);
        return top;
    }, []);
    useFloatingTableHeader(boqTableRef, getHeaderTop, [viewMode, filteredSorted.length, selectedPlantIds.length > 0, isLoading]);

    const projectPlantIds = useMemo(() => new Set(project?.plants.map(pp => pp.plant_id) ?? []), [project]);

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

    const locked = project.is_locked;
    const docDateField = viewMode === 'quotation' ? 'quotation_date' : 'boq_date';
    const docDateIso = (viewMode === 'quotation' ? project.quotation_date : project.boq_date) || todayIso();
    const projectDetails = [
        { label: 'Client', value: project.client_name, Icon: User },
        { label: 'Location', value: project.location, Icon: MapPin },
        { label: 'Landscape Architect', value: project.landscape_architect, Icon: Trees },
        { label: 'Architect', value: project.architect, Icon: Building2 },
    ];
    const exportingPdf = pdfBoqLoading || pdfQuotationLoading;

    return (
        <div className="max-w-5xl mx-auto">
            {/* Back nav */}
            <div className="mb-6">
                <Button asChild variant="outline" size="sm">
                    <Link to="/projects"><ArrowLeft className="w-4 h-4 mr-2" />Back to Projects</Link>
                </Button>
            </div>

            {/* Project header card: details + actions for the current view */}
            <div className="rounded-xl border border-border bg-white shadow-sm p-5 sm:p-6 mb-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight">{project.name}</h1>
                        {locked && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                                <Lock className="w-3 h-3" /> Locked
                            </Badge>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 md:justify-end">
                        {viewMode === 'standard' ? (
                            <>
                                {/* ── Edit project ── */}
                                <Button
                                    variant="outline" size="sm"
                                    className="h-9"
                                    onClick={() => setIsEditProjectOpen(true)}
                                    disabled={locked}
                                    title={locked ? 'Unlock the project to edit it' : 'Edit project details'}
                                >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                </Button>

                                {/* ── Lock / unlock ── */}
                                <Button
                                    variant={locked ? 'default' : 'outline'} size="sm"
                                    className="h-9"
                                    onClick={handleToggleLock}
                                    disabled={lockMutation.isPending}
                                    title={locked ? 'Unlock to allow editing' : 'Lock to prevent any further edits'}
                                >
                                    {locked ? <LockOpen className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                                    {locked ? 'Unlock' : 'Lock'}
                                </Button>

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
                            </>
                        ) : (
                            <>
                                {/* Date printed on this view's PDF / Excel */}
                                <label
                                    className={cn(
                                        'flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-md border border-input bg-white text-sm',
                                        locked && 'opacity-60'
                                    )}
                                    title={locked ? 'Unlock the project to change the date' : 'Date printed on the PDF and Excel'}
                                >
                                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {viewMode === 'boq' ? 'BOQ date' : 'Quotation date'}
                                    </span>
                                    <input
                                        type="date"
                                        value={docDateIso}
                                        disabled={locked}
                                        onChange={(e) => docDateMutation.mutate({ [docDateField]: e.target.value || null })}
                                        aria-label={viewMode === 'boq' ? 'BOQ date' : 'Quotation date'}
                                        className="bg-transparent text-sm text-foreground focus:outline-none disabled:cursor-not-allowed"
                                    />
                                </label>
                                <Button
                                    variant="outline" size="sm"
                                    className="h-9 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                                    onClick={handleExportExcel}
                                    disabled={excelLoading}
                                >
                                    {excelLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                                    {excelLoading ? 'Preparing…' : 'Export Excel'}
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-9"
                                    onClick={viewMode === 'boq' ? handleExportBoqPdf : handleExportQuotationPdf}
                                    disabled={exportingPdf}
                                >
                                    {exportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                    {exportingPdf ? 'Generating…' : 'Export PDF'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 mt-5 pt-4 border-t border-border/70">
                    {projectDetails.map(({ label, value, Icon }) => (
                        <div key={label} className="min-w-0">
                            <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <Icon className="w-3 h-3 shrink-0" /> {label}
                            </dt>
                            <dd className={cn('mt-0.5 text-sm truncate', value ? 'text-foreground' : 'text-muted-foreground/50')} title={value}>
                                {value || '—'}
                            </dd>
                        </div>
                    ))}
                </dl>
                {project.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed mt-4 max-w-3xl">{project.description}</p>
                )}
            </div>

            {/* Plants section */}
            <div className="rounded-xl border border-border bg-white shadow-sm overflow-clip">

                {/* Section header: title + totals, view tabs, add */}
                <div className="flex flex-col gap-3 px-4 sm:px-5 py-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                            <Leaf className="w-4 h-4 text-primary shrink-0" />
                            <h2 className="font-semibold text-foreground">Plants</h2>
                            <Badge variant="secondary" className="tabular-nums">{project.plants.length}</Badge>
                            {viewMode === 'boq' && project.plants.length > 0 && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    Total qty <span className="font-semibold text-foreground tabular-nums">{totalQuotationQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                </span>
                            )}
                            {viewMode === 'quotation' && project.plants.length > 0 && (
                                <span className="text-xs text-primary bg-primary/5 border border-primary/20 rounded-md px-2 py-0.5 whitespace-nowrap">
                                    Total <span className="font-bold tabular-nums">{totalQuotationAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </span>
                            )}
                        </div>
                        {/* Add button sits here on phones */}
                        <Button size="sm" onClick={openAdd} disabled={locked} className="sm:hidden shrink-0">
                            <Plus className="w-4 h-4 mr-1.5" />
                            Add Plant
                        </Button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div role="tablist" aria-label="Plants view" className="flex flex-1 sm:flex-initial items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
                            {VIEW_TABS.map(({ mode, label, Icon }) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={viewMode === mode}
                                    onClick={() => setViewMode(mode)}
                                    className={cn(
                                        'flex flex-1 sm:flex-initial items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                                        viewMode === mode ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" /> {label}
                                </button>
                            ))}
                        </div>
                        <Button size="sm" onClick={openAdd} disabled={locked} className="hidden sm:flex shrink-0">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Plant
                        </Button>
                    </div>
                </div>

                {project.plants.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Leaf className="w-8 h-8 mb-3 opacity-20" />
                        <p className="text-sm">No plants added yet.</p>
                        {!locked && <Button variant="link" size="sm" className="mt-1" onClick={openAdd}>Add the first plant</Button>}
                    </div>
                ) : viewMode === 'boq' || viewMode === 'quotation' ? (
                    <>
                        {/* Bulk Edit Toolbar — phones: title + buttons on top, inputs below; wider: title, then inputs + buttons */}
                        {selectedPlantIds.length > 0 && !locked && (
                            <div ref={bulkBarRef} className="sticky top-2 z-30 mx-3 sm:mx-5 my-3 p-3 sm:p-4 bg-[#f5f7f4] border border-primary/25 rounded-xl shadow-lg grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="col-start-1 row-start-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                                    <h4 className="text-sm font-semibold text-primary">
                                        Bulk Edit Selected
                                        <span className="ml-1.5 text-xs font-medium text-foreground tabular-nums">({selectedPlantIds.length})</span>
                                    </h4>
                                    <p className="hidden sm:block text-xs text-muted-foreground">
                                        Leave a field blank to keep its current value.
                                    </p>
                                </div>
                                <div className={`col-span-2 row-start-2 sm:col-span-1 sm:col-start-1 grid ${viewMode === 'quotation' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-2 sm:gap-3`}>
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
                                <div className="col-start-2 row-start-1 sm:row-start-2 sm:self-end flex items-center gap-2">
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
                            <Table ref={boqTableRef}>
                                <TableHeader className="relative z-20 [&_th]:bg-[#f7f5f1] [&[data-floating]_th]:shadow-[0_6px_6px_-6px_rgba(0,0,0,0.3)]">
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="w-8 font-semibold text-center">#</TableHead>
                                        <TableHead className="w-10 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filteredSorted.length > 0 && selectedPlantIds.length === filteredSorted.length}
                                                disabled={locked}
                                                onChange={(e) => handleSelectAllChange(e.target.checked, filteredSorted)}
                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none accent-primary"
                                            />
                                        </TableHead>
                                        <TableHead className={`${STICKY_IMG} ${STICKY_HEAD_BG} text-center font-semibold`}>Image</TableHead>
                                        <TableHead className={`${STICKY_NAME} ${STICKY_HEAD_BG} px-3 font-semibold truncate`}>Common Name</TableHead>
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
                                                <TableRow className="bg-muted/20 hover:bg-muted/20 border-y border-border/60">
                                                    <TableCell colSpan={viewMode === 'quotation' ? 11 : 9} className="py-2.5 px-5 font-bold text-primary text-xs uppercase tracking-wider bg-muted/15 border-l-[3px] border-primary">
                                                        <span className="sticky left-5">{category} ({pps.length})</span>
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
                                                                locked={locked}
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
                                                                locked={locked}
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
                                    onChange={e => setSearch(e.target.value)}
                                    className="pl-8 h-8 text-sm bg-background w-full"
                                />
                            </div>

                            {/* Filters Group */}
                            <div className="flex items-center gap-2">
                                {/* Category filter */}
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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

                                {/* List / card layout */}
                                <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 bg-background">
                                    <Button
                                        variant={standardLayout === 'list' ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => changeStandardLayout('list')}
                                        aria-pressed={standardLayout === 'list'}
                                        title="List view"
                                    >
                                        <LayoutList className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                        variant={standardLayout === 'cards' ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => changeStandardLayout('cards')}
                                        aria-pressed={standardLayout === 'cards'}
                                        title="Card view"
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {standardLayout === 'cards' ? (
                            filteredSorted.length === 0 ? (
                                <p className="h-24 flex items-center justify-center text-sm text-muted-foreground">No plants match your search.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-3 sm:p-4">
                                    {filteredSorted.map((pp, idx) => (
                                        <ProjectPlantCardMemo
                                            key={pp.plant_id}
                                            pp={pp}
                                            idx={idx}
                                            locked={locked}
                                            onEdit={openEdit}
                                            onDelete={handleDeletePlant}
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                        /* ── Table ── */
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
                                    {filteredSorted.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                                                No plants match your search.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredSorted.map((pp, idx) => (
                                            <ProjectPlantRowMemo
                                                key={pp.plant_id}
                                                pp={pp}
                                                idx={idx}
                                                locked={locked}
                                                onEdit={openEdit}
                                                onDelete={handleDeletePlant}
                                            />
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        )}

                        {(search || categoryFilter !== '__all__') && (
                            <p className="px-5 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
                                Showing {filteredSorted.length} of {project.plants.length} plants
                            </p>
                        )}
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
                            {editingPlantId ? (
                                <p className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm text-foreground">
                                    {allPlants.find(p => p.id === selectedPlantId)?.common_name
                                        ?? project.plants.find(pp => pp.plant_id === selectedPlantId)?.plant?.common_name}
                                </p>
                            ) : (
                                <PlantPicker
                                    plants={allPlants}
                                    value={selectedPlantId}
                                    onChange={setSelectedPlantId}
                                    addedIds={projectPlantIds}
                                />
                            )}
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

            {/* ── Edit Project Dialog ── */}
            <ProjectFormDialog
                open={isEditProjectOpen}
                project={project}
                isSaving={updateProjectMutation.isPending}
                onClose={() => setIsEditProjectOpen(false)}
                onSubmit={(data) => updateProjectMutation.mutate(data)}
            />

        </div>
    );
};
