import fs from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";

export type StoredUser = {
  id: string;
  email: string;
  name?: string;
  passwordHash?: string;
  image?: string;
  createdAt: string;
  updatedAt: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  image: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

let postgresReadyPromise: Promise<void> | null = null;

function shouldUsePostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_PRISMA_URL
  );
}

function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name || undefined,
    passwordHash: row.password_hash || undefined,
    image: row.image || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function ensureFileStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

async function readUsersFromFile(): Promise<StoredUser[]> {
  await ensureFileStore();
  const raw = await fs.readFile(USERS_FILE, "utf-8");
  return JSON.parse(raw) as StoredUser[];
}

async function writeUsersToFile(users: StoredUser[]) {
  await ensureFileStore();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

async function ensurePostgresStore() {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          password_hash TEXT,
          image TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;
    })();
  }

  return postgresReadyPromise;
}

async function getUserByEmailFromPostgres(email: string) {
  await ensurePostgresStore();
  const result = await sql<UserRow>`
    SELECT
      id,
      email,
      name,
      password_hash,
      image,
      created_at,
      updated_at
    FROM users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

async function getUserByIdFromPostgres(id: string) {
  await ensurePostgresStore();
  const result = await sql<UserRow>`
    SELECT
      id,
      email,
      name,
      password_hash,
      image,
      created_at,
      updated_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

async function createUserInPostgres(user: StoredUser) {
  await ensurePostgresStore();
  const existing = await getUserByEmailFromPostgres(user.email);
  if (existing) {
    throw new Error("An account with that email already exists.");
  }

  await sql`
    INSERT INTO users (
      id,
      email,
      name,
      password_hash,
      image,
      created_at,
      updated_at
    ) VALUES (
      ${user.id},
      ${user.email},
      ${user.name ?? null},
      ${user.passwordHash ?? null},
      ${user.image ?? null},
      ${user.createdAt},
      ${user.updatedAt}
    )
  `;

  return user;
}

async function upsertOAuthUserInPostgres(input: {
  email: string;
  name?: string;
  image?: string;
}) {
  await ensurePostgresStore();
  const existing = await getUserByEmailFromPostgres(input.email);
  const now = new Date().toISOString();

  if (!existing) {
    const created: StoredUser = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      image: input.image,
      createdAt: now,
      updatedAt: now,
    };

    await createUserInPostgres(created);
    return created;
  }

  await sql`
    UPDATE users
    SET
      name = ${input.name ?? existing.name ?? null},
      image = ${input.image ?? existing.image ?? null},
      updated_at = ${now}
    WHERE id = ${existing.id}
  `;

  return {
    ...existing,
    name: input.name ?? existing.name,
    image: input.image ?? existing.image,
    updatedAt: now,
  };
}

async function getUserByEmailFromFile(email: string) {
  const users = await readUsersFromFile();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

async function getUserByIdFromFile(id: string) {
  const users = await readUsersFromFile();
  return users.find((user) => user.id === id) ?? null;
}

async function createUserInFile(user: StoredUser) {
  const users = await readUsersFromFile();
  const existing = users.find(
    (item) => item.email.toLowerCase() === user.email.toLowerCase()
  );
  if (existing) {
    throw new Error("An account with that email already exists.");
  }

  users.push(user);
  await writeUsersToFile(users);
  return user;
}

async function upsertOAuthUserInFile(input: {
  email: string;
  name?: string;
  image?: string;
}) {
  const users = await readUsersFromFile();
  const idx = users.findIndex(
    (user) => user.email.toLowerCase() === input.email.toLowerCase()
  );
  const now = new Date().toISOString();

  if (idx === -1) {
    const created: StoredUser = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      image: input.image,
      createdAt: now,
      updatedAt: now,
    };
    users.push(created);
    await writeUsersToFile(users);
    return created;
  }

  users[idx] = {
    ...users[idx],
    name: input.name ?? users[idx].name,
    image: input.image ?? users[idx].image,
    updatedAt: now,
  };
  await writeUsersToFile(users);
  return users[idx];
}

export async function getUserByEmail(email: string) {
  if (shouldUsePostgres()) {
    return getUserByEmailFromPostgres(email);
  }

  return getUserByEmailFromFile(email);
}

export async function getUserById(id: string) {
  if (shouldUsePostgres()) {
    return getUserByIdFromPostgres(id);
  }

  return getUserByIdFromFile(id);
}

export async function getUsersByIds(
  ids: string[]
): Promise<Map<string, StoredUser>> {
  const unique = [
    ...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  const found = new Map<string, StoredUser>();
  await Promise.all(
    unique.map(async (id) => {
      const user = await getUserById(id);
      if (user) found.set(id, user);
    })
  );
  return found;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
}) {
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    name: input.name?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (shouldUsePostgres()) {
    return createUserInPostgres(user);
  }

  return createUserInFile(user);
}

export async function upsertOAuthUser(input: {
  email: string;
  name?: string;
  image?: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (shouldUsePostgres()) {
    return upsertOAuthUserInPostgres({ ...input, email });
  }

  return upsertOAuthUserInFile({ ...input, email });
}
