import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";
import { ObjectStorageProvider, MemoryStorage } from "../../src/platform/files/object-storage.js";
import { NotificationsService } from "../../src/platform/notifications/notifications.service.js";

describe("record features over HTTP", () => {
  let app: INestApplication;
  let t: Seeded;
  let branchId: string;
  let otherBranchId: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["org.branch.view"]);
    const res = await http().post("/api/v1/org/branches").set(as("admin")).send({ code: "CMB", name: "Colombo Central", type: "store" }).expect(201);
    branchId = res.body.id;
    const other = await http().post("/api/v1/org/branches").set(as("admin")).send({ code: "KDY", name: "Kandy" }).expect(201);
    otherBranchId = other.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (user: "admin" | "viewer" | "outsider") => ({ Authorization: `Bearer ${t.token(user)}`, "x-company-id": t.companyId });

  it("comments with mentions notify the mentioned user", async () => {
    const viewerId = `${t.tenantId}_viewer`;
    await http().post(`/api/v1/records/org.branch/${branchId}/comments`).set(as("admin")).send({ body: `Please check @[Vera](user:${viewerId})` }).expect(201);
    const comments = await http().get(`/api/v1/records/org.branch/${branchId}/comments`).set(as("viewer")).expect(200);
    expect(comments.body[0]).toMatchObject({ mentions: [viewerId] });
    const inbox = await app.get(NotificationsService).listMine(viewerId);
    expect(inbox.find((n) => n.category === "mention")).toMatchObject({ link: `/org/branches/${branchId}` });
    // Viewers can read but only the author can edit.
    await http().patch(`/api/v1/comments/${comments.body[0].id}`).set(as("viewer")).send({ body: "hijack" }).expect(403);
  });

  it("tags need edit permission and are searchable by tag", async () => {
    await http().put(`/api/v1/records/org.branch/${branchId}/tags`).set(as("viewer")).send({ tags: ["x"] }).expect(403);
    const tags = await http().put(`/api/v1/records/org.branch/${branchId}/tags`).set(as("admin")).send({ tags: ["Flagship", "west", "west"] }).expect(200);
    expect(tags.body).toEqual(["flagship", "west"]);
    const tagged = await http().get("/api/v1/records/tagged/flagship").set(as("viewer")).expect(200);
    expect(tagged.body).toEqual([{ entityType: "org.branch", entityId: branchId, link: `/org/branches/${branchId}` }]);
  });

  it("links records both ways and shows them as related", async () => {
    await http().post(`/api/v1/records/org.branch/${branchId}/links`).set(as("admin")).send({ toType: "org.branch", toId: otherBranchId, relation: "supplies" }).expect(201);
    const fromSide = await http().get(`/api/v1/records/org.branch/${branchId}/related`).set(as("viewer")).expect(200);
    expect(fromSide.body[0]).toMatchObject({ direction: "outgoing", relation: "supplies", entityId: otherBranchId, typeLabel: "Branch" });
    const toSide = await http().get(`/api/v1/records/org.branch/${otherBranchId}/related`).set(as("viewer")).expect(200);
    expect(toSide.body[0]).toMatchObject({ direction: "incoming", entityId: branchId });
  });

  it("validates custom fields and shows one activity timeline", async () => {
    await http().post("/api/v1/settings/custom-fields").set(as("admin")).send({ entityType: "org.branch", key: "region", label: "Region", type: "select", options: ["North", "South"] }).expect(201);
    await http().patch(`/api/v1/org/branches/${branchId}`).set(as("admin")).send({ customFields: { region: "East" } }).expect(400);
    await http().patch(`/api/v1/org/branches/${branchId}`).set(as("admin")).send({ customFields: { colour: "red" } }).expect(400);
    const ok = await http().patch(`/api/v1/org/branches/${branchId}`).set(as("admin")).send({ customFields: { region: "South" } }).expect(200);
    expect(ok.body.customFields).toEqual({ region: "South" });

    const activity = await http().get(`/api/v1/records/org.branch/${branchId}/activity`).set(as("viewer")).expect(200);
    const kinds = activity.body.map((a: { kind: string; action: string }) => `${a.kind}:${a.action}`);
    expect(kinds).toEqual(expect.arrayContaining(["audit:created", "audit:updated", "audit:tagged", "comment:commented"]));
  });

  it("searches by word prefix and respects view permissions", async () => {
    const hits = await http().get("/api/v1/search?q=colo cen").set(as("viewer")).expect(200);
    expect(hits.body.map((h: { entityId: string }) => h.entityId)).toEqual([branchId]);
    expect(hits.body[0]).toMatchObject({ typeLabel: "Branch", link: `/org/branches/${branchId}` });
    // A user without org.branch.view sees nothing, even though the index has the record.
    const noPerm = await seedTenant(app, []);
    const blind = await http().get("/api/v1/search?q=colombo").set({ Authorization: `Bearer ${noPerm.token("viewer")}`, "x-company-id": noPerm.companyId }).expect(200);
    expect(blind.body).toEqual([]);
  });

  it("keeps saved views private unless shared with permission", async () => {
    const mine = await http().post("/api/v1/views").set(as("viewer")).send({ entityType: "org.branch", name: "Stores", config: { where: "type:store" } }).expect(201);
    await http().post("/api/v1/views").set(as("viewer")).send({ entityType: "org.branch", name: "Shared", shared: true, config: {} }).expect(403);
    const shared = await http().post("/api/v1/views").set(as("admin")).send({ entityType: "org.branch", name: "All", shared: true, config: {} }).expect(201);
    const visible = await http().get("/api/v1/views?entityType=org.branch").set(as("viewer")).expect(200);
    expect(visible.body.map((v: { id: string }) => v.id).sort()).toEqual([mine.body.id, shared.body.id].sort());
    await http().patch(`/api/v1/views/${shared.body.id}`).set(as("viewer")).send({ name: "Mine now" }).expect(403);
  });

  it("uploads, verifies and downloads files through presigned URLs", async () => {
    const storage = app.get(ObjectStorageProvider).storage as MemoryStorage;
    await http().post("/api/v1/files/upload-url").set(as("viewer")).send({ entityType: "org.branch", entityId: branchId, name: "lease.pdf", contentType: "application/pdf", size: 10 }).expect(403);
    const start = await http().post("/api/v1/files/upload-url").set(as("admin")).send({ entityType: "org.branch", entityId: branchId, name: "../lease.pdf", contentType: "application/pdf", size: 10 }).expect(201);
    expect(start.body.uploadUrl).toContain("memory://PUT/");
    expect(start.body.file).toMatchObject({ name: "_lease.pdf", status: "pending" });
    const fileId = start.body.file.id;

    await http().post(`/api/v1/files/${fileId}/complete`).set(as("admin")).expect(400);
    storage.put(start.body.file.storageKey, 9, "application/pdf");
    await http().post(`/api/v1/files/${fileId}/complete`).set(as("admin")).expect(400);
    storage.put(start.body.file.storageKey, 10, "application/pdf");
    await http().post(`/api/v1/files/${fileId}/complete`).set(as("admin")).expect(200);

    const list = await http().get(`/api/v1/records/org.branch/${branchId}/files`).set(as("viewer")).expect(200);
    expect(list.body.map((f: { id: string }) => f.id)).toEqual([fileId]);
    const download = await http().get(`/api/v1/files/${fileId}/download`).set(as("viewer")).expect(200);
    expect(download.body.url).toContain("memory://GET/");
  });
});
