"use client";

import type { ReactNode } from "react";
import { ProtectedApp } from "@/components/layout/Gates";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ProtectedApp>{children}</ProtectedApp>;
}
