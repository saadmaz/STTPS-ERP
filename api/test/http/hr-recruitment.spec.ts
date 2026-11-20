import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createApp, seedTenant, Seeded } from "./app.js";

describe("HR: recruitment, from requisition to hire", () => {
  let app: INestApplication;
  let t: Seeded;
  const http = () => request(app.getHttpServer());
  const as = (u: "admin" | "viewer" | "outsider" = "admin") => ({ Authorization: `Bearer ${t.token(u)}`, "x-company-id": t.companyId });
  let department: string;
  let position: string;
  let manager: string;

  beforeAll(async () => {
    app = await createApp();
    t = await seedTenant(app, ["hr.candidate.view", "hr.candidate.edit", "hr.jobRequisition.view"]);
    department = (await http().post("/api/v1/org/departments").set(as()).send({ code: "ENG", name: "Engineering" }).expect(201)).body.id;
    position = (await http().post("/api/v1/hr/positions").set(as()).send({ code: "ENG-3", title: "Engineer", departmentId: department }).expect(201)).body.id;
    manager = (await http().post("/api/v1/hr/employees").set(as()).send({ firstName: "Nimal", lastName: "Perera", joiningDate: "2023-01-01", departmentId: department }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  let requisitionId: string;
  let postingId: string;

  it("submits a requisition, approving it at once with no workflow configured", async () => {
    const req = await http().post("/api/v1/hr/requisitions").set(as()).send({
      positionId: position, departmentId: department, hiringManagerId: manager, openings: 2, justification: "Team is growing", targetSalaryMax: "250000",
    }).expect(201);
    expect(req.body).toMatchObject({ number: expect.stringMatching(/^REQ-\d+$/), status: "draft", openings: 2, filledCount: 0 });
    requisitionId = req.body.id;
    const submitted = await http().post(`/api/v1/hr/requisitions/${requisitionId}/submit`).set(as()).expect(200);
    expect(submitted.body.status).toBe("approved");
  });

  it("only posts an approved requisition, then publishes to the public career page", async () => {
    const draftReq = await http().post("/api/v1/hr/requisitions").set(as()).send({ positionId: position, justification: "Backfill" }).expect(201);
    const blocked = await http().post("/api/v1/hr/postings").set(as()).send({ requisitionId: draftReq.body.id, title: "Engineer", description: "Build things." }).expect(201);
    await http().post(`/api/v1/hr/postings/${blocked.body.id}/publish`).set(as()).expect(400);

    const posting = await http().post("/api/v1/hr/postings").set(as()).send({ requisitionId, title: "Software Engineer", description: "Build things that matter.", location: "Colombo" }).expect(201);
    postingId = posting.body.id;
    const published = await http().post(`/api/v1/hr/postings/${postingId}/publish`).set(as()).expect(200);
    expect(published.body).toMatchObject({ status: "published", publishedAt: expect.any(String) });
  });

  let candidateId: string;

  it("lists and reads published postings on the public career page, with no authentication", async () => {
    const list = await http().get(`/api/v1/public/careers/${t.companyId}`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: postingId, title: "Software Engineer" });
    expect(list.body[0]).not.toHaveProperty("requisitionId");

    const one = await http().get(`/api/v1/public/careers/${t.companyId}/${postingId}`).expect(200);
    expect(one.body).toMatchObject({ title: "Software Engineer", location: "Colombo" });

    const applied = await http().post(`/api/v1/public/careers/${t.companyId}/${postingId}/apply`).send({
      firstName: "Kamala", lastName: "Silva", email: "kamala@example.com", phone: "0771234567",
    }).expect(201);
    candidateId = applied.body.id;

    const candidate = await http().get(`/api/v1/hr/candidates/${candidateId}`).set(as()).expect(200);
    expect(candidate.body).toMatchObject({ stage: "applied", source: "career_page", postingId, requisitionId, email: "kamala@example.com" });
  });

  it("schedules interviews, records a scorecard and averages the score", async () => {
    const scheduled = await http().post(`/api/v1/hr/candidates/${candidateId}/interviews`).set(as()).send({
      scheduledAt: "2026-02-01T10:00:00.000Z", type: "phone", interviewerId: manager,
    }).expect(200);
    expect(scheduled.body.stage).toBe("interview");
    const interviewId = scheduled.body.interviews[0].interviewId;

    const second = await http().post(`/api/v1/hr/candidates/${candidateId}/interviews`).set(as()).send({ scheduledAt: "2026-02-05T10:00:00.000Z", type: "technical" }).expect(200);
    const secondId = second.body.interviews[1].interviewId;

    await http().post(`/api/v1/hr/candidates/${candidateId}/interviews/${interviewId}/scorecard`).set(as()).send({ status: "completed", rating: 4, comments: "Good communicator" }).expect(200);
    const scored = await http().post(`/api/v1/hr/candidates/${candidateId}/interviews/${secondId}/scorecard`).set(as()).send({ status: "completed", rating: 5, comments: "Strong technically" }).expect(200);
    expect(scored.body.score).toBe(4.5);
  });

  it("extends an offer, the candidate accepts, and hiring creates the employee and fills the requisition", async () => {
    const offered = await http().post(`/api/v1/hr/candidates/${candidateId}/offer`).set(as()).send({ salary: "180000.00", currency: "LKR", startDate: "2026-03-01" }).expect(200);
    expect(offered.body).toMatchObject({ stage: "offer", offer: { status: "extended", salary: 18_000_000, currency: "LKR", startDate: "2026-03-01" } });

    const accepted = await http().post(`/api/v1/hr/candidates/${candidateId}/offer/respond`).set(as()).send({ accepted: true }).expect(200);
    expect(accepted.body.offer.status).toBe("accepted");

    const hired = await http().post(`/api/v1/hr/candidates/${candidateId}/hire`).set(as()).send({ joiningDate: "2026-03-01" }).expect(200);
    expect(hired.body).toMatchObject({ stage: "hired", hiredAt: "2026-03-01", employeeId: expect.any(String) });
    await http().patch(`/api/v1/hr/candidates/${candidateId}`).set(as()).send({ notes: "x" }).expect(400);

    const employee = await http().get(`/api/v1/hr/employees/${hired.body.employeeId}`).set(as()).expect(200);
    expect(employee.body).toMatchObject({ firstName: "Kamala", lastName: "Silva", departmentId: department, positionId: position, managerId: manager, joiningDate: "2026-03-01" });

    const requisition = await http().get(`/api/v1/hr/requisitions/${requisitionId}`).set(as()).expect(200);
    expect(requisition.body).toMatchObject({ filledCount: 1, status: "approved" });
  });

  it("rejects a candidate and declines an offer, closing the pipeline either way", async () => {
    const rejected = await http().post("/api/v1/public/careers/" + t.companyId + "/" + postingId + "/apply").send({ firstName: "Saman", lastName: "Fonseka", email: "saman@example.com" }).expect(201);
    const r1 = await http().post(`/api/v1/hr/candidates/${rejected.body.id}/reject`).set(as()).send({ reason: "Not enough experience" }).expect(200);
    expect(r1.body).toMatchObject({ stage: "rejected", rejectionReason: "Not enough experience" });
    await http().post(`/api/v1/hr/candidates/${rejected.body.id}/reject`).set(as()).send({ reason: "Again" }).expect(400);

    const declined = await http().post("/api/v1/public/careers/" + t.companyId + "/" + postingId + "/apply").send({ firstName: "Ruwan", lastName: "Jay", email: "ruwan@example.com" }).expect(201);
    await http().post(`/api/v1/hr/candidates/${declined.body.id}/offer`).set(as()).send({ salary: "150000" }).expect(200);
    const r2 = await http().post(`/api/v1/hr/candidates/${declined.body.id}/offer/respond`).set(as()).send({ accepted: false }).expect(200);
    expect(r2.body).toMatchObject({ stage: "rejected", rejectionReason: "Offer declined", offer: { status: "declined" } });
  });

  it("keeps hiring behind the employee-create permission, not just candidate-edit", async () => {
    const applied = await http().post("/api/v1/public/careers/" + t.companyId + "/" + postingId + "/apply").send({ firstName: "Another", lastName: "One", email: "another@example.com" }).expect(201);
    const asViewer = () => ({ Authorization: `Bearer ${t.token("viewer")}`, "x-company-id": t.companyId });
    await http().post(`/api/v1/hr/candidates/${applied.body.id}/hire`).set(asViewer()).send({}).expect(403);
  });
});
