import { ArrowRight, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { friendlyError, type Product } from "../api";
import { ProductFormSheet, type ProductPrefill } from "../components/ProductForm";
import { useToast } from "../components/toast";
import { ActionBar, Button, CandyAvatar, Card, Drip, Loading, Logo, Page, Stepper } from "../components/ui";
import { useCounts, useSaveCount } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { int, money } from "../lib/format";

const IDEAS = ["Takis Fuego", "Mazapán", "Pulparindo", "Sabritas", "Carlos V", "Paleta Payaso", "Duvalín", "Rockaleta", "Panditas", "Kranky"];

export function OnboardingPage() {
  const nav = useNavigate();
  const toast = useToast();
  const counts = useCounts();
  const catalog = useCatalog();
  const save = useSaveCount();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [form, setForm] = useState<{ open: boolean; product?: Product | null; prefill?: ProductPrefill }>({ open: false });
  const [qty, setQty] = useState<Record<string, number | null>>({});

  // Cantidades iniciales: parten de lo capturado al dar de alta.
  useEffect(() => {
    setQty((q) => {
      const next = { ...q };
      for (const p of catalog.active) if (!(p.id in next)) next[p.id] = p.current_quantity;
      return next;
    });
  }, [catalog.active]);

  const totals = useMemo(() => {
    let pieces = 0, atCost = 0, atPrice = 0;
    for (const p of catalog.active) {
      const n = qty[p.id] ?? 0;
      pieces += n; atCost += n * p.cost_price; atPrice += n * p.sale_price;
    }
    return { pieces, atCost, atPrice };
  }, [catalog.active, qty]);

  if (counts.isLoading || catalog.isLoading) return <Loading />;
  if ((counts.data?.length ?? 0) > 0) return <Navigate to="/" replace />;

  const missing = catalog.active.filter((p) => qty[p.id] == null).length;

  async function finish() {
    try {
      await save.mutateAsync({
        kind: "initial",
        items: catalog.active.map((p) => ({ product_id: p.id, counted_quantity: qty[p.id] ?? 0 })),
      });
      toast("¡Inventario inicial guardado! 🎉");
      nav("/", { replace: true });
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  if (step === 0) {
    return (
      <div className="min-h-dvh bg-bg">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#ff7b9c] to-pink pb-6 pt-safe text-white">
          <div className="sprinkles absolute inset-0 [background-size:160px_160px]" />
          <div className="relative mx-auto max-w-md px-6 pt-12 text-center">
            <span className="candy-emoji text-7xl animate-float inline-block">🍬</span>
            <h1 className="mt-3 font-display text-4xl font-bold">¡Hola!</h1>
            <p className="mt-2 text-white/90">Vamos a preparar tu dulcería en 3 pasos.</p>
          </div>
        </div>
        <Drip className="-mt-px h-10 text-pink" />
        <Page className="max-w-md pb-10">
          <ol className="space-y-3">
            {[
              ["🍭", "Agrega tus productos", "Nombre y categoría de cada dulce."],
              ["💲", "Costo y precio", "Cuánto te cuesta y en cuánto lo vendes."],
              ["📦", "Inventario inicial", "Cuántas piezas tienes hoy."],
            ].map(([e, t, d], i) => (
              <Card key={t} className="flex items-center gap-4 p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-pink-soft text-2xl">{e}</span>
                <div>
                  <p className="font-semibold">{i + 1}. {t}</p>
                  <p className="text-sm text-ink-2">{d}</p>
                </div>
              </Card>
            ))}
          </ol>
          <p className="mt-5 text-center text-sm text-ink-2">
            Después, cada sábado sólo cuentas lo que tienes y <Logo /> calcula todo lo demás.
          </p>
          <Button block size="xl" className="mt-6" onClick={() => setStep(1)}>Empezar <ArrowRight className="size-5" /></Button>
        </Page>
      </div>
    );
  }

  return (
    <>
      <header className="pt-safe sticky top-0 z-20 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <button className="text-sm font-medium text-ink-3" onClick={() => setStep(step === 2 ? 1 : 0)}>← Atrás</button>
            <span className="text-sm font-semibold text-pink">Paso {step} de 2</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold">{step === 1 ? "Tus productos" : "Inventario inicial"}</h1>
          <p className="text-sm text-ink-2">
            {step === 1 ? "Agrega los dulces que vendes. Puedes agregar más después." : "Confirma cuántas piezas tienes hoy de cada uno."}
          </p>
        </div>
      </header>

      <Page>
        {step === 1 && (
          <>
            {catalog.active.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-line p-5">
                <p className="mb-3 text-sm font-medium text-ink-2">Ideas para empezar rápido:</p>
                <div className="flex flex-wrap gap-2">
                  {IDEAS.map((n) => (
                    <button key={n} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium" onClick={() => setForm({ open: true, prefill: { name: n } })}>
                      + {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ul className="mt-4 space-y-3">
              {catalog.active.map((p) => {
                const look = catalog.look(p);
                return (
                  <Card as="li" key={p.id} className="flex items-center gap-3 p-3 animate-pop-in">
                    <CandyAvatar emoji={look.emoji} color={look.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-sm text-ink-2">Costo {money(p.cost_price)} · Precio {money(p.sale_price)} · Mín {p.min_quantity}</p>
                    </div>
                    <button className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-surface-2" aria-label={`Editar ${p.name}`} onClick={() => setForm({ open: true, product: p })}>
                      <Pencil className="size-4" />
                    </button>
                  </Card>
                );
              })}
            </ul>
            <Button variant="soft" block size="lg" className="mt-4" onClick={() => setForm({ open: true })}>
              <Plus className="size-5" /> Agregar producto
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <Card className="mb-4 grid grid-cols-3 divide-x divide-line p-4 text-center">
              <div><p className="text-xs text-ink-3">Piezas</p><p className="tabular text-lg font-semibold">{int(totals.pieces)}</p></div>
              <div><p className="text-xs text-ink-3">Valor a costo</p><p className="tabular text-lg font-semibold">{money(totals.atCost)}</p></div>
              <div><p className="text-xs text-ink-3">Valor a venta</p><p className="tabular text-lg font-semibold text-pink">{money(totals.atPrice)}</p></div>
            </Card>
            <ul className="space-y-3">
              {catalog.active.map((p) => {
                const look = catalog.look(p);
                return (
                  <Card as="li" key={p.id} className="flex items-center gap-3 p-3">
                    <CandyAvatar emoji={look.emoji} color={look.color} />
                    <p className="min-w-0 flex-1 truncate font-semibold">{p.name}</p>
                    <Stepper value={qty[p.id] ?? null} onChange={(v) => setQty((q) => ({ ...q, [p.id]: v }))} label={`piezas de ${p.name}`} />
                  </Card>
                );
              })}
            </ul>
          </>
        )}
      </Page>

      <ActionBar>
        {step === 1 ? (
          <Button block size="lg" disabled={catalog.active.length === 0} onClick={() => setStep(2)}>
            Siguiente: inventario <ArrowRight className="size-5" />
          </Button>
        ) : (
          <Button block size="lg" disabled={save.isPending || missing > 0} onClick={finish}>
            {save.isPending ? "Guardando…" : missing > 0 ? `Faltan ${missing} por capturar` : "Guardar inventario inicial"}
          </Button>
        )}
      </ActionBar>

      <ProductFormSheet
        open={form.open}
        product={form.product}
        prefill={form.prefill}
        onClose={() => setForm({ open: false })}
        onSaved={(p) => setQty((q) => ({ ...q, [p.id]: form.product ? q[p.id] ?? p.current_quantity : p.current_quantity }))}
      />
    </>
  );
}
