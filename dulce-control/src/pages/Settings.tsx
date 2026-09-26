import { clsx } from "clsx";
import { LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, friendlyError } from "../api";
import { useToast } from "../components/toast";
import { Button, Card, Field, Page, SectionTitle, TopBar, flavor, inputClass } from "../components/ui";
import { useUser } from "../hooks/auth";
import { useCategories, useDeleteCategory, useProfile, useUpdateProfile } from "../hooks/data";
import { applyTheme, getThemePref, type ThemePref } from "../lib/theme";

export function SettingsPage() {
  const user = useUser();
  const profile = useProfile();
  const saveProfile = useUpdateProfile();
  const categories = useCategories();
  const delCategory = useDeleteCategory();
  const toast = useToast();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  useEffect(() => { if (profile.data) setName(profile.data.business_name); }, [profile.data]);

  return (
    <>
      <TopBar title="Ajustes" back />
      <Page className="max-w-xl">
        {api.mode === "demo" && (
          <Card className="mb-4 border-pink/30 bg-pink-soft p-4 text-sm">
            <p className="font-semibold">Estás en modo demo 🍬</p>
            <p className="text-ink-2">Los datos son de ejemplo y sólo viven en este navegador. Sal del demo para usar tu cuenta.</p>
          </Card>
        )}

        <SectionTitle>Mi negocio</SectionTitle>
        <Card className="space-y-3 p-4">
          <Field label="Nombre de la dulcería">
            {(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
          </Field>
          <Button disabled={!name.trim() || name === profile.data?.business_name || saveProfile.isPending}
            onClick={async () => {
              try { await saveProfile.mutateAsync(name.trim()); toast("Guardado"); } catch (e) { toast(friendlyError(e), "error"); }
            }}>Guardar</Button>
          {user?.email && <p className="text-xs text-ink-3">Cuenta: {user.email}</p>}
        </Card>

        <SectionTitle>Apariencia</SectionTitle>
        <div className="grid grid-cols-3 gap-2 rounded-full bg-surface-2 p-1 text-sm font-semibold">
          {([["system", "Auto"], ["light", "☀️ Claro"], ["dark", "🌙 Oscuro"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => { setTheme(v); applyTheme(v); }}
              className={clsx("h-11 rounded-full transition", theme === v ? "bg-surface text-pink shadow-card" : "text-ink-3")}>{label}</button>
          ))}
        </div>

        <SectionTitle>Categorías</SectionTitle>
        <Card className="divide-y divide-line">
          {(categories.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className={clsx("grid size-9 place-items-center rounded-full text-lg", flavor[c.color].soft)}>{c.emoji}</span>
              <span className="flex-1 font-medium">{c.name}</span>
              <button aria-label={`Borrar categoría ${c.name}`} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger"
                onClick={async () => {
                  if (!confirm(`¿Borrar la categoría ${c.name}? Los productos quedan sin categoría.`)) return;
                  try { await delCategory.mutateAsync(c.id); } catch (e) { toast(friendlyError(e), "error"); }
                }}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {(categories.data ?? []).length === 0 && <p className="px-4 py-3 text-sm text-ink-3">Crea categorías al agregar o editar un producto.</p>}
        </Card>

        <SectionTitle>¿Cómo se calcula?</SectionTitle>
        <Card className="space-y-2 p-4 text-sm text-ink-2">
          <p><b className="text-ink">Vendidos</b> = inventario anterior − lo que contaste.</p>
          <p><b className="text-ink">Inventario anterior</b> = tu último conteo + las compras que registraste después.</p>
          <p><b className="text-ink">Ventas</b> = vendidos × precio · <b className="text-ink">Costo</b> = vendidos × costo · <b className="text-ink">Ganancia</b> = ventas − costo.</p>
          <p>Cada semana usa el costo y precio vigentes cuando se hizo el conteo; los cambios de costo quedan en el historial.</p>
          <p><b className="text-ink">Comprar sugerido</b> = mínimo − cantidad actual.</p>
        </Card>

        <Button variant="danger" block size="lg" className="mt-8" onClick={() => api.signOut()}>
          <LogOut className="size-5" /> {api.mode === "demo" ? "Salir del demo" : "Cerrar sesión"}
        </Button>
      </Page>
    </>
  );
}
