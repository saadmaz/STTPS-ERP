import { Injectable } from "@nestjs/common";

export const SIGNATURE_PROVIDER = "ESignatureProvider";

/**
 * A swappable adapter for e-signature providers. Today there is only the
 * manual one: it doesn't call any external service, and whether a document
 * actually got signed is always recorded by a staff member by hand
 * (`DocumentService.recordSignatureOutcome`) — a real provider integration
 * (DocuSign, Adobe Sign: OAuth, a signer-redirect flow, an inbound webhook to
 * learn the outcome) is its own project, not a thin layer over this.
 */
export interface ESignatureProvider {
  readonly name: string;
  requestSignature(doc: { id: string; title: string }): Promise<{ providerRef: string }>;
}

@Injectable()
export class ManualSignatureProvider implements ESignatureProvider {
  readonly name = "manual";

  async requestSignature(doc: { id: string; title: string }): Promise<{ providerRef: string }> {
    return { providerRef: `manual:${doc.id}` };
  }
}
