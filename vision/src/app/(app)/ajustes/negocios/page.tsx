"use client";

import { useState } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { createBusiness, updateBusiness, updateSite } from "@/lib/data/queries";
import { businessSchema, firstIssue, slugify } from "@/lib/domain/validation";
import { friendlyError } from "@/lib/domain/errors";
import type { Business } from "@/lib/domain/types";
import { BackToSettings, ReadOnlyNotice } from "@/components/settings/common";
import { BusinessMark } from "@/components/layout/BusinessMark";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Card, Field, Notice, PageHeader, Section, TextInput, Toggle, FormError } from "@/components/ui/primitives";
import { IconPlus } from "@/components/ui/icons";

type Draft = { id: string | null; name: string; accent_color: string; default_dwell_seconds: string; active: boolean };

const emptyDraft: Draft = { id: null, name: "", accent_color: "#7fa4c9", default_dwell_seconds: "60", active: true };

export default function NegociosSettingsPage() {
  const { membership, businesses, canManage, isOwner, reloadBusinesses } = useSite();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [siteName, setSiteName] = useState(membership.site_name);
  const [savingSite, setSavingSite] = useState(false);

  function edit(b: Business) {
    setError(null);
    setDraft({ id: b.id, name: b.name, accent_color: b.accent_color, default_dwell_seconds: String(b.default_dwell_seconds), active: b.active });
  }

  async function save() {
    if (!draft) return;
    setError(null);
    const parsed = businessSchema.safeParse(draft);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setSaving(true);
    try {
      if (draft.id) {
        await updateBusiness(draft.id, parsed.data);
      } else {
        const slug = slugify(parsed.data.name);
        if (!slug) throw new Error("El nombre debe tener letras o números.");
        if (businesses.some((b) => b.slug === slug)) throw new Error("Ya existe un negocio con un nombre equivalente.");
        await createBusiness({
          ...parsed.data,
          site_id: membership.site_id,
          slug,
          sort_order: Math.max(0, ...businesses.map((b) => b.sort_order)) + 1,
        });
      }
      await reloadBusinesses();
      toast.success("Negocio guardado.");
      setDraft(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveSiteName() {
    const name = siteName.trim();
    if (name.length < 1 || name.length > 80) return toast.error("Nombre del establecimiento: entre 1 y 80 caracteres.");
    setSavingSite(true);
    try {
      await updateSite(membership.site_id, { name });
      toast.success("Nombre actualizado. Se verá al recargar la app.");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSavingSite(false);
    }
  }

  return (
    <>
      <BackToSettings />
      <PageHeader
        title="Negocios"
        action={canManage ? <Button size="sm" icon={<IconPlus size={18} />} onClick={() => { setError(null); setDraft(emptyDraft); }}>Agregar</Button> : undefined}
      />
      {!canManage && <ReadOnlyNotice />}

      {isOwner && (
        <Section title="Establecimiento">
          <Card>
            <div className="stack">
              <Field label="Nombre del establecimiento">
                {(id) => <TextInput id={id} value={siteName} maxLength={80} onChange={(e) => setSiteName(e.target.value)} />}
              </Field>
              <Button variant="secondary" onClick={() => void saveSiteName()} loading={savingSite} disabled={siteName.trim() === membership.site_name}>
                Guardar nombre
              </Button>
            </div>
          </Card>
        </Section>
      )}

      <Section title="Negocios del establecimiento">
        <div className="list">
          {businesses.map((b) => (
            <div className="list-row" key={b.id}>
              <BusinessMark name={b.name} color={b.accent_color} />
              <div className="list-main">
                <strong>{b.name}</strong>
                <small className="muted">Permanencia por defecto: {b.default_dwell_seconds} s</small>
                <div className="badges">
                  {!b.active && <Badge tone="neutral">Inactivo</Badge>}
                  {!b.hours_confirmed && <Badge tone="warning">Horario sin confirmar</Badge>}
                </div>
              </div>
              {canManage && <Button variant="secondary" size="sm" onClick={() => edit(b)}>Editar</Button>}
            </div>
          ))}
        </div>
      </Section>

      <Sheet
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "Editar negocio" : "Nuevo negocio"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void save()} loading={saving}>Guardar</Button>
          </>
        }
      >
        {draft && (
          <div className="stack">
            <Field label="Nombre">
              {(id) => <TextInput id={id} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
            </Field>
            <Field label="Color" hint="Identifica al negocio en la app.">
              {(id) => (
                <div className="color-row">
                  <input id={id} type="color" className="color-input" value={draft.accent_color} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} />
                  <code>{draft.accent_color}</code>
                </div>
              )}
            </Field>
            <Field label="Permanencia mínima por defecto (segundos)" hint="Tiempo dentro de una zona para considerar ocupada una estación. 60 s es un valor inicial experimental; se calibrará con datos reales.">
              {(id) => (
                <TextInput id={id} inputMode="numeric" value={draft.default_dwell_seconds} onChange={(e) => setDraft({ ...draft, default_dwell_seconds: e.target.value })} />
              )}
            </Field>
            <Toggle
              label="Activo"
              description="Un negocio inactivo se oculta de la navegación, pero conserva su historial."
              checked={draft.active}
              onChange={(v) => setDraft({ ...draft, active: v })}
            />
            <FormError message={error} />
          </div>
        )}
      </Sheet>
    </>
  );
}
