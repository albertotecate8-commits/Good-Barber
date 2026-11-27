"use client";

import { useEffect, useState } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { useAsync } from "@/lib/hooks/useAsync";
import { fetchHours, saveWeek } from "@/lib/data/queries";
import { draftFromRows, validateDrafts, WEEKDAY_LABELS, type DayDraft } from "@/lib/domain/schedule";
import { friendlyError } from "@/lib/domain/errors";
import type { Business, BusinessHoursRow } from "@/lib/domain/types";
import { BackToSettings, ReadOnlyNotice } from "@/components/settings/common";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Card, ErrorBlock, LoadingBlock, Notice, PageHeader, Section, Segmented, Toggle, FormError } from "@/components/ui/primitives";

function WeekEditor({ business, rows, canManage, onSaved }: { business: Business; rows: BusinessHoursRow[]; canManage: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<DayDraft[]>(() => draftFromRows(rows));
  const [confirmed, setConfirmed] = useState(business.hours_confirmed);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-sincroniza solo cuando cambian los datos guardados (no en cada render).
  const rowsKey = JSON.stringify(rows);
  useEffect(() => {
    setDrafts(draftFromRows(rows));
    setConfirmed(business.hours_confirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, business.hours_confirmed]);

  const errors = validateDrafts(drafts);
  const errorFor = (wd: number) => errors.find((e) => e.weekday === wd)?.message;
  const dirty = JSON.stringify(drafts) !== JSON.stringify(draftFromRows(rows)) || confirmed !== business.hours_confirmed;

  function patch(weekday: number, p: Partial<DayDraft>) {
    setDrafts((ds) => ds.map((d) => (d.weekday === weekday ? { ...d, ...p } : d)));
  }

  async function save() {
    setErrorMsg(null);
    if (errors.length > 0) return setErrorMsg("Corrige los días marcados antes de guardar.");
    if (confirmed && drafts.some((d) => d.state === "unset")) {
      return setErrorMsg("Para marcar el horario como confirmado, define todos los días (abierto o cerrado).");
    }
    setSaving(true);
    try {
      const rowsToSave = drafts
        .filter((d) => d.state !== "unset")
        .map((d) => ({
          weekday: d.weekday,
          is_closed: d.state === "closed",
          opens_at: d.state === "open" ? d.opensAt : null,
          closes_at: d.state === "open" ? d.closesAt : null,
        }));
      const unset = drafts.filter((d) => d.state === "unset").map((d) => d.weekday);
      await saveWeek(business.id, rowsToSave, unset, confirmed);
      toast.success(`Horario de ${business.name} guardado.`);
      await onSaved();
    } catch (e) {
      setErrorMsg(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="week">
        {drafts.map((d) => (
          <div key={d.weekday} className={errorFor(d.weekday) ? "day day-error" : "day"}>
            <div className="day-head">
              <strong>{WEEKDAY_LABELS[d.weekday]}</strong>
              <Segmented
                label={`Estado del ${WEEKDAY_LABELS[d.weekday]}`}
                value={d.state}
                onChange={(v) =>
                  canManage &&
                  patch(d.weekday, {
                    state: v,
                    opensAt: v === "open" ? d.opensAt || "10:00" : "",
                    closesAt: v === "open" ? d.closesAt || "19:00" : "",
                  })
                }
                options={[
                  { value: "open", label: "Abierto" },
                  { value: "closed", label: "Cerrado" },
                  { value: "unset", label: "Sin definir" },
                ]}
              />
            </div>
            {d.state === "open" && (
              <div className="day-times">
                <label>
                  <span>Abre</span>
                  <input className="input" type="time" step={900} value={d.opensAt} disabled={!canManage} onChange={(e) => patch(d.weekday, { opensAt: e.target.value })} />
                </label>
                <label>
                  <span>Cierra</span>
                  <input className="input" type="time" step={900} value={d.closesAt} disabled={!canManage} onChange={(e) => patch(d.weekday, { closesAt: e.target.value })} />
                </label>
              </div>
            )}
            {errorFor(d.weekday) && <p className="field-msg">{errorFor(d.weekday)}</p>}
          </div>
        ))}
      </div>
      <Toggle
        label="Horario confirmado por el propietario"
        description="Mientras no esté confirmado, se muestra como pendiente y no se usará para clasificar eventos fuera de horario."
        checked={confirmed}
        onChange={setConfirmed}
        disabled={!canManage}
      />
      <FormError message={errorMsg} />
      {canManage && (
        <Button block onClick={() => void save()} loading={saving} disabled={!dirty}>
          Guardar horario
        </Button>
      )}
    </Card>
  );
}

export default function HorariosSettingsPage() {
  const { businesses, canManage, reloadBusinesses } = useSite();
  const ids = businesses.map((b) => b.id);
  const hours = useAsync(() => fetchHours(ids), [ids.join(",")]);

  return (
    <>
      <BackToSettings />
      <PageHeader title="Horarios" subtitle="Horario comercial de cada negocio (zona horaria del establecimiento)" />
      {!canManage && <ReadOnlyNotice />}
      <Notice tone="info">No se admiten horarios que crucen la medianoche. Un solo horario por día.</Notice>
      {hours.error ? (
        <ErrorBlock message={hours.error} onRetry={() => void hours.reload()} />
      ) : !hours.data ? (
        <LoadingBlock />
      ) : (
        businesses.map((b) => (
          <Section
            key={b.id}
            title={b.name}
            action={b.hours_confirmed ? <Badge tone="success">Confirmado</Badge> : <Badge tone="warning">Pendiente de confirmar</Badge>}
          >
            <WeekEditor
              business={b}
              rows={hours.data!.filter((h) => h.business_id === b.id)}
              canManage={canManage}
              onSaved={async () => {
                await Promise.all([hours.reload(), reloadBusinesses()]);
              }}
            />
          </Section>
        ))
      )}
    </>
  );
}
