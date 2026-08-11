import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useNavigate, useLocation, useSearch } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plantsApi } from '../../api/plants';
import { taxonomyApi } from '../../api/taxonomy';
import { projectsApi } from '../../api/projects';
import { PlantingPlace } from '../../types/plant';
import type { PlantCreate, Plant } from '../../types/plant';

import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { plantsQueryOptions, taxonomyTreeQueryOptions, categoriesQueryOptions } from '../../api/queryOptions';
import { aiApi } from '../../api/ai';
import { cn } from '../../lib-frontend/utils';
import { TaxonomyFormTable } from './TaxonomyFormTable';

// Shadcn components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Lucide icons
import {
    LayoutGrid,
    LayoutList,
    Plus,
    X,
    Upload,
    Sparkles,
    Loader2,
    MoreVertical,
    Leaf,
    FolderOpen,
    Pencil,
    Trash2,
    ArrowLeft,
    XCircle,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Check,
    Clock,
    ArrowDownAZ,
    ArrowUpAZ,
    History,
    AlertTriangle,
} from 'lucide-react';


/* ─── Memoized List Items ────────────────────────────────────────── */

interface PlantItemProps {
    plant: Plant;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onEdit: (plant: Plant) => void;
    onDelete: (id: string, name: string) => void;
    onAddToProject: (id: string) => void;
    onClick: (id: string, e: React.MouseEvent) => void;
}

const PlantCardMemo = memo(({ plant, isSelected, onSelect, onEdit, onDelete, onAddToProject, onClick }: PlantItemProps) => {
    const displayImage = plant.image_url || plant.icon_url;
    return (
        <Card
            role="button"
            tabIndex={0}
            onClick={(e) => onClick(plant.id, e)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick(plant.id, e as any);
                }
            }}
            className={cn(
                "group relative overflow-hidden cursor-pointer select-none transition-all duration-200 hover:shadow-lg hover:-translate-y-1 bg-card border-border/60",
                isSelected ? "ring-2 ring-primary border-primary" : ""
            )}
        >
            <div className="relative aspect-video w-full bg-muted overflow-hidden">
                {displayImage ? (
                    <img
                        src={displayImage}
                        alt={plant.common_name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Leaf size={32} className="text-muted-foreground/30" />
                    </div>
                )}

                <div className="absolute top-2 left-2 z-10">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); onSelect(plant.id); }}
                        onClick={e => e.stopPropagation()}
                        className="w-5 h-5 cursor-pointer accent-primary rounded-md border-white/20 bg-black/20 backdrop-blur-sm"
                    />
                </div>

                <div 
                    className="absolute top-2 right-2 z-10 actions-menu-container" 
                    role="presentation"
                    onClick={e => e.stopPropagation()}
                >
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-black/20 hover:bg-black/40 border-0 text-white backdrop-blur-md shadow-sm"
                            >
                                <MoreVertical size={16} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => onAddToProject(plant.id)}>
                                <FolderOpen className="mr-2 h-4 w-4" />
                                <span>Add to Project</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEdit(plant)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => onDelete(plant.id, plant.common_name)}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>

            <CardContent className="p-4 pt-3">
                <div className="flex flex-col gap-1 mb-3">
                    <h3 className="font-semibold text-foreground text-sm tracking-tight leading-snug line-clamp-1">
                        {plant.common_name}
                    </h3>
                    {plant.scientific_name && (
                        <p className="text-xs italic text-muted-foreground/80 leading-tight line-clamp-1">
                            {plant.scientific_name}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5 mt-auto">
                    <Badge variant="secondary" className="px-1.5 py-0 h-5 text-[9px] uppercase tracking-wider font-bold bg-secondary/50 border-secondary/20">
                        {plant.category}
                    </Badge>
                    <Badge variant="outline" className="px-1.5 py-0 h-5 text-[9px] uppercase tracking-wider font-bold border-muted-foreground/20 text-muted-foreground/90">
                        {plant.planting_place}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
});

const PlantTableRowMemo = memo(({ plant, isSelected, onSelect, onEdit, onDelete, onAddToProject, onClick }: PlantItemProps) => {
    return (
        <TableRow
            key={plant.id}
            onClick={(e) => onClick(plant.id, e)}
            className={cn(
                "cursor-pointer select-none transition-colors",
                isSelected ? 'bg-primary/5 hover:bg-primary/10' : ''
            )}
        >
            <TableCell className="px-4">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); onSelect(plant.id); }}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 cursor-pointer accent-primary"
                />
            </TableCell>
            <TableCell className="px-2">
                {plant.icon_url
                    ? <img src={plant.icon_url} alt="" className="w-8 h-8 object-cover rounded-md" />
                    : <div className="w-8 h-8 bg-muted rounded-md flex items-center justify-center"><Leaf size={12} className="text-muted-foreground" /></div>
                }
            </TableCell>
            <TableCell>
                <div className="font-medium text-foreground text-sm">{plant.common_name}</div>
                {plant.scientific_name && (
                    <div className="italic text-muted-foreground text-xs mt-0.5 sm:hidden">{plant.scientific_name}</div>
                )}
            </TableCell>
            <TableCell className="italic text-muted-foreground text-sm hidden sm:table-cell">{plant.scientific_name}</TableCell>
            <TableCell className="hidden md:table-cell">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide font-bold">{plant.category}</Badge>
            </TableCell>
            <TableCell className="hidden md:table-cell">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide font-bold">{plant.planting_place}</Badge>
            </TableCell>
            <TableCell className="actions-menu-container" onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                        >
                            <MoreVertical size={14} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => onAddToProject(plant.id)}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            <span>Add to Project</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(plant)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(plant.id, plant.common_name)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </TableRow>
    );
});

export const PlantManager = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();

    const [isCreating, setIsCreating] = useState(false);
    const [editingPlantId, setEditingPlantId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'card' | 'table'>('table');

    const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>(() => {
        const saved = sessionStorage.getItem('plantSelection');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        sessionStorage.setItem('plantSelection', JSON.stringify(selectedPlantIds));
    }, [selectedPlantIds]);

    const [showProjectModal, setShowProjectModal] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    const toggleSelection = useCallback((id: string) => {
        setSelectedPlantIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    }, []);

    // Queries
    const searchParams = useSearch({ strict: false }) as { category?: string };
    const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.getAll() });
    
    // Pagination state
    const PAGE_SIZE = 20;
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [filterCategory, setFilterCategory] = useState<string>(
        () => searchParams.category ?? '__all__'
    );
    const [filterIndoor, setFilterIndoor] = useState(false);
    const [filterOutdoor, setFilterOutdoor] = useState(false);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'recent' | 'oldest' | 'sci_asc' | 'sci_desc'>('recent');

    const plantingPlace = (filterIndoor && filterOutdoor) ? PlantingPlace.BOTH
                            : filterIndoor ? PlantingPlace.INDOOR
                            : filterOutdoor ? PlantingPlace.OUTDOOR
                            : undefined;

    const plantsParams = useMemo(() => ({
        skip: (currentPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        category: filterCategory === '__all__' ? undefined : filterCategory,
        planting_place: plantingPlace,
        sort: sortOrder
    }), [currentPage, PAGE_SIZE, debouncedSearch, filterCategory, plantingPlace, sortOrder]);

    const { data: plantsData, isLoading: plantsLoading } = useQuery(plantsQueryOptions(plantsParams));

    const plants = plantsData?.items || [];
    const totalPlantsInDb = plantsData?.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalPlantsInDb / PAGE_SIZE));

    // Prefetch functionality
    useEffect(() => {
        if (currentPage < totalPages) {
            const nextPage = currentPage + 1;
            const nextPrefetchParams = {
                ...plantsParams,
                skip: (nextPage - 1) * PAGE_SIZE,
            };
            queryClient.prefetchQuery(plantsQueryOptions(nextPrefetchParams));
        }
    }, [currentPage, totalPages, plantsParams, queryClient, PAGE_SIZE]);

    const { data: taxonomyTree } = useQuery(taxonomyTreeQueryOptions());
    const { data: categoriesOptions } = useQuery(categoriesQueryOptions());


    // Mutations
    const addPlantsToProjectMutation = useMutation({
        mutationFn: async (args: { projectId: string; plantIds: string[] }) => {
            const promises = args.plantIds.map(plantId =>
                projectsApi.addPlant(args.projectId, { plant_id: plantId, notes: '' })
            );
            return Promise.all(promises);
        },
        onSuccess: () => {
            showAlert(`Successfully added ${selectedPlantIds.length} plant(s) to project.`, 'success');
            setSelectedPlantIds([]);
            setShowProjectModal(false);
            setSelectedProjectId('');
        },
        onError: (error: any) => {
            showAlert("Failed to add plants to project: " + (error.response?.data?.detail || error.message), 'error');
        }
    });






    // Form State
    const [commonName, setCommonName] = useState('');
    const [category, setCategory] = useState<string>('');
    const [isIndoor, setIsIndoor] = useState(true);
    const [isOutdoor, setIsOutdoor] = useState(true);
    const [description, setDescription] = useState('');
    const [commonDiseases, setCommonDiseases] = useState('');
    const [scientificName, setScientificName] = useState('');
    const [taxonId, setTaxonId] = useState<string | null>(null);
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [iconUrl, setIconUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [careWater, setCareWater] = useState('');
    const [careSunlight, setCareSunlight] = useState('');
    const [careSoil, setCareSoil] = useState('');
    const [careMaintenance, setCareMaintenance] = useState('');
    const [iconPage, setIconPage] = useState(1);
    const [mainImagePage, setMainImagePage] = useState(1);

    useEffect(() => {
        if ((location.state as any)?.editPlant && plants && taxonomyTree) {
            handleEdit((location.state as any).editPlant);
            navigate({ to: '.', replace: true, state: {} as any });
        }
    }, [location.state, plants, taxonomyTree, navigate]);

    const [duplicatePlantData, setDuplicatePlantData] = useState<{
        plantData: PlantCreate;
        existingPlant: {
            id: string;
            common_name: string;
            scientific_name?: string;
        };
    } | null>(null);

    const createMutation = useMutation({
        mutationFn: ({ data, ignoreDuplicate }: { data: PlantCreate; ignoreDuplicate?: boolean }) =>
            plantsApi.create(data, ignoreDuplicate),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['plants'] });
            showAlert('Plant created successfully', 'success');
            setIsCreating(false);
            resetForm();
            setDuplicatePlantData(null);
            navigate({ to: '/plants', replace: true });
        },
        onError: (error: any, variables) => {
            if (error.response?.status === 409 && error.response?.data?.detail?.is_duplicate) {
                setDuplicatePlantData({
                    plantData: variables.data,
                    existingPlant: error.response.data.detail.existing_plant
                });
            } else {
                showAlert("Error creating plant: " + (error.response?.data?.detail || error.message), 'error');
            }
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string, data: Partial<PlantCreate> }) => plantsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['plants'] });
            showAlert('Plant updated successfully', 'success');
            setEditingPlantId(null);
            setIsCreating(false);
            resetForm();
            navigate({ to: '/plants', replace: true });
        },
        onError: (error: any) => {
            showAlert("Error updating plant: " + (error.response?.data?.detail || error.message), 'error');
        }
    });

    const aiMutation = useMutation({
        mutationFn: () => {
            if (!commonName.trim() && !scientificName.trim()) throw new Error("Please enter a common name or scientific name first");
            // Clear current images to show we are refreshing
            setIconUrl('');
            setImageUrl('');
            setIconPage(1);
            setMainImagePage(1);

            return aiApi.generatePlantDetails({
                commonName: commonName.trim() || undefined,
                scientificName: scientificName.trim() || undefined,
                categories: categoriesOptions?.items?.map(c => c.name)
            });
        },
        onSuccess: (data) => {
            if (data.common_name) setCommonName(data.common_name);
            if (data.description) setDescription(data.description);
            if (data.common_diseases) setCommonDiseases(data.common_diseases);
            if (data.category) setCategory(data.category);

            // Image fetching is now separate via iNaturalist
            const finalScientificName = data.taxonomy?.genus && data.taxonomy?.species
                ? `${data.taxonomy.genus} ${data.taxonomy.species}`
                : data.taxonomy?.species || scientificName;

            imageMutation.mutate({
                page: 1,
                name: finalScientificName || data.common_name || commonName
            });

            if (data.planting_place === 'Indoor') { setIsIndoor(true); setIsOutdoor(false); }
            else if (data.planting_place === 'Outdoor') { setIsIndoor(false); setIsOutdoor(true); }
            else if (data.planting_place === 'Indoor & Outdoor') { setIsIndoor(true); setIsOutdoor(true); }
            if (data.care_data) {
                setCareWater(data.care_data.water || '');
                setCareSunlight(data.care_data.sunlight || '');
                setCareSoil(data.care_data.soil || '');
                setCareMaintenance(data.care_data.maintenance || '');
            }
            if (data.taxonomy) {
                const path: { rank: string, name: string }[] = [];
                if (data.taxonomy.kingdom) path.push({ rank: 'Kingdom', name: data.taxonomy.kingdom });
                if (data.taxonomy.division) path.push({ rank: 'Division', name: data.taxonomy.division });
                if (data.taxonomy.class_name) path.push({ rank: 'Class', name: data.taxonomy.class_name });
                if (data.taxonomy.order) path.push({ rank: 'Order', name: data.taxonomy.order });
                if (data.taxonomy.family) path.push({ rank: 'Family', name: data.taxonomy.family });
                if (data.taxonomy.genus) path.push({ rank: 'Genus', name: data.taxonomy.genus });
                if (data.taxonomy.species) path.push({ rank: 'Species', name: data.taxonomy.species });
                if (path.length > 0) {
                    taxonomyApi.ensurePath(path).then((res) => {
                        setTaxonId(res.id);
                        queryClient.invalidateQueries({ queryKey: ['taxonomy', 'tree'] });
                    }).catch(console.error);
                }
                if (data.taxonomy.genus && data.taxonomy.species) setScientificName(`${data.taxonomy.genus} ${data.taxonomy.species}`);
                else if (data.taxonomy.species) setScientificName(data.taxonomy.species);
            }
            showAlert("Auto-filled details using AI!", 'success');
        },
        onError: (error: any) => {
            showAlert("AI Autofill failed: " + (error.response?.data?.detail || error.message), 'error');
        }
    });

    const imageMutation = useMutation({
        mutationFn: async ({ page, name, target = 'both' }: { page: number, name?: string, target?: 'icon' | 'image' | 'both' }) => {
            const searchName = name || scientificName.trim() || commonName.trim();
            if (!searchName) throw new Error("Please enter a common name or scientific name first");
            const data = await aiApi.fetchPlantImages({ plantName: searchName, page });
            return { ...data, target };
        },
        onSuccess: (data) => {
            if (data.target === 'both' || data.target === 'icon') {
                if (data.icon_url) setIconUrl(data.icon_url);
                setIconPage(data.page);
            }
            if (data.target === 'both' || data.target === 'image') {
                if (data.image_url) setImageUrl(data.image_url);
                setMainImagePage(data.page);
            }
        }
    });

    const regenerateIcon = () => {
        const nextPage = iconPage + 1;
        imageMutation.mutate({ page: nextPage, target: 'icon' });
    };

    const regenerateMainImage = () => {
        const nextPage = mainImagePage + 1;
        imageMutation.mutate({ page: nextPage, target: 'image' });
    };

    const deleteMutation = useMutation({
        mutationFn: plantsApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['plants'] });
            showAlert('Plant deleted successfully', 'success');
        },
        onError: (error: any) => {
            showAlert("Error deleting plant: " + (error.response?.data?.detail || error.message), 'error');
        }
    });

    const resetForm = useCallback(() => {
        setCommonName(''); setCategory(''); setIsIndoor(true); setIsOutdoor(true);
        setDescription(''); setCommonDiseases(''); setScientificName(''); setTaxonId(null);
        setIconFile(null); setImageFile(null); setIconUrl(''); setImageUrl('');
        setCareWater(''); setCareSunlight(''); setCareSoil(''); setCareMaintenance('');
        setIconPage(1);
        setMainImagePage(1);
    }, []);

    const handleEdit = useCallback((plant: Plant) => {
        setEditingPlantId(plant.id);
        setIsCreating(false);
        setCommonName(plant.common_name);
        setCategory(plant.category);
        setIsIndoor(plant.planting_place === PlantingPlace.INDOOR || plant.planting_place === PlantingPlace.BOTH);
        setIsOutdoor(plant.planting_place === PlantingPlace.OUTDOOR || plant.planting_place === PlantingPlace.BOTH);
        setDescription(plant.description || '');
        setCommonDiseases(plant.common_diseases || '');
        setScientificName(plant.scientific_name || '');
        setTaxonId(plant.taxon_id || null);
        setIconUrl(plant.icon_url || '');
        setImageUrl(plant.image_url || '');
        setIconFile(null); setImageFile(null);
        setCareWater(plant.care_data?.water || '');
        setCareSunlight(plant.care_data?.sunlight || '');
        setCareSoil(plant.care_data?.soil || '');
        setCareMaintenance(plant.care_data?.maintenance || '');
        setIconPage(1);
        setMainImagePage(1);
    }, []);

    const handleDelete = useCallback((id: string, name: string) => {
        confirm({
            title: 'Delete Plant',
            message: `Are you sure you want to delete ${name}? This action cannot be undone.`,
            confirmText: 'Delete',
            onConfirm: () => deleteMutation.mutate(id),
        });
    }, [confirm, deleteMutation]);


    const handleRowClick = useCallback((id: string, e: React.MouseEvent) => {
        if ((e.target as Element).closest('.actions-menu-container') ||
            (e.target as Element).closest('.dropdown-menu') ||
            (e.target as Element).tagName.toLowerCase() === 'input') return;
        navigate({ to: `/plants/${id}` as any });
    }, [navigate]);

    const openSingleProjectModal = useCallback((plantId: string) => {
        setSelectedPlantIds([plantId]);
        setShowProjectModal(true);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingPlantId(null);
        setIsCreating(false);
        navigate({ to: '/plants', replace: true });
    }, [navigate]);

    const toggleCreate = useCallback(() => {
        if (isCreating || editingPlantId) { cancelEdit(); }
        else { setEditingPlantId(null); resetForm(); setIsCreating(true); }
    }, [isCreating, editingPlantId, cancelEdit, resetForm]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isIndoor && !isOutdoor) {
            showAlert("Please select at least one Planting Place (Indoor or Outdoor)", 'warning');
            return;
        }
        setIsUploading(true);
        let finalIconUrl = iconUrl;
        let finalImageUrl = imageUrl;
        try {
            // Upload local file selections first
            if (iconFile) { const res = await plantsApi.uploadImage(iconFile, 'icon'); finalIconUrl = res.url; }
            if (imageFile) { const res = await plantsApi.uploadImage(imageFile, 'image'); finalImageUrl = res.url; }

            // Upload AI-fetched URLs (non-Cloudinary) to Cloudinary
            const isCloudinaryUrl = (url: string) => url.includes('res.cloudinary.com');

            if (!iconFile && finalIconUrl && !isCloudinaryUrl(finalIconUrl)) {
                try {
                    const res = await plantsApi.uploadImageFromUrl(finalIconUrl, 'icon');
                    finalIconUrl = res.url;
                } catch {
                    showAlert("Could not upload icon image to Cloudinary — the AI-suggested image may not exist. It will be skipped.", 'warning');
                    finalIconUrl = '';
                }
            }
            if (!imageFile && finalImageUrl && !isCloudinaryUrl(finalImageUrl)) {
                try {
                    const res = await plantsApi.uploadImageFromUrl(finalImageUrl, 'image');
                    finalImageUrl = res.url;
                } catch {
                    showAlert("Could not upload main image to Cloudinary — the AI-suggested image may not exist. It will be skipped.", 'warning');
                    finalImageUrl = '';
                }
            }
        } catch (error: any) {
            setIsUploading(false);
            showAlert("Error uploading images: " + (error.response?.data?.detail || error.message), 'error');
            return;
        }
        setIsUploading(false);

        let plantingPlace: PlantingPlace = PlantingPlace.BOTH;
        if (isIndoor && !isOutdoor) plantingPlace = PlantingPlace.INDOOR;
        if (!isIndoor && isOutdoor) plantingPlace = PlantingPlace.OUTDOOR;

        let parsedCareData = undefined;
        if (careWater.trim() || careSunlight.trim() || careSoil.trim() || careMaintenance.trim()) {
            parsedCareData = {
                water: careWater.trim() || undefined,
                sunlight: careSunlight.trim() || undefined,
                soil: careSoil.trim() || undefined,
                maintenance: careMaintenance.trim() || undefined,
            };
        }
        const plantData: Partial<PlantCreate> = {
            common_name: commonName, scientific_name: scientificName, category,
            planting_place: plantingPlace, description, common_diseases: commonDiseases,
            taxon_id: taxonId || undefined, icon_url: finalIconUrl || undefined,
            image_url: finalImageUrl || undefined, care_data: parsedCareData,
        };
        if (editingPlantId) { updateMutation.mutate({ id: editingPlantId, data: plantData }); }
        else { createMutation.mutate({ data: plantData as PlantCreate }); }
    };

    const displayedPlants = plants;

    // Reset to page 1 when filters/search change
    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterCategory, filterIndoor, filterOutdoor, sortOrder]);

    // ─── Reusable label ───────────────────────────────────────────────────────
    const FieldLabel = ({ children }: { children: React.ReactNode }) => (
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</span>
    );

    return (
        <TooltipProvider>
            <div className="pb-32">
                {/* ── Page Header ───────────────────────────────────────────── */}
                <div className="mb-6 space-y-4">
                    {/* Header Row: Title & Primary Action */}
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground truncate flex items-center gap-2">
                            {isCreating || editingPlantId ? 'Plant Editor' : 'Plant Catalog'}
                            {!isCreating && !editingPlantId && !!plantsData && (
                                <span className="text-xs font-medium text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full border border-border/50">
                                    {totalPlantsInDb}
                                </span>
                            )}
                        </h2>

                        {!isCreating && !editingPlantId && (
                            <Button
                                onClick={toggleCreate}
                                variant="default"
                                size="sm"
                                className="gap-1.5 shrink-0 shadow-sm"
                            >
                                <Plus size={16} />
                                <span className="hidden xs:inline">Add Plant</span>
                            </Button>
                        )}

                        {(isCreating || editingPlantId) && (
                            <Button
                                onClick={toggleCreate}
                                variant="outline"
                                size="sm"
                                className="gap-1.5 shrink-0 shadow-sm"
                            >
                                <ArrowLeft size={16} />
                                <span>Cancel</span>
                            </Button>
                        )}
                    </div>

                    {!isCreating && !editingPlantId && (
                        <div className="space-y-3">
                            {/* Controls Row: View Toggle & Import */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex bg-muted rounded-lg p-1">
                                    <Button
                                        variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setViewMode('card')}
                                        className="h-8 px-3 text-xs gap-1.5 focus-visible:ring-0"
                                    >
                                        <LayoutGrid size={13} />
                                        <span className="hidden sm:inline">Cards</span>
                                    </Button>
                                    <Button
                                        variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setViewMode('table')}
                                        className="h-8 px-3 text-xs gap-1.5 focus-visible:ring-0"
                                    >
                                        <LayoutList size={13} />
                                        <span className="hidden sm:inline">List</span>
                                    </Button>
                                </div>

                                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => navigate({ to: '/plants/import' })}
                                                className="h-8 px-3 text-xs gap-1.5 focus-visible:ring-0 hover:bg-background/50"
                                            >
                                                <Upload size={13} className="text-muted-foreground" />
                                                <span className="hidden sm:inline">Import CSV</span>
                                                <span className="sm:hidden">Import</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Import plants from a CSV file</TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Search: Full width on its own line */}
                            <div className="relative w-full">
                                <Input
                                    placeholder="Search catalog..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="h-9 bg-background/50 backdrop-blur-sm pr-8 placeholder:text-muted-foreground/60 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/20 transition-all shadow-sm"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                                    >
                                        <XCircle size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Filters Row: Category + Place + Sort in one scrollable line */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
                                {/* Category */}
                                <Select value={filterCategory} onValueChange={setFilterCategory}>
                                    <SelectTrigger className="w-[140px] shrink-0 h-9 bg-background/50 backdrop-blur-sm border-border/50 focus:ring-0 focus:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary/20 shadow-sm transition-all">
                                        <SelectValue placeholder="Categories" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All Categories</SelectItem>
                                        {categoriesOptions?.items?.map(c => (
                                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Indoor/Outdoor Toggle Group Style */}
                                <div className="flex items-center shrink-0 h-9 p-1 rounded-md border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm gap-1">
                                    <button
                                        onClick={() => setFilterIndoor(!filterIndoor)}
                                        className={cn(
                                            "pl-2 pr-3 h-full rounded text-[9px] font-bold uppercase tracking-widest transition-all duration-200 flex items-center gap-2",
                                            filterIndoor ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-all shrink-0",
                                            filterIndoor
                                                ? "bg-white border-white text-primary"
                                                : "border-muted-foreground/40 bg-white/10"
                                        )}>
                                            <Check className={cn("transition-all", filterIndoor ? "scale-100 opacity-100" : "scale-50 opacity-0")} size={10} strokeWidth={4} />
                                        </div>
                                        Indoor
                                    </button>
                                    <button
                                        onClick={() => setFilterOutdoor(!filterOutdoor)}
                                        className={cn(
                                            "pl-2 pr-3 h-full rounded text-[9px] font-bold uppercase tracking-widest transition-all duration-200 flex items-center gap-2",
                                            filterOutdoor ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-all shrink-0",
                                            filterOutdoor
                                                ? "bg-white border-white text-primary"
                                                : "border-muted-foreground/40 bg-white/10"
                                        )}>
                                            <Check className={cn("transition-all", filterOutdoor ? "scale-100 opacity-100" : "scale-50 opacity-0")} size={10} strokeWidth={4} />
                                        </div>
                                        Outdoor
                                    </button>
                                </div>

                                {/* Sort */}
                                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                                    <SelectTrigger className="w-[48px] shrink-0 h-9 bg-background/50 backdrop-blur-sm border-border/50 px-0 flex justify-center focus:ring-0 focus:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary/20 shadow-sm transition-all">
                                        <SelectValue>
                                            <div className="flex items-center justify-center w-full">
                                                {sortOrder === 'recent' && <Clock size={16} className="text-primary" />}
                                                {sortOrder === 'oldest' && <History size={16} className="text-primary" />}
                                                {(sortOrder === 'asc' || sortOrder === 'sci_asc') && <ArrowDownAZ size={16} className="text-primary" />}
                                                {(sortOrder === 'desc' || sortOrder === 'sci_desc') && <ArrowUpAZ size={16} className="text-primary" />}
                                            </div>
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        <SelectItem value="recent">
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-muted-foreground" />
                                                <span>Recent First</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="oldest">
                                            <div className="flex items-center gap-2">
                                                <History size={14} className="text-muted-foreground" />
                                                <span>Oldest First</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="asc">
                                            <div className="flex items-center gap-2">
                                                <ArrowDownAZ size={14} className="text-muted-foreground" />
                                                <span>Common A → Z</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="desc">
                                            <div className="flex items-center gap-2">
                                                <ArrowUpAZ size={14} className="text-muted-foreground" />
                                                <span>Common Z → A</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="sci_asc">
                                            <div className="flex items-center gap-2">
                                                <ArrowDownAZ size={14} className="text-muted-foreground" />
                                                <span>Scientific A → Z</span>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="sci_desc">
                                            <div className="flex items-center gap-2">
                                                <ArrowUpAZ size={14} className="text-muted-foreground" />
                                                <span>Scientific Z → A</span>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Create / Edit Form ────────────────────────────────────── */}
                {(isCreating || editingPlantId) && (
                    <Card className="mb-6 shadow-sm">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">
                                {editingPlantId ? 'Edit Plant' : 'New Plant'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Row 1: Common + Scientific */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <FieldLabel>Common Name</FieldLabel>
                                        <div className="flex gap-2">
                                            <Input
                                                value={commonName}
                                                onChange={e => setCommonName(e.target.value)}
                                                required
                                                placeholder="e.g. Snake Plant"
                                                className="flex-1"
                                            />
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        onClick={() => aiMutation.mutate()}
                                                        disabled={aiMutation.isPending || (!commonName.trim() && !scientificName.trim())}
                                                        className={`gap-1.5 shrink-0 font-semibold ${aiMutation.isPending ? '' : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-0'}`}
                                                        variant={aiMutation.isPending ? 'secondary' : 'default'}
                                                        size="sm"
                                                    >
                                                        {aiMutation.isPending
                                                            ? <><Loader2 size={13} className="animate-spin" /> Loading…</>
                                                            : <><Sparkles size={13} /> AI Fill</>
                                                        }
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Auto-fill plant details using AI (Groq)</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <FieldLabel>Scientific Name</FieldLabel>
                                        <Input
                                            value={scientificName}
                                            onChange={e => setScientificName(e.target.value)}
                                            placeholder="e.g. Sansevieria trifasciata"
                                            className="italic"
                                        />
                                    </div>
                                </div>

                                {/* Taxonomy */}
                                <div className="flex flex-col gap-1.5">
                                    <FieldLabel>Taxonomy Line</FieldLabel>
                                    <TaxonomyFormTable
                                        taxonomyTree={taxonomyTree || []}
                                        selectedTaxonId={taxonId}
                                        onChange={setTaxonId}
                                    />
                                </div>

                                {/* Category + Place */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <FieldLabel>Category</FieldLabel>
                                        <Select value={category} onValueChange={setCategory} required>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select category…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {categoriesOptions?.items?.map(c => (
                                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <FieldLabel>Planting Place</FieldLabel>
                                        <div className="flex gap-5 mt-1.5">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                                <input type="checkbox" checked={isIndoor} onChange={e => setIsIndoor(e.target.checked)} className="accent-primary" /> Indoor
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                                <input type="checkbox" checked={isOutdoor} onChange={e => setIsOutdoor(e.target.checked)} className="accent-primary" /> Outdoor
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="flex flex-col gap-1.5">
                                    <FieldLabel>Description</FieldLabel>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Brief description of this plant…"
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
                                    />
                                </div>

                                {/* Common Diseases */}
                                <div className="flex flex-col gap-1.5">
                                    <FieldLabel>Common Diseases & Pests</FieldLabel>
                                    <textarea
                                        value={commonDiseases}
                                        onChange={e => setCommonDiseases(e.target.value)}
                                        placeholder="Known diseases and pest susceptibility…"
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[60px]"
                                    />
                                </div>

                                <Separator />

                                {/* Care Info */}
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Care Information</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[
                                        { label: 'Water Needs', value: careWater, set: setCareWater, placeholder: 'Watering schedule & amount…' },
                                        { label: 'Sunlight Guidelines', value: careSunlight, set: setCareSunlight, placeholder: 'Prefers direct, indirect, shade…' },
                                        { label: 'Soil Type', value: careSoil, set: setCareSoil, placeholder: 'Soil drainage, pH, compost…' },
                                        { label: 'General Maintenance', value: careMaintenance, set: setCareMaintenance, placeholder: 'Pruning, fertilizer, repotting…' },
                                    ].map(({ label, value, set, placeholder }) => (
                                        <div key={label} className="flex flex-col gap-1.5">
                                            <FieldLabel>{label}</FieldLabel>
                                            <textarea
                                                value={value}
                                                onChange={e => set(e.target.value)}
                                                placeholder={placeholder}
                                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[60px]"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <Separator />

                                {/* Images */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <FieldLabel>Icon Image</FieldLabel>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={regenerateIcon}
                                                disabled={imageMutation.isPending || (!commonName.trim() && !scientificName.trim())}
                                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-primary"
                                            >
                                                {imageMutation.isPending && (imageMutation.variables?.target === 'icon' || imageMutation.variables?.target === 'both')
                                                    ? <Loader2 size={10} className="animate-spin" />
                                                    : <RefreshCw size={10} />
                                                }
                                                Regenerate
                                            </Button>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setIconFile(e.target.files?.[0] || null)}
                                            className="rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:bg-muted file:text-xs file:font-medium"
                                        />
                                        {(iconFile || iconUrl) && (
                                            <div className="relative group w-full max-w-[200px] mt-1">
                                                <img
                                                    src={iconFile ? URL.createObjectURL(iconFile) : iconUrl}
                                                    alt="Icon preview"
                                                    className="w-full h-auto rounded-lg border border-border"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => { setIconFile(null); setIconUrl(''); }}
                                                    className="absolute top-1 right-1 p-1.5 bg-destructive text-white rounded-full transition-all shadow-md hover:scale-110 z-10"
                                                    title="Remove image"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <FieldLabel>Main Image</FieldLabel>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={regenerateMainImage}
                                                disabled={imageMutation.isPending || (!commonName.trim() && !scientificName.trim())}
                                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-primary"
                                            >
                                                {imageMutation.isPending && (imageMutation.variables?.target === 'image' || imageMutation.variables?.target === 'both')
                                                    ? <Loader2 size={10} className="animate-spin" />
                                                    : <RefreshCw size={10} />
                                                }
                                                Regenerate
                                            </Button>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setImageFile(e.target.files?.[0] || null)}
                                            className="rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:bg-muted file:text-xs file:font-medium"
                                        />
                                        {(imageFile || imageUrl) && (
                                            <div className="relative group w-full mt-1">
                                                <img
                                                    src={imageFile ? URL.createObjectURL(imageFile) : imageUrl}
                                                    alt="Main image preview"
                                                    className="w-full h-auto max-h-[500px] rounded-lg border border-border"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => { setImageFile(null); setImageUrl(''); }}
                                                    className="absolute top-2 right-2 p-2 bg-destructive text-white rounded-full transition-all shadow-md hover:scale-110 z-10"
                                                    title="Remove image"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-1">
                                    <Button type="submit" disabled={isUploading} className="gap-1.5">
                                        {isUploading
                                            ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                                            : editingPlantId ? 'Save Changes' : 'Create Plant'
                                        }
                                    </Button>
                                    <Button type="button" variant="outline" onClick={cancelEdit} className="gap-1.5">
                                        <X size={14} /> Cancel
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* ── Plant List ────────────────────────────────────────────── */}
                {!isCreating && !editingPlantId && (
                    plantsLoading ? (
                        /* Loading skeletons */
                        viewMode === 'card' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Card key={i} className="p-4">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Skeleton className="w-9 h-9 rounded-lg" />
                                            <Skeleton className="h-4 flex-1" />
                                        </div>
                                        <Skeleton className="h-3 w-2/3 mb-2" />
                                        <div className="flex gap-1.5">
                                            <Skeleton className="h-4 w-16 rounded-full" />
                                            <Skeleton className="h-4 w-16 rounded-full" />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="p-0">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0">
                                            <Skeleton className="w-8 h-8 rounded-md" />
                                            <Skeleton className="h-4 flex-1" />
                                            <Skeleton className="h-4 w-32 hidden sm:block" />
                                            <Skeleton className="h-4 w-20 hidden md:block" />
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )
                    ) : viewMode === 'card' ? (
                        /* Card grid */
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                            {displayedPlants.map((plant: Plant) => (
                                <PlantCardMemo
                                    key={plant.id}
                                    plant={plant}
                                    isSelected={selectedPlantIds.includes(plant.id)}
                                    onSelect={toggleSelection}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    onAddToProject={openSingleProjectModal}
                                    onClick={handleRowClick}
                                />
                            ))}
                        </div>
                    ) : (
                        /* Table / list view */
                        <Card className="overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className="w-9 px-4">
                                            <input
                                                type="checkbox"
                                                checked={plants.length > 0 && plants.every(p => selectedPlantIds.includes(p.id))}
                                                onChange={(e) => { e.target.checked ? setSelectedPlantIds(plants.map((p: Plant) => p.id)) : setSelectedPlantIds([]); }}
                                                className="w-4 h-4 cursor-pointer accent-primary"
                                            />
                                        </TableHead>
                                        <TableHead className="w-11 px-2">Icon</TableHead>
                                        <TableHead
                                            className="cursor-pointer hover:text-foreground transition-colors group"
                                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                Common Name
                                                <div className={cn(
                                                    "opacity-0 group-hover:opacity-100 transition-opacity flex items-center shrink-0",
                                                    (sortOrder === 'asc' || sortOrder === 'desc') && "opacity-100"
                                                )}>
                                                    {sortOrder === 'desc' ? <ArrowUpAZ size={13} className="text-primary" /> : <ArrowDownAZ size={13} className={sortOrder === 'asc' ? "text-primary" : "text-muted-foreground/30"} />}
                                                </div>
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="hidden sm:table-cell cursor-pointer hover:text-foreground transition-colors group"
                                            onClick={() => setSortOrder(sortOrder === 'sci_asc' ? 'sci_desc' : 'sci_asc')}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                Scientific Name
                                                <div className={cn(
                                                    "opacity-0 group-hover:opacity-100 transition-opacity flex items-center shrink-0",
                                                    (sortOrder === 'sci_asc' || sortOrder === 'sci_desc') && "opacity-100"
                                                )}>
                                                    {sortOrder === 'sci_desc' ? <ArrowUpAZ size={13} className="text-primary" /> : <ArrowDownAZ size={13} className={sortOrder === 'sci_asc' ? "text-primary" : "text-muted-foreground/30"} />}
                                                </div>
                                            </div>
                                        </TableHead>
                                        <TableHead className="hidden md:table-cell">Category</TableHead>
                                        <TableHead className="hidden md:table-cell">Place</TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayedPlants.map((plant: Plant) => (
                                        <PlantTableRowMemo
                                            key={plant.id}
                                            plant={plant}
                                            isSelected={selectedPlantIds.includes(plant.id)}
                                            onSelect={toggleSelection}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                            onAddToProject={openSingleProjectModal}
                                            onClick={handleRowClick}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </Card>
                    )
                )}

                {/* ── Pagination ────────────────────────────────────────────── */}
                {!isCreating && !editingPlantId && totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                        <span>
                            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalPlantsInDb)} of {totalPlantsInDb}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                            >
                                <ChevronLeft size={14} />
                            </Button>
                            <span className="px-3 text-xs font-medium">{currentPage} / {totalPages}</span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                            >
                                <ChevronRight size={14} />
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── Bulk selection floating toolbar ───────────────────────── */}
                {!isCreating && !editingPlantId && selectedPlantIds.length > 0 && !showProjectModal && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50">
                        <span className="text-sm font-medium">{selectedPlantIds.length} plant(s) selected</span>
                        <Separator orientation="vertical" className="h-4 bg-background/30" />
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setShowProjectModal(true)}
                            className="gap-1.5 text-foreground"
                        >
                            <FolderOpen size={13} /> Add to Project
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedPlantIds([])}
                            className="gap-1.5 text-background/80 hover:text-background hover:bg-white/10"
                        >
                            <X size={13} /> Clear
                        </Button>
                    </div>
                )}

                {/* ── Add to Project Dialog ─────────────────────────────────── */}
                <Dialog open={showProjectModal} onOpenChange={setShowProjectModal}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Add {selectedPlantIds.length} Plant(s) to Project</DialogTitle>
                        </DialogHeader>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger>
                                <SelectValue placeholder="— Choose a Project —" />
                            </SelectTrigger>
                            <SelectContent>
                                {projectsData?.items?.map(proj => (
                                    <SelectItem key={proj.id} value={proj.id}>{proj.name} ({proj.client_name})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <DialogFooter className="mt-2">
                            <Button variant="outline" onClick={() => setShowProjectModal(false)}>Cancel</Button>
                            <Button
                                disabled={!selectedProjectId || addPlantsToProjectMutation.isPending}
                                onClick={() => addPlantsToProjectMutation.mutate({ projectId: selectedProjectId, plantIds: selectedPlantIds })}
                                className="gap-1.5"
                            >
                                {addPlantsToProjectMutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Adding…</> : 'Add Plants'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ── Duplicate Plant Dialog ─────────────────────────────────── */}
                <Dialog open={!!duplicatePlantData} onOpenChange={(open) => !open && setDuplicatePlantData(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                                Duplicate Plant Detected
                            </DialogTitle>
                            <DialogDescription className="pt-2 text-sm text-muted-foreground">
                                A plant with the same species/scientific name already exists in the catalog:
                            </DialogDescription>
                        </DialogHeader>
                        {duplicatePlantData && (
                            <div className="bg-destructive/5 rounded-xl border border-destructive/10 p-4 space-y-2.5">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Existing Plant</span>
                                    <span className="font-semibold text-foreground">
                                        {duplicatePlantData.existingPlant.common_name}
                                    </span>
                                    {duplicatePlantData.existingPlant.scientific_name && (
                                        <span className="text-sm italic text-muted-foreground">
                                            {duplicatePlantData.existingPlant.scientific_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        <DialogFooter className="mt-4 gap-2 sm:gap-0">
                            <Button 
                                variant="outline" 
                                onClick={() => setDuplicatePlantData(null)}
                            >
                                Skip / Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                disabled={createMutation.isPending}
                                onClick={() => {
                                    if (duplicatePlantData) {
                                        createMutation.mutate({ 
                                            data: duplicatePlantData.plantData, 
                                            ignoreDuplicate: true 
                                        });
                                    }
                                }}
                                className="gap-1.5"
                            >
                                {createMutation.isPending ? (
                                    <><Loader2 size={13} className="animate-spin" /> Adding…</>
                                ) : (
                                    'Ignore & Add Anyway'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </TooltipProvider>
    );
};
