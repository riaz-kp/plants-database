import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { plantsApi } from '../../api/plants';
import { taxonomyApi } from '../../api/taxonomy';
import type { TaxonTree } from '../../types/taxon';
import {
    ArrowLeft, Edit3, Bug, ListTree, Info, Sprout,
    Droplets, Sun, Wind, ScanText, MapPin, Tag
} from 'lucide-react';

export const PlantDetails = () => {
    const { id } = useParams({ strict: false }) as { id: string };

    const { data: plant, isLoading: plantLoading, error: plantError } = useQuery({
        queryKey: ['plants', id],
        queryFn: () => plantsApi.getById(id!),
        enabled: !!id,
    });

    const { data: tree } = useQuery({
        queryKey: ['taxonomy', 'tree'],
        queryFn: () => taxonomyApi.getTree(),
    });

    const getTaxonomyPath = (nodes: TaxonTree[], targetId: string, currentPath: TaxonTree[] = []): TaxonTree[] | null => {
        for (const node of nodes) {
            const path = [...currentPath, node];
            if (node.id === targetId) return path;
            if (node.children?.length) {
                const found = getTaxonomyPath(node.children, targetId, path);
                if (found) return found;
            }
        }
        return null;
    };

    const taxonomyPath = useMemo(() => {
        if (!tree || !plant?.taxon?.id) return null;
        return getTaxonomyPath(tree, plant.taxon.id);
    }, [tree, plant]);

    if (plantLoading) return (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Loading plant details…
        </div>
    );
    if (plantError || !plant) return (
        <div className="flex items-center justify-center h-64 text-destructive text-sm">
            Plant not found or error loading.
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto">
            {/* Nav */}
            <div className="flex items-center justify-between mb-8">
                <Link
                    to="/plants"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <ArrowLeft size={16} /> Back to Catalog
                </Link>
                <Link
                    to="/plants"
                    state={{ editPlant: plant } as any}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    <Edit3 size={16} /> Edit Plant
                </Link>
            </div>

            {/* Header */}
            <div className="flex flex-wrap gap-8 mb-10 items-center">
                <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-4 mb-3">
                        {plant.icon_url && (
                            <img
                                src={plant.icon_url}
                                alt={`${plant.common_name} icon`}
                                className="w-18 h-18 object-cover rounded-xl shadow-md border border-border"
                                style={{ width: 72, height: 72 }}
                            />
                        )}
                        <div>
                            <h1 className="text-4xl font-semibold tracking-tight text-foreground leading-tight">
                                {plant.common_name}
                            </h1>
                            <p className="text-base italic text-muted-foreground mt-0.5">
                                {plant.scientific_name || 'Scientific Name Unknown'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                            <Tag size={12} /> {plant.category}
                        </span>
                        <span className="inline-flex items-center gap-1.5 bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                            <MapPin size={12} /> {plant.planting_place}
                        </span>
                    </div>
                </div>
                {plant.image_url && (
                    <img
                        src={plant.image_url}
                        alt={`${plant.common_name} full view`}
                        className="flex-[1.2] min-w-[280px] max-h-[400px] w-full object-cover rounded-2xl shadow-xl"
                    />
                )}
            </div>

            {/* Body grid */}
            <div className="grid grid-cols-12 gap-6">
                {/* Main column */}
                <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
                    {/* Description */}
                    <div className="bg-white rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground mb-4 pb-3 border-b border-border">
                            <ScanText size={20} className="text-primary" /> Description
                        </h3>
                        <p className="text-sm leading-7 text-muted-foreground whitespace-pre-wrap">
                            {plant.description || 'No description provided.'}
                        </p>
                    </div>

                    {/* Care data */}
                    {plant.care_data && Object.keys(plant.care_data).length > 0 && (
                        <div className="bg-white rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground mb-4 pb-3 border-b border-border">
                                <Sprout size={20} className="text-primary" /> Care Data
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.entries(plant.care_data).map(([key, value]) => {
                                    let Icon = Info;
                                    if (key.toLowerCase().includes('water')) Icon = Droplets;
                                    if (key.toLowerCase().includes('sun')) Icon = Sun;
                                    if (key.toLowerCase().includes('soil')) Icon = ListTree;
                                    if (key.toLowerCase().includes('maintenance')) Icon = Wind;

                                    return (
                                        <div key={key} className="bg-muted/60 rounded-lg p-4">
                                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground mb-2">
                                                <Icon size={14} /> {key.replace(/_/g, ' ')}
                                            </div>
                                            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap m-0">
                                                {String(value)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Side column */}
                <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
                    {/* Diseases */}
                    {plant.common_diseases && (
                        <div className="bg-red-50 rounded-xl border border-red-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="flex items-center gap-2 text-base font-semibold text-red-700 mb-4 pb-3 border-b border-red-200">
                                <Bug size={20} /> Common Diseases & Pests
                            </h3>
                            <p className="text-sm leading-7 text-red-800/80 whitespace-pre-wrap m-0">
                                {plant.common_diseases}
                            </p>
                        </div>
                    )}

                    {/* Taxonomy */}
                    {taxonomyPath && taxonomyPath.length > 0 && (
                        <div className="bg-white rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground mb-4 pb-3 border-b border-border">
                                <ListTree size={20} className="text-primary" /> Taxonomy Lineage
                            </h3>
                            <div className="flex flex-col">
                                {taxonomyPath.map((t, i) => (
                                    <div
                                        key={t.id}
                                        className={`flex justify-between items-center py-2.5 ${i < taxonomyPath.length - 1 ? 'border-b border-dashed border-border' : ''}`}
                                    >
                                        <span className="text-[0.7rem] uppercase tracking-wider font-bold text-muted-foreground">
                                            {t.rank}
                                        </span>
                                        <span className="text-sm font-medium text-foreground">
                                            {t.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
