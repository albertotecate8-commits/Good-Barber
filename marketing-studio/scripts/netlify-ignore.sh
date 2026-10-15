#!/usr/bin/env bash
# Netlify ejecuta esto desde marketing-studio/ antes de construir.
# Salida 0 = omitir la construcción; salida 1 = construir.
# Sin caché (primer despliegue o «Clear cache and deploy») Netlify pone
# CACHED_COMMIT_REF igual a COMMIT_REF: en ese caso siempre se construye.
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ "${CACHED_COMMIT_REF}" = "${COMMIT_REF:-}" ]; then
  exit 1
fi
if ! git cat-file -e "${CACHED_COMMIT_REF}^{commit}" 2>/dev/null; then
  exit 1
fi
git diff --quiet "${CACHED_COMMIT_REF}" "${COMMIT_REF}" -- .
