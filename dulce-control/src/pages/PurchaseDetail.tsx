import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Button, CandyAvatar, Card, ErrorBox, Loading, Page, SectionTitle, TopBar } from "../components/ui";
import { usePurchase } from "../hooks/data";
import { useCatalog } from "../hooks/useCatalog";
import { fmtFull, fmtTime, int, money } from "../lib/format";

export function PurchaseDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { data, isLoading, error } = usePurchase(id);
  const catalog = useCatalog();
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const justSaved = params.get("nuevo") === "1";

  useEffect(() => {
    if (data?.ticket_path) api.ticketUrl(data.ticket_path).then(setTicketUrl).catch(() => setTicketUrl(null));
  }, [data?.ticket_path]);

  if (isLoading) return <Loading />;
  if (error || !data) return <Page className="pt-10"><ErrorBox error={error ?? "No encontrada"} /></Page>;

  return (
    <>
      <TopBar title="Detalle de compra" back={justSaved ? "/compras" : true} />
      <Page>
        {justSaved && (
          <div className="mb-4 flex items-center gap-3 rounded-3xl bg-mint-soft p-4 animate-pop-in">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-semibold">Inventario actualizado</p>
              <p className="text-sm text-ink-2">Se sumaron {int(data.total_units)} piezas. El próximo sábado se comparará contra estas cantidades.</p>
            </div>
          </div>
        )}

        <Card className="p-5">
          <p className="text-lg font-semibold">{data.store_name || (data.source === "ticket" ? "Compra con ticket" : "Compra")}</p>
          <p className="text-sm text-ink-2">{fmtFull(data.purchased_at)} · {fmtTime(data.purchased_at)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-ink-3">Piezas</p><p className="tabular text-xl font-semibold">{int(data.total_units)}</p></div>
            <div className="rounded-2xl bg-pink-soft p-3"><p className="text-xs text-ink-3">Costo</p><p className="tabular text-xl font-semibold">{money(data.total_cost)}</p></div>
          </div>
        </Card>

        <SectionTitle>Productos</SectionTitle>
        <Card className="divide-y divide-line">
          {data.items.map((i) => {
            const look = catalog.look(catalog.byId.get(i.product_id));
            return (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <CandyAvatar emoji={look.emoji} color={look.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{i.product_name}</p>
                  <p className="text-xs text-ink-3">
                    {i.previous_quantity} → {i.new_quantity} en inventario
                    {i.raw_name && <> · ticket: {i.raw_name}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular font-semibold">+{i.quantity}</p>
                  {i.unit_cost != null && <p className="tabular text-xs text-ink-3">{money(i.unit_cost)} c/u</p>}
                </div>
              </div>
            );
          })}
        </Card>

        {data.ticket_path && (
          <>
            <SectionTitle>📷 Ticket</SectionTitle>
            {ticketUrl ? (
              <button onClick={() => setZoom(!zoom)} className="block w-full">
                <img src={ticketUrl} alt="Foto del ticket" className={zoom ? "w-full rounded-3xl" : "max-h-72 w-full rounded-3xl object-cover object-top"} />
              </button>
            ) : <p className="text-sm text-ink-3">La foto no está disponible.</p>}
          </>
        )}

        {justSaved && <Button block size="lg" className="mt-6" onClick={() => nav("/")}>Listo, ir al inicio</Button>}
      </Page>
    </>
  );
}
