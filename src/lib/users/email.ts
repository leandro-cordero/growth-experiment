// Zod-free so the signup island can import it. Only allowlisted providers may register
// (docs/decisions.md > Bots and email quality).
const FREE = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'yahoo.com', 'proton.me', 'protonmail.com', 'aol.com',
]);
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com']);

export type EmailDomainType = 'free' | 'corporate' | 'disposable';

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

export const isAllowedEmail = (email: string) => FREE.has(domainOf(email));

export function emailDomainType(email: string): EmailDomainType {
  const d = domainOf(email);
  if (FREE.has(d)) return 'free';
  return DISPOSABLE.has(d) ? 'disposable' : 'corporate';
}
