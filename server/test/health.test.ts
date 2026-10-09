import { describe, it, expect } from 'vitest';
import { req, adminToken } from './helpers';

describe('health', () => {
  it('is publicly reachable without a JWT', async () => {
    const res = await req.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('does not require authentication', async () => {
    const res = await req.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('still works with a valid token (no ambiguity with auth routes)', async () => {
    const token = await adminToken();
    const res = await req.get('/api/health').set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});