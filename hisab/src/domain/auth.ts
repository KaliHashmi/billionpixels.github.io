import { fromHex, pbkdf2Sha256, safeEqual, toHex, utf8 } from './crypto';
import { AccountingError, AppState, ID, User, UserRole } from './types';
import { newId } from './utils';

export const PASSWORD_ITERATIONS = 30000;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  accountant: 'Accountant',
  viewer: 'Viewer (read-only)',
};

export type RandomBytes = (n: number) => Uint8Array;

/** Fallback for tests; the app passes a cryptographically secure generator. */
const insecureRandom: RandomBytes = (n) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256));

export function hashPassword(password: string, saltHex: string, iterations = PASSWORD_ITERATIONS): string {
  return toHex(pbkdf2Sha256(utf8(password), fromHex(saltHex), iterations));
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new AccountingError(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new AccountingError('The password must contain letters and numbers.');
}

function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

export interface NewUser {
  username: string;
  name: string;
  role: UserRole;
  password: string;
  mustChangePassword?: boolean;
}

function credentials(password: string, random: RandomBytes) {
  const salt = toHex(random(16));
  return { salt, iterations: PASSWORD_ITERATIONS, passwordHash: hashPassword(password, salt) };
}

export function addUser(state: AppState, input: NewUser, random: RandomBytes = insecureRandom): { state: AppState; user: User } {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9._@-]{3,40}$/.test(username)) throw new AccountingError('Username must be 3-40 letters, digits or . _ - @');
  if (state.users.some((u) => u.username === username)) throw new AccountingError('This username is already taken.');
  if (!input.name.trim()) throw new AccountingError('Name is required.');
  validatePassword(input.password);
  const user: User = {
    id: newId(),
    username,
    name: input.name.trim(),
    role: input.role,
    ...credentials(input.password, random),
    active: true,
    mustChangePassword: !!input.mustChangePassword,
    failedAttempts: 0,
    createdAt: new Date().toISOString(),
  };
  return { state: { ...state, users: [...state.users, user] }, user };
}

function replaceUser(state: AppState, user: User): AppState {
  return { ...state, users: state.users.map((u) => (u.id === user.id ? user : u)) };
}

export type LoginResult = { ok: true; state: AppState; user: User } | { ok: false; state: AppState; error: string };

/**
 * Check credentials. Repeated failures lock the account for a few minutes; the returned state
 * records attempts and the last login and must be saved either way.
 */
export function login(state: AppState, usernameInput: string, password: string, now = new Date()): LoginResult {
  const username = normalizeUsername(usernameInput);
  const user = state.users.find((u) => u.username === username);
  const fail = 'Invalid username or password.';
  if (!user) return { ok: false, state, error: fail };
  if (!user.active) return { ok: false, state, error: 'This account is deactivated. Contact your administrator.' };
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    return { ok: false, state, error: 'Too many failed attempts. Try again in a few minutes.' };
  }
  if (!safeEqual(hashPassword(password, user.salt, user.iterations), user.passwordHash)) {
    const attempts = user.failedAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    const next = replaceUser(state, {
      ...user,
      failedAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : user.lockedUntil,
    });
    return { ok: false, state: next, error: locked ? 'Too many failed attempts. Try again in a few minutes.' : fail };
  }
  const updated = { ...user, failedAttempts: 0, lockedUntil: undefined, lastLoginAt: now.toISOString() };
  return { ok: true, state: replaceUser(state, updated), user: updated };
}

/** "Keep me signed in" lasts this long on a device, renewed each time the app is opened. */
export const KEEP_SIGNED_IN_DAYS = 30;

/** A remembered sign-in, stored on the device. Tied to the password: a new password ends it. */
export interface SavedSession {
  userId: ID;
  /** The user's password salt when the session started (a new password gets a new salt). */
  salt: string;
  until: string;
}

export function saveSession(user: User, now = new Date()): SavedSession {
  return { userId: user.id, salt: user.salt, until: new Date(now.getTime() + KEEP_SIGNED_IN_DAYS * 86400000).toISOString() };
}

/** The user a remembered sign-in still belongs to, if it is valid. */
export function restoreSession(state: AppState, saved: SavedSession | null | undefined, now = new Date()): User | undefined {
  if (!saved || typeof saved.until !== 'string' || !(new Date(saved.until) > now)) return undefined;
  const user = state.users.find((u) => u.id === saved.userId);
  if (!user || !user.active || user.salt !== saved.salt) return undefined;
  if (user.lockedUntil && new Date(user.lockedUntil) > now) return undefined;
  return user;
}

export function changePassword(state: AppState, userId: ID, current: string, next: string, random: RandomBytes = insecureRandom): AppState {
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new AccountingError('User not found.');
  if (!safeEqual(hashPassword(current, user.salt, user.iterations), user.passwordHash)) throw new AccountingError('The current password is incorrect.');
  if (current === next) throw new AccountingError('Choose a different password.');
  validatePassword(next);
  return replaceUser(state, { ...user, ...credentials(next, random), mustChangePassword: false });
}

/** Administrator sets a temporary password; the user must change it at next login. */
export function resetPassword(state: AppState, userId: ID, temporary: string, random: RandomBytes = insecureRandom): AppState {
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new AccountingError('User not found.');
  validatePassword(temporary);
  return replaceUser(state, { ...user, ...credentials(temporary, random), mustChangePassword: true, failedAttempts: 0, lockedUntil: undefined });
}

function activeAdmins(state: AppState, except?: ID): number {
  return state.users.filter((u) => u.active && u.role === 'admin' && u.id !== except).length;
}

export function updateUser(state: AppState, userId: ID, patch: { name?: string; role?: UserRole; active?: boolean }): AppState {
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new AccountingError('User not found.');
  const next = { ...user, ...patch, name: (patch.name ?? user.name).trim() };
  if (!next.name) throw new AccountingError('Name is required.');
  if (user.role === 'admin' && (next.role !== 'admin' || !next.active) && activeAdmins(state, userId) === 0) {
    throw new AccountingError('At least one active administrator is required.');
  }
  return replaceUser(state, next);
}

export function canEdit(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'accountant';
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin';
}

/**
 * Issued documents (invoices, bills, credit notes, vouchers, payroll, VAT closings):
 * administrators edit and delete them, accountants may only delete them, viewers neither.
 */
export function canEditDocuments(role: UserRole | undefined): boolean {
  return role === 'admin';
}

export function canDeleteDocuments(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'accountant';
}
