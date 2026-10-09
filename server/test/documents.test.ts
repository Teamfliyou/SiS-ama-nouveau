import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, createUser, uniqueEmail, tokenFor } from './helpers';
import { detectFileType } from '../routes/documents';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('contenu du règlement')]);

async function staffToken() {
  const email = uniqueEmail('staff');
  await createUser(email, 'STAFF');
  return tokenFor(email);
}

describe('file type detection (pure)', () => {
  it('derives the type from the extension and checks the first bytes', () => {
    expect(detectFileType('Règlement.PDF', PDF)).toBe('application/pdf');
    expect(detectFileType('photo.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    // A renamed file whose content does not match its extension.
    expect(detectFileType('faux.pdf', Buffer.from('<html><script>'))).toBeNull();
    expect(detectFileType('page.html', Buffer.from('<html>'))).toBeNull();
    expect(detectFileType('pdf', PDF)).toBeNull();
  });
});

describe('Messagerie (announcements)', () => {
  beforeEach(resetDb);

  it('lets administrators publish, pin, edit and remove; the team reads', async () => {
    const admin = await adminToken();
    const staff = await staffToken();

    const first = await req.post('/api/announcements').set(auth(admin)).send({ title: 'Rentrée', body: 'Samedi 13 septembre à 9 h.' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ title: 'Rentrée', pinned: false });
    expect(first.body.createdBy.email).toContain('admin');
    const pinned = await req.post('/api/announcements').set(auth(admin)).send({ title: 'Règlement', body: 'À lire.', pinned: true });
    await req.post('/api/announcements').set(auth(admin)).send({ title: 'Sortie', body: 'Le 20 juin.' });

    // Staff reads, pinned first then the latest.
    const list = await req.get('/api/announcements').set(auth(staff));
    expect(list.status).toBe(200);
    expect(list.body.map((a: { title: string }) => a.title)).toEqual(['Règlement', 'Sortie', 'Rentrée']);

    // Staff cannot publish, edit or remove.
    expect((await req.post('/api/announcements').set(auth(staff)).send({ title: 'X', body: 'Y' })).status).toBe(403);
    expect((await req.put(`/api/announcements/${first.body.id}`).set(auth(staff)).send({ title: 'X', body: 'Y' })).status).toBe(403);
    expect((await req.delete(`/api/announcements/${first.body.id}`).set(auth(staff))).status).toBe(403);

    expect((await req.post('/api/announcements').set(auth(admin)).send({ title: '  ', body: 'Y' })).status).toBe(400);
    const edited = await req
      .put(`/api/announcements/${first.body.id}`)
      .set(auth(admin))
      .send({ title: 'Rentrée 2026', body: 'Samedi 13 septembre à 9 h 30.', pinned: false });
    expect(edited.body.title).toBe('Rentrée 2026');
    expect((await req.delete(`/api/announcements/${pinned.body.id}`).set(auth(admin))).status).toBe(200);
    expect((await req.delete(`/api/announcements/${pinned.body.id}`).set(auth(admin))).status).toBe(404);
    expect((await req.get('/api/announcements').set(auth(staff))).body).toHaveLength(2);

    // Information is kept in the JSON backup and not duplicated on restore.
    const backup = (await req.get('/api/export').set(auth(admin))).body;
    expect(backup.data.announcements).toHaveLength(2);
    expect((await req.post('/api/import/full').set(auth(admin)).send(backup)).status).toBe(200);
    expect((await req.get('/api/announcements').set(auth(staff))).body).toHaveLength(2);
    // ...and restored once removed.
    for (const a of (await req.get('/api/announcements').set(auth(admin))).body as { id: number }[]) {
      await req.delete(`/api/announcements/${a.id}`).set(auth(admin));
    }
    expect((await req.post('/api/import/full').set(auth(admin)).send(backup)).status).toBe(200);
    const restored = (await req.get('/api/announcements').set(auth(staff))).body as { title: string }[];
    expect(restored.map((a) => a.title).sort()).toEqual(['Rentrée 2026', 'Sortie']);
  });
});

describe('Documents', () => {
  beforeEach(resetDb);

  const upload = (token: string, file: Buffer, query: Record<string, string>) =>
    req.post('/api/documents').query(query).set(auth(token)).set('Content-Type', 'application/octet-stream').send(file);

  it('stores files sent by administrators and serves them to the team', async () => {
    const admin = await adminToken();
    const staff = await staffToken();

    const created = await upload(admin, PDF, {
      title: 'Règlement intérieur',
      category: 'REGLEMENT',
      description: 'Version 2026-2027',
      fileName: 'Règlement intérieur 2026.pdf',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      title: 'Règlement intérieur',
      category: 'REGLEMENT',
      mimeType: 'application/pdf',
      size: PDF.length,
      fileName: 'Règlement intérieur 2026.pdf',
    });
    expect(created.body.data).toBeUndefined();

    const list = await req.get('/api/documents').set(auth(staff));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].data).toBeUndefined();

    const file = await req
      .get(`/api/documents/${created.body.id}/file`)
      .set(auth(staff))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);

    const edited = await req
      .put(`/api/documents/${created.body.id}`)
      .set(auth(admin))
      .send({ title: 'Règlement intérieur 2026-2027', category: 'REGLEMENT', description: '' });
    expect(edited.body).toMatchObject({ title: 'Règlement intérieur 2026-2027', description: null });

    expect((await req.delete(`/api/documents/${created.body.id}`).set(auth(staff))).status).toBe(403);
    expect((await req.delete(`/api/documents/${created.body.id}`).set(auth(admin))).status).toBe(200);
    expect((await req.get(`/api/documents/${created.body.id}/file`).set(auth(staff))).status).toBe(404);
  });

  it('refuses uploads from the team, unknown types, empty and oversized files', async () => {
    const admin = await adminToken();
    const staff = await staffToken();
    const query = { title: 'Infos', fileName: 'infos.pdf' };

    expect((await upload(staff, PDF, query)).status).toBe(403);
    const html = await upload(admin, Buffer.from('<html><script>alert(1)</script>'), { title: 'Page', fileName: 'page.html' });
    expect(html.status).toBe(400);
    expect(html.body.error).toContain('Type de fichier non accepté');
    expect((await upload(admin, Buffer.from('pas un pdf'), query)).status).toBe(400);
    expect((await upload(admin, PDF, { fileName: 'infos.pdf' })).status).toBe(400);
    expect((await upload(admin, PDF, { title: 'Infos', fileName: 'infos.pdf', category: 'NOPE' })).status).toBe(400);
    expect((await upload(admin, Buffer.alloc(0), query)).status).toBe(400);

    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await upload(admin, big, query);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error).toContain('10 Mo');
    expect((await req.get('/api/documents').set(auth(admin))).body).toHaveLength(0);
  });
});
