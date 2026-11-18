// Venta rápida: los botoncitos flotantes de la pantalla Servicios.
//
// La idea es que registrar un corte cueste UN toque. Nada de formularios,
// nada de buscar cliente, nada de confirmar. Se toca el corte y la cantidad
// se suma al día, ahí mismo, a la vista.
//
// Lo que NO hace, a propósito:
//   · No pide cliente. La venta queda sin cliente, que es lo normal cuando
//     entra alguien de paso. Si hace falta anotarlo, para eso sigue estando
//     «Registrar servicio», que no se tocó.
//   · No pide confirmación. Para eso está «Deshacer», que es más rápido que
//     confirmar cada venta y además perdona el toque equivocado.
//   · No borra nada al deshacer: la venta queda CANCELADA en el historial.
//     Aquí nunca se pierde el rastro de lo que pasó.

import * as data from "./data.js";
import { toast, friendlyError, escapeHtml } from "./ui.js";
import { formatCents } from "./money.js";

// Cuánto se queda en pantalla el «Deshacer» antes de desaparecer.
const SEGUNDOS_PARA_DESHACER = 8;

export function barraVentaRapidaHTML() {
  return `
    <div class="vr-barra" id="vr-barra" hidden>
      <div class="vr-cabecera">
        <span class="vr-titulo">💵 Venta rápida</span>
        <span class="vr-total">Hoy <strong id="vr-total">$0.00</strong></span>
      </div>
      <div class="vr-chips" id="vr-chips" role="group" aria-label="Registrar una venta con un toque"></div>
      <div class="vr-deshacer" id="vr-deshacer" hidden></div>
    </div>`;
}

/* Monta los botoncitos.

   `totalDelDia()` devuelve el total en centavos que ya hay registrado, para
   que el contador de la barra arranque en el número correcto.
   `onRegistrada()` se llama después de guardar o deshacer, para que la lista
   de abajo se refresque. La barra NO se vuelve a pintar: así el «Deshacer»
   sigue en pantalla y los botones no bailan debajo del dedo. */
export async function montarBarraVentaRapida(raiz, { barberId, totalDelDia, onRegistrada, destacar = false }) {
  const barra = raiz.querySelector("#vr-barra");
  const chips = raiz.querySelector("#vr-chips");
  const cajaDeshacer = raiz.querySelector("#vr-deshacer");
  if (!barra || !chips) return;

  let servicios = [];
  try {
    servicios = await data.listServices(true);
  } catch (error) {
    // Sin catálogo no hay botones que pintar. No se inventa ninguno ni se
    // deja una barra vacía ocupando pantalla.
    toast(friendlyError(error), "error");
    return;
  }

  if (servicios.length === 0) return;

  chips.innerHTML = servicios
    .map(
      (s) => `
    <button type="button" class="vr-chip" data-servicio="${s.id}"
            aria-label="Registrar ${escapeHtml(s.name)} por ${formatCents(s.price_cents)}">
      <span class="vr-chip-nombre">${escapeHtml(s.name)}</span>
      <span class="vr-chip-precio">${formatCents(s.price_cents)}</span>
    </button>`
    )
    .join("");

  barra.hidden = false;
  if (destacar) barra.classList.add("vr-destacada");

  let total = Number(totalDelDia) || 0;
  const elTotal = raiz.querySelector("#vr-total");
  const pintarTotal = () => { elTotal.textContent = formatCents(total); };
  pintarTotal();

  let tiempoDeshacer = null;

  function ocultarDeshacer() {
    if (tiempoDeshacer) clearTimeout(tiempoDeshacer);
    tiempoDeshacer = null;
    cajaDeshacer.hidden = true;
    cajaDeshacer.innerHTML = "";
  }

  function ofrecerDeshacer(fila, servicio, importe) {
    cajaDeshacer.innerHTML = `
      <span class="vr-deshacer-texto">✓ ${escapeHtml(servicio.name)} · ${formatCents(importe)}</span>
      <button type="button" class="vr-deshacer-btn" id="vr-undo">Deshacer</button>`;
    cajaDeshacer.hidden = false;

    cajaDeshacer.querySelector("#vr-undo").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Deshaciendo…";
      try {
        await data.cancelServiceRecord(fila.id);
        total = Math.max(0, total - importe);
        pintarTotal();
        ocultarDeshacer();
        toast("Venta cancelada. Queda en el historial como cancelada.", "success");
        if (onRegistrada) onRegistrada();
      } catch (error) {
        btn.disabled = false;
        btn.textContent = "Deshacer";
        toast(friendlyError(error), "error");
      }
    });

    if (tiempoDeshacer) clearTimeout(tiempoDeshacer);
    tiempoDeshacer = setTimeout(ocultarDeshacer, SEGUNDOS_PARA_DESHACER * 1000);
  }

  chips.querySelectorAll("[data-servicio]").forEach((boton) => {
    const servicio = servicios.find((s) => s.id === boton.dataset.servicio);

    boton.addEventListener("click", async () => {
      // Doble toque: el segundo no entra. Sin esto, dos toques rápidos son
      // dos ventas, porque son dos operaciones distintas y legítimas a ojos
      // del servidor.
      if (boton.dataset.guardando === "1") return;
      boton.dataset.guardando = "1";
      boton.classList.add("vr-chip-guardando");

      // El identificador de la venta se genera UNA vez por toque y se reusa
      // si hay reintento: el RPC es idempotente por sale_id, así que un
      // reintento de red devuelve la venta que ya se guardó en lugar de
      // crear una segunda.
      const saleId = crypto.randomUUID();

      try {
        const filas = await data.createServiceRecordsBatch({
          barberId,
          clientId: null,
          items: [{ service: servicio, quantity: 1 }],
          saleId,
        });
        const fila = Array.isArray(filas) ? filas[0] : filas;
        if (!fila?.id) throw new Error("La venta no se guardó. Vuelve a intentarlo.");

        const importe = servicio.price_cents;
        total += importe;
        pintarTotal();
        boton.classList.add("vr-chip-listo");
        setTimeout(() => boton.classList.remove("vr-chip-listo"), 900);
        ofrecerDeshacer(fila, servicio, importe);
        if (onRegistrada) onRegistrada();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        boton.dataset.guardando = "0";
        boton.classList.remove("vr-chip-guardando");
      }
    });
  });
}
