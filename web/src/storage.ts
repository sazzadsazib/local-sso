import { Profile, PKCEState, TokenSession } from './types';

const PROFILES_KEY = 'ssoLocal.profiles';
const ACTIVE_PROFILE_KEY = 'ssoLocal.activeProfile';
const PKCE_KEY = 'ssoLocal.pkce';
const SESSION_KEY = 'ssoLocal.session';

const defaultProfiles: Profile[] = [
  {
    id: 'default-entra',
    name: 'Microsoft Entra ID (Local Mock)',
    provider: 'entra',
    tenant: 'common',
    clientId: '00000000-0000-0000-0000-000000000001',
    redirectUri: 'http://localhost:3000/callback',
    scope: 'openid profile email offline_access',
    prompt: 'select_account',
  },
  {
    id: 'contoso-tenant',
    name: 'Contoso Enterprise Tenant',
    provider: 'entra',
    tenant: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    clientId: 'client-app-contoso-123',
    redirectUri: 'http://127.0.0.1:8080/callback',
    scope: 'openid profile email offline_access User.Read',
  }
];

export function getProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) {
      saveProfiles(defaultProfiles);
      return defaultProfiles;
    }
    return JSON.parse(raw);
  } catch {
    return defaultProfiles;
  }
}

export function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getActiveProfile(): Profile {
  const profiles = getProfiles();
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  const found = profiles.find((p) => p.id === activeId);
  if (found) return found;
  if (profiles.length > 0) {
    setActiveProfileId(profiles[0].id);
    return profiles[0];
  }
  return defaultProfiles[0];
}

export function setActiveProfileId(id: string) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

export function saveActiveProfile(profile: Profile) {
  const profiles = getProfiles();
  const index = profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  saveProfiles(profiles);
  setActiveProfileId(profile.id);
}

export function deleteProfile(id: string) {
  const profiles = getProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  if (profiles.length > 0) {
    setActiveProfileId(profiles[0].id);
  }
}

export function getPKCEState(): PKCEState | null {
  try {
    const raw = localStorage.getItem(PKCE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePKCEState(state: PKCEState) {
  localStorage.setItem(PKCE_KEY, JSON.stringify(state));
}

export function clearPKCEState() {
  localStorage.removeItem(PKCE_KEY);
}

export function getSession(): TokenSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: TokenSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
