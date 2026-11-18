import { describe, expect, it } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuditService } from "../../src/platform/audit/audit.service.js";
import { UniqueService } from "../../src/platform/data/unique.service.js";
import { JobQueueService } from "../../src/platform/jobs/job-queue.service.js";
import { DomainEvent, EventBusService } from "../../src/platform/events/event-bus.service.js";
import { EmailSender } from "../../src/platform/notifications/email.sender.js";
import { NotificationsService } from "../../src/platform/notifications/notifications.service.js";
import { ApprovalsService, evaluate } from "../../src/platform/approvals/approvals.service.js";
import { ApprovalDefinitionsService, DelegationsService } from "../../src/platform/approvals/approval-definitions.service.js";
import { APPROVAL_COMPLETED, ApprovalCompletedPayload } from "../../src/platform/approvals/approvals.models.js";
import { DepartmentService } from "../../src/org/org.services.js";
import { COLLECTIONS } from "../../src/firestore/collections.js";
import { RequestContext } from "../../src/platform/context/request-context.js";
import { firestore, testContext } from "../helpers.js";

const completed: ApprovalCompletedPayload[] = [];

function kernel() {
  const fs = firestore();
  const audit = new AuditService(fs);
  const unique = new UniqueService(fs);
  const jobs = new JobQueueService(fs);
  const events = new EventBusService(fs, jobs);
  events.onModuleInit();
  const notifications = new NotificationsService(fs, jobs, new EmailSender());
  notifications.onModuleInit();
  const approvals = new ApprovalsService(fs, audit, events, jobs, notifications);
  approvals.onModuleInit();
  events.subscribe<ApprovalCompletedPayload>(APPROVAL_COMPLETED, `test.approvals.${Math.random()}`, async (e: DomainEvent<ApprovalCompletedPayload>) => {
    completed.push(e.payload);
  });
  return {
    fs, jobs, notifications, approvals,
    definitions: new ApprovalDefinitionsService(fs, audit, unique),
    delegations: new DelegationsService(fs, audit, unique),
    departments: new DepartmentService(fs, audit, unique),
  };
}

/** A company with active users requester, manager, director, x, y, escalation and delegate. */
async function setup() {
  const k = kernel();
  const base = testContext();
  const ids = Object.fromEntries(["requester", "manager", "director", "x", "y", "boss", "deputy"].map((n) => [n, `${base.tenantId}_${n}`]));
  for (const id of Object.values(ids)) {
    await k.fs.collection(COLLECTIONS.users).doc(id).set({ id, tenantId: base.tenantId, email: `${id}@test`, isActive: true, firstName: id, lastName: "T" });
  }
  const as = (user: keyof typeof ids): RequestContext => ({ ...base, userId: ids[user]!, allPermissions: false, permissions: new Set() });
  const dept = await k.departments.create(base, { code: "OPS", name: "Operations", managerUserId: ids.manager });
  await k.definitions.create(base, {
    code: "PURCHASE",
    name: "Purchase approval",
    entityType: "test.purchase",
    steps: [
      { name: "Manager", approvers: [{ type: "departmentManager" }] },
      { name: "Director", approvers: [{ type: "user", ids: [ids.director!] }], conditions: [{ fact: "amount", op: "gte", value: 100_000 }] },
      { name: "Finance", approvers: [{ type: "user", ids: [ids.x!, ids.y!] }], minApprovals: 2, timeoutHours: 24, escalateTo: [{ type: "user", ids: [ids.boss!] }] },
    ],
  });
  return { ...k, base, ids, as, dept };
}

describe("condition evaluation", () => {
  it("compares facts", () => {
    expect(evaluate([{ fact: "amount", op: "gte", value: 100 }], { amount: 100 })).toBe(true);
    expect(evaluate([{ fact: "amount", op: "gt", value: 100 }], { amount: 100 })).toBe(false);
    expect(evaluate([{ fact: "branch", op: "in", value: ["a", "b"] }], { branch: "b" })).toBe(true);
    expect(evaluate([{ fact: "branch", op: "nin", value: ["a"] }], { branch: "a" })).toBe(false);
    expect(evaluate([], {})).toBe(true);
  });
});

describe("approval engine", () => {
  it("runs conditional, sequential and parallel steps to approval and publishes the outcome", async () => {
    const s = await setup();
    const request = await s.approvals.submit(s.as("requester"), {
      entityType: "test.purchase", entityId: "P1", entityLabel: "PR-1", link: "/p/1", facts: { amount: 50_000, departmentId: s.dept.id },
    });
    expect(request.status).toBe("pending");
    expect(request.steps.map((st) => st.status)).toEqual(["pending", "skipped", "waiting"]);
    expect(request.pendingKeys).toEqual([`${s.base.companyId}:${s.ids.manager}`]);
    expect((await s.notifications.listMine(s.ids.manager!))[0]).toMatchObject({ category: "approval.request", link: "/p/1" });

    await expect(s.approvals.approve(s.as("requester"), request.id)).rejects.toBeInstanceOf(ForbiddenException);
    const afterManager = await s.approvals.approve(s.as("manager"), request.id, "ok");
    expect(afterManager.currentStep).toBe(2);
    expect((await s.approvals.waitingFor(s.as("x"))).map((r) => r.id)).toEqual([request.id]);

    const afterX = await s.approvals.approve(s.as("x"), request.id);
    expect(afterX.status).toBe("pending");
    await expect(s.approvals.approve(s.as("x"), request.id)).rejects.toBeInstanceOf(BadRequestException);
    const done = await s.approvals.approve(s.as("y"), request.id);
    expect(done.status).toBe("approved");
    expect(done.pendingKeys).toEqual([]);

    await s.jobs.drain();
    expect(completed.find((c) => c.requestId === request.id)).toMatchObject({ outcome: "approved", entityId: "P1" });
    expect((await s.notifications.listMine(s.ids.requester!))[0]).toMatchObject({ category: "approval.result" });
  });

  it("adds the director step above the threshold and lets a delegate act", async () => {
    const s = await setup();
    const today = new Date().toISOString().slice(0, 10);
    await s.delegations.create(s.as("director"), { delegateUserId: s.ids.deputy!, startDate: today, endDate: today });
    const request = await s.approvals.submit(s.as("requester"), {
      entityType: "test.purchase", entityId: "P2", entityLabel: "PR-2", facts: { amount: 250_000, departmentId: s.dept.id },
    });
    await s.approvals.approve(s.as("manager"), request.id);
    const atDirector = await s.approvals.requests.get(s.base, request.id);
    expect(atDirector.currentStep).toBe(1);
    expect(atDirector.pendingKeys.sort()).toEqual([`${s.base.companyId}:${s.ids.deputy}`, `${s.base.companyId}:${s.ids.director}`].sort());
    const byDeputy = await s.approvals.approve(s.as("deputy"), request.id);
    expect(byDeputy.decisions.at(-1)).toMatchObject({ userId: s.ids.deputy, onBehalfOf: s.ids.director, decision: "approved" });
    expect(byDeputy.currentStep).toBe(2);
  });

  it("rejects with a reason, and escalates a step that times out", async () => {
    const s = await setup();
    const r1 = await s.approvals.submit(s.as("requester"), { entityType: "test.purchase", entityId: "P3", entityLabel: "PR-3", facts: { amount: 1, departmentId: s.dept.id } });
    await expect(s.approvals.reject(s.as("manager"), r1.id, " ")).rejects.toBeInstanceOf(BadRequestException);
    expect((await s.approvals.reject(s.as("manager"), r1.id, "Over budget")).status).toBe("rejected");
    await expect(s.approvals.approve(s.as("manager"), r1.id)).rejects.toThrow("already rejected");

    const r2 = await s.approvals.submit(s.as("requester"), { entityType: "test.purchase", entityId: "P4", entityLabel: "PR-4", facts: { amount: 1, departmentId: s.dept.id } });
    await s.approvals.approve(s.as("manager"), r2.id);
    await s.fs.collection("jobs").doc(`approval_timeout_${r2.id}_2`).update({ runAt: new Date().toISOString() });
    await s.jobs.drain();
    const escalated = await s.approvals.requests.get(s.base, r2.id);
    expect(escalated.steps[2]!.escalated).toBe(true);
    expect(escalated.steps[2]!.approverIds).toContain(s.ids.boss);
    expect(escalated.decisions.at(-1)!.decision).toBe("escalated");
  });

  it("auto-approves when no workflow applies, and lets the requester cancel", async () => {
    const s = await setup();
    const auto = await s.approvals.submit(s.as("requester"), { entityType: "test.other", entityId: "O1", entityLabel: "Other", facts: {} });
    expect(auto).toMatchObject({ status: "approved", definitionId: null });
    const r = await s.approvals.submit(s.as("requester"), { entityType: "test.purchase", entityId: "P5", entityLabel: "PR-5", facts: { amount: 1, departmentId: s.dept.id } });
    await expect(s.approvals.cancel(s.as("x"), r.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await s.approvals.cancel(s.as("requester"), r.id)).status).toBe("cancelled");
  });

  it("refuses to submit when a step has no eligible approver", async () => {
    const s = await setup();
    await expect(
      s.approvals.submit(s.as("manager"), { entityType: "test.purchase", entityId: "P6", entityLabel: "PR-6", facts: { amount: 1, departmentId: s.dept.id } }),
    ).rejects.toThrow("no eligible approvers");
  });
});
