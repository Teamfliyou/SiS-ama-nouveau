const JWT_PLACEHOLDER = 'change-me-with-a-long-random-secret';
const JWT_EXAMPLE_MARKER = 'CHANGE_ME';

/**
 * Returns the JWT secret, failing fast if it is missing, too short or still uses
 * an example placeholder. There is intentionally NO default value in code.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is missing or too short (min 16 chars)');
  }
  if (secret.trim() === JWT_PLACEHOLDER || secret.includes(JWT_EXAMPLE_MARKER)) {
    throw new Error('JWT_SECRET still uses an example placeholder value');
  }
  return secret;
}