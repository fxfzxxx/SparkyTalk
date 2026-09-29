import { serve } from "@hono/node-server";
import { app } from "./app";
import { assertAuthConfig } from "./lib/auth";

assertAuthConfig();

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SparkyTalk API listening on :${info.port}`);
});
