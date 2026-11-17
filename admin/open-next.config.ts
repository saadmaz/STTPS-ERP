import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered on request (the app is behind sign-in and reads from
// the API), so no incremental cache is configured.
export default defineCloudflareConfig({});
