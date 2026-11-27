"use client";

import { useState } from "react";
import { useAsync } from "@/lib/hooks/useAsync";
import { createCountingLine, deleteCountingLine, fetchCountingLines, type CountingLineRow } from "@/lib/data/queries";
import { friendlyError } from "@/lib/domain/errors";
import type { Business, CameraOverview } from "@/lib/domain/types";
import { ConfirmSheet, Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";
import { Button, Field, FormError, Notice, Section, Segmented, Select, TextInput } from "../ui/primitives";
import { GeometryEditor, type NPoint } from "./GeometryEditor";

/** Líneas virtuales de entrada/salida de cada cámara (las usa el motor para contar). */
export function CountingLines({ cameras, businesses, canManage }: { cameras: CameraOverview[]; businesses: Business[]; canManage: boolean }) {
  const bizName = (id: string | null, cam: CameraOverview) => businesses.find((b) => b.id === (id ?? cam.business_id))?.name ?? "—";
  const toast = useToast();
  const ids = cameras.map((c) => c.id);
  const lines = useAsync(() => fetchCountingLines(ids), [ids.join(",")]);
  const [draft, setDraft] = useState<{ camera_id: string; business_id: string; name: string; points: NPoint[]; entry_side: "left" | "right" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<CountingLineRow | null>(null);

  async function save() {
    if (!draft) return;
    setError(null);
    const name = draft.name.trim();
    if (name.length < 1 || name.length > 40) return setError("Nombre: entre 1 y 40 caracteres.");
    if (draft.points.length !== 2) return setError("Toca los dos extremos de la línea (A y B).");
    setSaving(true);
    try {
      await createCountingLine({ camera_id: draft.camera_id, business_id: draft.business_id, name, point_a: draft.points[0]!, point_b: draft.points[1]!, entry_side: draft.entry_side });
      toast.success("Línea guardada.");
      setDraft(null);
      await lines.reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await deleteCountingLine(toDelete.id);
      toast.success("Línea eliminada.");
      setToDelete(null);
      await lines.reload();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <Section title="Líneas de entrada y salida" description="El motor cuenta una entrada o salida cuando una persona cruza la línea; cada persona en seguimiento cuenta una sola vez por sentido.">
      {lines.error ? (
        <Notice tone="danger">{lines.error}</Notice>
      ) : (
        <div className="list">
          {cameras.map((c) => {
            const mine = (lines.data ?? []).filter((l) => l.camera_id === c.id);
            return (
              <div key={c.id} className="list-row list-row-top">
                <div className="list-main">
                  <strong>{c.name}</strong>
                  {mine.length === 0 ? (
                    <small className="muted">Sin líneas: no habrá conteo de entradas/salidas en esta cámara.</small>
                  ) : (
                    mine.map((l) => (
                      <div key={l.id} className="line-item">
                        <small>{l.name} · cuenta para <strong>{bizName(l.business_id, c)}</strong></small>
                        {canManage && <Button variant="ghost" size="sm" onClick={() => setToDelete(l)}>Quitar</Button>}
                      </div>
                    ))
                  )}
                </div>
                {canManage && (
                  <Button variant="secondary" size="sm" onClick={() => { setError(null); setDraft({ camera_id: c.id, business_id: c.business_id, name: "Puerta", points: [], entry_side: "left" }); }}>
                    Agregar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Sheet
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title="Nueva línea de conteo"
        footer={<Button onClick={() => void save()} loading={saving} disabled={!draft || draft.points.length !== 2}>Guardar línea</Button>}
      >
        {draft && (
          <div className="stack">
            <Field label="Nombre">
              {(id) => <TextInput id={id} maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
            </Field>
            <Field label="Las entradas cuentan para" hint="Si esta cámara ve la puerta del otro negocio, elige ese negocio.">
              {(id) => (
                <Select id={id} value={draft.business_id} onChange={(e) => setDraft({ ...draft, business_id: e.target.value })}>
                  {businesses.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              )}
            </Field>
            <p className="muted small">Dibuja la línea a lo ancho de la puerta, por donde pasan los pies de las personas.</p>
            <GeometryEditor mode="line" points={draft.points} onChange={(points) => setDraft({ ...draft, points })} entrySide={draft.entry_side} />
            <Segmented
              label="Lado de adentro"
              value={draft.entry_side}
              onChange={(v) => setDraft({ ...draft, entry_side: v })}
              options={[{ value: "left", label: "Adentro = lado 1" }, { value: "right", label: "Adentro = lado 2" }]}
            />
            <small className="muted">La flecha «Adentro» del dibujo muestra hacia dónde cuenta una entrada.</small>
            <FormError message={error} />
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!toDelete}
        title="Quitar línea"
        message={<>¿Quitar la línea <strong>{toDelete?.name}</strong>? Los conteos ya registrados se conservan.</>}
        confirmLabel="Quitar"
        danger
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </Section>
  );
}
