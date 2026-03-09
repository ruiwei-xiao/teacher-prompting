import fs from "fs/promises";
import path from "path";
import { AppConfig } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const APPS_FILE = path.join(DATA_DIR, "apps.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(APPS_FILE);
  } catch {
    await fs.writeFile(APPS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

async function readApps(): Promise<AppConfig[]> {
  await ensureStore();
  const raw = await fs.readFile(APPS_FILE, "utf-8");
  return JSON.parse(raw) as AppConfig[];
}

async function writeApps(apps: AppConfig[]) {
  await ensureStore();
  await fs.writeFile(APPS_FILE, JSON.stringify(apps, null, 2), "utf-8");
}

export async function createApp(app: AppConfig) {
  const apps = await readApps();
  const exists = apps.find((a) => a.id === app.id);
  if (exists) {
    throw new Error(`App with id "${app.id}" already exists`);
  }
  apps.push(app);
  await writeApps(apps);
  return app;
}

export async function getAppById(id: string) {
  const apps = await readApps();
  return apps.find((a) => a.id === id) ?? null;
}

export async function listApps() {
  return readApps();
}

export async function updateApp(id: string, patch: Partial<AppConfig>) {
  const apps = await readApps();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  apps[idx] = {
    ...apps[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await writeApps(apps);
  return apps[idx];
}