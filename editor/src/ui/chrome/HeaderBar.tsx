import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';

export function HeaderBar() {
  const navigate = useNavigate();
  const currentProject = useStore((state) => state.currentProject);
  const lastSavedAt = useStore((state) => state.lastSavedAt);
  const isSaving = useStore((state) => state.isSaving);
  const history = useStore((state) => state.history);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);

  const [timeAgo, setTimeAgo] = useState<string>('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string>('');
  const [redoLabel, setRedoLabel] = useState<string>('');

  // Update time ago
  useEffect(() => {
    if (!lastSavedAt) {
      setTimeAgo('');
      return;
    }

    const updateTimeAgo = () => {
      const now = Date.now();
      const diffSec = Math.floor((now - lastSavedAt) / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);

      if (diffSec < 10) {
        setTimeAgo('just now');
      } else if (diffSec < 60) {
        setTimeAgo(`${diffSec}s ago`);
      } else if (diffMin < 60) {
        setTimeAgo(`${diffMin}m ago`);
      } else if (diffHour < 24) {
        setTimeAgo(`${diffHour}h ago`);
      } else {
        setTimeAgo('over a day ago');
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);

    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // Update undo/redo state
  useEffect(() => {
    const updateHistoryState = () => {
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());

      const undoStack = history.getUndoStack();
      const redoStack = history.getRedoStack();

      setUndoLabel(undoStack.length > 0 ? undoStack[undoStack.length - 1].label : '');
      setRedoLabel(redoStack.length > 0 ? redoStack[redoStack.length - 1].label : '');
    };

    updateHistoryState();
    
    // Poll for updates (could use event emitter for better performance)
    const interval = setInterval(updateHistoryState, 100);
    return () => clearInterval(interval);
  }, [history]);

  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-white/95 backdrop-blur-sm text-gray-800 flex items-center px-6 z-50 border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={() => navigate('/projects')}
          className="text-sky-600 hover:text-sky-700 transition-colors"
          title="Back to projects"
        >
          ← Projects
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-base font-semibold text-sky-600">DraftLab</h1>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-600">
          {currentProject?.name || 'Untitled Project'}
        </span>
      </div>

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-2 mr-4">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            canUndo
              ? 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
              : 'text-gray-400 cursor-not-allowed'
          }`}
          title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
            canRedo
              ? 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
              : 'text-gray-400 cursor-not-allowed'
          }`}
          title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Shift+Z)` : 'Redo (Ctrl+Shift+Z)'}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
          </svg>
          Redo
        </button>
      </div>

      {/* Save status indicator */}
      <div className="flex items-center gap-2 text-xs">
        {isSaving ? (
          <span className="text-gray-500 flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Saving...
          </span>
        ) : lastSavedAt ? (
          <span className="text-green-600 flex items-center gap-1.5">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Saved {timeAgo}
          </span>
        ) : (
          <span className="text-gray-400">Not saved</span>
        )}
      </div>
    </header>
  );
}