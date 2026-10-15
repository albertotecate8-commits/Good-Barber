import { requireUser } from "@/lib/data/session";
import { BusinessForm } from "@/components/business-forms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { createBusiness } from "../actions";

export const metadata = { title: "Nuevo negocio" };

export default async function NewBusinessPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Nuevo negocio" description="Agrega una marca nueva sin tocar las demás." />
      {user.isAdmin ? (
        <Card>
          <BusinessForm action={createBusiness} submitLabel="Crear negocio" />
        </Card>
      ) : (
        <Notice tone="warn">Solo un administrador puede crear negocios.</Notice>
      )}
    </>
  );
}
