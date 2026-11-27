"use client";

import { useState } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { useAsync, useNow, useRefreshWhileVisible } from "@/lib/hooks/useAsync";
import { fetchCameras, fetchDashboard, fetchHours, fetchSecurityEvents, reviewSecurityEvent } from "@/lib/data/queries";
import { engineStatus } from "@/lib/domain/indicators";
import { describeSchedule, scheduleStatus } from "@/lib/domain/schedule";
import { localDateISO } from "@/lib/domain/time";
import { friendlyError } from "@/lib/domain/errors";
import type { SecurityEvent, SecurityStatus } from "@/lib/domain/types";
import { SECURITY_KIND_LABELS } from "@/lib/domain/types";
import { TAPO_APP_STORE_URL } from "@/lib/config";
import { CameraList } from "@/components/dashboard/CameraList";
import { EngineBanner } from "@/components/dashboard/EngineBanner";
import { SecurityEventList } from "@/components/dashboard/SecurityEventList";
import { BusinessMark } from "@/components/layout/BusinessMark";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, ErrorBlock, Field, LoadingBlock, Notice, PageHeader, Section, Segmented, TextArea } from "@/components/ui/primitives";

export default function SeguridadPage() {
  const { membership, activeBusinesses, canManage } = useSite();
  const toast = useToast();
  const now = useNow();
  const [filterBiz, setFilterBiz] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"open" | "all">("open");
  const [reviewing, setReviewing] = useState<SecurityEvent | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const ids = activeBusinesses.map((b) => b.id);
  const selectedIds = filterBiz === "all" ? ids : [filterBiz];
  const key = ids.join(",");

  const base = useAsync(async () => {
    const today = localDateISO(new Date(), membership.timezone);
    const [dash, cameras, hours] = await Promise.all([
      fetchDashboard(membership.site_id, ids, today, today),
      fetchCameras(ids),
      fetchHours(ids),
    ]);
    return { engineNodes: dash.engineNodes, cameras, hours };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const events = useAsync(
    () => fetchSecurityEvents(selectedIds, { onlyOpen: filterStatus === "open", limit: 100 }),
    [selectedIds.join(","), filterStatus],
  );

  useRefreshWhileVisible(() => {
    void base.reload();
    void events.reload();
  }, 60_000);

  async function submitReview(status: SecurityStatus) {
    if (!reviewing) return;
    setSaving(true);
    try {
      await reviewSecurityEvent(reviewing.id, status, note.trim() || null);
      toast.success(status === "open" ? "Evento reabierto." : "Revisión guardada.");
      setReviewing(null);
      setNote("");
      await events.reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const engine = engineStatus(base.data?.engineNodes ?? [], now);

  return (
    <>
      <PageHeader title="Seguridad" subtitle="Eventos, horarios y conexión de cámaras" />

      <Notice tone="info" title="Vigilancia principal: alertas de Tapo">
        Las notificaciones nativas de la app Tapo siguen siendo el respaldo principal. Aquí se registrarán los eventos del análisis
        propio cuando el motor de visión esté conectado.{" "}
        <a href={TAPO_APP_STORE_URL} target="_blank" rel="noopener noreferrer">Abrir Tapo</a>
      </Notice>

      {base.error && !base.data ? (
        <ErrorBlock message={base.error} onRetry={() => void base.reload()} />
      ) : !base.data ? (
        <LoadingBlock />
      ) : (
        <>
          <EngineBanner engine={engine} now={now} />
          <Section title="Horario ahora">
            <div className="list">
              {activeBusinesses.map((b) => {
                const st = scheduleStatus(base.data!.hours.filter((h) => h.business_id === b.id), b.hours_confirmed, now, membership.timezone);
                return (
                  <div className="list-row" key={b.id}>
                    <BusinessMark name={b.name} color={b.accent_color} />
                    <div className="list-main">
                      <strong>{b.name}</strong>
                      <small className="muted">{describeSchedule(st)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title="Conexión de cámaras">
            <CameraList cameras={base.data.cameras} businesses={activeBusinesses} now={now} showBusiness />
          </Section>
        </>
      )}

      <Section title="Eventos">
        <div className="filters">
          {activeBusinesses.length > 1 && (
            <Segmented
              label="Negocio"
              value={filterBiz}
              onChange={setFilterBiz}
              options={[{ value: "all", label: "Todos" }, ...activeBusinesses.map((b) => ({ value: b.id, label: b.name }))]}
            />
          )}
          <Segmented
            label="Estado"
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "open", label: "Por revisar" },
              { value: "all", label: "Todos" },
            ]}
          />
        </div>
        {events.error ? (
          <ErrorBlock message={events.error} onRetry={() => void events.reload()} />
        ) : !events.data ? (
          <LoadingBlock />
        ) : (
          <SecurityEventList
            events={events.data}
            businesses={activeBusinesses}
            cameras={base.data?.cameras ?? []}
            engine={engine}
            onReview={canManage ? (e) => { setReviewing(e); setNote(e.review_note ?? ""); } : undefined}
          />
        )}
      </Section>

      <Sheet
        open={!!reviewing}
        onClose={() => !saving && setReviewing(null)}
        title={reviewing ? SECURITY_KIND_LABELS[reviewing.kind] : "Revisar"}
        footer={
          reviewing?.status === "open" ? (
            <>
              <Button variant="secondary" onClick={() => void submitReview("dismissed")} loading={saving}>Descartar</Button>
              <Button onClick={() => void submitReview("acknowledged")} loading={saving}>Marcar revisado</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => void submitReview("open")} loading={saving}>Reabrir</Button>
          )
        }
      >
        <Card>
          <p className="muted small">
            «Revisado» confirma que alguien lo verificó (por ejemplo, en la app Tapo). «Descartar» lo marca como falsa alarma. El evento
            original nunca se borra.
          </p>
        </Card>
        <Field label="Nota (opcional)" hint="Máximo 500 caracteres.">
          {(id) => <TextArea id={id} maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </Sheet>
    </>
  );
}
