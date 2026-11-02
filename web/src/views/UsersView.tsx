import React, { useState, useEffect, useCallback } from 'react';
import { MockUser } from '../types';
import { fetchMockUsers, createMockUser, updateMockUser, deleteMockUser } from '../api';
import { getActiveProject } from '../storage';
import { showToast } from '../components/toast';
import { Icon } from '../components/icons';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<MockUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<MockUser | null>(null);

  // Modal form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [roles, setRoles] = useState('');
  const [groups, setGroups] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMockUsers();
      setUsers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showToast(`Failed to load users: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setAvatarUrl('');
    setGivenName('');
    setFamilyName('');
    setRoles('User');
    setGroups('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (user: MockUser) => {
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setAvatarUrl(user.avatar_url || '');
    setGivenName(user.given_name || '');
    setFamilyName(user.family_name || '');
    setRoles((user.roles || []).join(', '));
    setGroups((user.groups || []).join(', '));
    setModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Delete this mock user?')) {
      try {
        await deleteMockUser(id);
        showToast('Mock user deleted');
        await loadUsers();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(msg, 'error');
      }
    }
  };

  const handleQuickLogin = (userEmail: string) => {
    const project = getActiveProject();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const tenant = project.tenant || 'common';
    const authUrl = `${origin}/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
      project.clientId
    )}&response_type=code&redirect_uri=${encodeURIComponent(
      project.redirectUri
    )}&scope=${encodeURIComponent(project.scope)}&login_hint=${encodeURIComponent(userEmail)}&prompt=none`;
    window.location.href = authUrl;
  };

  const handleCopyClaim = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied claim to clipboard');
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rolesList = roles
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const groupsList = groups
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    const payload: Partial<MockUser> = {
      name,
      email,
      preferred_username: email,
      given_name: givenName,
      family_name: familyName,
      avatar_url: avatarUrl.trim() || undefined,
      roles: rolesList.length > 0 ? rolesList : ['User'],
      groups: groupsList,
    };

    try {
      if (editingUser) {
        await updateMockUser(editingUser.id, payload);
        showToast('User updated');
      } else {
        await createMockUser(payload);
        showToast('User created');
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mock User Directory</h1>
          <p className="text-sm text-slate-400">
            Manage mock user identities, directory roles, and token claims returned in ID tokens.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="shrink-0 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Icon name="plus" className="w-4 h-4" strokeWidth={2.25} />
          <span>Add Mock User</span>
        </button>
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2">
          <Icon name="loader" className="w-5 h-5 animate-spin text-sky-400" />
          <span>Loading mock users...</span>
        </div>
      ) : error ? (
        <div className="py-12 text-center text-rose-400">Failed to load users: {error}</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-slate-500">No mock users found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((u) => (
            <div
              key={u.id}
              className="tilt-card glass-panel glass-hover p-6 rounded-2xl space-y-4 relative flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden relative shadow-md border border-white/10 flex items-center justify-center bg-gradient-to-tr from-sky-500 to-indigo-600">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.name}
                          className="w-full h-full object-cover rounded-xl"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className={`w-full h-full items-center justify-center text-lg font-bold text-white ${
                          u.avatar_url ? 'hidden' : 'flex'
                        }`}
                      >
                        {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-white break-words">{u.name}</h3>
                      <span className="text-xs text-slate-400 font-mono block truncate">{u.email}</span>
                    </div>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(u.roles || ['User']).map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20"
                    >
                      {r}
                    </span>
                  ))}
                  {(u.groups || []).map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    >
                      {g}
                    </span>
                  ))}
                </div>

                {/* Details / OIDC Claims */}
                <div className="user-claims-card rounded-xl border p-3 space-y-2.5 text-xs font-mono">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="user-claim-badge">oid</span>
                      <span className="user-claim-label text-[11px]">Object ID</span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0 justify-end">
                      <span className="user-claim-val truncate select-all font-mono text-[11px]" title={u.oid}>
                        {u.oid}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyClaim(u.oid)}
                        className="copy-claim-btn shrink-0 p-1 rounded transition cursor-pointer"
                        title="Copy Object ID"
                      >
                        <Icon name="copy" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="user-claim-badge">tid</span>
                      <span className="user-claim-label text-[11px]">Tenant ID</span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0 justify-end">
                      <span className="user-claim-val truncate select-all font-mono text-[11px]" title={u.tid}>
                        {u.tid}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyClaim(u.tid)}
                        className="copy-claim-btn shrink-0 p-1 rounded transition cursor-pointer"
                        title="Copy Tenant ID"
                      >
                        <Icon name="copy" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="user-claim-badge">sub</span>
                      <span className="user-claim-label text-[11px]">Subject</span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0 justify-end">
                      <span className="user-claim-val truncate select-all font-mono text-[11px]" title={u.sub}>
                        {u.sub}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyClaim(u.sub)}
                        className="copy-claim-btn shrink-0 p-1 rounded transition cursor-pointer"
                        title="Copy Subject"
                      >
                        <Icon name="copy" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin(u.email)}
                  className="btn-quick-login px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Icon name="zap" className="w-3.5 h-3.5" />
                  <span>Test Login</span>
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(u)}
                    className="btn-edit px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(u.id)}
                    className="btn-delete px-2.5 py-1.5 text-rose-400 hover:bg-rose-500/10 text-xs font-medium rounded-lg transition cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl space-y-4 no-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">
                {editingUser ? 'Edit Mock User' : 'Add New Mock User'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Close"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sazzad Sazib"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Email / Preferred Username</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sazib@gmail.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Avatar Image URL (optional)</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="e.g. https://avatars.githubusercontent.com/..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Given Name</label>
                  <input
                    type="text"
                    value={givenName}
                    onChange={(e) => setGivenName(e.target.value)}
                    placeholder="Sazzad"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Family Name</label>
                  <input
                    type="text"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="Sazib"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Roles (comma-separated)</label>
                  <input
                    type="text"
                    value={roles}
                    onChange={(e) => setRoles(e.target.value)}
                    placeholder="e.g. Global Administrator, Developer"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Groups (comma-separated)</label>
                  <input
                    type="text"
                    value={groups}
                    onChange={(e) => setGroups(e.target.value)}
                    placeholder="e.g. Engineers, Admins"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-500/20 cursor-pointer"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
