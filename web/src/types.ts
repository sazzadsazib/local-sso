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
  custom_claims?: Record<string, unknown>;
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
  rootUrl: string; // Project root URL (e.g. http://localhost:3000)
  provider: 'entra' | 'generic';
  tenant: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
  host?: string; // Configurable host origin / base URL (e.g. https://xxxx.ngrok-free.app or http://localhost:8080)
  issuerMode?: 'host' | 'entra'; // 'host' (default: {host}/{tenant}/v2.0) or 'entra' (login.microsoftonline.com)
  authorizeUrl?: string;
  tokenUrl?: string;
  jwksUrl?: string;
  logoutUrl?: string;
  prompt?: string;
  loginHint?: string;
}

export interface JWTHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface JWTPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  preferred_username?: string;
  tid?: string;
  oid?: string;
  roles?: string[];
  groups?: string[];
  picture?: string;
  avatar_url?: string;
  scp?: string;
  appid?: string;
  department?: string;
  job_title?: string;
  [key: string]: unknown;
}

export interface DecodedJWT {
  header: JWTHeader;
  payload: JWTPayload;
  signature: string;
}

export interface VerifyResponse {
  verified: boolean;
  reason?: string;
  claims?: JWTPayload;
}

export type ToastType = 'success' | 'info' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}
