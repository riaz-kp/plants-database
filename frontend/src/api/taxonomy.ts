import { client } from "./client";
import type { TaxonTree, TaxonCreate, TaxonResponse } from "../types/taxon";

export interface TaxonDescriptionStatus {
    /** Taxa with no description (or the old autofill placeholder) */
    missing: number;
    /** Descriptions are being written in the background right now */
    running: boolean;
}

export const taxonomyApi = {
    getTree: async (): Promise<TaxonTree[]> => {
        const response = await client.get<TaxonTree[]>("/taxonomy/tree");
        return response.data;
    },

    create: async (data: TaxonCreate): Promise<TaxonResponse> => {
        const response = await client.post<TaxonResponse>("/taxonomy/", data);
        return response.data;
    },

    getById: async (id: string): Promise<TaxonResponse> => {
        const response = await client.get<TaxonResponse>(`/taxonomy/${id}`);
        return response.data;
    },

    update: async (id: string, data: Partial<TaxonCreate>): Promise<TaxonResponse> => {
        const response = await client.put<TaxonResponse>(`/taxonomy/${id}`, data);
        return response.data;
    },

    delete: async (id: string): Promise<any> => {
        const response = await client.delete(`/taxonomy/${id}`);
        return response.data;
    },

    getDescriptionStatus: async (): Promise<TaxonDescriptionStatus> => {
        const response = await client.get<TaxonDescriptionStatus>("/taxonomy/descriptions/status");
        return response.data;
    },

    /** Starts writing AI descriptions for every taxon without one */
    fillDescriptions: async (): Promise<TaxonDescriptionStatus> => {
        const response = await client.post<TaxonDescriptionStatus>("/taxonomy/descriptions/fill");
        return response.data;
    },

    ensurePath: async (path: { rank: string; name: string }[]): Promise<TaxonResponse> => {
        const response = await client.post<TaxonResponse>("/taxonomy/ensure-path", { path });
        return response.data;
    }
};
