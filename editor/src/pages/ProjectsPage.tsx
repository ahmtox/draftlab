import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fileStorage, type ProjectMeta } from '../services/file-storage';
import { ProjectNameDialog } from '../ui/dialogs/ProjectNameDialog';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const projectList = await fileStorage.listProjects();
      setProjects(projectList);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewClick = () => {
    setShowNameDialog(true);
  };

  const handleCreateProject = async (name: string) => {
    try {
      setCreatingNew(true);
      setShowNameDialog(false);
      const newProject = await fileStorage.createProject(name);
      navigate(`/editor/${newProject.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      setCreatingNew(false);
    }
  };

  const handleCancelCreate = () => {
    setShowNameDialog(false);
  };

  const handleOpenProject = (projectId: string) => {
    navigate(`/editor/${projectId}`);
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this project?')) {
      return;
    }

    try {
      await fileStorage.deleteProject(projectId);
      await loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading projects...</div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-gray-50 overflow-auto">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-sky-600">DraftLab</h1>
                <p className="text-sm text-gray-600 mt-1">Your Projects</p>
              </div>
              <button
                onClick={handleCreateNewClick}
                disabled={creatingNew}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingNew ? 'Creating...' : '+ New Project'}
              </button>
            </div>
          </div>
        </header>

        {/* Projects Grid */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {projects.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-400 text-5xl mb-4">📐</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                No projects yet
              </h2>
              <p className="text-gray-600 mb-6">
                Create your first floor plan project to get started
              </p>
              <button
                onClick={handleCreateNewClick}
                disabled={creatingNew}
                className="px-6 py-3 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50"
              >
                {creatingNew ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleOpenProject(project.id)}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gray-100 flex items-center justify-center relative">
                    {project.thumbnailDataUrl ? (
                      <img
                        src={project.thumbnailDataUrl}
                        alt={project.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-gray-400 text-4xl">📐</div>
                    )}
                    
                    {/* Delete button - shown on hover */}
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                      title="Delete project"
                    >
                      ×
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-800 mb-1 truncate">
                      {project.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Updated {formatDate(project.updatedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Project Name Dialog */}
      <ProjectNameDialog
        isOpen={showNameDialog}
        defaultName="Untitled Project"
        onConfirm={handleCreateProject}
        onCancel={handleCancelCreate}
      />
    </>
  );
}