import { getProjects, getActiveProject, saveActiveProject, deleteProject } from '../storage';
import { Profile } from '../types';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';

function projectCard(p: Profile, isActive: boolean): string {
  const endpoint = p.host
    ? `${p.host.replace(/\/+$/, '')}/${p.tenant}`
    : `http://localhost:8080/${p.tenant}`;
  return `
    <div class="tilt-card glass-panel glass-hover p-5 rounded-2xl space-y-3 relative flex flex-col justify-between ${
      isActive ? 'border-sky-500/40 shadow-lg shadow-sky-500/10' : ''
    }">
      ${isActive ? '<span class="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">Active</span>' : ''}
      <div>
        <h3 class="text-base font-bold text-white">${p.name}</h3>
        <p class="text-xs text-slate-400 font-mono truncate">${p.rootUrl || '—'}</p>
      </div>
      <div class="space-y-1 text-xs font-mono text-slate-500">
        <div>Tenant: <span class="text-slate-300">${p.tenant}</span></div>
        <div>Client ID: <span class="text-slate-300 truncate block">${p.clientId}</span></div>
        <div>Endpoint: <span class="text-slate-300 truncate block">${endpoint}</span></div>
      </div>
      <div class="flex items-center gap-2 pt-2 border-t border-slate-800/80">
        <button data-configure="${p.id}" class="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5">
          ${icon('external-link', 'w-3 h-3')} Configure SSO
        </button>
        <button data-delete="${p.id}" class="px-2.5 py-1.5 text-rose-400 hover:bg-rose-500/10 text-xs font-medium rounded-lg transition">Delete</button>
      </div>
    </div>
  `;
}

export function renderProjectsView(container: HTMLElement) {
  const projects = getProjects();
  const active = getActiveProject();

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <h1 class="text-2xl font-bold text-white">Projects</h1>
          <p class="text-sm text-slate-400 mt-1">Manage your SSO projects. Each project has its own identity provider configuration.</p>
        </div>
        <button id="btnNewProject" class="shrink-0 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2 self-start sm:self-auto">
          ${icon('plus', 'w-4 h-4', 2.25)} New Project
        </button>
      </div>

      ${projects.length === 0 ? `
        <div class="glass-panel p-8 rounded-2xl text-center text-slate-500">
          <p class="text-lg font-semibold mb-1">No projects yet</p>
          <p class="text-sm">Create your first project to get started with SSO configuration.</p>
        </div>
      ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${projects.map((p) => projectCard(p, p.id === active.id)).join('')}
        </div>
      `}
    </div>

    <div id="projectModal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 hidden"></div>
  `;

  const modalEl = document.getElementById('projectModal')!;

  document.getElementById('btnNewProject')?.addEventListener('click', () => {
    openProjectModal(undefined, container, modalEl);
  });

  document.querySelectorAll('[data-configure]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-configure') || '';
      saveActiveProject(projects.find((p) => p.id === id) || projects[0]);
      window.location.hash = '#config';
    });
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete') || '';
      const proj = projects.find((p) => p.id === id);
      if (!proj) return;
      if (confirm(`Delete project "${proj.name}"? This cannot be undone.`)) {
        deleteProject(id);
        showToast('Project deleted');
        renderProjectsView(container);
      }
    });
  });
}

function openProjectModal(editProject: Profile | undefined, container: HTMLElement, modalEl: HTMLElement) {
  const isEdit = !!editProject;
  modalEl.innerHTML = `
    <div class="glass-panel max-w-md w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl space-y-4 no-scrollbar">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 class="text-lg font-bold text-white">${isEdit ? 'Edit Project' : 'New Project'}</h2>
        <button id="btnCloseModal" class="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition" aria-label="Close">${icon('close', 'w-4 h-4')}</button>
      </div>

      <form id="projectForm" class="space-y-3 text-left">
        <div>
          <label class="block text-xs font-semibold text-slate-400 mb-1">Project Name</label>
          <input id="inputProjectName" type="text" required value="${editProject?.name || ''}" placeholder="e.g. My App Project" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 mb-1">Project Root URL</label>
          <input id="inputRootUrl" type="text" required value="${editProject?.rootUrl || ''}" placeholder="e.g. http://localhost:3000" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Tenant</label>
            <input id="inputTenant" type="text" required value="${editProject?.tenant || 'common'}" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Client ID</label>
            <input id="inputClientId" type="text" required value="${editProject?.clientId || ''}" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 mb-1">Redirect URI</label>
          <input id="inputRedirectUri" type="text" required value="${editProject?.redirectUri || ''}" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-400 mb-1">Scope</label>
          <input id="inputScope" type="text" required value="${editProject?.scope || 'openid profile email offline_access'}" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
        </div>
        <div class="pt-3 flex justify-end gap-2 border-t border-slate-800">
          <button type="button" id="btnCancelModal" class="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
          <button type="submit" class="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-500/20">
            ${isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  `;

  modalEl.classList.remove('hidden');

  document.getElementById('btnCloseModal')?.addEventListener('click', () => modalEl.classList.add('hidden'));
  document.getElementById('btnCancelModal')?.addEventListener('click', () => modalEl.classList.add('hidden'));

  document.getElementById('projectForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (document.getElementById('inputProjectName') as HTMLInputElement).value;
    const rootUrl = (document.getElementById('inputRootUrl') as HTMLInputElement).value;
    const tenant = (document.getElementById('inputTenant') as HTMLInputElement).value;
    const clientId = (document.getElementById('inputClientId') as HTMLInputElement).value;
    const redirectUri = (document.getElementById('inputRedirectUri') as HTMLInputElement).value;
    const scope = (document.getElementById('inputScope') as HTMLInputElement).value;

    const existingProjects = getProjects();
    const project: Profile = {
      ...editProject,
      id: editProject?.id || 'project-' + Date.now(),
      name,
      rootUrl: rootUrl.replace(/\/+$/, ''),
      provider: editProject?.provider || 'entra',
      tenant,
      clientId,
      redirectUri,
      scope,
      host: '',
      issuerMode: editProject?.issuerMode || 'host',
    };

    const updated = existingProjects.filter((p) => p.id !== project.id);
    updated.push(project);
    saveActiveProject(project);

    modalEl.classList.add('hidden');
    showToast(isEdit ? 'Project updated' : 'Project created');
    renderProjectsView(container);
  });
}