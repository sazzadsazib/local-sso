import { Profile, PKCEState, TokenSession, MockUser } from './types';

const PROJECTS_KEY = 'local-sso.projects.v2';
const ACTIVE_PROJECT_KEY = 'local-sso.activeProject.v2';
const PKCE_KEY = 'local-sso.pkce.v2';
const SESSION_KEY = 'local-sso.session.v2';
const USERS_KEY = 'local-sso.users.v2';

export const defaultProjects: Profile[] = [
  {
    id: 'default-entra',
    name: 'Portal SSO',
    rootUrl: 'http://localhost:3000',
    provider: 'entra',
    tenant: 'common',
    clientId: '00000000-0000-0000-0000-000000000001',
    clientSecret: 'local-sso-secret-portal-1',
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
    clientSecret: 'local-sso-secret-contoso-1',
    redirectUri: 'http://localhost:8080/callback',
    scope: 'openid profile email offline_access User.Read',
    prompt: 'select_account',
    host: '',
    issuerMode: 'host',
  }
];

export const defaultUsers: MockUser[] = [
  {
    id: 'user-1',
    name: 'Sazzad Sazib',
    email: 'sazib@gmail.com',
    preferred_username: 'sazib@gmail.com',
    given_name: 'Sazzad',
    family_name: 'Sazib',
    avatar_url: 'assets/avatars/sazzad.jpg',
    roles: ['Global Administrator', 'User'],
    groups: ['Engineers', 'Admins'],
    department: 'Engineering',
    job_title: 'Principal Security Engineer',
    oid: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    tid: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    sub: 'sub-sazzad-sazib-001'
  },
  {
    id: 'user-2',
    name: 'Iftekhar Rifat',
    email: 'rifat@gmail.com',
    preferred_username: 'rifat@gmail.com',
    given_name: 'Iftekhar',
    family_name: 'Rifat',
    avatar_url: 'assets/avatars/rifat.jpg',
    roles: ['Application Developer', 'User'],
    groups: ['Developers'],
    department: 'Product Engineering',
    job_title: 'Application Developer',
    oid: 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e',
    tid: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    sub: 'sub-iftekhar-rifat-002'
  },
  {
    id: 'user-3',
    name: 'Adele Vance',
    email: 'adele.vance@contoso.com',
    preferred_username: 'adele.vance@contoso.com',
    given_name: 'Adele',
    family_name: 'Vance',
    avatar_url: '',
    roles: ['Security Reader', 'User'],
    groups: ['Finance', 'Audit'],
    department: 'Finance',
    job_title: 'Finance Manager',
    oid: 'c3d4e5f6-a7b8-4c5d-0e1f-2a3b4c5d6e7f',
    tid: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    sub: 'sub-adele-vance-003'
  },
  {
    id: 'user-4',
    name: 'Alex Wilber',
    email: 'alex.wilber@contoso.com',
    preferred_username: 'alex.wilber@contoso.com',
    given_name: 'Alex',
    family_name: 'Wilber',
    avatar_url: '',
    roles: ['User'],
    groups: ['Marketing'],
    department: 'Marketing',
    job_title: 'Marketing Specialist',
    oid: 'd4e5f6a7-b8c9-4d5e-1f2a-3b4c5d6e7f80',
    tid: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    sub: 'sub-alex-wilber-004'
  }
];

export function getProjects(): Profile[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY) || localStorage.getItem('ssoLocal.projects');
    if (!raw) {
      saveProjects(defaultProjects);
      return defaultProjects;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return defaultProjects;
  } catch {
    return defaultProjects;
  }
}

export function saveProjects(projects: Profile[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  localStorage.setItem('ssoLocal.projects', JSON.stringify(projects));
}

export function getActiveProject(): Profile {
  const projects = getProjects();
  const activeId = localStorage.getItem(ACTIVE_PROJECT_KEY) || localStorage.getItem('ssoLocal.activeProject');
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
  localStorage.setItem('ssoLocal.activeProject', id);
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

export function getStoredUsers(): MockUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY) || localStorage.getItem('ssoLocal.users');
    if (!raw) {
      saveStoredUsers(defaultUsers);
      return defaultUsers;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return defaultUsers;
  } catch {
    return defaultUsers;
  }
}

export function saveStoredUsers(users: MockUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem('ssoLocal.users', JSON.stringify(users));
}

export function addStoredUser(user: MockUser) {
  const users = getStoredUsers();
  users.push(user);
  saveStoredUsers(users);
}

export function updateStoredUser(user: MockUser) {
  const users = getStoredUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    users[idx] = user;
    saveStoredUsers(users);
  }
}

export function deleteStoredUser(id: string) {
  const users = getStoredUsers().filter((u) => u.id !== id);
  saveStoredUsers(users);
}

export function getPKCEState(): PKCEState | null {
  try {
    const raw = localStorage.getItem(PKCE_KEY) || localStorage.getItem('ssoLocal.pkce');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePKCEState(state: PKCEState) {
  localStorage.setItem(PKCE_KEY, JSON.stringify(state));
  localStorage.setItem('ssoLocal.pkce', JSON.stringify(state));
}

export function clearPKCEState() {
  localStorage.removeItem(PKCE_KEY);
  localStorage.removeItem('ssoLocal.pkce');
}

export function getSession(): TokenSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || localStorage.getItem('ssoLocal.session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: TokenSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('ssoLocal.session', JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('ssoLocal.session');
}
