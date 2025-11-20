import { useStore } from '../../state/store';
import { useState } from 'react';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { FixtureLibrary } from './FixtureLibrary';
import type { FixtureSchema } from '../../core/fixtures/schema';

type Tool = 'select' | 'wall' | 'room' | 'measure' | 'fixture'; // ✅ ADD 'fixture'

interface ToolButton {
  id: Tool;
  label: string;
  icon: string;
}

const tools: ToolButton[] = [
  { id: 'select', label: 'Select', icon: '⌘' },
  { id: 'wall', label: 'Wall', icon: '│' },
  { id: 'room', label: 'Room', icon: '□' },
  { id: 'measure', label: 'Measure', icon: '📏' },
];

export function Sidebar() {
  const activeTool = useStore((state) => state.activeTool);
  const setActiveTool = useStore((state) => state.setActiveTool);
  const setActiveFixtureSchema = useStore((state) => state.setActiveFixtureSchema); // ✅ NEW
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fixtureLibraryOpen, setFixtureLibraryOpen] = useState(false);

  const handleSelectFixture = (schema: FixtureSchema) => {
    console.log('Selected fixture:', schema);
    
    // ✅ Switch to fixture tool and store schema
    setActiveTool('fixture');
    setActiveFixtureSchema(schema);
    setFixtureLibraryOpen(false);
  };

  return (
    <>
      <aside className="fixed top-16 left-4 flex flex-col gap-2 z-40">
        {/* Tool Buttons */}
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Fixture Library Button */}
        <button
          onClick={() => setFixtureLibraryOpen(true)}
          className={`w-14 h-14 flex flex-col items-center justify-center rounded-xl text-lg transition-all shadow-sm border border-gray-200 ${
            activeTool === 'fixture'
              ? 'bg-sky-500 text-white shadow-sky-200'
              : 'bg-white text-gray-600 hover:bg-sky-50 hover:text-sky-600'
          }`}
          title="Fixture Library"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-[8px] mt-0.5 font-medium">Fixtures</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-14 h-14 flex flex-col items-center justify-center rounded-xl text-lg transition-all shadow-sm bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 border border-gray-200"
          title="Settings"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[8px] mt-0.5 font-medium">Settings</span>
        </button>
      </aside>

      {/* Dialogs */}
      <SettingsDialog 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
      />
      
      <FixtureLibrary 
        isOpen={fixtureLibraryOpen} 
        onClose={() => setFixtureLibraryOpen(false)}
        onSelectFixture={handleSelectFixture}
      />
    </>
  );
}