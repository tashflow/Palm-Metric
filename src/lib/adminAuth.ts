import type { User } from 'firebase/auth';

export const ADMIN_EMAILS = new Set<string>([
  'palmmetric1@gmail.com',
  'palmmatric1@gmail.com',
  'tashfilartwork@gmail.com',
  'tashflow26@gmail.com',
]);

export const ADMIN_UIDS = new Set<string>(['39H76y4E55g5yX2uY0lE5bQ3a393']);

export class AdminApprovalError extends Error {
  readonly code: string;
  readonly reasonCode?: string;

  constructor(code: string, message: string, reasonCode?: string) {
    super(message);
    this.name = 'AdminApprovalError';
    this.code = code;
    this.reasonCode = reasonCode;
  }
}

export interface AdminActor {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string;
  isAdminDocPresent?: boolean;
}

export function firebaseUserToAdminActor(
  user: User | null | undefined,
  isAdminDocPresent = false,
): AdminActor | null {
  if (!user) return null;
  const primaryProvider = user.providerData?.[0]?.providerId;
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    providerId: user.isAnonymous ? 'anonymous' : primaryProvider,
    isAdminDocPresent,
  };
}

export function isVerifiedAdminActor(actor: AdminActor | null | undefined): boolean {
  if (!actor) return false;
  if (typeof actor.uid !== 'string') return false;
  const cleanUid = actor.uid.trim();
  if (
    !cleanUid ||
    cleanUid !== actor.uid ||
    cleanUid.length > 128 ||
    cleanUid.includes('/') ||
    cleanUid.includes('\\') ||
    /\s/.test(cleanUid)
  ) {
    return false;
  }
  if (actor.isAnonymous === true || actor.providerId === 'anonymous') {
    return false;
  }

  if (ADMIN_UIDS.has(cleanUid)) {
    return true;
  }

  const normalizedEmail =
    typeof actor.email === 'string' ? actor.email.trim().toLowerCase() : '';
  if (actor.emailVerified === true && normalizedEmail && ADMIN_EMAILS.has(normalizedEmail)) {
    return true;
  }

  if (actor.emailVerified === true && actor.isAdminDocPresent === true) {
    return true;
  }

  return false;
}

export function assertVerifiedAdminActor(actor: AdminActor | null | undefined): AdminActor {
  if (!isVerifiedAdminActor(actor)) {
    throw new AdminApprovalError(
      'permission-denied',
      'Verified Admin authentication is required for order request review and approval.',
      'ADMIN_AUTH_REQUIRED',
    );
  }
  return actor as AdminActor;
}
