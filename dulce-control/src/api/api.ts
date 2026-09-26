import type {
  Category, CategoryColor, CostHistoryEntry, CountKind, Product, ProductInput, ProductPatch, Profile,
  Purchase, PurchaseInput, PurchaseWithItems, ScanResult, SessionUser, WeeklyCount, WeeklyCountWithItems,
} from "./types";

/** Contrato de datos. Hay dos implementaciones: Supabase y demo (localStorage). */
export interface Api {
  readonly mode: "supabase" | "demo";

  // Sesión
  getUser(): Promise<SessionUser | null>;
  onAuthChange(cb: (user: SessionUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile | null>;
  updateProfile(businessName: string): Promise<void>;

  // Catálogo
  listCategories(): Promise<Category[]>;
  createCategory(input: { name: string; emoji: string; color: CategoryColor }): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  listProducts(): Promise<Product[]>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, patch: ProductPatch): Promise<void>;
  /** Lanza ApiError("EN_USO") si el producto ya tiene historial: hay que desactivarlo. */
  deleteProduct(id: string): Promise<void>;
  costHistory(productId: string): Promise<CostHistoryEntry[]>;

  // Conteos
  saveCount(items: { product_id: string; counted_quantity: number }[], kind: CountKind, notes?: string): Promise<string>;
  listCounts(): Promise<WeeklyCount[]>;
  getCount(id: string): Promise<WeeklyCountWithItems>;

  // Compras
  confirmPurchase(input: PurchaseInput): Promise<string>;
  listPurchases(): Promise<Purchase[]>;
  getPurchase(id: string): Promise<PurchaseWithItems>;
  uploadTicket(file: Blob): Promise<string>;
  ticketUrl(path: string): Promise<string | null>;
  scanTicket(imageBase64: string, mediaType: "image/jpeg", catalog: { id: string; name: string }[]): Promise<ScanResult>;
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Traduce los códigos de error de las funciones SQL a mensajes para humanos. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("FALTAN_PRODUCTOS")) {
    const n = msg.match(/FALTAN_PRODUCTOS: (\d+)/)?.[1];
    return n ? `Faltan ${n} producto(s) por contar.` : "Faltan productos por contar.";
  }
  if (msg.includes("CANTIDAD_INVALIDA")) return "Hay cantidades inválidas (deben ser números enteros, sin negativos).";
  if (msg.includes("PRODUCTO_REPETIDO")) return "Un producto aparece dos veces.";
  if (msg.includes("PRODUCTO_DESCONOCIDO")) return "Hay un producto que ya no existe. Recarga la página.";
  if (msg.includes("EN_USO")) return "Este producto ya tiene historial; puedes desactivarlo.";
  if (msg.includes("products_owner_name_uq") || msg.includes("NOMBRE_REPETIDO")) return "Ya tienes un producto con ese nombre.";
  if (msg.includes("categories_owner_name_uq")) return "Ya existe esa categoría.";
  if (msg.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (msg.includes("Email not confirmed")) return "Confirma tu correo: te enviamos un enlace.";
  if (msg.includes("User already registered")) return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (msg.includes("Password should be")) return "La contraseña debe tener al menos 6 caracteres.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  return msg || "Algo salió mal.";
}
