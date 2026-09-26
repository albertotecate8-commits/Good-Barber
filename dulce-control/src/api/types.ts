import type { StockStatus } from "../lib/calc";

export type CategoryColor = "pink" | "mango" | "mint" | "choco" | "grape" | "sky";

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: CategoryColor;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  emoji: string | null;
  cost_price: number;
  sale_price: number;
  current_quantity: number;
  min_quantity: number;
  is_active: boolean;
  shopping_qty: number | null;
  shopping_checked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  name: string;
  category_id: string | null;
  emoji: string | null;
  cost_price: number;
  sale_price: number;
  min_quantity: number;
  current_quantity?: number; // sólo al crear (inventario inicial)
}

export type ProductPatch = Partial<
  Pick<Product, "name" | "category_id" | "emoji" | "cost_price" | "sale_price" | "min_quantity" | "is_active" | "shopping_qty" | "shopping_checked">
>;

export interface CostHistoryEntry {
  id: string;
  product_id: string;
  cost_price: number;
  sale_price: number;
  effective_from: string;
  source: "alta" | "edicion" | "compra";
}

export type CountKind = "initial" | "weekly";

export interface WeeklyCount {
  id: string;
  kind: CountKind;
  period_start: string | null;
  counted_at: string;
  products_counted: number;
  total_units_sold: number;
  total_sales: number;
  total_cost: number;
  total_profit: number;
  notes: string | null;
}

export interface WeeklyCountItem {
  id: string;
  weekly_count_id: string;
  product_id: string;
  product_name: string;
  previous_quantity: number;
  counted_quantity: number;
  units_sold: number;
  surplus: number;
  unit_cost: number;
  unit_price: number;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  min_quantity: number;
  stock_status: StockStatus;
  suggested_qty: number;
}

export interface WeeklyCountWithItems extends WeeklyCount {
  items: WeeklyCountItem[];
}

export interface Purchase {
  id: string;
  purchased_at: string;
  store_name: string | null;
  source: "manual" | "ticket";
  ticket_path: string | null;
  total_units: number;
  total_cost: number;
  notes: string | null;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name: string;
  raw_name: string | null;
  quantity: number;
  unit_cost: number | null;
  line_total: number | null;
  previous_quantity: number;
  new_quantity: number;
}

export interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[];
}

export interface PurchaseLineInput {
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  raw_name: string | null;
  update_cost: boolean;
}

export interface PurchaseInput {
  items: PurchaseLineInput[];
  purchased_at?: string;
  store_name?: string | null;
  source: "manual" | "ticket";
  ticket_path?: string | null;
  notes?: string | null;
}

export interface ScannedLine {
  raw_name: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  match_product_id: string | null;
  match_confidence: "high" | "medium" | "low" | "none";
  suggested_name: string;
}

export interface ScanResult {
  readable: boolean;
  store_name: string | null;
  purchase_date: string | null;
  ticket_total: number | null;
  items: ScannedLine[];
}

export interface Profile {
  id: string;
  business_name: string;
}

export interface SessionUser {
  id: string;
  email: string | null;
}
