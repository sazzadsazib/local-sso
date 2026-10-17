import { getStoredUsers, saveStoredUsers, addStoredUser, updateStoredUser, deleteStoredUser } from '../storage';
import { fetchMockUsers, createMockUser, updateMockUser, deleteMockUser } from '../api';
import { icon } from '../components/icons';
import { showToast } from '../components/toast';
import { openModal, closeModal } from '../components/modal';
import { MockUser } from '../types';

function escapeHtml(str: string | undefined): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(name: string): string {
  return String(name || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function roleType(roles?: string[]): 'admin' | 'developer' | 'user' {
  const list = (roles || []).map((r) => r.toLowerCase());
  if (list.some((r) => r.includes('administrator') || r.includes('admin'))) return 'admin';
  if (list.some((r) => r.includes('developer'))) return 'developer';
  return 'user';
}

function userAvatarHtml(user: MockUser, sizeCls = ''): string {
  const src = user.avatar_url && (user.avatar_url.startsWith('http') || user.avatar_url.startsWith('assets/'))
    ? user.avatar_url
    : '';
  return `
    <div class="avatar ${sizeCls}">
      ${src ? `<img src="${escapeHtml(src)}" alt="" width="52" height="52" loading="lazy" onerror="this.remove()" />` : ''}
      <span class="avatar-fallback" aria-hidden="true">${escapeHtml(getInitials(user.name))}</span>
    </div>
  `;
}

export async function renderUsersView(container: HTMLElement) {
  let users: MockUser[] = getStoredUsers();
  try {
    const apiUsers = await fetchMockUsers();
    if (apiUsers && apiUsers.length > 0) {
      users = apiUsers;
      saveStoredUsers(users);
    }
  } catch (e) {
    // offline or static mode, use stored users
  }

  let filter: 'all' | 'admin' | 'developer' | 'user' = 'all';
  let query = '';

  const render = () => {
    const filteredUsers = users.filter((u) => {
      const type = roleType(u.roles);
      const matchFilter = filter === 'all' || type === filter;
      const q = query.toLowerCase().trim();
      const matchQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.roles || []).some((r) => r.toLowerCase().includes(q)) ||
        (u.groups || []).some((g) => g.toLowerCase().includes(q));
      return matchFilter && matchQuery;
    });

    container.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div class="page-head-copy">
            <div class="eyebrow">
              <span class="eyebrow-index">03</span>
              <span>Mock user directory</span>
              <span class="eyebrow-rule"></span>
            </div>
            <h1 class="page-title">Mock users</h1>
            <p class="page-description">Curate the identities, roles, and group claims returned by the local provider. Test each persona against any project.</p>
          </div>
          <div class="page-actions">
            <button type="button" class="btn btn-primary" id="btnNewUser">
              ${icon('plus', 'w-4 h-4')} Add mock user
            </button>
          </div>
        </header>

        <div class="toolbar">
          <div class="search-box">
            ${icon('search', 'w-3.5 h-3.5')}
            <input class="input" id="userSearchInput" placeholder="Search by name, email, role, or group" value="${escapeHtml(query)}" />
          </div>
          <div class="toolbar-group">
            <div class="filter-row">
              <button type="button" class="filter-button${filter === 'all' ? ' is-active' : ''}" data-user-filter="all">All</button>
              <button type="button" class="filter-button${filter === 'admin' ? ' is-active' : ''}" data-user-filter="admin">Admins</button>
              <button type="button" class="filter-button${filter === 'developer' ? ' is-active' : ''}" data-user-filter="developer">Developers</button>
              <button type="button" class="filter-button${filter === 'user' ? ' is-active' : ''}" data-user-filter="user">Users</button>
            </div>
            <span class="result-count">${filteredUsers.length} of ${users.length}</span>
          </div>
        </div>

        ${
          filteredUsers.length
            ? `
          <div class="user-grid">
            ${filteredUsers
              .map((u) => {
                const type = roleType(u.roles);
                return `
                <article class="user-card" data-user-id="${u.id}">
                  <div class="user-card-head">
                    ${userAvatarHtml(u)}
                    <div class="user-identity">
                      <div class="user-name">${escapeHtml(u.name)}</div>
                      <div class="user-email" title="${escapeHtml(u.email)}">${escapeHtml(u.email)}</div>
                    </div>
                    ${type === 'admin' ? `<span class="chip chip-accent">Admin</span>` : ''}
                  </div>
                  <div class="user-roles">
                    ${(u.roles || ['User'])
                      .map((r) => `<span class="chip ${roleType([r]) === 'admin' ? 'chip-accent' : 'chip-blue'}">${escapeHtml(r)}</span>`)
                      .join('')}
                    ${(u.groups || []).map((g) => `<span class="chip">${escapeHtml(g)}</span>`).join('')}
                  </div>
                  <div class="claim-list">
                    <div class="claim-row">
                      <span class="claim-key">oid</span>
                      <span class="claim-value" title="${escapeHtml(u.oid)}">${escapeHtml(u.oid)}</span>
                      <button type="button" class="claim-copy" data-copy-claim="${escapeHtml(u.oid)}" title="Copy object ID">
                        ${icon('copy', 'w-3 h-3')}
                      </button>
                    </div>
                    <div class="claim-row">
                      <span class="claim-key">tid</span>
                      <span class="claim-value" title="${escapeHtml(u.tid)}">${escapeHtml(u.tid)}</span>
                      <button type="button" class="claim-copy" data-copy-claim="${escapeHtml(u.tid)}" title="Copy tenant ID">
                        ${icon('copy', 'w-3 h-3')}
                      </button>
                    </div>
                    <div class="claim-row">
                      <span class="claim-key">sub</span>
                      <span class="claim-value" title="${escapeHtml(u.sub)}">${escapeHtml(u.sub)}</span>
                      <button type="button" class="claim-copy" data-copy-claim="${escapeHtml(u.sub)}" title="Copy subject ID">
                        ${icon('copy', 'w-3 h-3')}
                      </button>
                    </div>
                  </div>
                  <div class="user-actions">
                    <button type="button" class="btn btn-secondary" data-quick-login="${escapeHtml(u.id)}">
                      ${icon('zap', 'w-3.5 h-3.5')} Test login
                    </button>
                    <span class="spacer"></span>
                    <button type="button" class="icon-button" data-edit-user="${escapeHtml(u.id)}" title="Edit user">
                      ${icon('pencil', 'w-3.5 h-3.5')}
                    </button>
                    <button type="button" class="icon-button" data-delete-user="${escapeHtml(u.id)}" title="Delete user">
                      ${icon('trash', 'w-3.5 h-3.5')}
                    </button>
                  </div>
                </article>
              `;
              })
              .join('')}
          </div>
        `
            : `
          <div class="empty-state">
            <span class="empty-icon">${icon('users', 'w-5 h-5')}</span>
            <h2 class="empty-title">${users.length ? 'No matching users' : 'No mock users yet'}</h2>
            <p class="empty-copy">${users.length ? 'Try a broader search or switch the role filter.' : 'Add an identity so you can test token claims and complete authorization flows.'}</p>
            ${!users.length ? `<button type="button" class="btn btn-primary" id="btnEmptyNewUser">${icon('plus', 'w-3.5 h-3.5')} Add mock user</button>` : ''}
          </div>
        `
        }
      </section>
    `;

    // Bind event handlers
    const searchInput = document.getElementById('userSearchInput') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      query = searchInput.value;
      render();
      const updated = document.getElementById('userSearchInput') as HTMLInputElement | null;
      if (updated) {
        updated.focus();
        updated.setSelectionRange(query.length, query.length);
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-user-filter]').forEach((b) => {
      b.addEventListener('click', () => {
        filter = b.dataset.userFilter as any;
        render();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-copy-claim]').forEach((b) => {
      b.addEventListener('click', () => {
        const val = b.dataset.copyClaim || '';
        navigator.clipboard.writeText(val);
        showToast('Copied claim to clipboard');
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-quick-login]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.quickLogin!;
        sessionStorage.setItem('ssoLocal.pendingLoginUser', id);
        window.location.hash = '#login';
      });
    });

    const openUserModal = (existingUser?: MockUser) => {
      const isEdit = Boolean(existingUser);
      openModal(`
        <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="userModalTitle">
          <form id="userForm" novalidate>
            <div class="modal-head">
              <div>
                <h2 class="modal-title" id="userModalTitle">${isEdit ? 'Edit mock user' : 'Add mock user'}</h2>
                <p class="modal-description">${isEdit ? 'Update the identity claims returned by the local provider.' : 'Create an identity for token and authorization testing.'}</p>
              </div>
              <button type="button" class="icon-button modal-close" id="btnCloseUserModal" aria-label="Close dialog">
                ${icon('close', 'w-4 h-4')}
              </button>
            </div>
            <div class="modal-body">
              <div class="form-grid">
                <div class="field field-full">
                  <label class="field-label" for="editUserName">Display name <span class="required">*</span></label>
                  <input class="input" id="editUserName" value="${escapeHtml(existingUser?.name || '')}" placeholder="e.g. Adele Vance" data-autofocus required />
                  <span class="field-error" id="err-editUserName"></span>
                </div>
                <div class="field field-full">
                  <label class="field-label" for="editUserEmail">Email / preferred username <span class="required">*</span></label>
                  <input class="input mono" id="editUserEmail" type="email" value="${escapeHtml(existingUser?.email || '')}" placeholder="name@contoso.com" required />
                  <span class="field-error" id="err-editUserEmail"></span>
                </div>
                <div class="field field-full">
                  <label class="field-label" for="editUserAvatar">Avatar URL</label>
                  <input class="input mono" id="editUserAvatar" type="url" value="${escapeHtml(existingUser?.avatar_url || '')}" placeholder="https://… or assets/avatars/name.jpg" />
                  <span class="field-help">Optional. Leave blank to display computed initials.</span>
                </div>
                <div class="field">
                  <label class="field-label" for="editUserGiven">Given name</label>
                  <input class="input" id="editUserGiven" value="${escapeHtml(existingUser?.given_name || '')}" placeholder="Adele" />
                </div>
                <div class="field">
                  <label class="field-label" for="editUserFamily">Family name</label>
                  <input class="input" id="editUserFamily" value="${escapeHtml(existingUser?.family_name || '')}" placeholder="Vance" />
                </div>
                <div class="field">
                  <label class="field-label" for="editUserRoles">Roles</label>
                  <input class="input" id="editUserRoles" value="${escapeHtml((existingUser?.roles || ['User']).join(', '))}" placeholder="Global Administrator, User" />
                  <span class="field-help">Comma-separated.</span>
                </div>
                <div class="field">
                  <label class="field-label" for="editUserGroups">Groups</label>
                  <input class="input" id="editUserGroups" value="${escapeHtml((existingUser?.groups || []).join(', '))}" placeholder="Engineers, Admins" />
                  <span class="field-help">Comma-separated.</span>
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-quiet" id="btnCancelUserModal">Cancel</button>
              <button type="submit" class="btn btn-primary">${icon(isEdit ? 'check' : 'plus', 'w-3.5 h-3.5')} ${isEdit ? 'Save changes' : 'Create user'}</button>
            </div>
          </form>
        </div>
      `);

      document.getElementById('btnCloseUserModal')?.addEventListener('click', closeModal);
      document.getElementById('btnCancelUserModal')?.addEventListener('click', closeModal);

      const form = document.getElementById('userForm') as HTMLFormElement;
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('editUserName') as HTMLInputElement).value.trim();
        const email = (document.getElementById('editUserEmail') as HTMLInputElement).value.trim();
        const avatarUrl = (document.getElementById('editUserAvatar') as HTMLInputElement).value.trim();
        const given = (document.getElementById('editUserGiven') as HTMLInputElement).value.trim();
        const family = (document.getElementById('editUserFamily') as HTMLInputElement).value.trim();
        const roles = (document.getElementById('editUserRoles') as HTMLInputElement).value
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);
        const groups = (document.getElementById('editUserGroups') as HTMLInputElement).value
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean);

        if (!name || !email) {
          showToast('Display name and Email are required', 'error');
          return;
        }

        if (isEdit && existingUser) {
          const updated: MockUser = {
            ...existingUser,
            name,
            email,
            preferred_username: email,
            avatar_url: avatarUrl,
            given_name: given,
            family_name: family,
            roles: roles.length ? roles : ['User'],
            groups,
          };
          try {
            await updateMockUser(existingUser.id, updated);
          } catch {}
          updateStoredUser(updated);
          const idx = users.findIndex((u) => u.id === existingUser.id);
          if (idx >= 0) users[idx] = updated;
          showToast('Mock user updated');
        } else {
          const newUser: MockUser = {
            id: `user-${Date.now()}`,
            name,
            email,
            preferred_username: email,
            avatar_url: avatarUrl,
            given_name: given,
            family_name: family,
            roles: roles.length ? roles : ['User'],
            groups,
            oid: `oid-${Math.random().toString(36).slice(2, 14)}`,
            tid: '72f988bf-86f1-41af-91ab-2d7cd011db47',
            sub: `sub-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.floor(Math.random() * 900 + 100)}`,
          };
          try {
            await createMockUser(newUser);
          } catch {}
          addStoredUser(newUser);
          users.push(newUser);
          showToast('Mock user created');
        }

        closeModal();
        render();
      });
    };

    document.getElementById('btnNewUser')?.addEventListener('click', () => openUserModal());
    document.getElementById('btnEmptyNewUser')?.addEventListener('click', () => openUserModal());

    container.querySelectorAll<HTMLButtonElement>('[data-edit-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editUser!;
        const u = users.find((user) => user.id === id);
        if (u) openUserModal(u);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-delete-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deleteUser!;
        const u = users.find((user) => user.id === id);
        if (!u) return;

        openModal(`
          <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="delUserTitle">
            <div class="modal-head">
              <div>
                <h2 class="modal-title" id="delUserTitle">Delete mock user?</h2>
                <p class="modal-description">This identity will no longer be available in the mock directory.</p>
              </div>
              <button type="button" class="icon-button modal-close" id="btnCloseDelUserModal" aria-label="Close dialog">
                ${icon('close', 'w-4 h-4')}
              </button>
            </div>
            <div class="modal-body">
              <p class="confirm-copy"><strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.email)}) will be deleted. Existing sessions will not be affected.</p>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-quiet" id="btnCancelDelUser">Cancel</button>
              <button type="button" class="btn btn-danger" id="btnConfirmDelUser">${icon('trash', 'w-3.5 h-3.5')} Delete user</button>
            </div>
          </div>
        `);

        document.getElementById('btnCloseDelUserModal')?.addEventListener('click', closeModal);
        document.getElementById('btnCancelDelUser')?.addEventListener('click', closeModal);
        document.getElementById('btnConfirmDelUser')?.addEventListener('click', async () => {
          try {
            await deleteMockUser(id);
          } catch {}
          deleteStoredUser(id);
          users = users.filter((user) => user.id !== id);
          closeModal();
          showToast(`Deleted ${u.name}`);
          render();
        });
      });
    });
  };

  render();
}
