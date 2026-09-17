// La tarjeta «🔔 Notificaciones». Una sola, usada tal cual por el perfil del
// barbero y por el panel del administrador: si algún día cambia el texto o el
// comportamiento, cambia en los dos sitios a la vez.
//
// El administrador pasa barberId = null. Eso no es un hueco: en la base, una
// suscripción con barber_id NULL es la del administrador, y el RLS solo se lo
// permite a él.

import * as push from "./push.js";
import { toast, friendlyError, escapeHtml } from "./ui.js";

export function tarjetaPushHTML(descripcion = "Recibe un aviso en tu teléfono cuando entre una cita nueva, aunque Good Barber esté cerrada.") {
  return `
    <div class="card" id="push-card">
      <h3>🔔 Notificaciones</h3>
      <p class="field-help mt-8">${escapeHtml(descripcion)}</p>
      <div class="mt-16" id="push-estado"><div class="spinner" style="margin:0"></div></div>
    </div>`;
}

// El permiso se pide SOLO al pulsar el botón, nunca al cargar la pantalla.
// iOS lo exige, y además es lo correcto: nadie debe encontrarse un diálogo de
// permisos sin haberlo provocado.
export function montarTarjetaPush(raiz, { barberId = null } = {}) {
  async function pintar() {
    const caja = raiz.querySelector("#push-estado");
    if (!caja) return;

    let estado;
    try {
      estado = await push.estadoActual();
    } catch (error) {
      caja.innerHTML = `<p class="text-danger">${escapeHtml(friendlyError(error))}</p>`;
      return;
    }

    // El navegador no puede: se explica por qué y no se ofrece un botón que
    // no funcionaría. En iPhone sin instalar, este es el mensaje que sale.
    if (!estado.puede) {
      caja.innerHTML = `
        <p style="font-weight:700">Notificaciones desactivadas</p>
        <p class="field-help mt-8">${escapeHtml(estado.mensaje)}</p>
        ${estado.motivo === "ios-sin-instalar"
          ? `<p class="field-help mt-8">Toca el botón de compartir de Safari y elige «Añadir a pantalla de inicio». Después abre Good Barber desde ahí.</p>`
          : ""}`;
      return;
    }

    if (estado.activo) {
      caja.innerHTML = `
        <p style="font-weight:700">✅ Notificaciones activadas</p>
        <p class="field-help mt-8">Este dispositivo recibirá un aviso con cada cita nueva. No es necesario volver a activarlas.</p>
        <button class="btn btn-ghost btn-block mt-16" id="push-off">Desactivar notificaciones</button>`;
      caja.querySelector("#push-off").addEventListener("click", async (e) => {
        const boton = e.currentTarget;
        boton.disabled = true;
        boton.textContent = "Desactivando…";
        try {
          await push.desactivar();
          toast("Notificaciones desactivadas en este dispositivo.", "success");
        } catch (error) {
          toast(friendlyError(error), "error");
        }
        pintar();
      });
      return;
    }

    caja.innerHTML = `
      <p style="font-weight:700">Notificaciones desactivadas</p>
      <button class="btn btn-primary btn-block mt-16" id="push-on">🔔 Activar notificaciones</button>`;
    caja.querySelector("#push-on").addEventListener("click", async (e) => {
      const boton = e.currentTarget;
      boton.disabled = true;
      boton.textContent = "Activando…";
      try {
        const resultado = await push.activar(barberId);

        // El dispositivo ya es de otra cuenta. No es un error del sistema ni
        // algo que se arregle reintentando, así que el aviso se queda escrito
        // en la tarjeta en lugar de pasar volando en un toast.
        if (resultado && resultado.ok === false) {
          caja.innerHTML = `
            <p style="font-weight:700">Notificaciones desactivadas</p>
            <p class="text-danger mt-8">${escapeHtml(resultado.mensaje)}</p>`;
          return;
        }
        toast("✅ Notificaciones activadas.", "success");
      } catch (error) {
        toast(friendlyError(error), "error");
      }
      pintar();
    });
  }

  pintar();
}
