import { Profile, PKCEState, TokenSession } from './types';

const PROJECTS_KEY = 'ssoLocal.projects';
const ACTIVE_PROJECT_KEY = 'ssoLocal.activeProject';
const PKCE_KEY = 'ssoLocal.pkce';
const SESSION_KEY = 'ssoLocal.session';

const defaultProjects: Profile[] = [
  {
    id: 'default-entra',
    name: 'Portal SSO',
    rootUrl: 'http://localhost:3000',
    provider: 'entra',
    tenant: 'common',
    clientId: '00000000-0000-0000-0000-000000000001',
    redirectUri: 'http://localhost:3000/callback',
    scope: 'openid profile email offline_access',
    prompt: 'select_account',
    host: '',
    issuerMode: 'host',
  },
  {
    id: 'contoso-tenant',
    name: 'Portal Contoso Enterprise SSO',
    rootUrl: 'http://localhost:8080',
    provider: 'entra',
    tenant: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    clientId: 'client-app-contoso-123',
    redirectUri: 'http://localhost:8080/callback',
    scope: 'openid profile email offline_access User.Read',
    host: '',
    issuerMode: 'host',
  }
];

export function getProjects(): Profile[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) {
      saveProjects(defaultProjects);
      return defaultProjects;
    }
    const parsed = JSON.parse(raw);
    let modified = false;
    if (Array.isArray(parsed)) {
      const p1 = parsed.find((p) => p.id === 'default-entra');
      if (p1 && (p1.name === 'Microsoft Entra ID (Local Mock)' || p1.name === 'bkash Portal')) {
        p1.name = 'Portal SSO';
        modified = true;
      }
      const p2 = parsed.find((p) => p.id === 'contoso-tenant');
      if (p2 && p2.name === 'Contoso Enterprise Tenant') {
        p2.name = 'Portal Contoso Enterprise SSO';
        modified = true;
      }
      if (modified) {
        saveProjects(parsed);
      }
    }
    return parsed;
  } catch {
    return defaultProjects;
  }
}

export function saveProjects(projects: Profile[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function getActiveProject(): Profile {
  const projects = getProjects();
  const activeId = localStorage.getItem(ACTIVE_PROJECT_KEY);
  const found = projects.find((p) => p.id === activeId);
  if (found) return found;
  if (projects.length > 0) {
    setActiveProjectId(projects[0].id);
    return projects[0];
  }
  return defaultProjects[0];
}

export function setActiveProjectId(id: string) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, id);
}

export function saveActiveProject(project: Profile) {
  const projects = getProjects();
  const index = projects.findIndex((p) => p.id === project.id);
  if (index >= 0) {
    projects[index] = project;
  } else {
    projects.push(project);
  }
  saveProjects(projects);
  setActiveProjectId(project.id);
}

export function deleteProject(id: string) {
  const projects = getProjects().filter((p) => p.id !== id);
  saveProjects(projects);
  if (projects.length > 0) {
    setActiveProjectId(projects[0].id);
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
