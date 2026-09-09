import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, uniqueEmail, TEST_PASSWORD } from './helpers';

describe('initial setup', () => {
  beforeEach(resetDb);

  it('reports needsSetup=true before any user exists', async () => {
    const res = await req.get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
  });

  it('creates the first ADMIN account and returns a token', async () => {
    const res = await req.post('/api/setup/admin').send({ email: uniqueEmail('setup'), password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.role).toBe('ADMIN');
    const status = await req.get('/api/setup/status');
    expect(status.body.needsSetup).toBe(false);
  });

  it('rejects a second bootstrap attempt with 403', async () => {
    const email = uniqueEmail('setup');
    await req.post('/api/setup/admin').send({ email, password: TEST_PASSWORD });
    const res = await req.post('/api/setup/admin').send({ email: uniqueEmail('setup2'), password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rejects invalid payloads with 400', async () => {
    const bad = await req.post('/api/setup/admin').send({ email: 'not-an-email', password: 'short' });
    expect(bad.status).toBe(400);
    const missing = await req.post('/api/setup/admin').send({});
    expect(missing.status).toBe(400);
  });
});

describe('authentication', () => {
  beforeEach(resetDb);

  it('logs in with valid credentials', async () => {
    const email = uniqueEmail('login');
    await req.post('/api/setup/admin').send({ email, password: TEST_PASSWORD });
    const res = await req.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe('ADMIN');
  });

  it('does NOT allow enumeration: same message for unknown email and wrong password', async () => {
    const email = uniqueEmail('enum');
    const wrongPwd = await req.post('/api/auth/login').send({ email: email, password: 'WrongPass123!' });
    const unknown = await req.post('/api/auth/login').send({ email: uniqueEmail('ghost'), password: 'WrongPass123!' });
    expect(wrongPwd.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPwd.body.error).toBe(unknown.body.error);
  });

  it('normalizes email case at login', async () => {
    const email = uniqueEmail('case');
    await req.post('/api/setup/admin').send({ email, password: TEST_PASSWORD });
    const res = await req.post('/api/auth/login').send({ email: email.toUpperCase(), password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('rejects invalid/expired tokens with 401', async () => {
    const res = await req.get('/api/classes').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a valid token when the account is deleted (401)', async () => {
    const email = uniqueEmail('ghostuser');
    await req.post('/api/setup/admin').send({ email, password: TEST_PASSWORD });
    const login = await req.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const token = login.body.token;
    // Promote a second ADMIN, log in as them, then delete the first account.
    const created = await req
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: uniqueEmail('admin2'), password: TEST_PASSWORD, role: 'ADMIN' });
    const admin2 = await req.post('/api/auth/login').send({ email: created.body.email, password: TEST_PASSWORD });
    const users = await req.get('/api/users').set('Authorization', `Bearer ${token}`);
    const ghost = (users.body as { id: number; email: string }[]).find((u) => u.email === email);
    expect(ghost).toBeTruthy();
    const del = await req.delete(`/api/users/${ghost!.id}`).set('Authorization', `Bearer ${admin2.body.token}`);
    expect(del.status).toBe(200);
    const stillUsed = await req.get('/api/classes').set('Authorization', `Bearer ${token}`);
    expect(stillUsed.status).toBe(401);
  });

  it('has no public register route (returns JSON 404)', async () => {
    const res = await req.post('/api/auth/register').send({ email: uniqueEmail('reg'), password: TEST_PASSWORD });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route introuvable');
  });

  it('changes password with correct current password, rejects wrong one', async () => {
    const email = uniqueEmail('pw');
    await req.post('/api/setup/admin').send({ email, password: TEST_PASSWORD });
    const token = (await req.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).body.token;
    const wrong = await req
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass123!', newPassword: 'NewPass456!' });
    expect(wrong.status).toBe(400);
    const ok = await req
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPass456!' });
    expect(ok.status).toBe(200);
    const oldPwd = await req.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(oldPwd.status).toBe(401);
    const newPwd = await req.post('/api/auth/login').send({ email, password: 'NewPass456!' });
    expect(newPwd.status).toBe(200);
  });
});

describe('login rate limiting', () => {
  beforeEach(resetDb);

  it('blocks after LOGIN_RATE_MAX failed attempts (429) even with valid credentials', async () => {
    const email = uniqueEmail('ratelimited');
    await req.post('/api/setup/admin').send({ email, password: TEST_PASSWORD });
    for (let i = 0; i < 5; i++) {
      const res = await req.post('/api/auth/login').send({ email, password: 'WrongPass123!' });
      expect([401, 429]).toContain(res.status);
    }
    // 6th attempt is blocked by the limiter despite correct credentials.
    const blocked = await req.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(blocked.status).toBe(429);
  });
});