import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class XsrfTokenService {
  constructor(
    private readonly currentSecret: string,
    private readonly previousSecret: string | undefined,
    private readonly lifetimeMilliseconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  issuePreAuthenticationToken(): string {
    const issuedAt = this.now();
    const payload = `p.${issuedAt}.${issuedAt + this.lifetimeMilliseconds}.${randomBytes(24).toString('base64url')}`;
    return `${payload}.${this.sign(payload, this.currentSecret)}`;
  }

  issueSessionToken(sessionCredential: string): string {
    return `s.${this.sign(`session.${sessionCredential}`, this.currentSecret)}`;
  }

  verifyPreAuthenticationToken(
    cookieValue: string | undefined,
    headerValue: string | undefined,
  ): boolean {
    if (!sameValue(cookieValue, headerValue) || !cookieValue) return false;
    const parts = cookieValue.split('.');
    if (parts.length !== 5 || parts[0] !== 'p') return false;
    const issuedAt = Number(parts[1]);
    const expiresAt = Number(parts[2]);
    if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return false;
    const now = this.now();
    if (issuedAt > now || expiresAt <= now || expiresAt - issuedAt !== this.lifetimeMilliseconds) {
      return false;
    }
    const payload = parts.slice(0, 4).join('.');
    return this.verifySignature(payload, parts[4]);
  }

  verifySessionToken(
    sessionCredential: string,
    cookieValue: string | undefined,
    headerValue: string | undefined,
  ): boolean {
    if (!sameValue(cookieValue, headerValue) || !cookieValue?.startsWith('s.')) return false;
    return this.verifySignature(`session.${sessionCredential}`, cookieValue.slice(2));
  }

  private verifySignature(payload: string, signature: string | undefined): boolean {
    if (!signature) return false;
    return [this.currentSecret, this.previousSecret]
      .filter((secret): secret is string => secret !== undefined)
      .some((secret) => sameValue(this.sign(payload, secret), signature));
  }

  private sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }
}

function sameValue(first: string | undefined, second: string | undefined): boolean {
  if (first === undefined || second === undefined) return false;
  const firstBytes = Buffer.from(first);
  const secondBytes = Buffer.from(second);
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}
