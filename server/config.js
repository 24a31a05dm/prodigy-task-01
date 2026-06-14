import path from 'node:path';
import { loadEnv } from './lib/env.js';

loadEnv();

const sessionSecret = process.env.SESSION_SECRET || 'dev-only-change-this-secret';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && sessionSecret === 'dev-only-change-this-secret') {
  throw new Error('SESSION_SECRET must be set in production.');
}

export const config = {
  port: Number(process.env.PORT || 5000),
  isProduction,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'authgate_sid',
  sessionSecret,
  sessionTtlMs: Number(process.env.SESSION_TTL_HOURS || 8) * 60 * 60 * 1000,
  dataFile: process.env.DATA_FILE || path.join(process.cwd(), 'server', 'data', 'db.json')
};
