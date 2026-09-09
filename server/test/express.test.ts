import { describe, it, expect } from 'vitest';
import { req, adminToken, auth } from './helpers';

describe('express hardening', () => {
  it('returns JSON 404 for unknown API routes (no HTML error page)', async () => {
    const res = await req.get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route introuvable');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('hides the x-powered-by header', async () => {
    const res = await req.get('/api/setup/status');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets basic security headers via helmet', async () => {
    const res = await req.get('/api/setup/status');
    expect(res.headers['content-security-policy']).toBeTruthy();
  });

  it('returns 400 on malformed JSON', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/classes')
      .set(auth(token))
      .set('Content-Type', 'application/json')
      .send('{"name": "CM1",');
    expect(res.status).toBe(400);
  });

  it('limits the JSON body size', async () => {
    const token = await adminToken();
    const big = 'x'.repeat(3 * 1024 * 1024);
    const res = await req
      .post('/api/classes')
      .set(auth(token))
      .send({ name: 'CM1', tuitionFee: 1, padding: big });
    expect(res.status).toBe(413);
  });
});