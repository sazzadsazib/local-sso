import React, { useState } from 'react';
import { Icon } from './icons';
import { highlightCode } from './highlight';
import { showToast } from './toast';

export type HttpMethod = 'GET' | 'POST' | 'CONFIG';

export interface ApiParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData';
  type: string;
  required: boolean;
  defaultValue?: string;
  description: string;
}

export interface ApiResponseSpec {
  code: number | string;
  description: string;
  contentType?: string;
  schemaSample?: string;
}

export interface ApiOperation {
  id: string;
  tag: 'OIDC & OAuth 2.0 Core' | 'Discovery & Keys' | 'Mock Helpers & Admin';
  method: HttpMethod;
  name: string;
  path: string;
  fullUrl: string;
  isCustomMock: boolean;
  description: string;
  parameters: ApiParam[];
  requestContentType?: string;
  requestSample?: string;
  responses: ApiResponseSpec[];
  canExecuteLive?: boolean;
}

export interface SwaggerApiExplorerProps {
  effectiveOrigin: string;
  currentTenant: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  rootUrl: string;
  issuerUrl: string;
  authorityUrl: string;
  discoveryUrl: string;
  authorizeBaseUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  logoutUrl: string;
  userinfoUrl: string;
  tokenProxyUrl: string;
  verifyApiUrl: string;
  usersApiUrl: string;
}

interface ExecutionState {
  loading: boolean;
  executed: boolean;
  status?: number;
  statusText?: string;
  duration?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  curlCommand?: string;
  requestUrl?: string;
  error?: string;
}

export const SwaggerApiExplorer: React.FC<SwaggerApiExplorerProps> = ({
  effectiveOrigin,
  currentTenant,
  clientId,
  clientSecret,
  redirectUri,
  scope,
  rootUrl,
  issuerUrl,
  authorityUrl,
  discoveryUrl,
  authorizeBaseUrl,
  tokenUrl,
  jwksUrl,
  logoutUrl,
  userinfoUrl,
  tokenProxyUrl,
  verifyApiUrl,
  usersApiUrl,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'ALL' | HttpMethod>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({
    'get-authorize': false,
    'post-token': false,
    'get-discovery': true, // Keep discovery expanded by default like Swagger docs
  });
  const [tryItOutMap, setTryItOutMap] = useState<Record<string, boolean>>({});
  const [paramInputs, setParamInputs] = useState<Record<string, Record<string, string>>>({});
  const [execStateMap, setExecStateMap] = useState<Record<string, ExecutionState>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  let hostHeader = 'localhost:8080';
  try {
    hostHeader = new URL(effectiveOrigin).host;
  } catch {
    // fallback
  }

  const operations: ApiOperation[] = [
    // 1. OIDC & OAuth 2.0 Core
    {
      id: 'get-authorize',
      tag: 'OIDC & OAuth 2.0 Core',
      method: 'GET',
      name: 'OIDC Authorization Flow',
      path: `/${currentTenant}/oauth2/v2.0/authorize`,
      fullUrl: `${authorizeBaseUrl}?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scope)}&state=12345&nonce=67890`,
      isCustomMock: false,
      description: 'Standard Microsoft Entra v2.0 endpoint: Renders the mock user login & consent screen. After persona selection, redirects back to redirect_uri with an authorization code and anti-forgery state.',
      canExecuteLive: false,
      parameters: [
        { name: 'tenant', in: 'path', type: 'string', required: true, defaultValue: currentTenant, description: 'Tenant identifier: common, organizations, consumers, or tenant GUID.' },
        { name: 'client_id', in: 'query', type: 'string', required: true, defaultValue: clientId, description: 'Application (client) ID configured in your app.' },
        { name: 'response_type', in: 'query', type: 'string', required: true, defaultValue: 'code', description: 'Must contain "code" for OAuth 2.0 authorization code flow.' },
        { name: 'redirect_uri', in: 'query', type: 'string', required: true, defaultValue: redirectUri, description: 'Registered callback URL to return the authorization code to.' },
        { name: 'scope', in: 'query', type: 'string', required: true, defaultValue: scope, description: 'Space-delimited permissions (e.g. openid profile email offline_access).' },
        { name: 'response_mode', in: 'query', type: 'string', required: false, defaultValue: 'query', description: 'Mode to return code (query or fragment).' },
        { name: 'code_challenge', in: 'query', type: 'string', required: false, defaultValue: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', description: 'PKCE SHA-256 base64url challenge.' },
        { name: 'code_challenge_method', in: 'query', type: 'string', required: false, defaultValue: 'S256', description: 'PKCE method: S256 or plain.' },
        { name: 'state', in: 'query', type: 'string', required: false, defaultValue: 'xyz-state-123', description: 'Random client state string used for CSRF prevention.' },
      ],
      responses: [
        {
          code: 302,
          description: 'Redirect to redirect_uri with authorization code query parameter.',
          contentType: 'text/html',
          schemaSample: `HTTP/1.1 302 Found\nLocation: ${redirectUri}?code=mock_code_8f2b1d9c&state=xyz-state-123`,
        },
        {
          code: 400,
          description: 'Invalid client, missing client_id, or unregistered redirect_uri.',
          contentType: 'application/json',
          schemaSample: JSON.stringify({ error: 'invalid_request', error_description: 'Missing required parameter: client_id' }, null, 2),
        },
      ],
    },
    {
      id: 'post-token',
      tag: 'OIDC & OAuth 2.0 Core',
      method: 'POST',
      name: 'OAuth 2.0 Token Exchange',
      path: `/${currentTenant}/oauth2/v2.0/token`,
      fullUrl: tokenUrl,
      isCustomMock: false,
      description: 'Standard Microsoft Entra v2.0 endpoint: Exchanges authorization code + PKCE code_verifier or refresh_token for RS256 signed ID token, Bearer access token, and refresh token.',
      requestContentType: 'application/x-www-form-urlencoded',
      canExecuteLive: true,
      parameters: [
        { name: 'tenant', in: 'path', type: 'string', required: true, defaultValue: currentTenant, description: 'Tenant identifier.' },
        { name: 'grant_type', in: 'formData', type: 'string', required: true, defaultValue: 'authorization_code', description: '"authorization_code" or "refresh_token".' },
        { name: 'client_id', in: 'formData', type: 'string', required: true, defaultValue: clientId, description: 'Your application Client ID.' },
        { name: 'client_secret', in: 'formData', type: 'string', required: false, defaultValue: clientSecret, description: 'Client secret (for confidential clients/backends).' },
        { name: 'code', in: 'formData', type: 'string', required: true, defaultValue: 'mock_code_8f2b1d9c', description: 'Authorization code from /authorize redirect.' },
        { name: 'code_verifier', in: 'formData', type: 'string', required: false, defaultValue: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', description: 'Plaintext PKCE code verifier.' },
        { name: 'redirect_uri', in: 'formData', type: 'string', required: false, defaultValue: redirectUri, description: 'Must match original redirect_uri from /authorize request.' },
      ],
      requestSample: `POST /${currentTenant}/oauth2/v2.0/token HTTP/1.1\nHost: ${hostHeader}\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code\n&client_id=${clientId}\n&client_secret=${clientSecret}\n&code=mock_code_8f2b1d9c\n&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk\n&redirect_uri=${encodeURIComponent(redirectUri)}`,
      responses: [
        {
          code: 200,
          description: 'Successful OAuth 2.0 Token Response.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              token_type: 'Bearer',
              scope: scope,
              expires_in: 3600,
              ext_expires_in: 3600,
              access_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InNzby1sb2NhbC1hY3RpdmUta2V5IiwidHlwIjoiSldUIn0.ey...',
              id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InNzby1sb2NhbC1hY3RpdmUta2V5IiwidHlwIjoiSldUIn0.ey...',
              refresh_token: 'local-sso-refresh-8f2b1d9c4e0a7',
            },
            null,
            2
          ),
        },
        {
          code: 400,
          description: 'Invalid grant or code expired.',
          contentType: 'application/json',
          schemaSample: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }, null, 2),
        },
      ],
    },
    {
      id: 'get-userinfo',
      tag: 'OIDC & OAuth 2.0 Core',
      method: 'GET',
      name: 'OIDC UserInfo Endpoint',
      path: `/${currentTenant}/oidc/userinfo`,
      fullUrl: userinfoUrl,
      isCustomMock: true,
      description: 'Extended OIDC endpoint: Standard Microsoft Entra ID does not supply /userinfo (uses Microsoft Graph API). Provided by local-sso for compatibility with generic OIDC client libraries (Better Auth, NextAuth, Spring Boot, Supabase).',
      canExecuteLive: true,
      parameters: [
        { name: 'tenant', in: 'path', type: 'string', required: true, defaultValue: currentTenant, description: 'Tenant identifier.' },
        { name: 'Authorization', in: 'header', type: 'string', required: true, defaultValue: 'Bearer <access_token>', description: 'Bearer access token obtained from /token.' },
      ],
      responses: [
        {
          code: 200,
          description: 'Authenticated User Claims and Persona Profile.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              sub: 'sub-sazzad-sazib-001',
              name: 'Sazzad Sazib',
              given_name: 'Sazzad',
              family_name: 'Sazib',
              preferred_username: 'sazib@gmail.com',
              email: 'sazib@gmail.com',
              email_verified: true,
              tid: currentTenant,
              oid: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
              roles: ['Global Administrator', 'User'],
              groups: ['Engineers', 'Admins'],
              job_title: 'Principal Security Engineer',
            },
            null,
            2
          ),
        },
        {
          code: 401,
          description: 'Unauthorized: missing or invalid Bearer token.',
          contentType: 'application/json',
          schemaSample: JSON.stringify({ error: 'invalid_token', error_description: 'Access token is invalid or missing' }, null, 2),
        },
      ],
    },
    {
      id: 'get-logout',
      tag: 'OIDC & OAuth 2.0 Core',
      method: 'GET',
      name: 'End Session & Logout',
      path: `/${currentTenant}/oauth2/v2.0/logout`,
      fullUrl: logoutUrl,
      isCustomMock: false,
      description: 'Standard Microsoft Entra v2.0 endpoint: Clears the mock session cookie and redirects to post_logout_redirect_uri.',
      canExecuteLive: false,
      parameters: [
        { name: 'tenant', in: 'path', type: 'string', required: true, defaultValue: currentTenant, description: 'Tenant identifier.' },
        { name: 'post_logout_redirect_uri', in: 'query', type: 'string', required: false, defaultValue: rootUrl || 'http://localhost:3000', description: 'URI to redirect the browser to after logout.' },
      ],
      responses: [
        {
          code: 302,
          description: 'Redirect back to post_logout_redirect_uri.',
          contentType: 'text/html',
          schemaSample: `HTTP/1.1 302 Found\nLocation: ${rootUrl || 'http://localhost:3000'}`,
        },
      ],
    },

    // 2. Discovery & Keys
    {
      id: 'get-discovery',
      tag: 'Discovery & Keys',
      method: 'GET',
      name: 'OpenID Provider Configuration (.well-known)',
      path: `/${currentTenant}/oauth2/v2.0/.well-known/openid-configuration`,
      fullUrl: discoveryUrl,
      isCustomMock: false,
      description: 'Standard OpenID Connect Discovery document: Client libraries fetch this endpoint at startup to automatically discover authorization, token, JWKS, and userinfo endpoints.',
      canExecuteLive: true,
      parameters: [
        { name: 'tenant', in: 'path', type: 'string', required: true, defaultValue: currentTenant, description: 'Tenant identifier.' },
      ],
      responses: [
        {
          code: 200,
          description: 'Standard OIDC Discovery JSON payload.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              issuer: issuerUrl,
              authorization_endpoint: authorizeBaseUrl,
              token_endpoint: tokenUrl,
              userinfo_endpoint: userinfoUrl,
              jwks_uri: jwksUrl,
              end_session_endpoint: logoutUrl,
              response_types_supported: ['code', 'id_token', 'code id_token', 'token'],
              scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
              id_token_signing_alg_values_supported: ['RS256'],
              code_challenge_methods_supported: ['S256', 'plain'],
            },
            null,
            2
          ),
        },
      ],
    },
    {
      id: 'get-jwks',
      tag: 'Discovery & Keys',
      method: 'GET',
      name: 'JWKS Public Key Set (RS256)',
      path: `/${currentTenant}/discovery/v2.0/keys`,
      fullUrl: jwksUrl,
      isCustomMock: false,
      description: 'Standard Microsoft Entra v2.0 endpoint: Exposes the RSA 2048-bit public keys formatted as JSON Web Key Set (JWKS). Resource servers use these keys to cryptographically verify token signatures.',
      canExecuteLive: true,
      parameters: [
        { name: 'tenant', in: 'path', type: 'string', required: true, defaultValue: currentTenant, description: 'Tenant identifier.' },
      ],
      responses: [
        {
          code: 200,
          description: 'JWKS Public Key Set.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              keys: [
                {
                  kty: 'RSA',
                  use: 'sig',
                  alg: 'RS256',
                  kid: 'local-sso-active-key',
                  n: 'u9h3K8x2Y_... (2048-bit RSA Modulus)',
                  e: 'AQAB',
                },
              ],
            },
            null,
            2
          ),
        },
      ],
    },
    {
      id: 'cfg-issuer',
      tag: 'Discovery & Keys',
      method: 'CONFIG',
      name: 'OIDC Token Issuer (iss claim)',
      path: issuerUrl.replace(/^https?:\/\/[^/]+/, ''),
      fullUrl: issuerUrl,
      isCustomMock: false,
      description: 'OIDC Specification: The expected "iss" claim inside signed ID and Access tokens. Your backend or resource server JWT validator must match this issuer exactly.',
      canExecuteLive: false,
      parameters: [],
      responses: [
        {
          code: 'SPEC',
          description: 'Expected JWT Claims Match Schema.',
          contentType: 'application/json',
          schemaSample: `// Decoded ID Token Payload Claim:\n{\n  "iss": "${issuerUrl}",\n  "aud": "${clientId}",\n  "sub": "sub-sazzad-sazib-001",\n  "tid": "${currentTenant}"\n}`,
        },
      ],
    },
    {
      id: 'cfg-authority',
      tag: 'Discovery & Keys',
      method: 'CONFIG',
      name: 'Authority URL (MSAL.js Base)',
      path: authorityUrl.replace(/^https?:\/\/[^/]+/, ''),
      fullUrl: authorityUrl,
      isCustomMock: false,
      description: 'MSAL Configuration: The base authority URL configured in @azure/msal-browser or @azure/msal-react applications.',
      canExecuteLive: false,
      parameters: [],
      responses: [
        {
          code: 'SPEC',
          description: 'MSAL PublicClientApplication Configuration Object.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              auth: {
                clientId: clientId,
                authority: authorityUrl,
                knownAuthorities: [hostHeader],
              },
            },
            null,
            2
          ),
        },
      ],
    },

    // 3. Mock Helpers & Admin
    {
      id: 'post-token-proxy',
      tag: 'Mock Helpers & Admin',
      method: 'POST',
      name: 'Browser CORS Token Proxy',
      path: '/api/token',
      fullUrl: tokenProxyUrl,
      isCustomMock: true,
      description: 'Helper API: A CORS-enabled JSON proxy endpoint that allows browser SPAs to exchange authorization codes without encountering CORS restrictions or server credential issues.',
      canExecuteLive: true,
      requestContentType: 'application/json',
      parameters: [
        { name: 'token_url', in: 'body', type: 'string', required: true, defaultValue: tokenUrl, description: 'Target token endpoint URL.' },
        { name: 'client_id', in: 'body', type: 'string', required: true, defaultValue: clientId, description: 'Application Client ID.' },
        { name: 'client_secret', in: 'body', type: 'string', required: false, defaultValue: clientSecret, description: 'Client secret.' },
        { name: 'code', in: 'body', type: 'string', required: true, defaultValue: 'mock_code_8f2b1d9c', description: 'Authorization code.' },
        { name: 'code_verifier', in: 'body', type: 'string', required: false, defaultValue: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', description: 'PKCE code verifier.' },
        { name: 'redirect_uri', in: 'body', type: 'string', required: true, defaultValue: redirectUri, description: 'Redirect URI.' },
      ],
      requestSample: JSON.stringify(
        {
          token_url: tokenUrl,
          client_id: clientId,
          client_secret: clientSecret,
          code: 'mock_code_8f2b1d9c',
          code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
          redirect_uri: redirectUri,
        },
        null,
        2
      ),
      responses: [
        {
          code: 200,
          description: 'Proxied Token Response.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              access_token: 'eyJhbGciOiJSUzI1NiIs...',
              id_token: 'eyJhbGciOiJSUzI1NiIs...',
              token_type: 'Bearer',
              expires_in: 3600,
            },
            null,
            2
          ),
        },
      ],
    },
    {
      id: 'post-verify',
      tag: 'Mock Helpers & Admin',
      method: 'POST',
      name: 'Token Signature & Claims Validator',
      path: '/api/verify',
      fullUrl: verifyApiUrl,
      isCustomMock: true,
      description: 'Helper API: Cryptographically verifies RS256 token signatures against the local JWKS and validates issuer and audience claims. Useful for debugging and automated integration testing.',
      canExecuteLive: true,
      requestContentType: 'application/json',
      parameters: [
        { name: 'id_token', in: 'body', type: 'string', required: true, defaultValue: '', description: 'Signed JWT token string to verify.' },
        { name: 'jwks_uri', in: 'body', type: 'string', required: false, defaultValue: jwksUrl, description: 'Public JWKS keys URL.' },
        { name: 'issuer', in: 'body', type: 'string', required: false, defaultValue: issuerUrl, description: 'Expected issuer.' },
        { name: 'audience', in: 'body', type: 'string', required: false, defaultValue: clientId, description: 'Expected audience (client_id).' },
      ],
      requestSample: JSON.stringify(
        {
          id_token: 'eyJhbGciOiJSUzI1NiIs...',
          jwks_uri: jwksUrl,
          issuer: issuerUrl,
          audience: clientId,
        },
        null,
        2
      ),
      responses: [
        {
          code: 200,
          description: 'Signature is valid and claims match expectation.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            {
              verified: true,
              claims: {
                sub: 'sub-sazzad-sazib-001',
                name: 'Sazzad Sazib',
                email: 'sazib@gmail.com',
                roles: ['Global Administrator', 'User'],
              },
            },
            null,
            2
          ),
        },
        {
          code: 400,
          description: 'Invalid token signature, expired token, or mismatched claims.',
          contentType: 'application/json',
          schemaSample: JSON.stringify({ verified: false, error: 'Token signature verification failed' }, null, 2),
        },
      ],
    },
    {
      id: 'get-users',
      tag: 'Mock Helpers & Admin',
      method: 'GET',
      name: 'Directory Mock Users API',
      path: '/api/users',
      fullUrl: usersApiUrl,
      isCustomMock: true,
      description: 'Helper API: Returns the roster of configured mock test personas, roles, and security groups.',
      canExecuteLive: true,
      parameters: [],
      responses: [
        {
          code: 200,
          description: 'List of configured mock personas.',
          contentType: 'application/json',
          schemaSample: JSON.stringify(
            [
              {
                id: 'user-1',
                name: 'Sazzad Sazib',
                email: 'sazib@gmail.com',
                preferred_username: 'sazib@gmail.com',
                avatar_url: 'https://avatars.githubusercontent.com/u/8937268?v=4',
                roles: ['Global Administrator', 'User'],
                groups: ['Engineers', 'Admins'],
              },
            ],
            null,
            2
          ),
        },
      ],
    },
  ];

  // Tag list
  const tags: Array<'OIDC & OAuth 2.0 Core' | 'Discovery & Keys' | 'Mock Helpers & Admin'> = [
    'OIDC & OAuth 2.0 Core',
    'Discovery & Keys',
    'Mock Helpers & Admin',
  ];

  // Filter operations
  const filteredOperations = operations.filter((op) => {
    if (selectedMethod !== 'ALL' && op.method !== selectedMethod) return false;
    if (selectedTag !== 'ALL' && op.tag !== selectedTag) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchPath = op.path.toLowerCase().includes(q);
      const matchName = op.name.toLowerCase().includes(q);
      const matchDesc = op.description.toLowerCase().includes(q);
      const matchMethod = op.method.toLowerCase().includes(q);
      if (!matchPath && !matchName && !matchDesc && !matchMethod) return false;
    }
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedOps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    operations.forEach((op) => {
      next[op.id] = true;
    });
    setExpandedOps(next);
  };

  const collapseAll = () => {
    setExpandedOps({});
  };

  const toggleTryItOut = (op: ApiOperation) => {
    const isNowActive = !tryItOutMap[op.id];
    setTryItOutMap((prev) => ({ ...prev, [op.id]: isNowActive }));

    // Initialize param values if opening
    if (isNowActive && !paramInputs[op.id]) {
      const defaults: Record<string, string> = {};
      op.parameters.forEach((p) => {
        if (p.defaultValue !== undefined) {
          defaults[p.name] = p.defaultValue;
        }
      });
      setParamInputs((prev) => ({ ...prev, [op.id]: defaults }));
    }
  };

  const handleParamChange = (opId: string, paramName: string, value: string) => {
    setParamInputs((prev) => ({
      ...prev,
      [opId]: {
        ...(prev[opId] || {}),
        [paramName]: value,
      },
    }));
  };

  const handleCopy = (key: string, text: string, toastMessage = 'Copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(toastMessage);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1600);
  };

  // Live Swagger Execution
  const handleExecute = async (op: ApiOperation) => {
    const inputs = paramInputs[op.id] || {};
    let url = op.fullUrl;
    const startTime = performance.now();

    setExecStateMap((prev) => ({
      ...prev,
      [op.id]: {
        loading: true,
        executed: false,
      },
    }));

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      let reqInit: RequestInit = {
        method: op.method === 'CONFIG' ? 'GET' : op.method,
      };

      let curlCmd = `curl -X ${reqInit.method} "${url}"`;

      if (op.method === 'GET') {
        // Build query parameters if any modified
        const queryParams = new URLSearchParams();
        op.parameters
          .filter((p) => p.in === 'query')
          .forEach((p) => {
            const val = inputs[p.name] !== undefined ? inputs[p.name] : p.defaultValue || '';
            if (val) queryParams.set(p.name, val);
          });

        // Headers
        op.parameters
          .filter((p) => p.in === 'header')
          .forEach((p) => {
            const val = inputs[p.name] !== undefined ? inputs[p.name] : p.defaultValue || '';
            if (val) {
              headers[p.name] = val;
              curlCmd += ` \\\n  -H "${p.name}: ${val}"`;
            }
          });

        const baseUrl = op.fullUrl.split('?')[0];
        const queryString = queryParams.toString();
        url = queryString ? `${baseUrl}?${queryString}` : baseUrl;
        reqInit.headers = headers;
      } else if (op.method === 'POST') {
        if (op.requestContentType === 'application/x-www-form-urlencoded') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          const formParams = new URLSearchParams();
          op.parameters
            .filter((p) => p.in === 'formData')
            .forEach((p) => {
              const val = inputs[p.name] !== undefined ? inputs[p.name] : p.defaultValue || '';
              formParams.set(p.name, val);
            });
          reqInit.body = formParams.toString();
          reqInit.headers = headers;
          curlCmd += ` \\\n  -H "Content-Type: application/x-www-form-urlencoded" \\\n  -d "${formParams.toString()}"`;
        } else {
          // JSON body
          headers['Content-Type'] = 'application/json';
          const bodyObj: Record<string, string> = {};
          op.parameters
            .filter((p) => p.in === 'body')
            .forEach((p) => {
              const val = inputs[p.name] !== undefined ? inputs[p.name] : p.defaultValue || '';
              bodyObj[p.name] = val;
            });
          const bodyStr = JSON.stringify(bodyObj, null, 2);
          reqInit.body = bodyStr;
          reqInit.headers = headers;
          curlCmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${bodyStr}'`;
        }
      }

      const res = await fetch(url, reqInit);
      const duration = Math.round(performance.now() - startTime);

      // Collect response headers
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      let resBody = '';
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        resBody = JSON.stringify(json, null, 2);
      } else {
        resBody = await res.text();
      }

      setExecStateMap((prev) => ({
        ...prev,
        [op.id]: {
          loading: false,
          executed: true,
          status: res.status,
          statusText: res.statusText || (res.status === 200 ? 'OK' : 'Response'),
          duration,
          responseBody: resBody,
          responseHeaders: resHeaders,
          curlCommand: curlCmd,
          requestUrl: url,
        },
      }));
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);
      setExecStateMap((prev) => ({
        ...prev,
        [op.id]: {
          loading: false,
          executed: true,
          status: 0,
          statusText: 'Fetch Error (CORS / Network)',
          duration,
          error: message,
          responseBody: `Error executing request:\n${message}\n\nNote: If calling from a different origin, verify CORS or use the /api/token proxy.`,
          curlCommand: `curl -X ${op.method} "${url}"`,
          requestUrl: url,
        },
      }));
    }
  };

  const clearExecution = (opId: string) => {
    setExecStateMap((prev) => ({
      ...prev,
      [opId]: {
        loading: false,
        executed: false,
      },
    }));
  };

  // Swagger style method badge colors
  const getMethodTheme = (method: HttpMethod) => {
    switch (method) {
      case 'GET':
        return {
          badge: 'bg-sky-600 text-white font-mono font-bold text-xs px-3 py-1.5 rounded min-w-[75px] text-center shadow-sm shadow-sky-600/30',
          border: 'border-sky-500/35 hover:border-sky-500/60',
          bgHeader: 'bg-sky-500/[0.04] hover:bg-sky-500/[0.08]',
          text: 'text-sky-400',
          bgBody: 'bg-sky-950/20',
        };
      case 'POST':
        return {
          badge: 'bg-emerald-600 text-white font-mono font-bold text-xs px-3 py-1.5 rounded min-w-[75px] text-center shadow-sm shadow-emerald-600/30',
          border: 'border-emerald-500/35 hover:border-emerald-500/60',
          bgHeader: 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]',
          text: 'text-emerald-400',
          bgBody: 'bg-emerald-950/20',
        };
      case 'CONFIG':
        return {
          badge: 'bg-purple-600 text-white font-mono font-bold text-xs px-3 py-1.5 rounded min-w-[75px] text-center shadow-sm shadow-purple-600/30',
          border: 'border-purple-500/35 hover:border-purple-500/60',
          bgHeader: 'bg-purple-500/[0.04] hover:bg-purple-500/[0.08]',
          text: 'text-purple-400',
          bgBody: 'bg-purple-950/20',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Swagger OpenAPI Top Header Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="p-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                <Icon name="terminal" className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">OpenAPI &amp; Swagger API Explorer</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                OAS 3.0.3
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 bg-slate-800 border border-slate-700">
                v2.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Interactive Swagger-style documentation and live test console for local Microsoft Entra ID (Azure AD) v2.0 OAuth 2.0 / OpenID Connect endpoints. Test requests live against your running instance.
            </p>
          </div>

          {/* Server Selector Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <div className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
              <span className="text-slate-400 font-semibold font-mono">Server:</span>
              <span className="text-emerald-400 font-mono font-bold truncate max-w-[220px]" title={effectiveOrigin}>
                {effectiveOrigin}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            </div>
            <a
              href={discoveryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              title="Open raw discovery document in new tab"
            >
              <span>Raw JSON</span>
              <Icon name="external-link" className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Global Toolbar: Filter, Method Tabs, Expand/Collapse */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Icon name="search" className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by path, method, or keyword..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
              >
                <Icon name="close" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Method Filter */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {(['ALL', 'GET', 'POST', 'CONFIG'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMethod(m)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer transition ${
                    selectedMethod === m
                      ? m === 'GET'
                        ? 'bg-sky-600 text-white'
                        : m === 'POST'
                        ? 'bg-emerald-600 text-white'
                        : m === 'CONFIG'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Tag Filter */}
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              aria-label="Filter by Tag"
              className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Expand / Collapse All */}
            <div className="flex items-center gap-1 pl-1">
              <button
                type="button"
                onClick={expandAll}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition cursor-pointer"
                title="Expand all endpoints"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition cursor-pointer"
                title="Collapse all endpoints"
              >
                Collapse all
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoint Groups by Tag */}
      {tags.map((tag) => {
        const tagOperations = filteredOperations.filter((op) => op.tag === tag);
        if (tagOperations.length === 0) return null;

        return (
          <div key={tag} className="space-y-3">
            {/* Tag Header Bar */}
            <div className="flex items-center justify-between gap-3 px-2 pt-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">{tag}</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                  {tagOperations.length}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                {tag === 'OIDC & OAuth 2.0 Core' && 'RFC 6749 / OpenID Connect Core 1.0'}
                {tag === 'Discovery & Keys' && 'RFC 8414 / RFC 7517'}
                {tag === 'Mock Helpers & Admin' && 'local-sso Developer Testing Extensions'}
              </span>
            </div>

            {/* Operation Accordion List */}
            <div className="space-y-2.5">
              {tagOperations.map((op) => {
                const isExpanded = !!expandedOps[op.id];
                const isTryItOut = !!tryItOutMap[op.id];
                const exec = execStateMap[op.id];
                const theme = getMethodTheme(op.method);
                const currentInputs = paramInputs[op.id] || {};

                return (
                  <div
                    key={op.id}
                    className={`rounded-xl border transition-all overflow-hidden ${theme.border} ${
                      isExpanded ? 'shadow-lg shadow-black/40' : ''
                    }`}
                  >
                    {/* Operation Header Row (Swagger style bar) */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpand(op.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(op.id);
                        }
                      }}
                      className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition select-none cursor-pointer ${theme.bgHeader}`}
                    >
                      <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                        {/* HTTP Method Badge */}
                        <span className={theme.badge}>{op.method}</span>

                        {/* Monospace Path */}
                        <span className="font-mono text-sm font-bold text-white tracking-tight break-all">
                          {op.path}
                        </span>

                        {/* Name / Summary */}
                        <span className="text-xs text-slate-300 font-medium truncate max-w-sm">
                          {op.name}
                        </span>

                        {/* Standard vs Custom Mock Badge */}
                        {op.isCustomMock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Mock Extension
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                            Standard Entra
                          </span>
                        )}
                      </div>

                      {/* Header Actions: Copy URL & Expand Arrow */}
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleCopy(`url-${op.id}`, op.fullUrl, 'Copied full endpoint URL!')}
                          className="p-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                          aria-label="Copy full URL"
                          title="Copy full endpoint URL"
                        >
                          <Icon
                            name={copiedKey === `url-${op.id}` ? 'check' : 'clipboard'}
                            className={`w-3.5 h-3.5 ${copiedKey === `url-${op.id}` ? 'text-emerald-400' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExpand(op.id)}
                          aria-label={isExpanded ? 'Collapse operation' : 'Expand operation'}
                          className="p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
                        >
                          <span className={`inline-block transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            <Icon name="chevron-down" className="w-4 h-4" />
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Operation Body (when expanded) */}
                    {isExpanded && (
                      <div className={`p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/70 space-y-5 font-sans`}>
                        {/* Description & Full URL Row */}
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                          <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                            {op.description}
                          </p>

                          {/* Try it out button */}
                          {op.canExecuteLive && (
                            <button
                              type="button"
                              onClick={() => toggleTryItOut(op)}
                              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                                isTryItOut
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 shadow-sm shadow-sky-500/10'
                              }`}
                            >
                              <Icon name={isTryItOut ? 'close' : 'zap'} className="w-3.5 h-3.5" />
                              <span>{isTryItOut ? 'Cancel' : 'Try it out'}</span>
                            </button>
                          )}
                        </div>

                        {/* Full Resolved URL bar */}
                        <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800">
                          <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                            Endpoint:
                          </span>
                          <span className="text-xs font-mono text-slate-200 break-all select-all flex-1">
                            {op.fullUrl}
                          </span>
                          <a
                            href={op.fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-white transition shrink-0"
                            title="Open URL in new browser tab"
                          >
                            <Icon name="external-link" className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        {/* Parameters Section */}
                        {op.parameters.length > 0 && (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">
                              <span>Parameters</span>
                              {isTryItOut && (
                                <span className="text-sky-400 text-[11px] font-medium">
                                  Editable &mdash; ready to execute
                                </span>
                              )}
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/50">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-mono text-[11px]">
                                    <th className="py-2.5 px-3.5 font-semibold">Name</th>
                                    <th className="py-2.5 px-3.5 font-semibold">Location</th>
                                    <th className="py-2.5 px-3.5 font-semibold">Type</th>
                                    <th className="py-2.5 px-3.5 font-semibold">Description</th>
                                    {isTryItOut && <th className="py-2.5 px-3.5 font-semibold">Value</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-sans">
                                  {op.parameters.map((p) => {
                                    const inputValue = currentInputs[p.name] !== undefined ? currentInputs[p.name] : p.defaultValue || '';

                                    return (
                                      <tr key={p.name} className="hover:bg-slate-800/30 transition">
                                        <td className="py-2.5 px-3.5 font-mono text-xs font-bold text-white whitespace-nowrap">
                                          {p.name}
                                          {p.required && <span className="text-rose-400 ml-1 font-bold">*</span>}
                                        </td>
                                        <td className="py-2.5 px-3.5">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                                            {p.in}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3.5 font-mono text-slate-400 text-[11px]">
                                          {p.type}
                                        </td>
                                        <td className="py-2.5 px-3.5 text-slate-300 text-xs">
                                          {p.description}
                                          {!isTryItOut && p.defaultValue && (
                                            <div className="mt-0.5 text-slate-400 text-[11px] font-mono">
                                              Default: <span className="text-slate-300">{p.defaultValue}</span>
                                            </div>
                                          )}
                                        </td>
                                        {isTryItOut && (
                                          <td className="py-2 px-3 min-w-[200px]">
                                            <input
                                              type="text"
                                              value={inputValue}
                                              onChange={(e) => handleParamChange(op.id, p.name, e.target.value)}
                                              placeholder={`Enter ${p.name}...`}
                                              className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none"
                                            />
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Execute Bar when in Try-It-Out mode */}
                        {isTryItOut && (
                          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-sky-950/40 border border-sky-500/30">
                            <div className="text-xs text-sky-200 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                              <span>Live execution enabled against local server.</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={exec?.loading}
                                onClick={() => handleExecute(op)}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-md shadow-sky-600/30 cursor-pointer"
                              >
                                {exec?.loading ? (
                                  <>
                                    <Icon name="loader" className="w-3.5 h-3.5 animate-spin" />
                                    <span>Executing...</span>
                                  </>
                                ) : (
                                  <>
                                    <Icon name="play" className="w-3.5 h-3.5" />
                                    <span>Execute</span>
                                  </>
                                )}
                              </button>
                              {exec?.executed && (
                                <button
                                  type="button"
                                  onClick={() => clearExecution(op.id)}
                                  className="px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Live Server Response Display (Swagger style output console) */}
                        {exec?.executed && (
                          <div className="space-y-3 p-4 rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white uppercase tracking-wider">
                                  Server Response
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                                    exec.status === 200
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  }`}
                                >
                                  {exec.status} {exec.statusText}
                                </span>
                                {exec.duration !== undefined && (
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {exec.duration} ms
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(`res-body-${op.id}`, exec.responseBody || '', 'Copied live response body!')}
                                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
                              >
                                <Icon
                                  name={copiedKey === `res-body-${op.id}` ? 'check' : 'copy'}
                                  className={`w-3.5 h-3.5 ${copiedKey === `res-body-${op.id}` ? 'text-emerald-400' : ''}`}
                                />
                                <span>{copiedKey === `res-body-${op.id}` ? 'Copied!' : 'Copy Body'}</span>
                              </button>
                            </div>

                            {/* Curl Generated command */}
                            {exec.curlCommand && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                                  cURL Command
                                </span>
                                <pre className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80 text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre leading-relaxed select-all">
                                  {exec.curlCommand}
                                </pre>
                              </div>
                            )}

                            {/* Response Body */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                                Response Body
                              </span>
                              <pre className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre leading-relaxed select-all max-h-72">
                                <code
                                  dangerouslySetInnerHTML={{
                                    __html: highlightCode(exec.responseBody || '', 'json'),
                                  }}
                                />
                              </pre>
                            </div>

                            {/* Response Headers */}
                            {exec.responseHeaders && Object.keys(exec.responseHeaders).length > 0 && (
                              <details className="text-xs group">
                                <summary className="cursor-pointer text-slate-400 hover:text-slate-300 text-[11px] font-mono select-none py-1">
                                  <span>Response Headers ({Object.keys(exec.responseHeaders).length})</span>
                                </summary>
                                <pre className="mt-1 p-2 bg-slate-900 rounded-lg border border-slate-800/80 text-[11px] font-mono text-slate-400 overflow-x-auto whitespace-pre">
                                  {Object.entries(exec.responseHeaders)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join('\n')}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}

                        {/* Request Sample (when available) */}
                        {op.requestSample && !isTryItOut && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                                <Icon name="zap" className="w-3.5 h-3.5 text-sky-400" />
                                <span>Request Sample ({op.requestContentType || 'HTTP'})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(`req-sample-${op.id}`, op.requestSample || '', 'Copied request sample!')}
                                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs cursor-pointer"
                              >
                                <Icon
                                  name={copiedKey === `req-sample-${op.id}` ? 'check' : 'copy'}
                                  className={`w-3.5 h-3.5 ${copiedKey === `req-sample-${op.id}` ? 'text-emerald-400' : ''}`}
                                />
                                <span>{copiedKey === `req-sample-${op.id}` ? 'Copied!' : 'Copy'}</span>
                              </button>
                            </div>
                            <pre className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed select-all">
                              <code
                                dangerouslySetInnerHTML={{
                                  __html: highlightCode(op.requestSample, op.requestSample.startsWith('{') ? 'json' : 'bash'),
                                }}
                              />
                            </pre>
                          </div>
                        )}

                        {/* Responses Spec Section */}
                        <div className="space-y-2.5">
                          <span className="block text-xs font-bold text-slate-200 border-b border-slate-800 pb-2">
                            Responses
                          </span>

                          <div className="space-y-2">
                            {op.responses.map((resp) => {
                              const isSuccess = String(resp.code).startsWith('2');
                              const isRedirect = String(resp.code).startsWith('3');

                              return (
                                <div
                                  key={String(resp.code)}
                                  className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                                          isSuccess
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : isRedirect
                                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                            : resp.code === 'SPEC'
                                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                        }`}
                                      >
                                        {resp.code}
                                      </span>
                                      <span className="text-xs text-slate-300 font-medium">{resp.description}</span>
                                    </div>
                                    {resp.contentType && (
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                        {resp.contentType}
                                      </span>
                                    )}
                                  </div>

                                  {resp.schemaSample && (
                                    <div className="mt-1">
                                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                        <span className="font-mono text-slate-400">Example Value / Payload:</span>
                                        <button
                                          type="button"
                                          onClick={() => handleCopy(`resp-sample-${op.id}-${resp.code}`, resp.schemaSample || '', 'Copied response schema sample!')}
                                          className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          <Icon
                                            name={copiedKey === `resp-sample-${op.id}-${resp.code}` ? 'check' : 'copy'}
                                            className={`w-3 h-3 ${copiedKey === `resp-sample-${op.id}-${resp.code}` ? 'text-emerald-400' : ''}`}
                                          />
                                          <span>{copiedKey === `resp-sample-${op.id}-${resp.code}` ? 'Copied' : 'Copy'}</span>
                                        </button>
                                      </div>
                                      <pre className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed select-all max-h-56">
                                        <code
                                          dangerouslySetInnerHTML={{
                                            __html: highlightCode(
                                              resp.schemaSample,
                                              resp.schemaSample.startsWith('{') || resp.schemaSample.startsWith('[') ? 'json' : 'bash'
                                            ),
                                          }}
                                        />
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
