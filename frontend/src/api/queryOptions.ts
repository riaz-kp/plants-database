import { queryOptions } from '@tanstack/react-query';
import { plantsApi } from './plants';
import { categoriesApi } from './categories';
import { projectsApi } from './projects';
import { taxonomyApi } from './taxonomy';
import { dashboardApi } from './dashboard';

export const plantsQueryOptions = (params?: { 
    category?: string; 
    planting_place?: string; 
    search?: string; 
    taxon_id?: string;
    skip?: number;
    limit?: number;
    sort?: string;
}) => queryOptions({
    queryKey: ['plants', params],
    queryFn: () => plantsApi.getAll(params),
    staleTime: 5 * 60 * 1000,
});

export const plantDetailsQueryOptions = (id: string) => queryOptions({
    queryKey: ['plants', 'detail', id],
    queryFn: () => plantsApi.getById(id),
    staleTime: 5 * 60 * 1000,
});

export const categoriesQueryOptions = (params?: { skip?: number; limit?: number; search?: string }) => queryOptions({
    queryKey: ['categories', params],
    queryFn: () => categoriesApi.getAll(params),
    staleTime: 5 * 60 * 1000,
});

export const projectsQueryOptions = (params?: { skip?: number; limit?: number; search?: string; sort?: string }) => queryOptions({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getAll(params),
    staleTime: 5 * 60 * 1000,
});

export const projectDetailsQueryOptions = (id: string) => queryOptions({
    queryKey: ['projects', 'detail', id],
    queryFn: () => projectsApi.getById(id),
    staleTime: 5 * 60 * 1000,
});

export const projectShareQueryOptions = (token: string) => queryOptions({
    queryKey: ['projects', 'share', token],
    queryFn: () => projectsApi.getByShareToken(token),
    staleTime: 5 * 60 * 1000,
});

export const taxonomyTreeQueryOptions = () => queryOptions({
    queryKey: ['taxonomy', 'tree'],
    queryFn: () => taxonomyApi.getTree(),
    staleTime: 5 * 60 * 1000,
});

export const dashboardQueryOptions = () => queryOptions({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.getStats(),
    staleTime: 5 * 60 * 1000,
});
