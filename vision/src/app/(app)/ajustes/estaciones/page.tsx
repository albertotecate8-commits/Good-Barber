"use client";

import { useState } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { useAsync } from "@/lib/hooks/useAsync";
import { createStation, deleteStation, fetchCameras, fetchStations, updateStation, updateStationZone } from "@/lib/data/queries";
import { GeometryEditor, type NPoint } from "@/components/settings/GeometryEditor";
import { firstIssue, stationSchema } from "@/lib/domain/validation";
import { friendlyError } from "@/lib/domain/errors";
import type { Station, StationKind } from "@/lib/domain/types";
import { STATION_KIND_LABELS } from "@/lib/domain/types";
import { BackToSettings, ReadOnlyNotice } from "@/components/settings/common";
import { BusinessMark } from "@/components/layout/BusinessMark";
import { ConfirmSheet, Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, EmptyState, ErrorBlock, Field, LoadingBlock, Notice, PageHeader, Section, Select, TextInput, Toggle, FormError } from "@/components/ui/primitives";
import { IconChair, IconPlus } from "@/components/ui/icons";

type Draft = {
  id: string | null;
  business_id: string;
  camera_id: string;
  name: string;
  kind: StationKind;
  dwell_threshold_seconds: string;
  release_grace_seconds: string;
  active: boolean;
};

export default function EstacionesSettingsPage() {
  const { businesses, canManage } = useSite();
  const toast = useToast();
  const ids = businesses.map((b) => b.id);
  const data = useAsync(async () => {
    const [stations, cameras] = await Promise.all([fetchStations(ids), fetchCameras(ids)]);
    return { stations, cameras };
  }, [ids.join(",")]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Station | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [zoneFor, setZoneFor] = useState<Station | null>(null);
  const [zonePts, setZonePts] = useState<NPoint[]>([]);
  const [savingZone, setSavingZone] = useState(false);

  async function saveZone(points: NPoint[] | null) {
    if (!zoneFor) return;
    if (points && points.length < 3) return toast.error("La zona necesita al menos 3 puntos.");
    setSavingZone(true);
    try {
      await updateStationZone(zoneFor.id, points);
      toast.success(points ? "Zona guardada." : "Zona eliminada.");
      setZoneFor(null);
      await data.reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSavingZone(false);
    }
  }

  const bizById = new Map(businesses.map((b) => [b.id, b]));

  function newDraft(businessId: string): Draft {
    return {
      id: null,
      business_id: businessId,
      camera_id: data.data?.cameras.find((c) => c.business_id === businessId && c.active)?.id ?? "",
      name: "",
      kind: "silla",
      dwell_threshold_seconds: "",
      release_grace_seconds: "15",
      active: true,
    };
  }

  function edit(s: Station) {
    setError(null);
    setDraft({
      id: s.id,
      business_id: s.business_id,
      camera_id: s.camera_id ?? "",
      name: s.name,
      kind: s.kind,
      dwell_threshold_seconds: s.dwell_threshold_seconds === null ? "" : String(s.dwell_threshold_seconds),
      release_grace_seconds: String(s.release_grace_seconds),
      active: s.active,
    });
  }

  async function save() {
    if (!draft) return;
    setError(null);
    const parsed = stationSchema.safeParse(draft);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setSaving(true);
    try {
      if (draft.id) {
        await updateStation(draft.id, parsed.data);
      } else {
        const sameBiz = data.data?.stations.filter((s) => s.business_id === draft.business_id) ?? [];
        await createStation({ ...parsed.data, sort_order: Math.max(0, ...sameBiz.map((s) => s.sort_order)) + 1 });
      }
      toast.success("Estación guardada.");
      setDraft(null);
      await data.reload();
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
      await deleteStation(toDelete.id);
      toast.success("Estación eliminada.");
      setToDelete(null);
      await data.reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setDeleting(false);
    }
  }

  const draftBiz = draft ? bizById.get(draft.business_id) : undefined;
  const draftCameras = data.data?.cameras.filter((c) => c.business_id === draft?.business_id) ?? [];

  return (
    <>
      <BackToSettings />
      <PageHeader title="Estaciones" subtitle="Sillas, mesas, lavabos y áreas que quieras medir" />
      {!canManage && <ReadOnlyNotice />}

      <Notice tone="info" title="Las zonas se dibujan sobre la imagen real">
        Cada estación necesita una zona dibujada sobre el encuadre de su cámara. El editor de zonas se habilitará cuando exista una
        captura real de la cámara (Fase 1). Mientras tanto, puedes dar de alta las estaciones que existen de verdad.
      </Notice>

      {data.error ? (
        <ErrorBlock message={data.error} onRetry={() => void data.reload()} />
      ) : !data.data ? (
        <LoadingBlock />
      ) : (
        businesses.map((b) => {
          const list = data.data!.stations.filter((s) => s.business_id === b.id);
          return (
            <Section
              key={b.id}
              title={b.name}
              action={canManage ? <Button size="sm" variant="secondary" icon={<IconPlus size={16} />} onClick={() => { setError(null); setDraft(newDraft(b.id)); }}>Agregar</Button> : undefined}
            >
              {list.length === 0 ? (
                <EmptyState icon={<BusinessMark name={b.name} color={b.accent_color} />} title="Sin estaciones">
                  Agrega solo las estaciones que existen en el local.
                </EmptyState>
              ) : (
                <div className="list">
                  {list.map((s) => {
                    const cam = data.data!.cameras.find((c) => c.id === s.camera_id);
                    return (
                      <div className="list-row" key={s.id}>
                        <span className="list-icon"><IconChair size={18} /></span>
                        <div className="list-main">
                          <strong>{s.name}</strong>
                          <small className="muted">
                            {STATION_KIND_LABELS[s.kind]} · {cam ? cam.name : "sin cámara"} · permanencia{" "}
                            {s.dwell_threshold_seconds ?? b.default_dwell_seconds} s{s.dwell_threshold_seconds === null ? " (del negocio)" : ""}
                          </small>
                          <div className="badges">
                            <Badge tone={s.zone ? "success" : "neutral"}>{s.zone ? "Zona dibujada" : "Zona sin dibujar"}</Badge>
                            {!s.active && <Badge tone="neutral">Inactiva</Badge>}
                          </div>
                        </div>
                        {canManage && (
                          <div className="row-actions">
                            <Button variant="ghost" size="sm" onClick={() => { setZoneFor(s); setZonePts(s.zone ?? []); }}>Zona</Button>
                            <Button variant="secondary" size="sm" onClick={() => edit(s)}>Editar</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          );
        })
      )}

      <Sheet
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "Editar estación" : `Nueva estación · ${draftBiz?.name ?? ""}`}
        footer={
          <>
            {draft?.id && (
              <Button
                variant="danger"
                disabled={saving}
                onClick={() => {
                  setToDelete(data.data?.stations.find((s) => s.id === draft.id) ?? null);
                  setDraft(null);
                }}
              >
                Eliminar
              </Button>
            )}
            <Button onClick={() => void save()} loading={saving}>Guardar</Button>
          </>
        }
      >
        {draft && (
          <div className="stack">
            <Field label="Nombre" hint="Por ejemplo: «Silla 1», «Mesa de uñas».">
              {(id) => <TextInput id={id} maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
            </Field>
            <Field label="Tipo">
              {(id) => (
                <Select id={id} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as StationKind })}>
                  {(Object.keys(STATION_KIND_LABELS) as StationKind[]).map((k) => <option key={k} value={k}>{STATION_KIND_LABELS[k]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Cámara que la observa">
              {(id) => (
                <Select id={id} value={draft.camera_id} onChange={(e) => setDraft({ ...draft, camera_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {draftCameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field
              label="Permanencia mínima (segundos)"
              hint={`Vacío = usar el valor del negocio (${draftBiz?.default_dwell_seconds ?? 60} s, experimental). Rango 5–3600.`}
            >
              {(id) => (
                <TextInput id={id} inputMode="numeric" placeholder={String(draftBiz?.default_dwell_seconds ?? 60)} value={draft.dwell_threshold_seconds} onChange={(e) => setDraft({ ...draft, dwell_threshold_seconds: e.target.value })} />
              )}
            </Field>
            <Field label="Tolerancia de salida (segundos)" hint="Tiempo sin presencia antes de marcarla libre (evita parpadeos). Rango 0–600.">
              {(id) => (
                <TextInput id={id} inputMode="numeric" value={draft.release_grace_seconds} onChange={(e) => setDraft({ ...draft, release_grace_seconds: e.target.value })} />
              )}
            </Field>
            <Toggle label="Activa" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
            <FormError message={error} />
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!zoneFor}
        onClose={() => !savingZone && setZoneFor(null)}
        title={`Zona · ${zoneFor?.name ?? ""}`}
        footer={
          <>
            {zoneFor?.zone && <Button variant="danger" onClick={() => void saveZone(null)} disabled={savingZone}>Quitar zona</Button>}
            <Button onClick={() => void saveZone(zonePts)} loading={savingZone} disabled={zonePts.length < 3}>Guardar zona</Button>
          </>
        }
      >
        {zoneFor && (
          <div className="stack">
            {!zoneFor.camera_id && <Notice tone="warning">Asigna primero la cámara que observa esta estación (Editar).</Notice>}
            <p className="muted small">Toca las esquinas del área donde se sienta o trabaja la persona (incluye el piso frente a la silla: el motor usa el punto de los pies).</p>
            <GeometryEditor mode="polygon" points={zonePts} onChange={setZonePts} />
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!toDelete}
        title="Eliminar estación"
        message={<>¿Eliminar <strong>{toDelete?.name}</strong>? Si ya tiene historial de ocupación no se podrá eliminar; desactívala en su lugar.</>}
        confirmLabel="Eliminar"
        danger
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
