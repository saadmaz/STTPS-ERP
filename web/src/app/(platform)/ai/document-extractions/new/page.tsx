"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { humanize } from "@/lib/format";
import { PageHeader, Field } from "@/components/ui/kit";
import { DOCUMENT_TYPES, extractionsApi } from "@/modules/ai/document-extraction";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Page() {
  const router = useRouter();
  const [docType, setDocType] = useState<(typeof DOCUMENT_TYPES)[number]>("receipt");
  const [file, setFile] = useState<File | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first");
      const fileBase64 = await toBase64(file);
      return extractionsApi.extractions.create({ docType, fileName: file.name, contentType: file.type, fileBase64 });
    },
    onSuccess: (r) => { toast.success("Extracted"); router.push(`/ai/document-extractions/${r.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="New document extraction" subtitle="Upload an invoice, receipt, purchase order, CV or bank statement (PNG, JPEG, WebP or PDF)." />
      <div className="card p-4 space-y-4">
        <Field label="Document type">
          <select className="input-base" value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)}>
            {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </select>
        </Field>
        <Field label="File">
          <input className="input-base" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <button className="btn-primary" disabled={!file || create.isPending} onClick={() => create.mutate()}>Extract</button>
      </div>
    </div>
  );
}
