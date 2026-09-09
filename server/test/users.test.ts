import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, createUser, adminToken, adminSession, auth, uniqueEmail, tokenFor } from './helpers';

describe('user management (ADMIN only)', () => {
  beforeEach(resetDb);

  it('requires authentication (401) without a token', async () => {
    expect((await req.get('/api/users')).status).toBe(401);
    expect((await req.post('/api/users').send({})).status).toBe(401);
  });

  it('forbids STAFF users from managing users (403)', async () => {
    const staffEmail = uniqueEmail('staff');
    await createUser(staffEmail, 'STAFF');
    const token = await tokenFor(staffEmail);
    expect((await req.get('/api/users').set(auth(token))).status).toBe(403);
    expect((await req.post('/api/users').set(auth(token)).send({})).status).toBe(403);
  });

  it('lists users without exposing password hashes', async () => {
    const token = await adminToken();
    const res = await req.get('/api/users').set(auth(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const u = res.body[0];
    expect(u.password).toBeUndefined();
    expect(u.token).toBeUndefined();
  });

  it('creates a user (201) and rejects invalid payloads (400)', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/users')
      .set(auth(token))
      .send({ email: uniqueEmail('new'), password: 'StrongPass123!', role: 'STAFF' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBeTruthy();
    expect(res.body.role).toBe('STAFF');
    const badEmail = await req
      .post('/api/users')
      .set(auth(token))
      .send({ email: 'nope', password: 'StrongPass123!', role: 'STAFF' });
    expect(badEmail.status).toBe(400);
    const badRole = await req
      .post('/api/users')
      .set(auth(token))
      .send({ email: uniqueEmail('r'), password: 'StrongPass123!', role: 'SUPERUSER' });
    expect(badRole.status).toBe(400);
  });

  it('prevents self-demotion / self-deletion and protecting the last ADMIN (400)', async () => {
    const admin = await adminSession();
    const demote = await req.put(`/api/users/${admin.id}/role`).set(auth(admin.token)).send({ role: 'STAFF' });
    expect(demote.status).toBe(400);
    const selfDelete = await req.delete(`/api/users/${admin.id}`).set(auth(admin.token));
    expect(selfDelete.status).toBe(400);
  });

  it('allows an ADMIN to demote another ADMIN when one remains', async () => {
    const admin = await adminSession();
    const created = await req
      .post('/api/users')
      .set(auth(admin.token))
      .send({ email: uniqueEmail('otheradmin'), password: 'StrongPass123!', role: 'ADMIN' });
    const res = await req.put(`/api/users/${created.body.id}/role`).set(auth(admin.token)).send({ role: 'STAFF' });
    expect(res.status).toBe(200);
  });

  it('allows an ADMIN to delete another user', async () => {
    const admin = await adminSession();
    const created = await req
      .post('/api/users')
      .set(auth(admin.token))
      .send({ email: uniqueEmail('victim'), password: 'StrongPass123!', role: 'STAFF' });
    const res = await req.delete(`/api/users/${created.body.id}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    const users = await req.get('/api/users').set(auth(admin.token));
    expect(users.body).toHaveLength(1);
  });
});

describe('role-based access control on shared routes', () => {
  beforeEach(resetDb);

  it('lets both roles read public-of-api resources', async () => {
    const admin = await adminToken();
    const staffEmail = uniqueEmail('staff');
    await createUser(staffEmail, 'STAFF');
    const staff = await tokenFor(staffEmail);
    expect((await req.get('/api/classes').set(auth(admin))).status).toBe(200);
    expect((await req.get('/api/classes').set(auth(staff))).status).toBe(200);
    expect((await req.get('/api/stats').set(auth(staff))).status).toBe(200);
  });

  it('restricts data export/import to ADMIN', async () => {
    const token = await adminToken();
    const staffEmail = uniqueEmail('staff');
    await createUser(staffEmail, 'STAFF');
    const staff = await tokenFor(staffEmail);
    expect((await req.get('/api/export').set(auth(staff))).status).toBe(403);
    expect((await req.post('/api/import/full').set(auth(staff)).send({})).status).toBe(403);
    expect((await req.get('/api/export').set(auth(token))).status).toBe(200);
  });
});