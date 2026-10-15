import { Badge, Card, Notice, PageHeader } from "./ui";

export function ModulePlaceholder({
  title,
  stage,
  description,
  planned,
  honestNote,
}: {
  title: string;
  stage: string;
  description: string;
  planned: string[];
  honestNote?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} eyebrow={<Badge tone="warn">En construcción · {stage}</Badge>} />
      <Notice tone="warn" title="Este módulo todavía no funciona">
        Se muestra para que conozcas el plan. Ningún botón de esta sección simula resultados.
      </Notice>
      <Card className="mt-4">
        <h2 className="mb-2 text-base font-semibold">Qué hará</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          {planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {honestNote && <p className="mt-4 text-xs text-faint">{honestNote}</p>}
      </Card>
    </>
  );
}
