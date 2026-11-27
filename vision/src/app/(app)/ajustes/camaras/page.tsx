"use client";

import { useState } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { useAsync, useNow } from "@/lib/hooks/useAsync";
import { createCamera, deleteCamera, fetchCameras, updateCamera } from "@/lib/data/queries";
import { cameraSchema, firstIssue } from "@/lib/domain/validation";
import { friendlyError } from "@/lib/domain/errors";
import { cameraConnection, describeCameraConnection } from "@/lib/domain/indicators";
import type { CameraOverview } from "@/lib/domain/types";
import { TAPO_APP_STORE_URL } from "@/lib/config";
import { BackToSettings, ReadOnlyNotice } from "@/components/settings/common";
import { CountingLines } from "@/components/settings/CountingLines";
import { ConfirmSheet, Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, EmptyState, ErrorBlock, Field, LoadingBlock, Notice, PageHeader, Section, Select, TextInput, Toggle, FormError } from "@/components/ui/primitives";
import { IconCamera, IconPlus } from "@/components/ui/icons";

type Draft = {
  id: string | null;
  business_id: string;
  name: string;
  model: string;
  location_note: string;
  stream_profile: "stream1" | "stream2";
  analysis_enabled: boolean;
  active: boolean;
};

export default function CamarasSettingsPage() {
  const { businesses, canManage } = useSite();
  const toast = useToast();
  const now = useNow();
  const ids = businesses.map((b) => b.id);
  const cams = useAsync(() => fetchCameras(ids), [ids.join(",")]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<CameraOverview | null>(null);
  const [deleting, setDeleting] = useState(false);

  function newDraft(): Draft {
    return {
      id: null,
      business_id: businesses[0]?.id ?? "",
      name: "",
      model: "TP-Link Tapo C100",
      location_note: "",
      stream_profile: "stream2",
      analysis_enabled: false,
      active: true,
    };
  }

  function edit(c: CameraOverview) {
    setError(null);
    setDraft({
      id: c.id,
      business_id: c.business_id,
      name: c.name,
      model: c.model,
      location_note: c.location_note ?? "",
      stream_profile: c.stream_profile,
      analysis_enabled: c.analysis_enabled,
      active: c.active,
    });
  }

  async function save() {
    if (!draft) return;
    setError(null);
    const parsed = cameraSchema.safeParse(draft);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setSaving(true);
    try {
      if (draft.id) await updateCamera(draft.id, parsed.data);
      else await createCamera(parsed.data);
      toast.success("Cámara guardada.");
      setDraft(null);
      await cams.reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCamera(toDelete.id);
      toast.success("Cámara eliminada.");
      setToDelete(null);
      await cams.reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <BackToSettings />
      <PageHeader
        title="Cámaras"
        action={canManage && businesses.length > 0 ? <Button size="sm" icon={<IconPlus size={18} />} onClick={() => { setError(null); setDraft(newDraft()); }}>Agregar</Button> : undefined}
      />
      {!canManage && <ReadOnlyNotice />}

      <Notice tone="info" title="Las credenciales no se guardan aquí">
        El usuario y la contraseña RTSP de cada cámara (cuenta de cámara de Tapo) solo se configurarán en el servidor de procesamiento,
        nunca en la app ni en la base de datos. El estado de conexión lo reporta el motor de visión; esta pantalla no lo simula.
      </Notice>

      {cams.error ? (
        <ErrorBlock message={cams.error} onRetry={() => void cams.reload()} />
      ) : !cams.data ? (
        <LoadingBlock />
      ) : (
        businesses.map((b) => {
          const list = cams.data!.filter((c) => c.business_id === b.id);
          return (
            <Section key={b.id} title={b.name}>
              {list.length === 0 ? (
                <EmptyState icon={<IconCamera />} title="Sin cámaras" />
              ) : (
                <div className="list">
                  {list.map((c) => {
                    const conn = cameraConnection(c, now);
                    return (
                      <div className="list-row" key={c.id}>
                        <span className="list-icon"><IconCamera size={18} /></span>
                        <div className="list-main">
                          <strong>{c.name}</strong>
                          <small className="muted">{c.model}{c.location_note ? ` · ${c.location_note}` : ""}</small>
                          <small className="muted">{describeCameraConnection(conn, now)}</small>
                          <div className="badges">
                            <Badge tone={c.analysis_enabled ? "accent" : "neutral"}>{c.analysis_enabled ? "Análisis solicitado" : "Análisis desactivado"}</Badge>
                            <Badge tone="neutral">{c.stream_profile === "stream2" ? "Baja resolución" : "Alta resolución"}</Badge>
                          </div>
                        </div>
                        {canManage && <Button variant="secondary" size="sm" onClick={() => edit(c)}>Editar</Button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          );
        })
      )}

      {cams.data && cams.data.length > 0 && <CountingLines cameras={cams.data.filter((c) => c.active)} canManage={canManage} />}

      <Section title="Ver cámaras en vivo">
        <a className="btn btn-secondary btn-block" href={TAPO_APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          Abrir app Tapo
        </a>
        <p className="muted small">
          La transmisión RTSP no se reproduce en el navegador. Las capturas periódicas se agregarán cuando exista una conexión de cámara
          validada (Fase 1).
        </p>
      </Section>

      <Sheet
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "Editar cámara" : "Nueva cámara"}
        footer={
          <>
            {draft?.id && (
              <Button variant="danger" onClick={() => { setToDelete(cams.data?.find((c) => c.id === draft.id) ?? null); setDraft(null); }} disabled={saving}>
                Eliminar
              </Button>
            )}
            <Button onClick={() => void save()} loading={saving}>Guardar</Button>
          </>
        }
      >
        {draft && (
          <div className="stack">
            <Field label="Negocio">
              {(id) => (
                <Select id={id} value={draft.business_id} onChange={(e) => setDraft({ ...draft, business_id: e.target.value })}>
                  {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Nombre">
              {(id) => <TextInput id={id} maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
            </Field>
            <Field label="Modelo">
              {(id) => <TextInput id={id} maxLength={60} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />}
            </Field>
            <Field label="Ubicación (opcional)" hint="Por ejemplo: «Esquina sobre la entrada».">
              {(id) => <TextInput id={id} maxLength={200} value={draft.location_note} onChange={(e) => setDraft({ ...draft, location_note: e.target.value })} />}
            </Field>
            <Field label="Perfil de transmisión para el análisis" hint="La baja resolución consume menos CPU y ancho de banda. Se confirmará en la auditoría RTSP (Fase 1).">
              {(id) => (
                <Select id={id} value={draft.stream_profile} onChange={(e) => setDraft({ ...draft, stream_profile: e.target.value as Draft["stream_profile"] })}>
                  <option value="stream2">Baja resolución (stream2)</option>
                  <option value="stream1">Alta resolución (stream1)</option>
                </Select>
              )}
            </Field>
            <Toggle
              label="Solicitar análisis"
              description="Indica que el motor debe procesar esta cámara cuando esté disponible. No conecta nada por sí solo."
              checked={draft.analysis_enabled}
              onChange={(v) => setDraft({ ...draft, analysis_enabled: v })}
            />
            <Toggle label="Activa" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
            <FormError message={error} />
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!toDelete}
        title="Eliminar cámara"
        message={
          <>
            ¿Eliminar <strong>{toDelete?.name}</strong>? Si ya tiene métricas o eventos registrados, no se podrá eliminar para conservar el
            historial; en ese caso desactívala.
          </>
        }
        confirmLabel="Eliminar"
        danger
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
