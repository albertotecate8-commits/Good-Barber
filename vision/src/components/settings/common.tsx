import Link from "next/link";
import { IconChevronLeft } from "../ui/icons";
import { Notice } from "../ui/primitives";

export function BackToSettings() {
  return (
    <Link href="/ajustes/" className="back-link">
      <IconChevronLeft size={18} /> Ajustes
    </Link>
  );
}

export function ReadOnlyNotice() {
  return <Notice tone="info">Tu rol es de solo lectura. Pide al propietario que haga los cambios.</Notice>;
}
