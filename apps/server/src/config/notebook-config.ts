import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { NotebookError } from "../notebook/notebook-errors.js";

export interface NotebookConfig {
  root: string;
  name: string;
}

export interface AppConfig {
  registryFile: string;
  initialNotebook?: NotebookConfig;
}

export function loadNotebookConfig(
  environment: NodeJS.ProcessEnv = process.env,
  defaultRoot = path.join(process.cwd(), "snail-notes"),
): NotebookConfig {
  const configuredRoot = environment.NOTEBOOK_ROOT?.trim();
  const root = path.resolve(configuredRoot || defaultRoot);

  if (!configuredRoot && !existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }

  if (!existsSync(root)) {
    throw new NotebookError("INVALID_CONFIG", `NOTEBOOK_ROOT 不存在：${root}`, 500);
  }

  let stats;
  try {
    stats = statSync(root);
  } catch {
    throw new NotebookError("INVALID_CONFIG", `NOTEBOOK_ROOT 无法访问：${root}`, 500);
  }

  if (!stats.isDirectory()) {
    throw new NotebookError("INVALID_CONFIG", `NOTEBOOK_ROOT 必须是目录：${root}`, 500);
  }

  const canonicalRoot = realpathSync(root);
  return {
    root: canonicalRoot,
    name: environment.NOTEBOOK_NAME?.trim() || path.basename(canonicalRoot) || "Snail Note",
  };
}

export function loadAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
  defaultDataDirectory = path.join(process.cwd(), ".snail-note"),
): AppConfig {
  const dataDirectory = path.resolve(environment.SNAIL_NOTE_DATA_DIR?.trim() || defaultDataDirectory);
  mkdirSync(dataDirectory, { recursive: true });

  return {
    registryFile: path.join(dataDirectory, "notebooks.json"),
    ...(environment.NOTEBOOK_ROOT?.trim()
      ? { initialNotebook: loadNotebookConfig(environment) }
      : {}),
  };
}
