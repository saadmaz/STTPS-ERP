// Passenger startup file (cPanel Setup Node.js App → Application startup file).
// Passenger sets PORT itself and does not source .env, so dotenv must load first.
import "dotenv/config";
import { createServer } from "node:http";
import next from "next";

const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

process.on("uncaughtException", (err) => {
  console.error("[startup] uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[startup] unhandledRejection", err);
});

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`[startup] web ready on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("[startup] FAILED to prepare Next.js app", err);
    process.exit(1);
  });
