import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CategoryColor, CountKind, ProductInput, ProductPatch, PurchaseInput } from "../api";

export const qk = {
  profile: ["profile"] as const,
  categories: ["categories"] as const,
  products: ["products"] as const,
  counts: ["counts"] as const,
  count: (id: string) => ["count", id] as const,
  purchases: ["purchases"] as const,
  purchase: (id: string) => ["purchase", id] as const,
  history: (id: string) => ["cost-history", id] as const,
};

export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: () => api.getProfile() });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: () => api.listCategories() });
export const useProducts = () => useQuery({ queryKey: qk.products, queryFn: () => api.listProducts() });
export const useCounts = () => useQuery({ queryKey: qk.counts, queryFn: () => api.listCounts() });
export const useCount = (id: string | undefined) =>
  useQuery({ queryKey: qk.count(id ?? ""), queryFn: () => api.getCount(id!), enabled: !!id });
export const usePurchases = () => useQuery({ queryKey: qk.purchases, queryFn: () => api.listPurchases() });
export const usePurchase = (id: string | undefined) =>
  useQuery({ queryKey: qk.purchase(id ?? ""), queryFn: () => api.getPurchase(id!), enabled: !!id });
export const useCostHistory = (id: string | undefined) =>
  useQuery({ queryKey: qk.history(id ?? ""), queryFn: () => api.costHistory(id!), enabled: !!id });

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateProduct() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (input: ProductInput) => api.createProduct(input), onSuccess: () => inv(qk.products) });
}
export function useUpdateProduct() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductPatch }) => api.updateProduct(id, patch),
    onSuccess: (_d, v) => inv(qk.products, qk.history(v.id)),
  });
}
export function useDeleteProduct() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.deleteProduct(id), onSuccess: () => inv(qk.products) });
}
export function useCreateCategory() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: { name: string; emoji: string; color: CategoryColor }) => api.createCategory(input),
    onSuccess: () => inv(qk.categories),
  });
}
export function useDeleteCategory() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.deleteCategory(id), onSuccess: () => inv(qk.categories, qk.products) });
}
export function useSaveCount() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ items, kind, notes }: { items: { product_id: string; counted_quantity: number }[]; kind: CountKind; notes?: string }) =>
      api.saveCount(items, kind, notes),
    onSuccess: () => inv(qk.products, qk.counts),
  });
}
export function useConfirmPurchase() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (input: PurchaseInput) => api.confirmPurchase(input),
    onSuccess: () => inv(qk.products, qk.purchases),
  });
}
export function useUpdateProfile() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (name: string) => api.updateProfile(name), onSuccess: () => inv(qk.profile) });
}

/** Último conteo semanal (no el inicial) — "esta semana" en el tablero. */
export function useLatestWeekly() {
  const counts = useCounts();
  const latest = counts.data?.find((c) => c.kind === "weekly");
  const detail = useCount(latest?.id);
  return { counts, latest, detail };
}
