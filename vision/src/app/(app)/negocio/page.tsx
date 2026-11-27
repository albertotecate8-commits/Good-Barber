"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import type { Business } from "@/lib/domain/types";
import { BusinessMark } from "@/components/layout/BusinessMark";
import { BusinessDetail } from "@/components/dashboard/BusinessDetail";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { IconChevronRight, IconStore } from "@/components/ui/icons";

function BusinessIndex({ businesses }: { businesses: Business[] }) {
  return (
    <>
      <PageHeader title="Negocios" />
      {businesses.length === 0 ? (
        <EmptyState icon={<IconStore />} title="No hay negocios activos" />
      ) : (
        <div className="list">
          {businesses.map((b) => (
            <Link key={b.id} href={`/negocio/?n=${encodeURIComponent(b.slug)}`} className="list-row list-link">
              <BusinessMark name={b.name} color={b.accent_color} />
              <div className="list-main"><strong>{b.name}</strong></div>
              <IconChevronRight size={18} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function NegocioContent() {
  const params = useSearchParams();
  const slug = params.get("n");
  const { businesses, activeBusinesses } = useSite();
  if (!slug) return <BusinessIndex businesses={activeBusinesses} />;
  const business = businesses.find((b) => b.slug === slug);
  if (!business) {
    return (
      <>
        <PageHeader title="Negocio no encontrado" />
        <EmptyState icon={<IconStore />} title={`No existe un negocio «${slug}».`} action={<Link className="btn btn-secondary" href="/negocio/">Ver negocios</Link>} />
      </>
    );
  }
  return <BusinessDetail key={business.id} business={business} />;
}

export default function NegocioPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NegocioContent />
    </Suspense>
  );
}
