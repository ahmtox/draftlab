import { useStore } from '../../state/store';

type Tool = 'select' | 'wall' | 'room' | 'measure'; // ✅ Added 'measure'

interface ToolButton {
  id: Tool;
  label: string;
  icon: string;
}

const tools: ToolButton[] = [
  { id: 'select', label: 'Select', icon: '⌘' },
  { id: 'wall', label: 'Wall', icon: '│' },
  { id: 'room', label: 'Room', icon: '□' },
  { id: 'measure', label: 'Measure', icon: '📏' }, // ✅ NEW
];

export function Sidebar() {
  const activeTool = useStore((state) => state.activeTool);
  const setActiveTool = useStore((state) => state.setActiveTool);

  return (
    <aside className="fixed top-16 left-4 flex flex-col gap-2 z-40">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={`w-14 h-14 flex flex-col items-center justify-center rounded-xl text-lg transition-all shadow-sm ${
            activeTool === tool.id
              ? 'bg-sky-500 text-white shadow-sky-200'
              : 'bg-white text-gray-600 hover:bg-sky-50 hover:text-sky-600'
          }`}
          title={tool.label}
        >
          <span className="text-lg">{tool.icon}</span>
          <span className="text-[8px] mt-0.5 font-medium">{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}