import { useStore } from '../../state/store';

export function ViewModeToggle() {
  const viewMode = useStore((state) => state.viewMode);
  const setViewMode = useStore((state) => state.setViewMode);

  return (
    <div className="fixed top-20 right-4 z-30 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setViewMode('2D')}
        className={`
          px-4 py-2 text-sm font-medium transition-colors
          ${viewMode === '2D' 
            ? 'bg-sky-500 text-white' 
            : 'bg-white text-gray-700 hover:bg-gray-50'}
        `}
      >
        2D
      </button>
      <button
        onClick={() => setViewMode('3D')}
        className={`
          px-4 py-2 text-sm font-medium transition-colors border-l border-gray-200
          ${viewMode === '3D' 
            ? 'bg-sky-500 text-white' 
            : 'bg-white text-gray-700 hover:bg-gray-50'}
        `}
      >
        3D
      </button>
    </div>
  );
}