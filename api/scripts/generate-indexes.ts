// Writes ../firestore.indexes.json from src/platform/data/indexes.ts.
// Run with `npm run indexes`, then deploy: firebase deploy --only firestore:indexes
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { indexesFile } from "../src/platform/data/indexes.js";

const target = fileURLToPath(new URL("../../firestore.indexes.json", import.meta.url));
writeFileSync(target, JSON.stringify(indexesFile(), null, 2) + "\n");
console.log(`Wrote ${target}`);
