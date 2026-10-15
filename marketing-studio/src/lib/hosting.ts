// Detecta si la app corre en un hosting sin servidor propio (Netlify, Vercel u
// otro sobre AWS Lambda). Ahí el disco es efímero y no hay FFmpeg, así que el
// almacenamiento local y el montaje de video se desactivan con un aviso claro.

type Env = Record<string, string | undefined>;

export function serverlessHost(env: Env = process.env): string | null {
  if (env.NETLIFY || (env.SITE_ID && env.DEPLOY_URL)) return "Netlify";
  if (env.VERCEL) return "Vercel";
  if (env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT) return "este hosting sin servidor";
  return null;
}
