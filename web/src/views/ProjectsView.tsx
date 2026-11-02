import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Profile } from '../types';
import { getProjects, getActiveProject, saveActiveProject, deleteProject } from '../storage';
import { showToast } from '../components/toast';
import { Icon } from '../components/icons';

export interface ProjectsViewProps {
  onNavigateToConfig?: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onNavigateToConfig }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Profile[]>(() => getProjects());
  const [active, setActive] = useState<Profile>(() => getActiveProject());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Profile | undefined>(undefined);

  // Modal form states
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [tenant, setTenant] = useState('common');
  const [clientId, setClientId] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [scope, setScope] = useState('openid profile email offline_access');

  const refresh = () => {
    setProjects(getProjects());
    setActive(getActiveProject());
  };

  const handleOpenCreateModal = () => {
    setEditingProject(undefined);
    setName('');
    setRootUrl('http://localhost:3000');
    setTenant('common');
    setClientId(`00000000-0000-0000-0000-${Math.floor(100000000000 + Math.random() * 900000000000)}`);
    setRedirectUri('http://localhost:3000/callback');
    setScope('openid profile email offline_access');
    setModalOpen(true);
  };

  const handleConfigure = (project: Profile) => {
    saveActiveProject(project);
    setActive(project);
    if (onNavigateToConfig) {
      onNavigateToConfig();
    }
    void navigate({ to: '/config' });
  };

  const handleDelete = (project: Profile) => {
    if (window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
      deleteProject(project.id);
      showToast('Project deleted');
      refresh();
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const isEdit = !!editingProject;
    const existingProjects = getProjects();

    const updatedProject: Profile = {
      ...editingProject,
      id: editingProject?.id || 'project-' + Date.now(),
      name,
      rootUrl: rootUrl.replace(/\/+$/, ''),
      provider: editingProject?.provider || 'entra',
      tenant,
      clientId,
      clientSecret: editingProject?.clientSecret || `local-sso-secret-${Math.random().toString(36).slice(2, 10)}`,
      redirectUri,
      scope,
      host: editingProject?.host || '',
      issuerMode: editingProject?.issuerMode || 'host',
    };

    const updatedList = existingProjects.filter((p) => p.id !== updatedProject.id);
    updatedList.push(updatedProject);
    saveActiveProject(updatedProject);

    setModalOpen(false);
    showToast(isEdit ? 'Project updated' : 'Project created');
    refresh();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your SSO projects. Each project has its own identity provider configuration.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="shrink-0 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Icon name="plus" className="w-4 h-4" strokeWidth={2.25} />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-slate-500">
          <p className="text-lg font-semibold mb-1">No projects yet</p>
          <p className="text-sm">Create your first project to get started with SSO configuration.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => {
            const isActive = p.id === active.id;
            const endpoint = p.host
              ? `${p.host.replace(/\/+$/, '')}/${p.tenant}`
              : `http://localhost:8080/${p.tenant}`;

            return (
              <div
                key={p.id}
                className={`tilt-card glass-panel glass-hover p-5 rounded-2xl space-y-3 relative flex flex-col justify-between ${
                  isActive ? 'border-sky-500/40 shadow-lg shadow-sky-500/10' : ''
                }`}
              >
                {isActive && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                    Active
                  </span>
                )}
                <div>
                  <h3 className="text-base font-bold text-white">{p.name}</h3>
                  <p className="text-xs text-slate-400 font-mono truncate">{p.rootUrl || '—'}</p>
                </div>
                <div className="space-y-1 text-xs font-mono text-slate-500">
                  <div>
                    Tenant: <span className="text-slate-300">{p.tenant}</span>
                  </div>
                  <div>
                    Client ID: <span className="text-slate-300 truncate block">{p.clientId}</span>
                  </div>
                  <div>
                    Endpoint: <span className="text-slate-300 truncate block">{endpoint}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleConfigure(p)}
                    className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="external-link" className="w-3 h-3" />
                    <span>Configure SSO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="px-2.5 py-1.5 text-rose-400 hover:bg-rose-500/10 text-xs font-medium rounded-lg transition cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl space-y-4 no-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">
                {editingProject ? 'Edit Project' : 'New Project'}
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
                <label className="block text-xs font-semibold text-slate-400 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My App Project"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Project Root URL</label>
                <input
                  type="text"
                  required
                  value={rootUrl}
                  onChange={(e) => setRootUrl(e.target.value)}
                  placeholder="e.g. http://localhost:3000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tenant</label>
                  <input
                    type="text"
                    required
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Client ID</label>
                  <input
                    type="text"
                    required
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Redirect URI</label>
                <input
                  type="text"
                  required
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Scope</label>
                <input
                  type="text"
                  required
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
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
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
