import type { Plant } from "./plant";

export interface ProjectPlant {
    plant_id: string;
    notes?: string;
    plant?: Plant;
    quantity?: number;
    unit?: string;
    optimum_height_size?: string;
    rate?: number;
    /** When the plant was added to the project (ISO, UTC) */
    added_at?: string;
}

export interface Project {
    id: string;
    name: string;
    client_name?: string;
    location?: string;
    description?: string;
    landscape_architect?: string;
    architect?: string;
    /** Dates printed on the BOQ / quotation exports ("YYYY-MM-DD"); null means today. */
    boq_date?: string | null;
    quotation_date?: string | null;
    is_locked: boolean;
    created_at: string;
    updated_at: string;
    plants: ProjectPlant[];
}

export interface ProjectCreate {
    name: string;
    client_name?: string;
    location?: string;
    description?: string;
    landscape_architect?: string;
    architect?: string;
    boq_date?: string | null;
    quotation_date?: string | null;
}

export interface ProjectPlantCreate {
    plant_id: string;
    notes?: string;
    quantity?: number;
    unit?: string;
    optimum_height_size?: string;
    rate?: number;
}

export type ProjectResponse = Project;

/** A project as listed: how many plants it has, not the plants themselves. */
export interface ProjectSummary extends Omit<Project, 'plants'> {
    plant_count: number;
}

/** A catalog plant as shown in bulk import name matches */
export interface PlantBrief {
    id: string;
    common_name: string;
    scientific_name?: string | null;
    category?: string | null;
    icon_url?: string | null;
}

/** How one pasted plant name matched the catalog */
export interface PlantNameMatch {
    name: string;
    status: 'found' | 'in_project' | 'missing';
    plant?: PlantBrief | null;
    /** Other catalog plants with exactly this name */
    alternatives: PlantBrief[];
    /** Close catalog names for a missing name */
    suggestions: (PlantBrief & { in_project: boolean })[];
}

export interface ProjectImportResult {
    created: number;
    linked: number;
    already_in_project: number;
    failed: number;
    errors: string[];
    rows: { status: 'created' | 'linked' | 'already_in_project' | 'failed'; plant_id?: string | null; error?: string | null }[];
}

export interface ProjectListResponse {
    items: ProjectSummary[];
    total: number;
}
