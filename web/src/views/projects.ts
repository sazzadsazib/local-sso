import { getProjects, getActiveProject, setActiveProjectId, saveActiveProject, deleteProject } from '../storage';
import { icon } from '../components/icons';
import { showToast } from '../components/toast';
import { openModal, closeModal } from '../components/modal';
import { Profile } from '../types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function escapeHtml(str: string | undefined): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidUrl(val: string): boolean {
  try {
    const u = new URL(val);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function renderProjectsView(container: HTMLElement, onProjectChange?: () => void) {
  const projects = getProjects();
  const active = getActiveProject();

  container.innerHTML = `
    <section class="page">
      <header class="page-head">
        <div class="page-head-copy">
          <div class="eyebrow">
            <span class="eyebrow-index">01</span>
            <span>Identity workspace</span>
            <span class="eyebrow-rule"></span>
          </div>
          <h1 class="page-title">Projects</h1>
          <p class="page-description">Manage the tenants and OIDC clients connected to your local identity provider. Each project keeps its own endpoints, credentials, and test context.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" id="btnNewProjectTop">
            ${icon('plus', 'w-4 h-4')} New project
          </button>
        </div>
      </header>

      <div class="stat-strip">
        <div class="stat-cell">
          <div class="stat-label">Projects</div>
          <div class="stat-value">
            <span class="stat-primary">${pad(projects.length)}</span>
            <small>workspaces</small>
          </div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Active tenant</div>
          <div class="stat-value">
            <span class="stat-primary">${escapeHtml(active ? active.tenant : '—')}</span>
            <small>${escapeHtml(active ? (active.issuerMode === 'entra' ? 'Entra issuer' : 'Host issuer') : 'no context')}</small>
          </div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Exposed endpoints</div>
          <div class="stat-value">
            <span class="stat-primary">10</span>
            <small>OIDC + mock</small>
          </div>
        </div>
      </div>

      ${
        active
          ? `
        <div class="active-project">
          <div class="active-project-main">
            <div class="active-project-label">
              <span class="dot"></span> Active context
            </div>
            <h2 class="active-project-title">${escapeHtml(active.name)}</h2>
            <div class="active-project-url">
              ${icon('globe', 'w-3.5 h-3.5')} ${escapeHtml(active.rootUrl || 'No root URL configured')}
            </div>
          </div>
          <div class="active-project-meta">
            <div class="active-meta-block">
              <div class="active-meta-label">Tenant</div>
              <div class="active-meta-value" title="${escapeHtml(active.tenant)}">${escapeHtml(active.tenant)}</div>
            </div>
            <div class="active-meta-block">
              <div class="active-meta-label">Client ID</div>
              <div class="active-meta-value" title="${escapeHtml(active.clientId)}">${escapeHtml(active.clientId)}</div>
            </div>
            <a class="btn btn-secondary" href="#config">
              Configure ${icon('arrow-right', 'w-3.5 h-3.5')}
            </a>
          </div>
        </div>
      `
          : ''
      }

      <div class="section-head">
        <h2 class="section-title">All projects</h2>
        <span class="section-meta">${pad(projects.length)} total</span>
      </div>

      <div class="project-grid">
        ${projects
          .map((p, idx) => {
            const isActive = p.id === active?.id;
            return `
            <article class="project-card${isActive ? ' is-active' : ''}">
              <div class="project-card-top">
                ${
                  isActive
                    ? `<span class="chip chip-accent"><span class="dot"></span>Active</span>`
                    : `<span class="chip">Idle</span>`
                }
                <span class="project-card-index">${pad(idx + 1)}</span>
              </div>
              <h3 class="project-card-title">${escapeHtml(p.name)}</h3>
              <div class="project-card-url" title="${escapeHtml(p.rootUrl)}">
                ${icon('link', 'w-3 h-3')} <span class="od-truncate">${escapeHtml(p.rootUrl || 'No root URL')}</span>
              </div>
              <div class="project-card-meta">
                <div>
                  <div class="meta-label">Tenant</div>
                  <div class="meta-value" title="${escapeHtml(p.tenant)}">${escapeHtml(p.tenant)}</div>
                </div>
                <div>
                  <div class="meta-label">Client ID</div>
                  <div class="meta-value" title="${escapeHtml(p.clientId)}">${escapeHtml(p.clientId)}</div>
                </div>
              </div>
              <div class="project-card-actions">
                <button type="button" class="btn btn-quiet" data-configure="${escapeHtml(p.id)}">
                  Configure ${icon('arrow-up-right', 'w-3.5 h-3.5')}
                </button>
                ${
                  !isActive
                    ? `<button type="button" class="btn btn-quiet" data-set-active="${escapeHtml(p.id)}">Set active</button>`
                    : ''
                }
                <span class="spacer"></span>
                <button type="button" class="icon-button" data-delete-project="${escapeHtml(p.id)}" aria-label="Delete ${escapeHtml(p.name)}" title="Delete project">
                  ${icon('trash', 'w-4 h-4')}
                </button>
              </div>
            </article>
          `;
          })
          .join('')}

        <button type="button" class="new-project-tile" id="btnNewProjectCard">
          <span class="new-project-icon">${icon('plus', 'w-4 h-4')}</span>
          <strong>New project</strong>
          <span class="new-project-desc">Add another Entra tenant or client configuration.</span>
        </button>
      </div>
    </section>
  `;

  // Attach event handlers
  const openNewModal = () => {
    openModal(`
      <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="projectModalTitle">
        <form id="newProjectForm" novalidate>
          <div class="modal-head">
            <div>
              <h2 class="modal-title" id="projectModalTitle">New project</h2>
              <p class="modal-description">Create a tenant and client configuration for the local identity provider.</p>
            </div>
            <button type="button" class="icon-button modal-close" id="btnCloseModal" aria-label="Close dialog">
              ${icon('close', 'w-4 h-4')}
            </button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="field field-full">
                <label class="field-label" for="newProjectName">Project name <span class="required">*</span></label>
                <input class="input" id="newProjectName" name="name" placeholder="e.g. Customer Portal" autocomplete="off" data-autofocus required />
                <span class="field-error" id="err-newProjectName"></span>
              </div>
              <div class="field field-full">
                <label class="field-label" for="newProjectRoot">Root URL <span class="required">*</span></label>
                <input class="input mono" id="newProjectRoot" name="rootUrl" placeholder="http://localhost:3000" inputmode="url" required />
                <span class="field-error" id="err-newProjectRoot"></span>
              </div>
              <div class="field">
                <label class="field-label" for="newProjectTenant">Tenant <span class="required">*</span></label>
                <input class="input mono" id="newProjectTenant" name="tenant" value="common" autocomplete="off" required />
                <span class="field-error" id="err-newProjectTenant"></span>
              </div>
              <div class="field">
                <label class="field-label" for="newProjectClientId">Client ID <span class="required">*</span></label>
                <input class="input mono" id="newProjectClientId" name="clientId" placeholder="client-app-123" autocomplete="off" required />
                <span class="field-error" id="err-newProjectClientId"></span>
              </div>
              <div class="field field-full">
                <label class="field-label" for="newProjectRedirect">Redirect URI <span class="required">*</span></label>
                <input class="input mono" id="newProjectRedirect" name="redirectUri" placeholder="http://localhost:3000/callback" inputmode="url" required />
                <span class="field-error" id="err-newProjectRedirect"></span>
              </div>
              <div class="field field-full">
                <label class="field-label" for="newProjectScope">Scopes <span class="required">*</span></label>
                <input class="input mono" id="newProjectScope" name="scope" value="openid profile email offline_access" autocomplete="off" required />
                <span class="field-help">Space-separated. Keep <code>openid</code> for OIDC flows.</span>
                <span class="field-error" id="err-newProjectScope"></span>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <span class="modal-note">A mock client secret will be auto-generated.</span>
            <button type="button" class="btn btn-quiet" id="btnCancelProject">Cancel</button>
            <button type="submit" class="btn btn-primary">${icon('plus', 'w-3.5 h-3.5')} Create project</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('btnCloseModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelProject')?.addEventListener('click', closeModal);

    const form = document.getElementById('newProjectForm') as HTMLFormElement;
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (document.getElementById('newProjectName') as HTMLInputElement).value.trim();
      const rootUrl = (document.getElementById('newProjectRoot') as HTMLInputElement).value.trim();
      const tenant = (document.getElementById('newProjectTenant') as HTMLInputElement).value.trim();
      const clientId = (document.getElementById('newProjectClientId') as HTMLInputElement).value.trim();
      const redirectUri = (document.getElementById('newProjectRedirect') as HTMLInputElement).value.trim();
      const scope = (document.getElementById('newProjectScope') as HTMLInputElement).value.trim();

      let hasError = false;
      const setErr = (id: string, msg: string) => {
        hasError = true;
        const errEl = document.getElementById(`err-${id}`);
        const inputEl = document.getElementById(id);
        if (errEl) {
          errEl.textContent = msg;
          errEl.classList.add('is-visible');
        }
        if (inputEl) inputEl.classList.add('is-error');
      };

      if (!name) setErr('newProjectName', 'Please enter a project name');
      if (!isValidUrl(rootUrl)) setErr('newProjectRoot', 'Enter a valid URL (e.g. http://localhost:3000)');
      if (!tenant) setErr('newProjectTenant', 'Tenant cannot be empty');
      if (!clientId) setErr('newProjectClientId', 'Client ID cannot be empty');
      if (!isValidUrl(redirectUri)) setErr('newProjectRedirect', 'Enter a valid callback redirect URI');
      if (!scope.includes('openid')) setErr('newProjectScope', 'Include openid in scopes');

      if (hasError) return;

      const newProj: Profile = {
        id: `project-${Date.now()}`,
        name,
        rootUrl: rootUrl.replace(/\/+$/, ''),
        provider: 'entra',
        tenant,
        clientId,
        clientSecret: `local-sso-secret-${Math.random().toString(36).slice(2, 10)}`,
        redirectUri,
        scope,
        prompt: 'select_account',
        host: '',
        issuerMode: 'host',
      };

      saveActiveProject(newProj);
      closeModal();
      showToast(`Created project: ${newProj.name}`, 'success');
      renderProjectsView(container, onProjectChange);
      if (onProjectChange) onProjectChange();
    });
  };

  document.getElementById('btnNewProjectTop')?.addEventListener('click', openNewModal);
  document.getElementById('btnNewProjectCard')?.addEventListener('click', openNewModal);

  // Set active handlers
  container.querySelectorAll<HTMLButtonElement>('[data-set-active]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.setActive!;
      setActiveProjectId(id);
      showToast(`Set active: ${getActiveProject().name}`, 'info');
      renderProjectsView(container, onProjectChange);
      if (onProjectChange) onProjectChange();
    });
  });

  // Configure handlers
  container.querySelectorAll<HTMLButtonElement>('[data-configure]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.configure!;
      setActiveProjectId(id);
      window.location.hash = '#config';
    });
  });

  // Delete project handlers
  container.querySelectorAll<HTMLButtonElement>('[data-delete-project]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteProject!;
      const proj = getProjects().find((p) => p.id === id);
      if (!proj) return;

      openModal(`
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="deleteProjTitle">
          <div class="modal-head">
            <div>
              <h2 class="modal-title" id="deleteProjTitle">Delete project?</h2>
              <p class="modal-description">This removes the configuration for this tenant from your local playground.</p>
            </div>
            <button type="button" class="icon-button modal-close" id="btnCloseDelModal" aria-label="Close dialog">
              ${icon('close', 'w-4 h-4')}
            </button>
          </div>
          <div class="modal-body">
            <p class="confirm-copy"><strong>${escapeHtml(proj.name)}</strong> and its client settings will be deleted. Existing sessions will not be preserved.</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-quiet" id="btnCancelDelete">Cancel</button>
            <button type="button" class="btn btn-danger" id="btnConfirmDelete">${icon('trash', 'w-3.5 h-3.5')} Delete project</button>
          </div>
        </div>
      `);

      document.getElementById('btnCloseDelModal')?.addEventListener('click', closeModal);
      document.getElementById('btnCancelDelete')?.addEventListener('click', closeModal);
      document.getElementById('btnConfirmDelete')?.addEventListener('click', () => {
        deleteProject(id);
        closeModal();
        showToast(`Deleted ${proj.name}`);
        renderProjectsView(container, onProjectChange);
        if (onProjectChange) onProjectChange();
      });
    });
  });
}