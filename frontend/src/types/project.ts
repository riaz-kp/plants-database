import type { Plant } from "./plant";

export interface ProjectPlant {
    plant_id: string;
    notes?: string;
    plant?: Plant;
    quantity?: number;
    unit?: string;
    optimum_height_size?: string;
    rate?: number;
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

export interface ProjectListResponse {
    items: ProjectSummary[];
    total: number;
}
