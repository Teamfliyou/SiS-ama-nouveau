import { describe, it, expect } from 'vitest';
import { ApiError, apiErrorMessage } from './api';

describe('apiErrorMessage', () => {
  it('prefers the server message from ApiError', () => {
    expect(apiErrorMessage(new ApiError('Rôle invalide', 400))).toBe('Rôle invalide');
  });

  it('falls back to the generic network message', () => {
    expect(apiErrorMessage({ some: 'thing' })).toBe('Erreur de connexion au serveur');
    expect(apiErrorMessage(null)).toBe('Erreur de connexion au serveur');
  });
});