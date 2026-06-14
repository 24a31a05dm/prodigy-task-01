import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, hashSessionToken, parseCookies } from '../server/lib/session.js';

test('session tokens are random and hashed before storage', () => {
  const firstToken = createSessionToken();
  const secondToken = createSessionToken();

  assert.notEqual(firstToken, secondToken);
  assert.notEqual(hashSessionToken(firstToken), firstToken);
  assert.equal(hashSessionToken(firstToken).length, 64);
});

test('cookie parser extracts named cookies', () => {
  const cookies = parseCookies('authgate_sid=abc123; theme=light');

  assert.equal(cookies.authgate_sid, 'abc123');
  assert.equal(cookies.theme, 'light');
});
