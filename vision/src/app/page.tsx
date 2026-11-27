"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FullscreenLoading, SetupRequired } from "@/components/layout/Gates";

export default function RootRedirect() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.status === "signed_in") router.replace("/inicio/");
    else if (auth.status === "signed_out") router.replace("/login/");
    else if (auth.status === "recovery") router.replace("/restablecer/");
  }, [auth.status, router]);
  if (auth.status === "unconfigured") return <SetupRequired />;
  return <FullscreenLoading />;
}
