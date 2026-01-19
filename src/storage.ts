import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".tidio-mcp");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

export interface TidioCredentials {
  public_key: string;
  access_token: string;
  refresh_token: string;
  site_url: string;
  created_at: string;
  updated_at: string;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadCredentials(): TidioCredentials | null {
  try {
    if (!existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const data = readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data) as TidioCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: Omit<TidioCredentials, "created_at" | "updated_at">): TidioCredentials {
  ensureConfigDir();

  const existing = loadCredentials();
  const now = new Date().toISOString();

  const fullCredentials: TidioCredentials = {
    ...credentials,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  writeFileSync(CREDENTIALS_FILE, JSON.stringify(fullCredentials, null, 2), "utf-8");
  return fullCredentials;
}

export function clearCredentials(): boolean {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      writeFileSync(CREDENTIALS_FILE, "{}", "utf-8");
    }
    return true;
  } catch {
    return false;
  }
}

export function hasValidCredentials(): boolean {
  const creds = loadCredentials();
  return creds !== null && !!creds.public_key && !!creds.refresh_token;
}
