export interface MockUser {
  id: string;
  name: string;
  given_name?: string;
  family_name?: string;
  email: string;
  preferred_username: string;
  tid: string;
  oid: string;
  sub: string;
  roles?: string[];
  groups?: string[];
  custom_claims?: Record<string, any>;
}

export interface TokenSession {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  expires_at?: number;
  email?: string;
  name?: string;
  tid?: string;
  oid?: string;
  verified?: boolean;
}

export interface PKCEState {
  verifier: string;
  challenge: string;
  state: string;
  nonce: string;
  createdAt: number;
  tenant: string;
}

export interface Profile {
  id: string;
  name: string;
  provider: 'entra' | 'generic';
  tenant: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  jwksUrl?: string;
  logoutUrl?: string;
  prompt?: string;
  loginHint?: string;
}

export interface DecodedJWT {
  header: Record<string, any>;
  payload: Record<string, any>;
  signature: string;
}
