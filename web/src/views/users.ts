import { fetchMockUsers, createMockUser, updateMockUser, deleteMockUser } from '../api';
import { MockUser } from '../types';
import { showToast } from '../components/toast';
import { icon } from '../components/icons';
import { getActiveProject } from '../storage';

export async function renderUsersView(container: HTMLElement) {
  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <h1 class="text-2xl font-bold text-white mb-1">Mock User Directory</h1>
          <p class="text-sm text-slate-400">Manage mock user identities, directory roles, and token claims returned in ID tokens.</p>
        </div>
        <button id="btnAddUser" class="shrink-0 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2 self-start sm:self-auto">
          ${icon('plus', 'w-4 h-4', 2.25)} Add Mock User
        </button>
      </div>

      <div id="usersList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="col-span-full py-12 text-center text-slate-500">Loading mock users...</div>
      </div>
    </div>

    <!-- Modal Template Placeholder -->
    <div id="userModal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 hidden"></div>
  `;

  const usersListEl = document.getElementById('usersList')!;
  const userModalEl = document.getElementById('userModal')!;

  async function loadUsers() {
    try {
      const users = await fetchMockUsers();
      if (users.length === 0) {
        usersListEl.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">No mock users found.</div>`;
        return;
      }

      usersListEl.innerHTML = users
        .map(
          (u) => `
        <div class="tilt-card glass-panel glass-hover p-6 rounded-2xl space-y-4 relative flex flex-col justify-between">
          <div class="space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-lg font-bold text-white shadow-md">
                  ${u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="min-w-0">
                  <h3 class="text-base font-bold text-white break-words">${u.name}</h3>
                  <span class="text-xs text-slate-400 font-mono block truncate">${u.email}</span>
                </div>
              </div>
            </div>

            <!-- Badges -->
            <div class="flex flex-wrap gap-1.5 pt-1">
              ${(u.roles || ['User'])
                .map(
                  (r) =>
                    `<span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">${r}</span>`
                )
                .join('')}
              ${(u.groups || [])
                .map(
                  (g) =>
                    `<span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">${g}</span>`
                )
                .join('')}
            </div>

            <!-- Details -->
            <div class="space-y-1 text-xs font-mono text-slate-400 bg-slate-950/70 p-3 rounded-xl border border-slate-900">
              <div class="flex justify-between"><span class="text-slate-500">ObjectID (oid):</span> <span class="text-slate-300 truncate max-w-[160px]">${u.oid}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">TenantID (tid):</span> <span class="text-slate-300 truncate max-w-[160px]">${u.tid}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Subject (sub):</span> <span class="text-slate-300 truncate max-w-[160px]">${u.sub}</span></div>
            </div>
          </div>

          <!-- Card Actions -->
          <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <button data-login="${u.email}" class="btn-quick-login px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5">
              ${icon('zap', 'w-3.5 h-3.5')} Test Login
            </button>
            <div class="flex gap-1.5">
              <button data-edit="${u.id}" class="btn-edit px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition">Edit</button>
              <button data-delete="${u.id}" class="btn-delete px-2.5 py-1.5 text-rose-400 hover:bg-rose-500/10 text-xs font-medium rounded-lg transition">Delete</button>
            </div>
          </div>
        </div>
      `
        )
        .join('');

      // Wire edit / delete / quick login
      document.querySelectorAll('.btn-quick-login').forEach((btn) => {
        btn.addEventListener('click', () => {
          const email = btn.getAttribute('data-login') || '';
          const project = getActiveProject();
          const origin = window.location.origin;
          const tenant = project.tenant || 'common';
          const authUrl = `${origin}/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
            project.clientId
          )}&response_type=code&redirect_uri=${encodeURIComponent(
            project.redirectUri
          )}&scope=${encodeURIComponent(project.scope)}&login_hint=${encodeURIComponent(email)}&prompt=none`;
          window.location.href = authUrl;
        });
      });

      document.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-edit') || '';
          const user = users.find((u) => u.id === id);
          if (user) openUserModal(user);
        });
      });

      document.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-delete') || '';
          if (confirm('Delete this mock user?')) {
            try {
              await deleteMockUser(id);
              showToast('Mock user deleted');
              loadUsers();
            } catch (err: any) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    } catch (err: any) {
      usersListEl.innerHTML = `<div class="col-span-full py-12 text-center text-rose-400">Failed to load users: ${err.message}</div>`;
    }
  }

  function openUserModal(user?: MockUser) {
    const isEdit = !!user;
    userModalEl.innerHTML = `
      <div class="glass-panel max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 class="text-lg font-bold text-white">${isEdit ? 'Edit Mock User' : 'Add New Mock User'}</h2>
          <button id="btnCloseModal" class="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition" aria-label="Close">${icon('close', 'w-4 h-4')}</button>
        </div>

        <form id="userForm" class="space-y-3 text-left">
          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Display Name</label>
            <input id="userName" type="text" required value="${user?.name || ''}" placeholder="e.g. Sazzad Sazib" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Email / Preferred Username</label>
            <input id="userEmail" type="email" required value="${user?.email || ''}" placeholder="e.g. sazib@gmail.com" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-400 mb-1">Given Name</label>
              <input id="userGivenName" type="text" value="${user?.given_name || ''}" placeholder="Sazzad" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-400 mb-1">Family Name</label>
              <input id="userFamilyName" type="text" value="${user?.family_name || ''}" placeholder="Sazib" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Roles (comma-separated)</label>
            <input id="userRoles" type="text" value="${(user?.roles || []).join(', ')}" placeholder="e.g. Global Administrator, Developer" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Groups (comma-separated)</label>
            <input id="userGroups" type="text" value="${(user?.groups || []).join(', ')}" placeholder="e.g. Engineers, Admins" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none" />
          </div>

          <div class="pt-3 flex justify-end gap-2 border-t border-slate-800">
            <button type="button" id="btnCancelModal" class="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
            <button type="submit" class="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-500/20">
              ${isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    `;

    userModalEl.classList.remove('hidden');

    document.getElementById('btnCloseModal')?.addEventListener('click', () => userModalEl.classList.add('hidden'));
    document.getElementById('btnCancelModal')?.addEventListener('click', () => userModalEl.classList.add('hidden'));

    document.getElementById('userForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('userName') as HTMLInputElement).value;
      const email = (document.getElementById('userEmail') as HTMLInputElement).value;
      const givenName = (document.getElementById('userGivenName') as HTMLInputElement).value;
      const familyName = (document.getElementById('userFamilyName') as HTMLInputElement).value;
      const rolesStr = (document.getElementById('userRoles') as HTMLInputElement).value;
      const groupsStr = (document.getElementById('userGroups') as HTMLInputElement).value;

      const roles = rolesStr ? rolesStr.split(',').map((r) => r.trim()).filter(Boolean) : ['User'];
      const groups = groupsStr ? groupsStr.split(',').map((g) => g.trim()).filter(Boolean) : [];

      const payload: Partial<MockUser> = {
        name,
        email,
        preferred_username: email,
        given_name: givenName,
        family_name: familyName,
        roles,
        groups,
      };

      try {
        if (isEdit && user) {
          await updateMockUser(user.id, payload);
          showToast('User updated');
        } else {
          await createMockUser(payload);
          showToast('User created');
        }
        userModalEl.classList.add('hidden');
        loadUsers();
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    });
  }

  document.getElementById('btnAddUser')?.addEventListener('click', () => openUserModal());
  await loadUsers();
}
