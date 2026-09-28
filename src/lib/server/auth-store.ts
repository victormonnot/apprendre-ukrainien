import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
};
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 400, code = "AUTH_INVALID") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const COST = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
let hashing = 0;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function accountsEnabled() {
  return (
    process.env.APP_AUTH_ENABLED === "1" ||
    process.env.APP_ACCESS_MODE === "accounts"
  );
}
export function accountRootDirectory() {
  const configured = process.env.APP_DATA_DIR;
  if (configured) {
    if (!path.isAbsolute(configured))
      throw new Error("APP_DATA_DIR must be an absolute path for accounts.");
    return configured;
  }
  return path.join(process.cwd(), ".data");
}
export function accountDirectory(
  account: Account,
  root = accountRootDirectory(),
) {
  if (!/^[0-9a-f-]{36}$/.test(account.id))
    throw new Error("Invalid account identity.");
  return account.role === "owner"
    ? root
    : path.join(root, "accounts", account.id);
}
export function normalizeUsername(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(value.trim())
  )
    throw new AuthError(
      "Choisis un pseudo de 3 à 32 caractères : lettres, chiffres, point, tiret ou soulignement.",
    );
  return value.trim().toLowerCase();
}
export function validatePassword(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new AuthError(
      "Le mot de passe doit contenir entre 12 et 128 caractères.",
    );
}
function key(password: string, salt: Buffer): Promise<Buffer> {
  if (hashing >= 2)
    throw new AuthError(
      "Plusieurs connexions sont en cours. Réessaie dans quelques instants.",
      429,
      "AUTH_RATE_LIMITED",
    );
  hashing++;
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, COST, (error, result) => {
      hashing--;
      if (error) reject(error);
      else resolve(result);
    });
  });
}
export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await key(password, salt);
  return `scrypt-v1:${salt.toString("hex")}:${derived.toString("hex")}`;
}
async function verifyPassword(
  password: string,
  stored: string | undefined,
): Promise<boolean> {
  // Equal work for an absent username; no secret-dependent early return.
  const parts = stored?.match(/^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/);
  const salt = Buffer.from(parts?.[1] ?? "00".repeat(16), "hex");
  const expected = Buffer.from(parts?.[2] ?? "00".repeat(64), "hex");
  const actual = await key(password, salt);
  return timingSafeEqual(actual, expected) && !!parts;
}
function publicAccount(row: Record<string, unknown>): Account {
  if (row.role !== "owner" && row.role !== "member")
    throw new Error("Invalid account role.");
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: row.role,
  };
}
function recoveryCode() {
  return randomBytes(24)
    .toString("hex")
    .match(/.{1,8}/g)!
    .join("-");
}
function recoveryDigest(value: string) {
  return digest(value.replace(/-/g, "").toLowerCase());
}

export function openAuthStore(
  directory = accountRootDirectory(),
  now: () => number = Date.now,
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "accounts.sqlite3");
  const db = new DatabaseSync(filename, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
    timeout: 5000,
  });
  chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','member')), created_at INTEGER NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON accounts(role) WHERE role='owner';
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS session_account ON sessions(account_id);
    CREATE TABLE IF NOT EXISTS auth_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT;
  `);
  function transaction<T>(operation: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function consumeLimit(bucket: string, maximum: number, windowMs: number) {
    transaction(() => {
      const instant = now();
      db.prepare("DELETE FROM auth_limits WHERE expires_at <= ?").run(instant);
      const row = db
        .prepare("SELECT count FROM auth_limits WHERE bucket=?")
        .get(bucket);
      if (row && Number(row.count) >= maximum)
        throw new AuthError(
          "La limite de demandes est atteinte. Réessaie un peu plus tard.",
          429,
          "AUTH_RATE_LIMITED",
        );
      db.prepare(
        "INSERT INTO auth_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
      ).run(bucket, instant + windowMs);
    });
  }
  function createSession(account: Account) {
    const token = randomBytes(32).toString("hex");
    const instant = now();
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(instant);
    // Keep the latest ten sessions per account; unlimited device sessions are unnecessary.
    db.prepare(
      "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE account_id=? ORDER BY created_at DESC LIMIT -1 OFFSET 9)",
    ).run(account.id);
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest(token),
      account.id,
      instant,
      instant + SESSION_SECONDS * 1000,
    );
    return { account, token };
  }
  function resolveSession(token: string | undefined): Account | null {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db
      .prepare(
        "SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(digest(token), now());
    return row ? publicAccount(row) : null;
  }
  function credentialsLimit(username: string, kind: string) {
    consumeLimit("credentials:global", 60, 60_000);
    consumeLimit(
      `${kind}:${digest(username)}`,
      kind === "recover" ? 5 : 15,
      15 * 60_000,
    );
  }
  async function createAccount(
    input: { username: unknown; displayName: unknown; password: unknown },
    role: Account["role"],
  ) {
    const username = normalizeUsername(input.username);
    const name =
      typeof input.displayName === "string" ? input.displayName.trim() : "";
    if (!name || name.length > 60)
      throw new AuthError(
        "Ton prénom ou nom d’affichage doit contenir entre 1 et 60 caractères.",
      );
    validatePassword(input.password);
    if (role === "member") {
      consumeLimit("register:global", 100, 60 * 60_000);
      if (!db.prepare("SELECT id FROM accounts WHERE role='owner'").get())
        throw new AuthError(
          "Les inscriptions ne sont pas encore ouvertes.",
          503,
        );
    }
    const passwordHash = await hashPassword(input.password);
    const code = recoveryCode();
    const account: Account = {
      id: randomUUID(),
      username,
      displayName: name,
      role,
    };
    transaction(() => {
      if (db.prepare("SELECT id FROM accounts WHERE username=?").get(username))
        throw new AuthError("Ce pseudo n’est pas disponible.", 409);
      if (
        role === "owner" &&
        db.prepare("SELECT id FROM accounts WHERE role='owner'").get()
      )
        throw new AuthError("Le compte propriétaire existe déjà.", 409);
      if (
        role === "member" &&
        Number(
          db.prepare("SELECT count(*) AS count FROM accounts").get()?.count,
        ) >= 1000
      )
        throw new AuthError(
          "Les inscriptions sont momentanément complètes.",
          503,
        );
      db.prepare("INSERT INTO accounts VALUES(?,?,?,?,?,?,?)").run(
        account.id,
        username,
        name,
        passwordHash,
        recoveryDigest(code),
        role,
        now(),
      );
    });
    return { ...createSession(account), recoveryCode: code };
  }
  return {
    close: () => db.close(),
    consumeLimit,
    resolveSession,
    hasOwner: () =>
      !!db.prepare("SELECT id FROM accounts WHERE role='owner'").get(),
    register: (input: {
      username: unknown;
      displayName: unknown;
      password: unknown;
    }) => createAccount(input, "member"),
    provisionOwner: (input: {
      username: unknown;
      displayName: unknown;
      password: unknown;
    }) => createAccount(input, "owner"),
    async login(usernameInput: unknown, password: unknown) {
      const username = normalizeUsername(usernameInput);
      if (typeof password !== "string" || password.length > 128)
        throw new AuthError("Pseudo ou mot de passe incorrect.", 401);
      credentialsLimit(username, "login");
      const row = db
        .prepare("SELECT * FROM accounts WHERE username=?")
        .get(username);
      const expected =
        typeof row?.password_hash === "string" ? row.password_hash : undefined;
      if (!(await verifyPassword(password, expected)) || !row)
        throw new AuthError("Pseudo ou mot de passe incorrect.", 401);
      // A concurrent password change/recovery must not authenticate a stale hash.
      if (
        db
          .prepare("SELECT password_hash FROM accounts WHERE id=?")
          .get(String(row.id))?.password_hash !== expected
      )
        throw new AuthError("Pseudo ou mot de passe incorrect.", 401);
      return createSession(publicAccount(row));
    },
    logout(token: string | undefined) {
      if (token && /^[a-f0-9]{64}$/.test(token))
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
          digest(token),
        );
    },
    async changePassword(
      token: string | undefined,
      currentPassword: unknown,
      password: unknown,
    ) {
      const account = resolveSession(token);
      if (!account)
        throw new AuthError(
          "Reconnecte-toi pour continuer.",
          401,
          "AUTH_REQUIRED",
        );
      validatePassword(password);
      if (typeof currentPassword !== "string" || currentPassword.length > 128)
        throw new AuthError("Le mot de passe actuel est incorrect.");
      credentialsLimit(account.username, "password");
      const previous = db
        .prepare("SELECT password_hash FROM accounts WHERE id=?")
        .get(account.id)!.password_hash as string;
      if (!(await verifyPassword(currentPassword, previous)))
        throw new AuthError("Le mot de passe actuel est incorrect.");
      const next = await hashPassword(password);
      transaction(() => {
        if (
          !resolveSession(token) ||
          db
            .prepare("SELECT password_hash FROM accounts WHERE id=?")
            .get(account.id)?.password_hash !== previous
        )
          throw new AuthError(
            "Reconnecte-toi pour continuer.",
            401,
            "AUTH_REQUIRED",
          );
        db.prepare("UPDATE accounts SET password_hash=? WHERE id=?").run(
          next,
          account.id,
        );
        db.prepare(
          "DELETE FROM sessions WHERE account_id=? AND token_hash!=?",
        ).run(account.id, digest(token!));
      });
    },
    async recover(usernameInput: unknown, code: unknown, password: unknown) {
      const username = normalizeUsername(usernameInput);
      validatePassword(password);
      credentialsLimit(username, "recover");
      if (typeof code !== "string" || !/^[a-fA-F0-9-]{48,53}$/.test(code))
        throw new AuthError("Pseudo ou code de récupération incorrect.", 401);
      const row = db
        .prepare("SELECT * FROM accounts WHERE username=?")
        .get(username);
      const expected =
        typeof row?.recovery_hash === "string"
          ? row.recovery_hash
          : "0".repeat(64);
      if (
        !timingSafeEqual(
          Buffer.from(recoveryDigest(code), "hex"),
          Buffer.from(expected, "hex"),
        ) ||
        !row
      )
        throw new AuthError("Pseudo ou code de récupération incorrect.", 401);
      const passwordHash = await hashPassword(password);
      const nextCode = recoveryCode();
      const account = publicAccount(row);
      transaction(() => {
        if (
          db
            .prepare("SELECT recovery_hash FROM accounts WHERE id=?")
            .get(account.id)?.recovery_hash !== expected
        )
          throw new AuthError(
            "Ce code de récupération a déjà été utilisé.",
            401,
          );
        db.prepare(
          "UPDATE accounts SET password_hash=?,recovery_hash=? WHERE id=?",
        ).run(passwordHash, recoveryDigest(nextCode), account.id);
        db.prepare("DELETE FROM sessions WHERE account_id=?").run(account.id);
      });
      return { ...createSession(account), recoveryCode: nextCode };
    },
  };
}
