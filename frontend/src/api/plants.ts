import { client } from "./client";
import type { PlantCreate, PlantResponse, PlantListResponse } from "../types/plant";

export const plantsApi = {
    getAll: async (params?: { 
        category?: string; 
        planting_place?: string; 
        search?: string; 
        taxon_id?: string;
        skip?: number;
        limit?: number;
        sort?: string;
    }): Promise<PlantListResponse> => {
        const response = await client.get<PlantListResponse>("/plants/", { params });
        return response.data;
    },

    create: async (data: PlantCreate, ignoreDuplicate?: boolean): Promise<PlantResponse> => {
        const response = await client.post<PlantResponse>("/plants/", data, {
            params: ignoreDuplicate !== undefined ? { ignore_duplicate: ignoreDuplicate } : undefined
        });
        return response.data;
    },

    getById: async (id: string): Promise<PlantResponse> => {
        const response = await client.get<PlantResponse>(`/plants/${id}`);
        return response.data;
    },

    delete: async (id: string): Promise<void> => {
        await client.delete(`/plants/${id}`);
    },

    update: async (id: string, data: Partial<PlantCreate>): Promise<PlantResponse> => {
        const response = await client.put<PlantResponse>(`/plants/${id}`, data);
        return response.data;
    },

    uploadImage: async (file: File, type: 'icon' | 'image'): Promise<{ url: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('image_type', type);
        const response = await client.post<{ url: string }>("/plants/upload-image", formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        });
        return response.data;
    },

    uploadImageFromUrl: async (url: string, type: 'icon' | 'image'): Promise<{ url: string }> => {
        const response = await client.post<{ url: string }>("/plants/upload-image-from-url", {
            url,
            image_type: type,
        });
        return response.data;
    }
};
