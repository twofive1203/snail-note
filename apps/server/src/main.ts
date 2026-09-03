import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnvFile } from "dotenv";
import { buildApp } from "./app.js";
import { loadAppConfig } from "./config/notebook-config.js";

export async function startServer(): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  loadEnvFile({ path: path.join(repositoryRoot, ".env") });
  const config = loadAppConfig(process.env, path.join(repositoryRoot, ".snail-note"));
  const defaultWebRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));
  const webRoot = path.resolve(process.env.WEB_DIST || defaultWebRoot);
  const app = await buildApp(config, { webRoot });
  const port = Number(process.env.PORT || 61666);
  const host = process.env.HOST || "0.0.0.0";
  await app.listen({ port, host });
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  startServer().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
