import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INDEXES, indexesFile } from "../../src/platform/data/indexes.js";

describe("Firestore indexes", () => {
  it("firestore.indexes.json matches the registry (run `npm run indexes`)", () => {
    const path = fileURLToPath(new URL("../../../firestore.indexes.json", import.meta.url));
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(indexesFile());
  });

  it("stays within the composite index budget and has no duplicates", () => {
    // Firestore's own ceiling is 200 composite indexes per database (see indexes.ts's header comment).
    expect(INDEXES.length).toBeLessThanOrEqual(200);
    const keys = INDEXES.map((i) => `${i.collection}:${i.fields.map((f) => f.join(" ")).join(",")}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
