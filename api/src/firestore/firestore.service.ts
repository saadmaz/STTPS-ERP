import { Injectable, OnModuleInit } from "@nestjs/common";
import { generateKeyPairSync } from "node:crypto";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import {
  getFirestore,
  Firestore,
  CollectionReference,
  Transaction,
} from "firebase-admin/firestore";

@Injectable()
export class FirestoreService implements OnModuleInit {
  private app!: App;
  private _db!: Firestore;

  onModuleInit() {
    // FIRESTORE_EMULATOR_HOST (set by `firebase emulators:start` or a test
    // harness) routes every call to the local emulator, which accepts any
    // credential — a throwaway keypair avoids ever needing a real service
    // account for local dev/CI. Never set this in production.
    const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

    if (getApps().length === 0) {
      this.app = initializeApp({
        credential: cert(
          usingEmulator
            ? {
                projectId: process.env.FIREBASE_PROJECT_ID || "demo-sttps-erp",
                clientEmail: "emulator@example.com",
                privateKey: generateKeyPairSync("rsa", {
                  modulusLength: 2048,
                  privateKeyEncoding: { type: "pkcs1", format: "pem" },
                  publicKeyEncoding: { type: "pkcs1", format: "pem" },
                }).privateKey,
              }
            : {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // .env stores this as a single-line string with literal \n —
                // decode to real newlines for a valid PEM.
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
              },
        ),
      });
    } else {
      this.app = getApps()[0]!;
    }

    this._db = getFirestore(this.app);

    // ignoreUndefinedProperties: partial update/create payloads built from
    // optional DTO fields can end up with explicit `undefined` values
    // (e.g. spreading a Partial<T>); without this, the SDK throws instead
    // of just omitting them, which Prisma's equivalent partial-update calls
    // never did.
    //
    // preferRest: plain HTTPS requests instead of long-lived gRPC/HTTP2
    // connections, which serverless and shared hosts often break or throttle
    // (reads stalled 40-90s in polish-station-pos before REST was forced).
    this._db.settings({
      ignoreUndefinedProperties: true,
      ...(usingEmulator ? {} : { preferRest: true }),
    });
  }

  get db(): Firestore {
    return this._db;
  }

  collection<T = FirebaseFirestore.DocumentData>(name: string): CollectionReference<T> {
    return this._db.collection(name) as CollectionReference<T>;
  }

  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this._db.runTransaction(fn);
  }

  /** A fresh, unused document ID from the given collection (Firestore auto-ID). */
  newId(collectionName: string): string {
    return this._db.collection(collectionName).doc().id;
  }
}
