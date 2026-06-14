import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import {
  createSession,
  createUser,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  findUserByEmail,
  initializeDatabase,
  listUsers,
  markUserLogin,
  publicUser
} from './lib/database.js';
import { hashPassword, verifyPassword } from './lib/password.js';
import { createSessionToken, hashSessionToken, parseCookies } from './lib/session.js';
import { validateLogin, validateRegistration } from './lib/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDirectory = path.join(__dirname, '..', 'public');

const authAttempts = new Map();
const authWindowMs = 15 * 60 * 1000;
const authAttemptLimit = 12;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function setSessionCookieHeader(sessionToken) {
  const parts = [
    `${config.sessionCookieName}=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`
  ];

  if (config.isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function clearSessionCookieHeader() {
  const parts = [
    `${config.sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (config.isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 10 * 1024) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    return {};
  }

  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody);
    } catch (error) {
      const parseError = new Error('Request body must be valid JSON.');
      parseError.statusCode = 400;
      throw parseError;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  return {};
}

function getClientKey(req, pathname) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
  return `${ip}:${pathname}`;
}

function isRateLimited(req, pathname) {
  const key = getClientKey(req, pathname);
  const now = Date.now();
  const record = authAttempts.get(key);

  if (!record || record.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + authWindowMs });
    return null;
  }

  record.count += 1;

  if (record.count > authAttemptLimit) {
    return Math.ceil((record.resetAt - now) / 1000);
  }

  return null;
}

async function getAuth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[config.sessionCookieName];

  if (!sessionToken) {
    return null;
  }

  const auth = await findSessionByTokenHash(hashSessionToken(sessionToken));

  if (!auth) {
    return null;
  }

  return {
    ...auth,
    sessionToken,
    publicUser: publicUser(auth.user)
  };
}

async function startSession(req, user) {
  const sessionToken = createSessionToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();

  await createSession({
    tokenHash: hashSessionToken(sessionToken),
    userId: user.id,
    userAgent: req.headers['user-agent'] || 'unknown',
    expiresAt
  });

  return setSessionCookieHeader(sessionToken);
}

async function handleRegister(req, res) {
  const validation = validateRegistration(await readRequestBody(req));

  if (!validation.isValid) {
    return sendJson(res, 400, {
      message: 'Please fix the highlighted fields.',
      errors: validation.errors
    });
  }

  const { name, email, password } = validation.values;
  const passwordHash = await hashPassword(password);
  const user = await createUser({ name, email, passwordHash });

  if (!user) {
    return sendJson(res, 409, { message: 'An account already exists for this email address.' });
  }

  const cookie = await startSession(req, user);

  return sendJson(res, 201, {
    message: 'Account created successfully.',
    user: publicUser(user)
  }, { 'Set-Cookie': cookie });
}

async function handleLogin(req, res) {
  const validation = validateLogin(await readRequestBody(req));

  if (!validation.isValid) {
    return sendJson(res, 400, {
      message: 'Please fix the highlighted fields.',
      errors: validation.errors
    });
  }

  const { email, password } = validation.values;
  const user = await findUserByEmail(email);
  const credentialsAreValid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!credentialsAreValid) {
    return sendJson(res, 401, { message: 'Invalid email or password.' });
  }

  const updatedUser = await markUserLogin(user.id);
  const cookie = await startSession(req, updatedUser || user);

  return sendJson(res, 200, {
    message: 'Signed in successfully.',
    user: publicUser(updatedUser || user)
  }, { 'Set-Cookie': cookie });
}

async function requireAuth(req, res) {
  const auth = await getAuth(req);

  if (!auth) {
    sendJson(res, 401, { message: 'Authentication required.' });
    return null;
  }

  return auth;
}

async function handleApi(req, res, pathname) {
  const isAuthAttempt = req.method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(pathname);

  if (isAuthAttempt) {
    const retryAfter = isRateLimited(req, pathname);

    if (retryAfter) {
      return sendJson(res, 429, {
        message: 'Too many attempts. Please try again in a few minutes.'
      }, { 'Retry-After': String(retryAfter) });
    }
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    return handleRegister(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    return handleLogin(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = await requireAuth(req, res);

    if (!auth) {
      return;
    }

    await deleteSessionByTokenHash(hashSessionToken(auth.sessionToken));
    return sendJson(res, 200, { message: 'Signed out successfully.' }, {
      'Set-Cookie': clearSessionCookieHeader()
    });
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const auth = await getAuth(req);

    if (!auth) {
      return sendJson(res, 401, { message: 'Not signed in.' });
    }

    return sendJson(res, 200, { user: auth.publicUser });
  }

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const auth = await requireAuth(req, res);

    if (!auth) {
      return;
    }

    return sendJson(res, 200, {
      user: auth.publicUser,
      stats: [
        { label: 'Session status', value: 'Active' },
        { label: 'Access level', value: auth.user.role },
        { label: 'Protected route', value: '/api/dashboard' }
      ],
      activity: [
        'Authenticated with an HTTP-only session cookie.',
        'Password hash is stored on the server, never the plain password.',
        'This response is blocked unless a valid session exists.'
      ]
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const auth = await requireAuth(req, res);

    if (!auth) {
      return;
    }

    if (auth.user.role !== 'admin') {
      return sendJson(res, 403, { message: 'You do not have permission to access this resource.' });
    }

    return sendJson(res, 200, { users: await listUsers() });
  }

  return sendJson(res, 404, { message: 'API route not found.' });
}

function publicFilePath(pathname) {
  let decodedPath = '';

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }

  const extension = path.extname(decodedPath);

  if (!contentTypes[extension]) {
    return null;
  }

  const filePath = path.normalize(path.join(publicDirectory, decodedPath));
  const relativePath = path.relative(publicDirectory, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

async function sendFile(res, filePath) {
  const extension = path.extname(filePath);
  const content = await readFile(filePath);

  res.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=3600'
  });
  res.end(content);
}

async function sendApp(res) {
  await sendFile(res, path.join(publicDirectory, 'index.html'));
}

async function handlePage(req, res, pathname) {
  if (req.method !== 'GET') {
    return redirect(res, '/');
  }

  if (pathname === '/') {
    return sendApp(res);
  }

  if (pathname === '/dashboard') {
    const auth = await getAuth(req);

    if (!auth) {
      return redirect(res, '/?auth=required');
    }

    return sendApp(res);
  }

  if (pathname === '/admin') {
    const auth = await getAuth(req);

    if (!auth) {
      return redirect(res, '/?auth=required');
    }

    if (auth.user.role !== 'admin') {
      return redirect(res, '/dashboard?admin=forbidden');
    }

    return sendApp(res);
  }

  return redirect(res, '/');
}

async function handleRequest(req, res) {
  applySecurityHeaders(res);

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    const assetPath = req.method === 'GET' ? publicFilePath(pathname) : null;

    if (assetPath) {
      return await sendFile(res, assetPath);
    }

    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname);
    }

    return await handlePage(req, res, pathname);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendJson(res, 404, { message: 'File not found.' });
    }

    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Something went wrong on the server.' : error.message;

    if (statusCode === 500) {
      console.error(error);
    }

    return sendJson(res, statusCode, { message });
  }
}

await initializeDatabase();

createServer(handleRequest).listen(config.port, () => {
  console.log(`AuthGate is running at http://localhost:${config.port}`);
});
