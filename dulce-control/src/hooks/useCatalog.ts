import { useMemo } from "react";
import type { Category, CategoryColor, Product } from "../api";
import { useCategories, useProducts } from "./data";

export interface CatalogView {
  products: Product[];
  active: Product[];
  categories: Category[];
  categoryOf: (p: { category_id: string | null }) => Category | undefined;
  look: (p: Pick<Product, "category_id" | "emoji"> | undefined) => { emoji: string; color: CategoryColor };
  byId: Map<string, Product>;
  isLoading: boolean;
  error: unknown;
}

/** Productos + categorías con utilidades para pintar cada dulce. */
export function useCatalog(): CatalogView {
  const products = useProducts();
  const categories = useCategories();
  return useMemo(() => {
    const cats = categories.data ?? [];
    const list = products.data ?? [];
    const catMap = new Map(cats.map((c) => [c.id, c]));
    const categoryOf = (p: { category_id: string | null }) => (p.category_id ? catMap.get(p.category_id) : undefined);
    return {
      products: list,
      active: list.filter((p) => p.is_active),
      categories: cats,
      categoryOf,
      look: (p) => {
        const c = p ? categoryOf(p) : undefined;
        return { emoji: p?.emoji || c?.emoji || "🍬", color: c?.color ?? "pink" };
      },
      byId: new Map(list.map((p) => [p.id, p])),
      isLoading: products.isLoading || categories.isLoading,
      error: products.error ?? categories.error,
    };
  }, [products.data, categories.data, products.isLoading, categories.isLoading, products.error, categories.error]);
}
