import { describe, it, expect } from 'vitest';
import { accessKey, invitationMessage } from './invitations';

describe('teacher access', () => {
  it('tells the access status of a teacher record', () => {
    expect(accessKey(null, null)).toBe('NO_EMAIL');
    expect(accessKey('a@b.fr', null)).toBe('NONE');
    expect(accessKey('a@b.fr', { email: 'a@b.fr', status: 'INVITED', inviteExpiresAt: null })).toBe('INVITED');
  });

  it('explains the outcome of an invitation', () => {
    const base = { email: 'a@b.fr', expiresAt: '2026-10-17T00:00:00Z' };
    expect(invitationMessage({ ...base, emailStatus: 'SENT' })).toEqual({ ok: true, text: 'Invitation envoyée à a@b.fr' });
    expect(invitationMessage({ ...base, emailStatus: 'SIMULATED', link: 'x' }).text).toContain('copiez le lien');
    expect(invitationMessage({ ...base, emailStatus: 'FAILED', link: 'x' }).ok).toBe(false);
    expect(invitationMessage({ error: 'Cette adresse e-mail est déjà utilisée par un autre compte' }).ok).toBe(false);
  });
});
