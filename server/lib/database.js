import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

let writeQueue = Promise.resolve();

const emptyDatabase = {
  users: [],
  sessions: []
};

async function ensureDatabaseFile() {
  await mkdir(path.dirname(config.dataFile), { recursive: true });

  try {
    await readFile(config.dataFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    await writeDatabase(emptyDatabase);
  }
}

async function readDatabase() {
  await ensureDatabaseFile();
  const raw = await readFile(config.dataFile, 'utf8');
  const data = JSON.parse(raw || '{}');

  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : []
  };
}

async function writeDatabase(data) {
  const temporaryFile = `${config.dataFile}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, config.dataFile);
}

async function withWrite(mutator) {
  const run = async () => {
    const data = await readDatabase();
    const result = await mutator(data);
    await writeDatabase(data);
    return result;
  };

  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

export async function initializeDatabase() {
  await ensureDatabaseFile();
  await deleteExpiredSessions();
}

export function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

export async function createUser({ name, email, passwordHash }) {
  return withWrite((data) => {
    const existingUser = data.users.find((user) => user.email === email);

    if (existingUser) {
      return null;
    }

    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      name,
      email,
      passwordHash,
      role: data.users.length === 0 ? 'admin' : 'user',
      createdAt: now,
      lastLoginAt: now
    };

    data.users.push(user);
    return user;
  });
}

export async function findUserByEmail(email) {
  const data = await readDatabase();
  return data.users.find((user) => user.email === email) || null;
}

export async function findUserById(id) {
  const data = await readDatabase();
  return data.users.find((user) => user.id === id) || null;
}

export async function markUserLogin(userId) {
  return withWrite((data) => {
    const user = data.users.find((candidate) => candidate.id === userId);

    if (!user) {
      return null;
    }

    user.lastLoginAt = new Date().toISOString();
    return user;
  });
}

export async function createSession({ tokenHash, userId, userAgent, expiresAt }) {
  return withWrite((data) => {
    const session = {
      id: randomUUID(),
      tokenHash,
      userId,
      userAgent,
      createdAt: new Date().toISOString(),
      expiresAt
    };

    data.sessions.push(session);
    return session;
  });
}

export async function findSessionByTokenHash(tokenHash) {
  const data = await readDatabase();
  const session = data.sessions.find((candidate) => candidate.tokenHash === tokenHash);

  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await deleteSessionByTokenHash(tokenHash);
    return null;
  }

  const user = data.users.find((candidate) => candidate.id === session.userId);

  if (!user) {
    await deleteSessionByTokenHash(tokenHash);
    return null;
  }

  return { session, user };
}

export async function deleteSessionByTokenHash(tokenHash) {
  return withWrite((data) => {
    const beforeCount = data.sessions.length;
    data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
    return data.sessions.length < beforeCount;
  });
}

export async function deleteExpiredSessions() {
  return withWrite((data) => {
    const now = Date.now();
    const beforeCount = data.sessions.length;
    data.sessions = data.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
    return beforeCount - data.sessions.length;
  });
}

export async function listUsers() {
  const data = await readDatabase();
  return data.users.map(publicUser);
}
