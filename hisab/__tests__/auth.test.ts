import { addUser, changePassword, login, resetPassword, updateUser } from '../src/domain/auth';
import { createCompany } from '../src/domain/template';

function company() {
  const s = createCompany({ companyName: 'X', currency: 'OMR', vatRate: 5, country: 'OM' });
  return addUser(s, { username: 'Admin', name: 'Owner', role: 'admin', password: 'secret123' });
}

it('creates users with hashed passwords and logs in', () => {
  const { state, user } = company();
  expect(user.username).toBe('admin');
  expect(user.passwordHash).not.toContain('secret');
  expect(user.passwordHash).toHaveLength(64);
  const ok = login(state, ' ADMIN ', 'secret123');
  expect(ok.ok).toBe(true);
  const bad = login(state, 'admin', 'wrong');
  expect(bad).toMatchObject({ ok: false, error: 'Invalid username or password.' });
  expect(login(state, 'nobody', 'secret123').ok).toBe(false);
});

it('validates passwords and usernames', () => {
  const { state } = company();
  expect(() => addUser(state, { username: 'a', name: 'A', role: 'viewer', password: 'secret123' })).toThrow(/Username/);
  expect(() => addUser(state, { username: 'admin', name: 'A', role: 'viewer', password: 'secret123' })).toThrow(/taken/);
  expect(() => addUser(state, { username: 'sara', name: 'Sara', role: 'viewer', password: 'short1' })).toThrow(/at least 8/);
  expect(() => addUser(state, { username: 'sara', name: 'Sara', role: 'viewer', password: 'onlyletters' })).toThrow(/letters and numbers/);
});

it('locks the account after 5 failed attempts', () => {
  let { state } = company();
  const now = new Date('2026-01-01T10:00:00Z');
  for (let i = 0; i < 5; i++) state = login(state, 'admin', 'nope', now).state;
  expect(login(state, 'admin', 'secret123', now)).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
  expect(login(state, 'admin', 'secret123', new Date('2026-01-01T10:06:00Z')).ok).toBe(true);
});

it('changes and resets passwords', () => {
  const { state: s0, user } = company();
  expect(() => changePassword(s0, user.id, 'wrong', 'newpass99')).toThrow(/incorrect/);
  let s = changePassword(s0, user.id, 'secret123', 'newpass99');
  expect(login(s, 'admin', 'newpass99').ok).toBe(true);
  s = resetPassword(s, user.id, 'temp1234');
  const r = login(s, 'admin', 'temp1234');
  expect(r.ok && r.user.mustChangePassword).toBe(true);
});

it('keeps at least one administrator and blocks deactivated users', () => {
  const { state: s0, user } = company();
  expect(() => updateUser(s0, user.id, { role: 'viewer' })).toThrow(/administrator/);
  const { state: s1, user: sara } = addUser(s0, { username: 'sara', name: 'Sara', role: 'accountant', password: 'secret123' });
  const s2 = updateUser(s1, sara.id, { active: false });
  expect(login(s2, 'sara', 'secret123')).toMatchObject({ ok: false, error: expect.stringMatching(/deactivated/) });
});
