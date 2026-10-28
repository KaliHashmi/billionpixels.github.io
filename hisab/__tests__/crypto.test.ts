import { hmacSha256, pbkdf2Sha256, sha256, toHex, utf8 } from '../src/domain/crypto';

it('sha256 matches known vectors', () => {
  expect(toHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(toHex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(toHex(sha256(utf8('a'.repeat(1000))))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  expect(toHex(sha256(utf8('حساب')))).toHaveLength(64);
});

it('hmac and pbkdf2 match RFC test vectors', () => {
  expect(toHex(hmacSha256(utf8('key'), utf8('The quick brown fox jumps over the lazy dog')))).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  expect(toHex(pbkdf2Sha256(utf8('password'), utf8('salt'), 1))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  expect(toHex(pbkdf2Sha256(utf8('password'), utf8('salt'), 2))).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
  expect(toHex(pbkdf2Sha256(utf8('password'), utf8('salt'), 4096))).toBe('c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
});
