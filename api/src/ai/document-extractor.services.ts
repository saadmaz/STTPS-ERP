import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { DOCUMENT_TYPES } from "./document-extraction.models.js";

const MODEL = "claude-sonnet-5-5";

const SCHEMAS: Record<(typeof DOCUMENT_TYPES)[number], Anthropic.Tool["input_schema"]> = {
  invoice: {
    type: "object",
    properties: {
      supplierName: { type: "string" }, invoiceNumber: { type: "string" }, invoiceDate: { type: "string" }, dueDate: { type: "string" },
      currency: { type: "string" }, totalAmount: { type: "number" }, taxAmount: { type: "number" },
      lineItems: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, amount: { type: "number" } } } },
    },
  },
  receipt: {
    type: "object",
    properties: { merchant: { type: "string" }, date: { type: "string" }, currency: { type: "string" }, totalAmount: { type: "number" }, category: { type: "string" }, description: { type: "string" } },
  },
  purchase_order: {
    type: "object",
    properties: {
      supplierName: { type: "string" }, poNumber: { type: "string" }, orderDate: { type: "string" }, currency: { type: "string" }, totalAmount: { type: "number" },
      lineItems: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" } } } },
    },
  },
  cv: {
    type: "object",
    properties: {
      candidateName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, currentTitle: { type: "string" }, yearsExperience: { type: "number" },
      skills: { type: "array", items: { type: "string" } },
      education: { type: "array", items: { type: "object", properties: { institution: { type: "string" }, degree: { type: "string" }, year: { type: "string" } } } },
      workHistory: { type: "array", items: { type: "object", properties: { employer: { type: "string" }, title: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" } } } },
    },
  },
  bank_statement: {
    type: "object",
    properties: {
      accountNumber: { type: "string" }, statementDate: { type: "string" }, currency: { type: "string" },
      transactions: { type: "array", items: { type: "object", properties: { date: { type: "string" }, description: { type: "string" }, amount: { type: "number" }, type: { type: "string", enum: ["debit", "credit"] } } } },
    },
  },
};

export interface ExtractionResult {
  extractedData: Record<string, unknown>;
  error: string | null;
}

/**
 * Extracts structured fields from an uploaded invoice/receipt/PO/CV/bank
 * statement via a forced tool call, so the result is always well-formed
 * JSON rather than free text to parse. The file is never stored — it's
 * processed once and discarded; only the extracted fields persist (on the
 * `DocumentExtractionDoc`, as a user-reviewable draft, never posted
 * directly to any ledger or master-data entity).
 */
@Injectable()
export class DocumentExtractorService {
  private readonly logger = new Logger("AI");

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async extract(docType: (typeof DOCUMENT_TYPES)[number], contentType: string, fileBase64: string): Promise<ExtractionResult> {
    if (!this.isConfigured()) {
      return { extractedData: {}, error: "The AI assistant isn't configured yet — ask an administrator to set ANTHROPIC_API_KEY." };
    }
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const label = docType.replace(/_/g, " ");
      const contentBlock: Anthropic.ContentBlockParam =
        contentType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
          : { type: "image", source: { type: "base64", media_type: contentType as "image/png" | "image/jpeg" | "image/webp", data: fileBase64 } };
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        tools: [{ name: "extract", description: `Extracts structured fields from a ${label}`, input_schema: SCHEMAS[docType] }],
        tool_choice: { type: "tool", name: "extract" },
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: `Extract the fields from this ${label}.` }] }],
      });
      const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!toolUse) return { extractedData: {}, error: "The model did not return structured data." };
      return { extractedData: toolUse.input as Record<string, unknown>, error: null };
    } catch (error) {
      this.logger.warn(`Extraction failed: ${(error as Error).message}`);
      return { extractedData: {}, error: (error as Error).message.slice(0, 300) };
    }
  }
}
