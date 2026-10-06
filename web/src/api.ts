import { MockUser, TokenSession } from './types';

const BASE_URL = window.location.origin;

export async function fetchMockUsers(): Promise<MockUser[]> {
  const res = await fetch(`${BASE_URL}/api/users`);
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`);
  return res.json();
}

export async function createMockUser(user: Partial<MockUser>): Promise<MockUser> {
  const res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error(`Failed to create user: ${res.statusText}`);
  return res.json();
}

export async function updateMockUser(id: string, user: Partial<MockUser>): Promise<MockUser> {
  const res = await fetch(`${BASE_URL}/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error(`Failed to update user: ${res.statusText}`);
  return res.json();
}

export async function deleteMockUser(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/users/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete user: ${res.statusText}`);
}

export async function exchangeToken(tokenUrl: string, params: Record<string, string>): Promise<TokenSession> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    body.append(k, v);
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data;
}

export async function verifyIDToken(idToken: string, jwksUri: string, issuer: string, audience: string) {
  const res = await fetch(`${BASE_URL}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_token: idToken,
      jwks_uri: jwksUri,
      issuer: issuer,
      audience: audience,
    }),
  });
  return res.json();
}

export function decodeJWT(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { header, payload, signature: parts[2] };
  } catch {
    return null;
  }
}
