// Interpreta lo que la persona escribe en el chat creativo. Son reglas, no un
// modelo de lenguaje: reconoce cantidades, formatos, estilos guardados, ajustes
// («más premium», «conserva la composición»…), pedidos de memoria («recuerda
// que…») y de investigación. Lo que no reconoce lo dice, no lo inventa.
import { guessMemoryKind, type MemoryKind } from "./styles";

export const MODIFIERS = {
  premium: { label: "Más premium", re: /(mas |muy )?(premium|elegante|de lujo|lujos|sofisticad|exclusiv)/ },
  natural: { label: "Más natural", re: /(menos artificial|mas natural|mas real|realista|menos (falso|plastico|ia\b))/ },
  minimal: { label: "Más limpio", re: /(minimalista|mas limpio|mas simple|menos (saturado|cargado|elementos|recargado))/ },
  bold: { label: "Más llamativo", re: /(mas llamativ|mas impacto|mas atrevid|que resalte|mas fuerte)/ },
  warm: { label: "Tonos cálidos", re: /(mas calid|tonos calidos|colores calidos)/ },
  cool: { label: "Tonos fríos", re: /(mas fri[oa]|tonos frios|colores frios)/ },
  bright: { label: "Más luminoso", re: /(mas luminos|mas clar[oa]|mas luz|mas brillante)/ },
  dark: { label: "Más oscuro", re: /(mas oscur|mas sombr|mas dramatic)/ },
  keep_composition: { label: "Conservar composición", re: /(conserva|manten|mantener|misma|deja igual) (la )?composicion/ },
  change_colors: { label: "Cambiar colores", re: /(cambia|cambiale|otros?|diferentes?|otra)\b.{0,30}\b(colores|paleta)/ },
  change_offer: { label: "Cambiar promoción", re: /((cambia|cambiale|otra|otro|diferente)\b.{0,40}\b(promocion|promo|oferta)|(otro|cambia el) servicio)/ },
  bigger_text: { label: "Texto más grande", re: /(texto|letra|titulo|precio) mas grande/ },
  no_text: { label: "Sin texto en la imagen", re: /(sin texto|sin letras|sin precio en la imagen)/ },
} as const;
export type ModifierKey = keyof typeof MODIFIERS;

export type ChatFormat = "post" | "story" | "reel" | "carousel";

export interface ParsedMessage {
  /** Nueva tanda de propuestas o ajuste de una propuesta anterior. */
  kind: "create" | "modify" | "remember" | "research" | "approve" | "unknown";
  count: number;
  format: ChatFormat | null;
  modifiers: ModifierKey[];
  /** Estilo pedido: id de un estilo guardado, o null. */
  styleId: string | null;
  styleReason: string | null;
  /** Se pidió un estilo que no se encontró. */
  styleMissing: string | null;
  /** Número de propuesta mencionado («la segunda», «la opción 2»), base 1. */
  target: number | null;
  /** Servicio o promoción mencionada por nombre. */
  offerName: string | null;
  memory: { text: string; kind: MemoryKind } | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const NUMBERS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4 };
const ORDINALS: Record<string, number> = { primera: 1, primer: 1, primero: 1, segunda: 2, segundo: 2, tercera: 3, tercero: 3, cuarta: 4, cuarto: 4 };

export interface StyleRef {
  id: string;
  name: string;
  created_at: string;
}

/** «Usa el estilo Barbería noir» o «el estilo que guardamos la semana pasada». */
export function findStyle(text: string, styles: StyleRef[], now: Date): { id: string | null; reason: string | null; missing: string | null } {
  const t = norm(text);
  if (!/estilo/.test(t)) return { id: null, reason: null, missing: null };
  const byName = [...styles].sort((a, b) => b.name.length - a.name.length).find((s) => t.includes(norm(s.name)));
  if (byName) return { id: byName.id, reason: `por nombre («${byName.name}»)`, missing: null };
  const recent = [...styles].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const days = (s: StyleRef) => (now.getTime() - new Date(s.created_at).getTime()) / 86400_000;
  if (/semana pasada/.test(t)) {
    const hit = recent.find((s) => days(s) >= 6 && days(s) < 15) ?? null;
    if (hit) return { id: hit.id, reason: `guardado la semana pasada («${hit.name}», ${hit.created_at.slice(0, 10)})`, missing: null };
    return { id: null, reason: null, missing: "No hay un estilo guardado la semana pasada." };
  }
  if (/(ultimo|reciente|que guardamos|que guarde|guardado)/.test(t)) {
    if (recent[0]) return { id: recent[0].id, reason: `el más reciente («${recent[0].name}», ${recent[0].created_at.slice(0, 10)})`, missing: null };
    return { id: null, reason: null, missing: "Este negocio aún no tiene estilos guardados." };
  }
  const named = t.match(/estilo ([a-z0-9ñ ]{2,40})/)?.[1]?.trim();
  if (named && !/^(de|del|que|mas|menos|diferente|nuevo)\b/.test(named)) return { id: null, reason: null, missing: `No encontré un estilo llamado «${named}» en este negocio.` };
  return { id: null, reason: null, missing: null };
}

export function parseMessage(
  raw: string,
  ctx: { styles: StyleRef[]; offerNames: string[]; hasProposals: boolean; now: Date },
): ParsedMessage {
  const text = raw.trim();
  const t = norm(text);
  const base: ParsedMessage = { kind: "unknown", count: 3, format: null, modifiers: [], styleId: null, styleReason: null, styleMissing: null, target: null, offerName: null, memory: null };

  const remember = text.match(/^\s*(recuerda|guarda en (la )?memoria|guarda|anota|no olvides)( que)?[:,]?\s+(.{3,})$/i);
  if (remember) {
    const fact = remember[4].trim().replace(/\s+/g, " ");
    return { ...base, kind: "remember", memory: { text: fact.charAt(0).toUpperCase() + fact.slice(1), kind: guessMemoryKind(fact) } };
  }

  const format: ChatFormat | null = /(historia|stor(y|ies))/.test(t)
    ? "story"
    : /\b(reel|vertical)\b/.test(t)
      ? "reel"
      : /carrusel/.test(t)
        ? "carousel"
        : /(publicacion|post|feed)\b/.test(t)
          ? "post"
          : null;
  const modifiers = (Object.keys(MODIFIERS) as ModifierKey[]).filter((k) => MODIFIERS[k].re.test(t));
  const style = findStyle(text, ctx.styles, ctx.now);
  const numMatch = t.match(/\b(\d|un|una|uno|dos|tres|cuatro)\s+(anuncios?|propuestas?|opciones|versiones|disenos?|ideas?|imagenes?|historias?|publicaciones?|variantes?)/);
  const count = numMatch ? Math.min(4, Math.max(1, Number(numMatch[1]) || NUMBERS[numMatch[1]] || 3)) : null;
  const ord = t.match(/\b(primera|primer|primero|segunda|segundo|tercera|tercero|cuarta|cuarto)\b/)?.[1];
  const optNum = t.match(/\b(opcion|propuesta|version|la|el)\s+(\d)\b/)?.[2];
  const target = ord ? ORDINALS[ord] : optNum ? Number(optNum) : null;
  const offerName = [...ctx.offerNames].sort((a, b) => b.length - a.length).find((n) => n.length >= 3 && t.includes(norm(n))) ?? null;
  const common = { format, modifiers, styleId: style.id, styleReason: style.reason, styleMissing: style.missing, target, offerName };

  if (/(investiga|tendencias|competencia|competidores|que estan haciendo|mercado local)/.test(t) && !/(haz|crea|disena)/.test(t)) return { ...base, ...common, kind: "research" };
  if (/^(apruebo|aprobar|aprueba|publica(lo|la)?|publicar)\b/.test(t)) return { ...base, ...common, kind: "approve" };

  const asksNew = count !== null || /^(haz|hazme|crea|creame|disena|genera|prepara|propon|quiero)\b/.test(t) && !/^(hazlo|hazla|haz que)/.test(t);
  const adapts = /(adapta|convierte|pasalo|pasala|llevalo|llevala)/.test(t);
  const tweaks = modifiers.length > 0 || /^(hazlo|hazla|ponle|cambia|cambiale|quita|agrega|usa|manten|conserva)/.test(t);
  if (ctx.hasProposals && (adapts || (tweaks && count === null) || (target !== null && !asksNew))) {
    return { ...base, ...common, kind: "modify", count: 1 };
  }
  if (asksNew || format || style.id || offerName || tweaks) return { ...base, ...common, kind: "create", count: count ?? 3 };
  return { ...base, ...common };
}
