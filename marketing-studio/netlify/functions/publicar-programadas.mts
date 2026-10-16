// Función programada de Netlify (incluida en el plan Free; consume pocos
// créditos de cómputo). Cada 15 minutos pide a la app que publique lo aprobado
// cuya hora ya llegó. Si MKT_PUBLISHING_ENABLED no es «1», la app no publica nada.
export default async function handler() {
  // Apagada: no despierta a la app (ahorra créditos del plan Free).
  if (process.env.MKT_PUBLISHING_ENABLED !== "1") return new Response("Publicación automática apagada.", { status: 200 });
  const base = process.env.URL;
  const secret = process.env.MKT_CRON_SECRET;
  if (!base || !secret) return new Response("Falta URL o MKT_CRON_SECRET", { status: 500 });
  const res = await fetch(`${base}/api/meta/publicar-programadas`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

export const config = { schedule: "*/15 * * * *" };
