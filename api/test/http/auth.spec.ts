import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "./app.js";
import { FirestoreService } from "../../src/firestore/firestore.service.js";
import { COLLECTIONS } from "../../src/firestore/collections.js";
import { currentStep, sha256, totpAt } from "../../src/auth/security.js";

describe("sign-in security", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function register() {
    const slug = `org-${randomUUID().slice(0, 8)}`;
    const email = `${slug}@example.test`;
    const password = "Correct-horse-42";
    await http()
      .post("/api/v1/auth/register")
      .send({ organizationName: "Org", organizationSlug: slug, firstName: "Ada", lastName: "Owner", email, password })
      .expect(201);
    return { email, password };
  }

  const cookieOf = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[])?.find((c) => c.startsWith("refresh_token="))?.split(";")[0] ?? "";

  it("rejects weak passwords at registration", async () => {
    await http()
      .post("/api/v1/auth/register")
      .send({ organizationName: "Org", organizationSlug: `weak-${randomUUID().slice(0, 6)}`, firstName: "A", lastName: "B", email: `${randomUUID()}@x.test`, password: "password" })
      .expect(400);
  });

  it("stores only hashed refresh tokens and rotates them", async () => {
    const { email, password } = await register();
    const login = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    const cookie = cookieOf(login);
    const token = cookie.split("=")[1]!;
    const fs = app.get(FirestoreService);
    expect((await fs.collection(COLLECTIONS.sessions).doc(token).get()).exists).toBe(false);
    expect((await fs.collection(COLLECTIONS.sessions).doc(sha256(token)).get()).exists).toBe(true);

    const refreshed = await http().post("/api/v1/auth/refresh").set("Cookie", cookie).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // The old refresh token no longer works after rotation.
    await http().post("/api/v1/auth/refresh").set("Cookie", cookie).expect(401);

    const sessions = await http().get("/api/v1/auth/sessions").set({ Authorization: `Bearer ${refreshed.body.accessToken}`, Cookie: cookieOf(refreshed) }).expect(200);
    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0]).toMatchObject({ current: true });
    expect(sessions.body[0].id).toHaveLength(16);
  });

  it("locks an email after five failed passwords", async () => {
    const { email, password } = await register();
    for (let i = 0; i < 5; i++) await http().post("/api/v1/auth/login").send({ email, password: "Wrong-password-1" }).expect(401);
    await http().post("/api/v1/auth/login").send({ email, password }).expect(429);
  });

  it("enrols and enforces two-step sign-in, without code replay", async () => {
    const { email, password } = await register();
    const first = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    const auth = { Authorization: `Bearer ${first.body.accessToken}` };

    const setup = await http().post("/api/v1/auth/mfa/setup").set(auth).expect(200);
    await http().post("/api/v1/auth/mfa/enable").set(auth).send({ code: "000000" }).expect(400);
    // Captured once: recomputing currentStep() for the replay check below could cross a 30s step boundary and flake.
    const enrolStep = currentStep();
    const enabled = await http().post("/api/v1/auth/mfa/enable").set(auth).send({ code: totpAt(setup.body.secret, enrolStep) }).expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);

    // The stored secret is encrypted, never the plain base32 value.
    const fs = app.get(FirestoreService);
    const userId = first.body.user.id;
    const stored = (await fs.collection(COLLECTIONS.users).doc(userId).get()).data()!;
    expect(stored.mfaSecret).toMatch(/^v1\./);
    expect(stored.mfaSecret).not.toContain(setup.body.secret);

    const challenge = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    expect(challenge.body).toMatchObject({ mfaRequired: true });
    expect(challenge.body.accessToken).toBeUndefined();
    // The MFA token is not an access token.
    await http().get("/api/v1/auth/me").set({ Authorization: `Bearer ${challenge.body.mfaToken}` }).expect(401);

    // The code used at enrolment cannot be replayed; the next time step works.
    await http().post("/api/v1/auth/mfa/verify").send({ mfaToken: challenge.body.mfaToken, code: totpAt(setup.body.secret, enrolStep) }).expect(401);
    const ok = await http().post("/api/v1/auth/mfa/verify").send({ mfaToken: challenge.body.mfaToken, code: totpAt(setup.body.secret, enrolStep + 1) }).expect(200);
    expect(ok.body.accessToken).toBeTruthy();

    // A recovery code works once.
    const again = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    const recovery = enabled.body.recoveryCodes[0];
    await http().post("/api/v1/auth/mfa/verify").send({ mfaToken: again.body.mfaToken, code: recovery }).expect(200);
    const third = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    await http().post("/api/v1/auth/mfa/verify").send({ mfaToken: third.body.mfaToken, code: recovery }).expect(401);
  });

  it("changes the password and signs out other devices", async () => {
    const { email, password } = await register();
    const deviceA = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    const deviceB = await http().post("/api/v1/auth/login").send({ email, password }).expect(200);
    await http()
      .post("/api/v1/auth/change-password")
      .set({ Authorization: `Bearer ${deviceA.body.accessToken}`, Cookie: cookieOf(deviceA) })
      .send({ currentPassword: password, newPassword: "Brand-new-pass-77" })
      .expect(200);
    await http().post("/api/v1/auth/refresh").set("Cookie", cookieOf(deviceB)).expect(401);
    await http().post("/api/v1/auth/refresh").set("Cookie", cookieOf(deviceA)).expect(200);
    await http().post("/api/v1/auth/login").send({ email, password }).expect(401);
  });

  it("does not let a purpose token act as an access token", async () => {
    const jwt = app.get(JwtService);
    const forged = jwt.sign({ sub: "x", purpose: "mfa" });
    await http().get("/api/v1/auth/me").set({ Authorization: `Bearer ${forged}` }).expect(401);
  });
});
