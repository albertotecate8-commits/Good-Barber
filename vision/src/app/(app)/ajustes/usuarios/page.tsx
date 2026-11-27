"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSite } from "@/lib/site/SiteProvider";
import { useAsync } from "@/lib/hooks/useAsync";
import { addMemberByEmail, fetchMembers, updateMember } from "@/lib/data/queries";
import { firstIssue, memberSchema } from "@/lib/domain/validation";
import { friendlyError } from "@/lib/domain/errors";
import type { Member, Role } from "@/lib/domain/types";
import { ROLE_LABELS } from "@/lib/domain/types";
import { BackToSettings } from "@/components/settings/common";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, ErrorBlock, Field, LoadingBlock, Notice, PageHeader, Section, Select, TextInput, Toggle, FormError } from "@/components/ui/primitives";
import { IconPlus, IconUser } from "@/components/ui/icons";

const ROLE_HELP: Record<Role, string> = {
  owner: "Todo, incluida la gestión de usuarios.",
  admin: "Configura negocios, cámaras, estaciones y horarios; revisa eventos.",
  viewer: "Solo consulta.",
};

type Draft = { mode: "add" | "edit"; user_id?: string; email: string; role: Role; display_name: string; active: boolean };

export default function UsuariosSettingsPage() {
  const auth = useAuth();
  const { membership, isOwner } = useSite();
  const toast = useToast();
  const members = useAsync(() => fetchMembers(membership.site_id), [membership.site_id]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const myId = auth.status === "signed_in" ? auth.session.user.id : "";

  async function save() {
    if (!draft) return;
    setError(null);
    const parsed = memberSchema.safeParse(draft);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setSaving(true);
    try {
      if (draft.mode === "add") {
        await addMemberByEmail(membership.site_id, parsed.data.email, parsed.data.role, parsed.data.display_name);
      } else {
        await updateMember(membership.site_id, draft.user_id!, {
          role: parsed.data.role,
          display_name: parsed.data.display_name,
          active: draft.active,
        });
      }
      toast.success("Usuario guardado.");
      setDraft(null);
      await members.reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  function edit(m: Member) {
    setError(null);
    setDraft({ mode: "edit", user_id: m.user_id, email: m.email, role: m.role, display_name: m.display_name ?? "", active: m.active });
  }

  return (
    <>
      <BackToSettings />
      <PageHeader
        title="Usuarios"
        action={isOwner ? <Button size="sm" icon={<IconPlus size={18} />} onClick={() => { setError(null); setDraft({ mode: "add", email: "", role: "viewer", display_name: "", active: true }); }}>Dar acceso</Button> : undefined}
      />
      <Notice tone="info" title="Cómo se agregan personas">
        El registro público está bloqueado. 1) El administrador técnico crea la cuenta (ver docs/BASE-DE-DATOS.md, «Cuentas»).
        2) Aquí, «Dar acceso» con su correo y su rol. Los usuarios de la app no son empleados: los empleados se registrarán aparte
        (Fase 2).
      </Notice>
      {!isOwner && <Notice tone="info">Solo el propietario puede administrar usuarios.</Notice>}

      <Section title="Con acceso">
        {members.error ? (
          <ErrorBlock message={members.error} onRetry={() => void members.reload()} />
        ) : !members.data ? (
          <LoadingBlock />
        ) : (
          <div className="list">
            {members.data.map((m) => (
              <div className="list-row" key={m.user_id}>
                <span className="list-icon"><IconUser size={18} /></span>
                <div className="list-main">
                  <strong>{m.display_name || m.email}</strong>
                  {m.display_name && <small className="muted break">{m.email}</small>}
                  <div className="badges">
                    <Badge tone="accent">{ROLE_LABELS[m.role]}</Badge>
                    {!m.active && <Badge tone="neutral">Sin acceso</Badge>}
                    {m.user_id === myId && <Badge tone="info">Tú</Badge>}
                  </div>
                </div>
                {isOwner && <Button variant="secondary" size="sm" onClick={() => edit(m)}>Editar</Button>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Sheet
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.mode === "add" ? "Dar acceso" : "Editar acceso"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void save()} loading={saving}>Guardar</Button>
          </>
        }
      >
        {draft && (
          <div className="stack">
            <Field label="Correo de la cuenta">
              {(id) => (
                <TextInput id={id} type="email" inputMode="email" autoComplete="off" value={draft.email} disabled={draft.mode === "edit"} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              )}
            </Field>
            <Field label="Nombre a mostrar (opcional)">
              {(id) => <TextInput id={id} maxLength={60} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />}
            </Field>
            <Field label="Rol" hint={ROLE_HELP[draft.role]}>
              {(id) => (
                <Select id={id} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              )}
            </Field>
            {draft.mode === "edit" && (
              <Toggle
                label="Acceso activo"
                description="Desactivar quita el acceso sin borrar la cuenta. Siempre debe quedar al menos un propietario activo."
                checked={draft.active}
                onChange={(v) => setDraft({ ...draft, active: v })}
              />
            )}
            <FormError message={error} />
          </div>
        )}
      </Sheet>
    </>
  );
}
