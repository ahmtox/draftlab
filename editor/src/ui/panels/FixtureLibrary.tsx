import { useState } from 'react';
import { fixtureLibrary, getFixturesByCategory } from '../../core/fixtures/library';
import type { FixtureSchema } from '../../core/fixtures/schema';

interface FixtureLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFixture: (schema: FixtureSchema) => void;
}

export function FixtureLibrary({ isOpen, onClose, onSelectFixture }: FixtureLibraryProps) {
  const [activeCategory, setActiveCategory] = useState<FixtureSchema['category']>('doors');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const categories: Array<{ id: FixtureSchema['category']; label: string; icon: string }> = [
    { id: 'doors', label: 'Doors', icon: '🚪' },
    { id: 'windows', label: 'Windows', icon: '🪟' },
    { id: 'furniture', label: 'Furniture', icon: '🛏️' },
    { id: 'appliances', label: 'Appliances', icon: '🔥' },
  ];

  const fixtures = searchQuery
    ? Array.from(fixtureLibrary.values()).filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : getFixturesByCategory(activeCategory);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed right-4 top-16 bottom-4 w-80 bg-white rounded-xl shadow-2xl z-[101] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Fixture Library</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search fixtures..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Category Tabs */}
        {!searchQuery && (
          <div className="flex gap-1 p-2 border-b border-gray-200 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-sky-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Fixture Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {fixtures.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {searchQuery ? 'No fixtures found' : 'No fixtures in this category'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {fixtures.map((fixture) => (
                <button
                  key={fixture.id}
                  onClick={() => onSelectFixture(fixture)}
                  className="p-3 border border-gray-200 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition-all group"
                >
                  {/* Preview (SVG icon or placeholder) */}
                  <div className="w-full h-20 bg-gray-50 rounded mb-2 flex items-center justify-center text-3xl">
                    {fixture.category === 'doors' && '🚪'}
                    {fixture.category === 'furniture' && '🛏️'}
                    {fixture.category === 'appliances' && '🔥'}
                  </div>
                  
                  {/* Name */}
                  <div className="text-sm font-medium text-gray-800 group-hover:text-sky-600">
                    {fixture.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}