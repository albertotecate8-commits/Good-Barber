import { clsx } from "clsx";
import { AlertTriangle, Camera, Check, ChevronDown, ImagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, friendlyError, type Product, type ScanResult } from "../api";
import { ProductFormSheet, type ProductPrefill } from "../components/ProductForm";
import { useToast } from "../components/toast";
import {
  ActionBar, Button, CandyAvatar, Card, Chip, Field, MoneyInput, Page, Sheet, Stepper, TopBar, inputClass,
} from "../components/ui";
import { useConfirmPurchase } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { compressImage } from "../lib/image";
import { confidenceFromScore, rankMatches, type Confidence } from "../lib/match";
import { int, money } from "../lib/format";

interface Row {
  key: string;
  raw_name: string | null;
  product_id: string | null;
  quantity: number | null;
  unit_cost: string;
  update_cost: boolean;
  confidence: Confidence | "manual";
  suggested_name: string;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const newKey = () => crypto.randomUUID();
const costNum = (s: string) => (s.trim() === "" ? null : Number.isNaN(parseFloat(s)) ? null : parseFloat(s));

export function PurchaseNewPage() {
  const [params] = useSearchParams();
  const mode = params.get("modo") === "manual" ? "manual" : "ticket";
  const nav = useNavigate();
  const toast = useToast();
  const catalog = useCatalog();
  const confirm = useConfirmPurchase();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"capture" | "scanning" | "detected" | "edit">(mode === "manual" ? "edit" : "capture");
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [store, setStore] = useState("");
  const [date, setDate] = useState(todayISO());
  const [picker, setPicker] = useState<{ rowKey: string | null } | null>(null);
  const [newProduct, setNewProduct] = useState<{ rowKey: string | null; prefill: ProductPrefill } | null>(null);

  // Modo manual: precarga la lista de compras pendiente.
  const manualRows = useMemo<Row[]>(() => catalog.active
    .filter((p) => p.shopping_qty != null && !p.shopping_checked)
    .map((p) => ({
      key: p.id, raw_name: null, product_id: p.id, quantity: p.shopping_qty || null,
      unit_cost: String(p.cost_price), update_cost: false, confidence: "manual" as const, suggested_name: p.name,
    })), [catalog.active]);
  const effectiveRows = rows ?? (mode === "manual" ? manualRows : []);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows(effectiveRows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const assignProduct = (key: string, p: Product) => {
    const row = effectiveRows.find((r) => r.key === key);
    const c = costNum(row?.unit_cost ?? "");
    setRow(key, {
      product_id: p.id, confidence: row?.raw_name ? "high" : "manual",
      unit_cost: row?.unit_cost || String(p.cost_price),
      update_cost: c != null && c !== p.cost_price,
    });
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const img = await compressImage(file);
      setImage({ blob: img.blob, url: img.url });
      setStep("scanning");
      const catalogLite = catalog.active.map((p) => ({ id: p.id, name: p.name }));
      const result = await api.scanTicket(img.base64, "image/jpeg", catalogLite);
      if (!result.readable || result.items.length === 0) {
        toast("No pudimos leer productos en la foto. Intenta con más luz o captura a mano.", "error");
        setStep("capture");
        return;
      }
      setScan(result);
      setStore(result.store_name ?? "");
      if (result.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(result.purchase_date) && result.purchase_date <= todayISO()) setDate(result.purchase_date);
      setRows(result.items.map((it) => {
        // Respaldo local si la IA no encontró coincidencia.
        let productId = it.match_product_id;
        let confidence: Confidence = it.match_confidence;
        if (!productId) {
          const [best] = rankMatches(it.raw_name, catalog.active);
          if (best && confidenceFromScore(best.score) === "high") { productId = best.product.id; confidence = "medium"; }
        }
        const product = productId ? catalog.byId.get(productId) : undefined;
        return {
          key: newKey(), raw_name: it.raw_name, product_id: productId ?? null, quantity: it.quantity,
          unit_cost: it.unit_price != null ? String(it.unit_price) : product ? String(product.cost_price) : "",
          update_cost: !!product && it.unit_price != null && it.unit_price !== product.cost_price,
          confidence, suggested_name: it.suggested_name || it.raw_name,
        };
      }));
      setStep("detected");
    } catch (e) {
      toast(friendlyError(e), "error");
      setStep("capture");
    }
  }

  const unresolved = effectiveRows.filter((r) => !r.product_id || !r.quantity);
  const doubtful = effectiveRows.filter((r) => r.product_id && (r.confidence === "medium" || r.confidence === "low"));
  const totalUnits = effectiveRows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const totalCost = effectiveRows.reduce((s, r) => s + (r.quantity ?? 0) * (costNum(r.unit_cost) ?? 0), 0);

  async function submit() {
    if (unresolved.length || effectiveRows.length === 0) return;
    try {
      const ticket_path = image ? await api.uploadTicket(image.blob) : null;
      const purchased_at = date === todayISO() ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
      const id = await confirm.mutateAsync({
        source: mode === "ticket" && scan ? "ticket" : "manual",
        store_name: store,
        purchased_at,
        ticket_path,
        items: effectiveRows.map((r) => ({
          product_id: r.product_id!, quantity: r.quantity!, unit_cost: costNum(r.unit_cost),
          raw_name: r.raw_name, update_cost: r.update_cost,
        })),
      });
      toast(`Compra registrada: +${int(totalUnits)} piezas al inventario`);
      nav(`/compras/${id}?nuevo=1`, { replace: true });
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  // ------------------------------------------------------------- Captura
  if (step === "capture" || step === "scanning") {
    return (
      <>
        <TopBar title="🧾 Compra con ticket" back />
        <Page className="max-w-md">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          {step === "scanning" && image ? (
            <div className="flex flex-col items-center pt-4">
              <div className="relative w-64 overflow-hidden rounded-3xl border-4 border-surface shadow-card">
                <img src={image.url} alt="Ticket" className="max-h-96 w-full object-cover" />
                <div className="absolute inset-x-0 h-16 animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-pink/45 to-transparent" />
              </div>
              <style>{`@keyframes scan { 0% { top: -4rem } 100% { top: 100% } }`}</style>
              <p className="mt-6 font-display text-2xl font-semibold">Leyendo tu ticket…</p>
              <p className="mt-1 text-sm text-ink-2">Buscando productos, cantidades y precios</p>
            </div>
          ) : (
            <>
              <button onClick={() => cameraRef.current?.click()}
                className="mt-2 flex w-full flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed border-pink/40 bg-pink-soft/60 px-6 py-12 text-center active:scale-[0.99]">
                <span className="grid size-20 place-items-center rounded-full bg-pink text-white shadow-pop"><Camera className="size-9" /></span>
                <span className="font-display text-2xl font-semibold">📷 Tomar foto del ticket</span>
                <span className="text-sm text-ink-2">Que se vea completo, derecho y con buena luz</span>
              </button>
              <Button variant="secondary" block size="lg" className="mt-3" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-5" /> Subir foto de la galería
              </Button>
              <Card className="mt-6 p-4 text-sm text-ink-2">
                <p className="mb-1 font-semibold text-ink">¿Cómo funciona?</p>
                La IA detecta productos, cantidades y precios. <b>Nada cambia en tu inventario</b> hasta que revises y confirmes.
              </Card>
              <Button variant="ghost" block className="mt-3" onClick={() => nav("/compras/nueva?modo=manual", { replace: true })}>
                Mejor capturar a mano
              </Button>
            </>
          )}
        </Page>
      </>
    );
  }

  // ------------------------------------------------------------- Detectado (resumen)
  if (step === "detected") {
    return (
      <>
        <TopBar title="🧾 Compra detectada" back={false} />
        <Page>
          <div className="flex items-center gap-4">
            {image && <img src={image.url} alt="Ticket" className="h-24 w-16 shrink-0 rounded-xl border border-line object-cover" />}
            <div>
              <p className="font-semibold">{store || "Tienda sin nombre"}</p>
              <p className="text-sm text-ink-2">{effectiveRows.length} productos · {int(totalUnits)} piezas</p>
              {scan?.ticket_total != null && <p className="text-sm text-ink-2">Total del ticket: <b className="tabular">{money(scan.ticket_total)}</b></p>}
            </div>
          </div>

          <Card className="mt-4 divide-y divide-line">
            {effectiveRows.map((r) => {
              const p = r.product_id ? catalog.byId.get(r.product_id) : undefined;
              const look = catalog.look(p);
              return (
                <div key={r.key} className="flex items-center gap-3 px-4 py-3">
                  {p ? <CandyAvatar emoji={look.emoji} color={look.color} size="sm" /> : <span className="grid size-9 place-items-center rounded-full bg-warn-soft"><AlertTriangle className="size-4 text-warn" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p ? p.name : r.raw_name}</p>
                    <p className="truncate text-xs text-ink-3">
                      {p ? <>Ticket: {r.raw_name}</> : "⚠️ No encontramos coincidencia exacta"}
                      {p && (r.confidence === "medium" || r.confidence === "low") && " · revisar"}
                    </p>
                  </div>
                  <span className="tabular text-lg font-bold">{r.quantity ?? "?"}</span>
                </div>
              );
            })}
          </Card>

          {(unresolved.length > 0 || doubtful.length > 0) && (
            <p className="mt-3 rounded-2xl bg-warn-soft p-3 text-sm">
              {unresolved.length > 0
                ? `Hay ${unresolved.length} renglón(es) sin producto. Toca EDITAR para elegir el correcto o darlo de alta.`
                : `Revisa ${doubtful.length} coincidencia(s) dudosa(s) antes de confirmar.`}
            </p>
          )}
          <p className="mt-3 text-center text-sm text-ink-3">Costo total detectado: <b className="tabular text-ink">{money(totalCost)}</b></p>
        </Page>
        <ActionBar>
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep("edit")}><Pencil className="size-4" /> EDITAR</Button>
          <Button size="lg" className="flex-[1.4]" disabled={unresolved.length > 0 || confirm.isPending} onClick={submit}>
            {confirm.isPending ? "Guardando…" : <>CONFIRMAR <Check className="size-5" /></>}
          </Button>
        </ActionBar>
      </>
    );
  }

  // ------------------------------------------------------------- Editar
  return (
    <>
      <TopBar title={mode === "manual" && !scan ? "✍️ Registrar compra" : "Editar compra"} back={!scan} />
      <Page>
        {mode === "manual" && !scan && rows == null && manualRows.length > 0 && (
          <p className="mb-3 rounded-2xl bg-pink-soft p-3 text-sm">Precargamos tu lista de compras. Ajusta cantidades y quita lo que no compraste.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tienda (opcional)">{(id) => <input id={id} className={inputClass} value={store} onChange={(e) => setStore(e.target.value)} placeholder="Ej. Bodega" />}</Field>
          <Field label="Fecha">{(id) => <input id={id} type="date" max={todayISO()} className={inputClass} value={date} onChange={(e) => setDate(e.target.value || todayISO())} />}</Field>
        </div>

        <ul className="mt-5 space-y-3">
          {effectiveRows.map((r) => {
            const p = r.product_id ? catalog.byId.get(r.product_id) : undefined;
            const look = catalog.look(p);
            const c = costNum(r.unit_cost);
            const suggestions = !p && r.raw_name ? rankMatches(r.raw_name, catalog.active, 3) : [];
            return (
              <Card as="li" key={r.key} className={clsx("p-4", !p && "border-warn/50")}>
                {r.raw_name && <p className="mb-2 truncate text-xs text-ink-3">Ticket: <span className="font-mono">{r.raw_name}</span></p>}
                <div className="flex items-center gap-2">
                  <button onClick={() => setPicker({ rowKey: r.key })} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-surface-2 p-2 pr-3 text-left">
                    {p ? <CandyAvatar emoji={look.emoji} color={look.color} size="sm" /> : <span className="grid size-9 place-items-center rounded-full bg-warn-soft"><AlertTriangle className="size-4 text-warn" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p ? p.name : "Elegir producto"}</span>
                      {p && r.confidence !== "manual" && (
                        <Chip tone={r.confidence === "high" ? "ok" : "warn"} className="mt-0.5">{r.confidence === "high" ? "Coincide" : "Revisa"}</Chip>
                      )}
                    </span>
                    <ChevronDown className="size-4 text-ink-3" />
                  </button>
                  <button aria-label="Quitar renglón" className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger"
                    onClick={() => setRows(effectiveRows.filter((x) => x.key !== r.key))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {!p && (
                  <div className="mt-3 rounded-2xl bg-warn-soft p-3">
                    <p className="text-sm font-semibold">⚠️ No encontramos coincidencia exacta.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.map((s) => (
                        <button key={s.product.id} className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium" onClick={() => assignProduct(r.key, s.product)}>
                          ¿{s.product.name}?
                        </button>
                      ))}
                      <button className="rounded-full bg-pink px-3 py-1.5 text-sm font-semibold text-white"
                        onClick={() => setNewProduct({ rowKey: r.key, prefill: { name: r.suggested_name, cost_price: c } })}>
                        + AGREGAR PRODUCTO
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-2">Piezas</p>
                    <Stepper value={r.quantity} min={1} onChange={(v) => setRow(r.key, { quantity: v })} label="piezas compradas" />
                  </div>
                  <div className="w-32">
                    <p className="mb-1.5 text-xs font-medium text-ink-2">Costo por pieza</p>
                    <MoneyInput value={r.unit_cost} onChange={(v) => {
                      const n = costNum(v);
                      setRow(r.key, { unit_cost: v, update_cost: !!p && n != null && n !== p.cost_price });
                    }} />
                  </div>
                </div>

                {p && c != null && c !== p.cost_price && (
                  <label className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
                    <input type="checkbox" className="size-5 accent-[var(--pink)]" checked={r.update_cost} onChange={(e) => setRow(r.key, { update_cost: e.target.checked })} />
                    <span>Actualizar costo de <b>{money(p.cost_price)}</b> a <b>{money(c)}</b> <span className="text-ink-3">(se guarda en el historial)</span></span>
                  </label>
                )}
                {r.quantity != null && c != null && (
                  <p className="mt-2 text-right text-sm text-ink-2">Subtotal <b className="tabular text-ink">{money(r.quantity * c)}</b></p>
                )}
              </Card>
            );
          })}
        </ul>

        <Button variant="soft" block size="lg" className="mt-4" onClick={() => setPicker({ rowKey: null })}>
          <Plus className="size-5" /> Agregar producto a la compra
        </Button>

        <Card className="mt-5 flex items-center justify-between p-4">
          <span className="text-ink-2">{int(totalUnits)} piezas</span>
          <span className="tabular text-lg font-bold">{money(totalCost)}</span>
        </Card>
        {scan?.ticket_total != null && Math.abs(scan.ticket_total - totalCost) > 0.5 && (
          <p className="mt-2 text-center text-xs text-ink-3">El ticket dice {money(scan.ticket_total)}; la diferencia puede ser de productos que no son dulces o descuentos.</p>
        )}
      </Page>

      <ActionBar>
        {scan && <Button variant="secondary" size="lg" onClick={() => setStep("detected")}>Resumen</Button>}
        <Button block size="lg" disabled={unresolved.length > 0 || effectiveRows.length === 0 || confirm.isPending} onClick={submit}>
          {confirm.isPending ? "Guardando…" : unresolved.length ? `Completa ${unresolved.length} renglón(es)` : <>CONFIRMAR COMPRA <Check className="size-5" /></>}
        </Button>
      </ActionBar>

      <ProductPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        rawName={picker?.rowKey ? effectiveRows.find((r) => r.key === picker.rowKey)?.raw_name ?? null : null}
        onPick={(p) => {
          if (picker?.rowKey) assignProduct(picker.rowKey, p);
          else setRows([...effectiveRows, { key: newKey(), raw_name: null, product_id: p.id, quantity: p.shopping_qty || 1, unit_cost: String(p.cost_price), update_cost: false, confidence: "manual", suggested_name: p.name }]);
          setPicker(null);
        }}
        onCreate={(name) => { const key = picker?.rowKey ?? null; setPicker(null); setNewProduct({ rowKey: key, prefill: { name } }); }}
      />

      <ProductFormSheet
        open={!!newProduct}
        prefill={newProduct?.prefill}
        askInitialQty={false}
        onClose={() => setNewProduct(null)}
        onSaved={(p) => {
          const key = newProduct?.rowKey;
          if (key) {
            const row = effectiveRows.find((r) => r.key === key);
            setRows(effectiveRows.map((r) => (r.key === key ? { ...r, product_id: p.id, confidence: "high", unit_cost: row?.unit_cost || String(p.cost_price), update_cost: false } : r)));
          } else {
            setRows([...effectiveRows, { key: newKey(), raw_name: null, product_id: p.id, quantity: 1, unit_cost: String(p.cost_price), update_cost: false, confidence: "manual", suggested_name: p.name }]);
          }
        }}
      />
    </>
  );
}

function ProductPicker({ open, onClose, rawName, onPick, onCreate }: {
  open: boolean; onClose: () => void; rawName: string | null; onPick: (p: Product) => void; onCreate: (name: string) => void;
}) {
  const catalog = useCatalog();
  const [q, setQ] = useState("");
  const suggestions = rawName && !q ? rankMatches(rawName, catalog.active, 4) : [];
  const list = catalog.active.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const Item = ({ p, hint }: { p: Product; hint?: string }) => {
    const look = catalog.look(p);
    return (
      <li>
        <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => { onPick(p); setQ(""); }}>
          <CandyAvatar emoji={look.emoji} color={look.color} size="sm" />
          <span className="flex-1 font-medium">{p.name}</span>
          {hint && <Chip tone="pink">{hint}</Chip>}
        </button>
      </li>
    );
  };
  return (
    <Sheet open={open} onClose={onClose} title="Elegir producto">
      {rawName && <p className="mb-3 text-sm text-ink-2">En el ticket dice: <span className="font-mono font-semibold text-ink">{rawName}</span></p>}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
        <input className={clsx(inputClass, "pl-11")} placeholder="Buscar en mis productos…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
      </div>
      {suggestions.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Parecidos</p>
          <ul className="divide-y divide-line">{suggestions.map((s) => <Item key={s.product.id} p={s.product} hint={`${Math.round(s.score * 100)}%`} />)}</ul>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Todos</p>
        </>
      )}
      <ul className="divide-y divide-line">{list.map((p) => <Item key={p.id} p={p} />)}</ul>
      <Button variant="soft" block className="mt-3" onClick={() => onCreate(q.trim())}><Plus className="size-4" /> Agregar producto nuevo</Button>
    </Sheet>
  );
}
