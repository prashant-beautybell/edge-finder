import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface BetfairConfig {
  appKey: string;
  username: string;
  password: string;
  certPath?: string;
  keyPath?: string;
}

function decodePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return Buffer.from(trimmed, "base64").toString("utf8");
}

function materializePemFiles(): { certPath?: string; keyPath?: string } {
  const certPem = process.env.BETFAIR_CERT_PEM?.trim();
  const keyPem = process.env.BETFAIR_KEY_PEM?.trim();

  if (!certPem || !keyPem) {
    return {};
  }

  const certPath = path.join(os.tmpdir(), "edge-finder-betfair.crt");
  const keyPath = path.join(os.tmpdir(), "edge-finder-betfair.key");
  fs.writeFileSync(certPath, decodePem(certPem), { mode: 0o600 });
  fs.writeFileSync(keyPath, decodePem(keyPem), { mode: 0o600 });
  return { certPath, keyPath };
}

export function getBetfairConfig(): BetfairConfig | null {
  const appKey = process.env.BETFAIR_APP_KEY?.trim() ?? "";
  const username = process.env.BETFAIR_USERNAME?.trim() ?? "";
  const password = process.env.BETFAIR_PASSWORD?.trim() ?? "";

  if (!appKey || !username || !password) {
    return null;
  }

  const fromEnv = materializePemFiles();
  const certPath = fromEnv.certPath ?? process.env.BETFAIR_CERT_PATH?.trim();
  const keyPath = fromEnv.keyPath ?? process.env.BETFAIR_KEY_PATH?.trim();

  return {
    appKey,
    username,
    password,
    certPath: certPath || undefined,
    keyPath: keyPath || undefined,
  };
}

export function getBetfairSetupError(): string | null {
  const config = getBetfairConfig();
  if (!config) {
    return (
      "Betfair Exchange is not configured. Add BETFAIR_APP_KEY, BETFAIR_USERNAME, and " +
      "BETFAIR_PASSWORD to Vercel environment variables."
    );
  }

  const hasCerts = Boolean(config.certPath && config.keyPath);
  if (!hasCerts && process.env.VERCEL) {
    return (
      "Betfair password login is blocked from Vercel. Add BETFAIR_CERT_PEM and BETFAIR_KEY_PEM " +
      "(API certificate from developer.betfair.com) alongside your app key and credentials."
    );
  }

  if (hasCerts && config.certPath && config.keyPath) {
    if (!fs.existsSync(config.certPath) || !fs.existsSync(config.keyPath)) {
      return "Betfair certificate files not found. Check BETFAIR_CERT_PEM and BETFAIR_KEY_PEM.";
    }
  }

  return null;
}

export function hasBetfairCertificateLogin(): boolean {
  const config = getBetfairConfig();
  return Boolean(config?.certPath && config?.keyPath);
}
