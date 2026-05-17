import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

// =============================================================================
// Shopping data hooks (pilot for the React Query migration).
//
// Wraps the imperative api.* calls into useQuery/useMutation hooks. Consumers
// (ShoppingList.tsx) call these instead of useState + useEffect, getting cache,
// dedup, automatic refetch, and optimistic updates for free.
//
// This is the reference pattern for future page migrations (Tasks, Budget, …).
// Keep the shape consistent: <Type> interface → useXxx() query → useCreateXxx
// useUpdateXxx, useDeleteXxx mutations that invalidate the right keys.
// =============================================================================

export interface ShoppingItem {
    id: string;
    name: string;
    category: string;
    quantity?: number;
    unit?: string;
    price?: number;
    is_checked: boolean;
    notes?: string;
}

export interface ShoppingTemplate {
    id: string;
    name: string;
    items: Array<{
        name: string;
        category: string;
        quantity?: number;
        unit?: string;
        price?: number;
        notes?: string;
    }>;
}

interface ApiResponse<T> {
    success: boolean;
    data: T;
    error?: string;
}

// -- Queries ------------------------------------------------------------------

export const useShoppingItems = () =>
    useQuery({
        queryKey: queryKeys.shopping.items(),
        queryFn: async () => {
            const res = await api.get<ApiResponse<ShoppingItem[]>>('/api/shopping');
            if (!res.success) throw new Error(res.error || 'Failed to fetch shopping items');
            return res.data;
        },
    });

export const useShoppingTemplates = () =>
    useQuery({
        queryKey: queryKeys.shopping.templates(),
        queryFn: async () => {
            const res = await api.get<ApiResponse<ShoppingTemplate[]>>('/api/shopping/templates');
            if (!res.success) throw new Error(res.error || 'Failed to fetch templates');
            return res.data;
        },
    });

// -- Mutations ----------------------------------------------------------------

export interface CreateShoppingItemInput {
    name: string;
    category: string;
    quantity?: number;
    unit?: string;
    price?: number;
    notes?: string;
}

export const useCreateShoppingItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: CreateShoppingItemInput) => {
            const res = await api.post<ApiResponse<ShoppingItem>>('/api/shopping', input);
            if (!res.success) throw new Error(res.error || 'Failed to add item');
            return res.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.items() });
        },
    });
};

export interface UpdateShoppingItemInput {
    id: string;
    patch: Partial<Omit<ShoppingItem, 'id'>>;
}

export const useUpdateShoppingItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, patch }: UpdateShoppingItemInput) => {
            const res = await api.put<ApiResponse<ShoppingItem>>(`/api/shopping/${id}`, patch);
            if (!res.success) throw new Error(res.error || 'Failed to update item');
            return res.data;
        },
        // Optimistic update: flip is_checked / patch instantly, rollback on error.
        onMutate: async ({ id, patch }) => {
            await qc.cancelQueries({ queryKey: queryKeys.shopping.items() });
            const previous = qc.getQueryData<ShoppingItem[]>(queryKeys.shopping.items());
            if (previous) {
                qc.setQueryData<ShoppingItem[]>(
                    queryKeys.shopping.items(),
                    previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
                );
            }
            return { previous };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous) {
                qc.setQueryData(queryKeys.shopping.items(), ctx.previous);
            }
        },
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.items() });
        },
    });
};

export const useDeleteShoppingItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.delete<ApiResponse<unknown>>(`/api/shopping/${id}`);
            if (!res.success) throw new Error(res.error || 'Failed to delete item');
            return id;
        },
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: queryKeys.shopping.items() });
            const previous = qc.getQueryData<ShoppingItem[]>(queryKeys.shopping.items());
            if (previous) {
                qc.setQueryData<ShoppingItem[]>(
                    queryKeys.shopping.items(),
                    previous.filter((item) => item.id !== id),
                );
            }
            return { previous };
        },
        onError: (_err, _id, ctx) => {
            if (ctx?.previous) {
                qc.setQueryData(queryKeys.shopping.items(), ctx.previous);
            }
        },
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.items() });
        },
    });
};

export const useClearCheckedItems = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await api.delete<ApiResponse<unknown>>('/api/shopping/checked/clear');
            if (!res.success) throw new Error(res.error || 'Failed to clear checked items');
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.items() });
        },
    });
};

export const useCreateTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { name: string; items: ShoppingTemplate['items'] }) => {
            const res = await api.post<ApiResponse<ShoppingTemplate>>(
                '/api/shopping/templates',
                input,
            );
            if (!res.success) throw new Error(res.error || 'Failed to create template');
            return res.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.templates() });
        },
    });
};

export const useUpdateTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            input,
        }: {
            id: string;
            input: { name: string; items: ShoppingTemplate['items'] };
        }) => {
            const res = await api.put<ApiResponse<ShoppingTemplate>>(
                `/api/shopping/templates/${id}`,
                input,
            );
            if (!res.success) throw new Error(res.error || 'Failed to update template');
            return res.data;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.templates() });
        },
    });
};

export const useApplyTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.post<ApiResponse<unknown>>(
                `/api/shopping/templates/${id}/apply`,
                {},
            );
            if (!res.success) throw new Error(res.error || 'Failed to apply template');
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.items() });
        },
    });
};

export const useDeleteTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.delete<ApiResponse<unknown>>(`/api/shopping/templates/${id}`);
            if (!res.success) throw new Error(res.error || 'Failed to delete template');
            return id;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: queryKeys.shopping.templates() });
        },
    });
};
