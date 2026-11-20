import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("Document management", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["documents.document.view", "documents.document.create", "documents.document.edit", "documents.folder.view"]);
  });
  afterAll(async () => {
    await app?.close();
  });

  let folderId: string;
  let documentId: string;

  it("creates a folder and a document inside it", async () => {
    const folder = await http().post("/api/v1/documents/folders").set(as()).send({ name: "Contracts" }).expect(201);
    folderId = folder.body.id;

    const doc = await http().post("/api/v1/documents/records").set(as("viewer")).send({ title: "Supplier NDA", category: "legal", folderId }).expect(201);
    documentId = doc.body.id;
    expect(doc.body).toMatchObject({ title: "Supplier NDA", category: "legal", folderId, status: "draft", signatureStatus: "none" });

    // A document can be attached to via the existing generic record features — no document-specific wiring needed.
    await http().get(`/api/v1/records/documents.document/${documentId}/related`).set(as("viewer")).expect(200);
    await http().get(`/api/v1/records/documents.document/_/custom-fields`).set(as("viewer")).expect(200);
  });

  it("rejects a document in the wrong folder", async () => {
    await http().post("/api/v1/documents/records").set(as()).send({ title: "Orphan", category: "other", folderId: "does-not-exist" }).expect(400);
  });

  it("submits for approval and auto-approves when no workflow is configured", async () => {
    const submitted = await http().post(`/api/v1/documents/records/${documentId}/submit`).set(as("viewer")).expect(200);
    expect(submitted.body.status).toBe("approved");

    await http().post(`/api/v1/documents/records/${documentId}/submit`).set(as("viewer")).expect(400); // not a draft any more
  });

  it("requests and records a signature outcome", async () => {
    const draft = await http().post("/api/v1/documents/records").set(as()).send({ title: "Not yet approved", category: "contract" }).expect(201);
    await http().post(`/api/v1/documents/records/${draft.body.id}/request-signature`).set(as()).expect(400);

    const signed = await http().post(`/api/v1/documents/records/${documentId}/request-signature`).set(as("viewer")).expect(200);
    expect(signed.body.signatureStatus).toBe("pending");
    expect(signed.body.signatureProviderRef).toBe(`manual:${documentId}`);

    await http().post(`/api/v1/documents/records/${documentId}/signature-outcome`).set(as("viewer")).send({ outcome: "signed" }).expect(200);
    await http().post(`/api/v1/documents/records/${documentId}/signature-outcome`).set(as("viewer")).send({ outcome: "signed" }).expect(400); // not pending any more

    const got = await http().get(`/api/v1/documents/records/${documentId}`).set(as("viewer")).expect(200);
    expect(got.body.signatureStatus).toBe("signed");
  });

  it("creates a document from a template, copying its metadata", async () => {
    const template = await http().post("/api/v1/documents/records").set(as()).send({ title: "NDA template", category: "legal", folderId, isTemplate: true, signatureRequired: true, notes: "Standard terms" }).expect(201);

    await http().post(`/api/v1/documents/records/${documentId}/from-template`).set(as("viewer")).send({ title: "Won't work" }).expect(400); // not a template

    const copy = await http().post(`/api/v1/documents/records/${template.body.id}/from-template`).set(as("viewer")).send({ title: "ACME NDA" }).expect(201);
    expect(copy.body).toMatchObject({ title: "ACME NDA", category: "legal", folderId, status: "draft", isTemplate: false, templateId: template.body.id, signatureRequired: true, notes: "Standard terms" });
  });

  it("keeps folder creation behind its own permission, separate from documents", async () => {
    await http().post("/api/v1/documents/folders").set(as("viewer")).send({ name: "Nope" }).expect(403); // viewer only has documents.folder.view
    await http().post("/api/v1/documents/folders").set(as("outsider")).send({ name: "Nope" }).expect(403); // not a member of this company
    await http().post("/api/v1/documents/records").set(as("viewer")).send({ title: "Allowed", category: "other" }).expect(201); // viewer does have documents.document.create
  });
});
