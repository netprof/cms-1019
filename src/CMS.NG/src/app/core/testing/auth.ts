import { AUTH_STORAGE_KEY, AuthProfile } from '../auth/auth.service';

/** An unsigned JWT-shaped token carrying the given `role` claim; enough for the client, which never verifies. */
export function fakeToken(roles: string[] | string): string {
  const encode = (value: object) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'helen', name: '海倫', role: roles })}.sig`;
}

/** Stores a signed-in profile in session storage; call before the AuthService is created. */
export function signIn(roles: string[] | string = ['Admin'], userName = '海倫'): AuthProfile {
  const profile: AuthProfile = { userId: 'helen', userName, accessToken: fakeToken(roles) };
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}
