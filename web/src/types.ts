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
  avatar_url?: string;
  roles?: string[];
  groups?: string[];
  department?: string;
  job_title?: string;
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
  user_id?: string;
  project_id?: string;
  prompt?: string;
  issuer?: string;
  issued_at?: string;
  id_claims?: any;
}

export interface PKCEState {
  verifier: string;
  challenge: string;
  state: string;
  nonce: string;
  createdAt: number;
  tenant: string;
  userId?: string;
  projectId?: string;
  scope?: string;
  prompt?: string;
}

export interface Profile {
  id: string;
  name: string;
  rootUrl: string; // Project root URL (e.g. http://localhost:3000)
  provider: 'entra' | 'generic';
  tenant: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
  host?: string; // Configurable host origin / base URL
  issuerMode?: 'host' | 'entra'; // 'host' (default: {host}/{tenant}/v2.0) or 'entra'
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
  raw?: string;
}
