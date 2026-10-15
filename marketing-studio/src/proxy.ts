import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/configuracion-inicial"];

// Refresca la sesión de Supabase en cada petición y manda a /login a quien no
// la tenga. Es solo la primera barrera: cada página y acción vuelve a
// verificar al usuario, y RLS protege los datos en la base.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!url || !anonKey) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/configuracion-inicial", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const login = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
