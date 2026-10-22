import { client } from "./client";
import type { Project, ProjectCreate, ProjectPlantCreate, ProjectListResponse } from "../types/project";

export interface ShareLinkInfo {
    token: string;
    expires_at: string;
    url: string;
}

export const projectsApi = {
    getAll: async (params?: { skip?: number; limit?: number; search?: string; sort?: string }): Promise<ProjectListResponse> => {
        const response = await client.get<ProjectListResponse>("/projects/", { params });
        return response.data;
    },

    getById: async (id: string): Promise<Project> => {
        const response = await client.get<Project>(`/projects/${id}`);
        return response.data;
    },

    create: async (data: ProjectCreate): Promise<Project> => {
        const response = await client.post<Project>("/projects/", data);
        return response.data;
    },

    addPlant: async (projectId: string, data: ProjectPlantCreate): Promise<Project> => {
        const response = await client.post<Project>(`/projects/${projectId}/plants`, data);
        return response.data;
    },

    addPlantsBulk: async (projectId: string, plantIds: string[]): Promise<{ added: number; skipped: number }> => {
        const response = await client.post<{ added: number; skipped: number }>(`/projects/${projectId}/plants/bulk`, { plant_ids: plantIds });
        return response.data;
    },

    setLocked: async (id: string, isLocked: boolean): Promise<Project> => {
        const response = await client.patch<Project>(`/projects/${id}/lock`, { is_locked: isLocked });
        return response.data;
    },

    updatePlant: async (projectId: string, plantId: string, data: ProjectPlantCreate): Promise<Project> => {
        const response = await client.put<Project>(`/projects/${projectId}/plants/${plantId}`, data);
        return response.data;
    },

    removePlant: async (projectId: string, plantId: string): Promise<Project> => {
        const response = await client.delete<Project>(`/projects/${projectId}/plants/${plantId}`);
        return response.data;
    },

    update: async (id: string, data: Partial<ProjectCreate>): Promise<Project> => {
        const response = await client.put<Project>(`/projects/${id}`, data);
        return response.data;
    },

    delete: async (id: string): Promise<void> => {
        await client.delete(`/projects/${id}`);
    },

    duplicate: async (id: string): Promise<Project> => {
        const response = await client.post<Project>(`/projects/${id}/duplicate`);
        return response.data;
    },

    getShareLink: async (id: string): Promise<ShareLinkInfo | null> => {
        const response = await client.get<ShareLinkInfo | null>(`/projects/${id}/share`);
        return response.data;
    },

    generateShareLink: async (id: string): Promise<ShareLinkInfo> => {
        const response = await client.post<ShareLinkInfo>(`/projects/${id}/share`);
        return response.data;
    },

    getByShareToken: async (token: string): Promise<Project> => {
        const response = await client.get<Project>(`/projects/share/${token}`);
        return response.data;
    },
};
