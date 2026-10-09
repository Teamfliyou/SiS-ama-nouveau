import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, createUser, uniqueEmail, tokenFor, TEST_PASSWORD } from './helpers';
import { prisma } from '../lib/prisma';
import { accountStatus, hashToken } from '../lib/invitations';

const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;
const login = (email: string, password: string) => req.post('/api/auth/login').send({ email, password });

describe('account status (pure)', () => {
  it('tells active accounts from pending and expired invitations', () => {
    const now = new Date('2026-10-10T10:00:00Z');
    expect(accountStatus({ inviteTokenHash: null, inviteExpiresAt: null }, now)).toBe('ACTIVE');
    expect(accountStatus({ inviteTokenHash: 'x', inviteExpiresAt: new Date('2026-10-12T00:00:00Z') }, now)).toBe('INVITED');
    expect(accountStatus({ inviteTokenHash: 'x', inviteExpiresAt: new Date('2026-10-09T00:00:00Z') }, now)).toBe('EXPIRED');
    expect(hashToken('abc')).toHaveLength(64);
  });
});

describe('teacher accounts by invitation', () => {
  beforeEach(resetDb);

  it('creates the Prof account with the record and lets the teacher choose the password', async () => {
    const admin = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(admin)).send({ name: 'Niveau 1' })).body;
    const email = uniqueEmail('karim');
    const created = await req
      .post('/api/teachers')
      .set(auth(admin))
      .send({ firstName: 'Karim', lastName: 'Haddad', email, classId: cls.id });
    expect(created.status).toBe(201);
    // No email service in tests: the link is given to send it another way.
    expect(created.body.invitation).toMatchObject({ email, emailStatus: 'SIMULATED' });
    expect(created.body.account).toMatchObject({ email, status: 'INVITED' });
    const link = created.body.invitation.link as string;
    expect(link).toMatch(/\/invitation\?token=/);

    // Nobody can log in before the teacher chose the password.
    expect((await login(email, TEST_PASSWORD)).status).toBe(401);
    // The token itself is never stored.
    const token = tokenOf(link);
    expect(await prisma.user.count({ where: { inviteTokenHash: token } })).toBe(0);

    const info = await req.get(`/api/invitations/${token}`);
    expect(info.body).toEqual({ email, firstName: 'Karim' });
    expect((await req.post(`/api/invitations/${token}`).send({ password: 'court' })).status).toBe(400);
    const accepted = await req.post(`/api/invitations/${token}`).send({ password: 'MonMotDePasse2026' });
    expect(accepted.body).toEqual({ success: true, email });

    const session = await login(email, 'MonMotDePasse2026');
    expect(session.status).toBe(200);
    expect(session.body.role).toBe('TEACHER');
    // The teacher sees their class.
    const classes = (await req.get('/api/classes').set(auth(session.body.token))).body as { id: number }[];
    expect(classes.map((c) => c.id)).toEqual([cls.id]);

    // The link only works once.
    expect((await req.post(`/api/invitations/${token}`).send({ password: 'UnAutre2026!!' })).status).toBe(404);
    const list = (await req.get('/api/teachers').set(auth(admin))).body as { id: number; account: { status: string } }[];
    expect(list.find((t) => t.id === created.body.id)?.account.status).toBe('ACTIVE');
  });

  it('invites a teacher once an email is added, and sends a new link on request', async () => {
    const admin = await adminToken();
    const noEmail = (await req.post('/api/teachers').set(auth(admin)).send({ firstName: 'Nadia', lastName: 'B' })).body;
    expect(noEmail.invitation).toBeNull();
    expect(noEmail.account).toBeNull();
    const refused = await req.post(`/api/teachers/${noEmail.id}/invitation`).set(auth(admin));
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('e-mail');

    const email = uniqueEmail('nadia');
    const updated = await req.put(`/api/teachers/${noEmail.id}`).set(auth(admin)).send({ firstName: 'Nadia', lastName: 'B', email });
    expect(updated.body.invitation).toMatchObject({ email, emailStatus: 'SIMULATED' });
    const first = tokenOf(updated.body.invitation.link);

    // Sending again replaces the link (also for a forgotten password).
    const again = await req.post(`/api/teachers/${noEmail.id}/invitation`).set(auth(admin));
    expect(again.status).toBe(200);
    const second = tokenOf(again.body.link);
    expect(second).not.toBe(first);
    expect((await req.get(`/api/invitations/${first}`)).status).toBe(404);
    expect((await req.get(`/api/invitations/${second}`)).status).toBe(200);

    // Expired link.
    await prisma.user.updateMany({ where: { email }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    expect((await req.get(`/api/invitations/${second}`)).status).toBe(410);
    const users = (await req.get('/api/users').set(auth(admin))).body as { email: string; status: string; inviteTokenHash?: string }[];
    const account = users.find((u) => u.email === email)!;
    expect(account.status).toBe('EXPIRED');
    expect(account.inviteTokenHash).toBeUndefined();
  });

  it('keeps an email used by another account, and lets only the administration invite', async () => {
    const admin = await adminToken();
    const staffEmail = uniqueEmail('vs');
    await createUser(staffEmail, 'STAFF');
    const staff = await tokenFor(staffEmail);

    // The record is saved; the invitation explains why it could not be done.
    const clash = await req.post('/api/teachers').set(auth(admin)).send({ firstName: 'X', lastName: 'Y', email: staffEmail });
    expect(clash.status).toBe(201);
    expect(clash.body.invitation.error).toContain('déjà utilisée');
    expect(clash.body.account).toBeNull();

    // Vie scolaire invites; a teacher cannot.
    const teacher = (await req.post('/api/teachers').set(auth(staff)).send({ firstName: 'Z', lastName: 'W', email: uniqueEmail('z') })).body;
    expect(teacher.invitation.emailStatus).toBe('SIMULATED');
    const token = tokenOf(teacher.invitation.link);
    await req.post(`/api/invitations/${token}`).send({ password: 'MotDePasseProf1' });
    const prof = (await login(teacher.email, 'MotDePasseProf1')).body.token;
    expect((await req.post(`/api/teachers/${teacher.id}/invitation`).set(auth(prof))).status).toBe(403);

    // Malformed tokens.
    expect((await req.get('/api/invitations/abc')).status).toBe(404);
  });
});
