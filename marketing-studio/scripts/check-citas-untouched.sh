#!/usr/bin/env bash
# Comprueba que la rama no modifica la app de citas de Good Barber: todo cambio
# debe estar dentro de marketing-studio/, salvo el flujo de CI del Studio y el
# enlace en el README raíz (documentación).
set -euo pipefail
base="${1:-origin/main}"
cd "$(git rev-parse --show-toplevel)"
changed=$(git diff --name-only "$base"...HEAD)
outside=$(echo "$changed" | grep -v '^marketing-studio/' | grep -v '^\.github/workflows/marketing-studio\.yml$' | grep -v '^README\.md$' || true)
if [ -n "$outside" ]; then
  echo "La rama modifica archivos fuera de marketing-studio/:"; echo "$outside"; exit 1
fi
if echo "$changed" | grep -q '^README\.md$'; then
  # En el README raíz solo se permite agregar líneas (el enlace al Studio).
  if git diff "$base"...HEAD -- README.md | grep -E '^-[^-]' >/dev/null; then
    echo "README.md raíz: se eliminaron o cambiaron líneas existentes."; exit 1
  fi
fi
echo "OK: la app de citas no tiene cambios ($(echo "$changed" | grep -c '^marketing-studio/') archivos solo en marketing-studio/)."
