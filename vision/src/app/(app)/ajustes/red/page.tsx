"use client";

import { useState } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { useAsync } from "@/lib/hooks/useAsync";
import { fetchNetworkChecks, insertNetworkCheck } from "@/lib/data/queries";
import { isIPv4, ispWarning, networkVerdict } from "@/lib/domain/network";
import { friendlyError } from "@/lib/domain/errors";
import { formatDateTime } from "@/lib/domain/time";
import { BackToSettings, ReadOnlyNotice } from "@/components/settings/common";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Card, Field, FormError, Notice, PageHeader, Section, Segmented, TextInput } from "@/components/ui/primitives";

type Medicion = { ipv4: string | null; ipAny: string | null; org: string | null; asn: string | null };

const VERDICT_TONE = { ip_publica: "success", cgnat: "danger", doble_nat: "danger", nat_proveedor: "warning", incompleto: "neutral" } as const;

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default function DiagnosticoRedPage() {
  const { membership, canManage } = useSite();
  const toast = useToast();
  const history = useAsync(() => (canManage ? fetchNetworkChecks(membership.site_id) : Promise.resolve([])), [membership.site_id, canManage]);
  const [m, setM] = useState<Medicion | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  const [wan, setWan] = useState("");
  const [modelo, setModelo] = useState("");
  const [filtro, setFiltro] = useState<"si" | "no" | "no_se">("no_se");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function medir() {
    setMidiendo(true);
    setError(null);
    const [v4, any, info] = await Promise.all([
      getJson("https://api.ipify.org?format=json"),
      getJson("https://api64.ipify.org?format=json"),
      getJson("https://ipapi.co/json/"),
    ]);
    const ipv4 = typeof v4?.ip === "string" ? v4.ip : null;
    setM({
      ipv4,
      ipAny: typeof any?.ip === "string" ? any.ip : null,
      org: typeof info?.org === "string" ? info.org : null,
      asn: typeof info?.asn === "string" ? info.asn : null,
    });
    if (!ipv4) setError("No se pudo medir la IP pública. Revisa que el iPhone tenga internet por el Wi-Fi del local.");
    setMidiendo(false);
  }

  const verdict = networkVerdict(m?.ipv4 ?? null, wan);
  const aviso = ispWarning(m?.org ?? null);

  async function guardar() {
    if (!m?.ipv4) return setError("Primero mide la IP pública.");
    if (!isIPv4(wan)) return setError("Escribe la IP WAN del módem (cuatro números separados por puntos).");
    setSaving(true);
    try {
      await insertNetworkCheck({
        site_id: membership.site_id,
        public_ipv4: m.ipv4,
        public_ip_any: m.ipAny,
        isp_org: m.org,
        isp_asn: m.asn,
        wan_ip_modem: wan.trim(),
        modem_model: modelo.trim() || null,
        source_ip_filter: filtro,
        verdict: verdict.kind,
        notes: aviso,
      });
      toast.success("Diagnóstico guardado.");
      await history.reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BackToSettings />
      <PageHeader title="Diagnóstico de red" subtitle="¿Las cámaras pueden recibir conexión desde el servidor? (no abre ningún puerto)" />
      {!canManage && <ReadOnlyNotice />}

      <Section title="Paso 1 · En el local, con el Wi-Fi de Izzi">
        <Card>
          <p className="small">Conecta el iPhone al Wi-Fi del local y <strong>apaga los datos móviles</strong>. Luego toca:</p>
          <Button onClick={() => void medir()} loading={midiendo} disabled={!canManage}>Medir IP pública</Button>
          {m && (
            <dl className="kv">
              <div><dt>IP pública (IPv4)</dt><dd className="break">{m.ipv4 ?? "—"}</dd></div>
              <div><dt>Proveedor</dt><dd>{m.org ?? "—"}</dd></div>
              <div><dt>IPv6</dt><dd className="break">{m.ipAny && m.ipAny.includes(":") ? m.ipAny : "no disponible"}</dd></div>
            </dl>
          )}
          {aviso && <Notice tone="warning">{aviso}</Notice>}
          <p className="muted small">La medición consulta servicios públicos de «cuál es mi IP» (ipify e ipapi).</p>
        </Card>
      </Section>

      <Section title="Paso 2 · La IP que muestra el módem">
        <Card>
          <ol className="steps">
            <li>Sin salir del Wi-Fi del local, abre Safari y escribe <code>192.168.0.1</code>.</li>
            <li>Entra con el usuario y contraseña de la etiqueta del módem (abajo o atrás del aparato).</li>
            <li>Busca «Estado», «Status», «WAN» o «Internet» y copia la <strong>dirección IPv4 de WAN/Internet</strong>.</li>
          </ol>
          <Field label="IP WAN del módem">
            {(id) => <TextInput id={id} inputMode="decimal" placeholder="Ej. 100.72.15.3" value={wan} onChange={(e) => setWan(e.target.value)} />}
          </Field>
          <Field label="Modelo del módem (opcional)" hint="Viene en la etiqueta: Arris, Technicolor, Hitron, Sagemcom…">
            {(id) => <TextInput id={id} maxLength={80} value={modelo} onChange={(e) => setModelo(e.target.value)} />}
          </Field>
          <p className="small">En el menú de «Reenvío de puertos» / «Port forwarding» del módem (solo mirar, no guardes nada): ¿hay un campo de <strong>IP de origen</strong> o <strong>IP remota permitida</strong>?</p>
          <Segmented label="Filtro por IP de origen" value={filtro} onChange={setFiltro} options={[{ value: "si", label: "Sí hay" }, { value: "no", label: "No hay" }, { value: "no_se", label: "No sé" }]} />
        </Card>
      </Section>

      <Section title="Resultado">
        <Card>
          <div><Badge tone={VERDICT_TONE[verdict.kind]}>{verdict.title}</Badge></div>
          <p className="small">{verdict.detail}</p>
          <FormError message={error} />
          <Button onClick={() => void guardar()} loading={saving} disabled={!canManage || verdict.kind === "incompleto"}>Guardar diagnóstico</Button>
        </Card>
      </Section>

      {canManage && history.data && history.data.length > 0 && (
        <Section title="Diagnósticos guardados">
          <div className="list">
            {history.data.map((h) => (
              <div className="list-row" key={h.id}>
                <div className="list-main">
                  <strong>{formatDateTime(h.created_at, membership.timezone)}</strong>
                  <small className="muted">Pública {h.public_ipv4 ?? "—"} · módem {h.wan_ip_modem ?? "—"} · {h.isp_org ?? "proveedor ?"}</small>
                </div>
                <Badge tone={VERDICT_TONE[h.verdict as keyof typeof VERDICT_TONE] ?? "neutral"}>{h.verdict.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
