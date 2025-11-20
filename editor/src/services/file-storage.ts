import type { Scene } from '../core/domain/types';

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl?: string;
};

const DB_NAME = 'draftlab';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const SCENES_STORE = 'scenes';

class FileStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Projects store: metadata only
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const projectStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Scenes store: full scene data
        if (!db.objectStoreNames.contains(SCENES_STORE)) {
          db.createObjectStore(SCENES_STORE, { keyPath: 'projectId' });
        }
      };
    });
  }

  /**
   * DANGER: Wipes entire database - for debugging only
   */
  async wipeDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => {
        console.log('Database wiped successfully');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async createProject(name: string): Promise<ProjectMeta> {
    if (!this.db) await this.init();

    const now = Date.now();
    const project: ProjectMeta = {
      id: `project-${now}`,
      name,
      createdAt: now,
      updatedAt: now,
    };

    const emptyScene: Scene = {
      nodes: new Map(),
      walls: new Map(),
      rooms: new Map(),
      fixtures: new Map(),
    };

    await this.saveProjectMeta(project);
    await this.saveScene(project.id, emptyScene);

    return project;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const index = store.index('updatedAt');
      const request = index.openCursor(null, 'prev'); // Sort by most recent

      const projects: ProjectMeta[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          projects.push(cursor.value);
          cursor.continue();
        } else {
          resolve(projects);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getProject(id: string): Promise<ProjectMeta | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveScene(projectId: string, scene: Scene): Promise<void> {
    if (!this.db) await this.init();

    // Convert Maps to arrays for JSON serialization
    const serializedScene = {
      projectId,
      nodes: Array.from(scene.nodes.entries()),
      walls: Array.from(scene.walls.entries()),
      rooms: Array.from(scene.rooms.entries()),
      fixtures: Array.from(scene.fixtures.entries()),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([SCENES_STORE, PROJECTS_STORE], 'readwrite');
      
      // Save scene
      const sceneStore = transaction.objectStore(SCENES_STORE);
      sceneStore.put(serializedScene);

      // Update project updatedAt timestamp
      const projectStore = transaction.objectStore(PROJECTS_STORE);
      const getRequest = projectStore.get(projectId);

      getRequest.onsuccess = () => {
        const project = getRequest.result;
        if (project) {
          project.updatedAt = Date.now();
          projectStore.put(project);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async loadScene(projectId: string): Promise<Scene | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(SCENES_STORE, 'readonly');
      const store = transaction.objectStore(SCENES_STORE);
      const request = store.get(projectId);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Convert arrays back to Maps
        const scene: Scene = {
          nodes: new Map(result.nodes ?? []),
          walls: new Map(result.walls ?? []),
          rooms: new Map(result.rooms ?? []),
          fixtures: new Map(result.fixtures ?? []),
        };

        resolve(scene);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE, SCENES_STORE], 'readwrite');

      const projectStore = transaction.objectStore(PROJECTS_STORE);
      const sceneStore = transaction.objectStore(SCENES_STORE);

      projectStore.delete(id);
      sceneStore.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async saveThumbnail(projectId: string, dataUrl: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const getRequest = store.get(projectId);

      getRequest.onsuccess = () => {
        const project = getRequest.result;
        if (project) {
          project.thumbnailDataUrl = dataUrl;
          store.put(project);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private async saveProjectMeta(project: ProjectMeta): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      store.put(project);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export const fileStorage = new FileStorage();

// Expose wipe function to window for debugging (development only)
if (import.meta.env.DEV) {
  (window as any).wipeDraftLabDB = () => fileStorage.wipeDatabase();
}