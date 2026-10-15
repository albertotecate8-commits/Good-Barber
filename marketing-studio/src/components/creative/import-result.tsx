"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { attachImportedResult } from "@/app/(app)/estudio/actions";
import { AssetUploader } from "../asset-uploader";
import { Field } from "../ui";

/** Sube a la Biblioteca lo que generaste en ChatGPT/Gemini/Flow y lo registra como versión. */
export function ImportResult({
  projectId,
  businessId,
  businessName,
  projectTitle,
  video,
  conceptOptions,
}: {
  projectId: string;
  businessId: string;
  businessName: string;
  projectTitle: string;
  video: boolean;
  conceptOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [tool, setTool] = useState(video ? "flow" : "chatgpt");
  const [parent, setParent] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="¿De dónde viene?" name="imp-tool">
          <select id="imp-tool" className="input" value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="chatgpt">ChatGPT</option>
            <option value="gemini">Gemini</option>
            <option value="flow">Google Flow</option>
            <option value="otro">Otra herramienta</option>
          </select>
        </Field>
        <Field label="Concepto que usaste" name="imp-parent">
          <select id="imp-parent" className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Ninguno</option>
            {conceptOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <AssetUploader
        businesses={[{ id: businessId, name: businessName }]}
        defaultBusinessId={businessId}
        defaultKind={video ? "video" : "image"}
        defaultOrigin="ai_generated"
        defaultTags={`estudio, ${projectTitle}`}
        submitLabel="Importar a la Biblioteca y al proyecto"
        onUploaded={async (assetId) => {
          const r = await attachImportedResult(projectId, { assetId, tool, parentVersionId: parent || null });
          setMessage(r.ok ? { ok: true, text: "Resultado importado como nueva versión. Pásalo por el editor para poner textos exactos y revísalo antes de usarlo." } : { ok: false, text: r.message });
          router.refresh();
        }}
      />
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
