import type { FixtureSchema } from './schema';
import { createDoorSymbol, createBedSymbol, createOvenSymbol } from './symbols';

export const fixtureLibrary = new Map<string, FixtureSchema>();

// ============================================================================
// DOORS
// ============================================================================

fixtureLibrary.set('door', {
  id: 'door',
  name: 'Door',
  category: 'doors',
  params: [
    { 
      key: 'width', 
      label: 'Width', 
      type: 'number', 
      default: 900, 
      min: 600, 
      max: 1500, 
      step: 100,
      unit: 'mm'
    },
    { 
      key: 'swing', 
      label: 'Swing Direction', 
      type: 'enum', 
      default: 'left', 
      values: ['left', 'right'] 
    },
    { 
      key: 'height', 
      label: 'Height', 
      type: 'number', 
      default: 2100, 
      min: 1800, 
      max: 2400, 
      step: 100,
      unit: 'mm'
    },
  ],
  anchors: [{ type: 'wall', snapToCenter: true }],
  openingRule: { 
    widthParam: 'width', 
    heightParam: 'height',
    depthMode: 'cut' 
  },
  symbol2D: (params) => createDoorSymbol(params.width, params.swing),
});

// ============================================================================
// FURNITURE
// ============================================================================

fixtureLibrary.set('bed-single', {
  id: 'bed-single',
  name: 'Single Bed',
  category: 'furniture',
  params: [
    { 
      key: 'width', 
      label: 'Width', 
      type: 'number', 
      default: 1000, 
      min: 900, 
      max: 1200, 
      step: 50,
      unit: 'mm'
    },
    { 
      key: 'length', 
      label: 'Length', 
      type: 'number', 
      default: 2000, 
      min: 1900, 
      max: 2100, 
      step: 50,
      unit: 'mm'
    },
  ],
  anchors: [{ type: 'room' }, { type: 'floor' }],
  symbol2D: (params) => createBedSymbol(params.width, params.length),
});

fixtureLibrary.set('bed-double', {
  id: 'bed-double',
  name: 'Double Bed',
  category: 'furniture',
  params: [
    { 
      key: 'width', 
      label: 'Width', 
      type: 'number', 
      default: 1400, 
      min: 1200, 
      max: 1600, 
      step: 50,
      unit: 'mm'
    },
    { 
      key: 'length', 
      label: 'Length', 
      type: 'number', 
      default: 2000, 
      min: 1900, 
      max: 2100, 
      step: 50,
      unit: 'mm'
    },
  ],
  anchors: [{ type: 'room' }, { type: 'floor' }],
  symbol2D: (params) => createBedSymbol(params.width, params.length),
});

fixtureLibrary.set('bed-queen', {
  id: 'bed-queen',
  name: 'Queen Bed',
  category: 'furniture',
  params: [
    { 
      key: 'width', 
      label: 'Width', 
      type: 'number', 
      default: 1600, 
      min: 1500, 
      max: 1700, 
      step: 50,
      unit: 'mm'
    },
    { 
      key: 'length', 
      label: 'Length', 
      type: 'number', 
      default: 2000, 
      min: 1900, 
      max: 2100, 
      step: 50,
      unit: 'mm'
    },
  ],
  anchors: [{ type: 'room' }, { type: 'floor' }],
  symbol2D: (params) => createBedSymbol(params.width, params.length),
});

fixtureLibrary.set('bed-king', {
  id: 'bed-king',
  name: 'King Bed',
  category: 'furniture',
  params: [
    { 
      key: 'width', 
      label: 'Width', 
      type: 'number', 
      default: 2000, 
      min: 1800, 
      max: 2200, 
      step: 50,
      unit: 'mm'
    },
    { 
      key: 'length', 
      label: 'Length', 
      type: 'number', 
      default: 2000, 
      min: 1900, 
      max: 2100, 
      step: 50,
      unit: 'mm'
    },
  ],
  anchors: [{ type: 'room' }, { type: 'floor' }],
  symbol2D: (params) => createBedSymbol(params.width, params.length),
});

// ============================================================================
// APPLIANCES
// ============================================================================

fixtureLibrary.set('oven', {
  id: 'oven',
  name: 'Oven/Stove',
  category: 'appliances',
  params: [
    { 
      key: 'width', 
      label: 'Width', 
      type: 'number', 
      default: 600, 
      min: 500, 
      max: 900, 
      step: 50,
      unit: 'mm'
    },
    { 
      key: 'depth', 
      label: 'Depth', 
      type: 'number', 
      default: 600, 
      min: 500, 
      max: 700, 
      step: 50,
      unit: 'mm'
    },
  ],
  anchors: [{ type: 'room' }, { type: 'floor' }],
  symbol2D: (params) => createOvenSymbol(params.width, params.depth),
});

/**
 * Get fixture schema by ID
 */
export function getFixture(id: string): FixtureSchema | undefined {
  return fixtureLibrary.get(id);
}

/**
 * Get all fixtures in a category
 */
export function getFixturesByCategory(category: FixtureSchema['category']): FixtureSchema[] {
  return Array.from(fixtureLibrary.values()).filter(f => f.category === category);
}

/**
 * Search fixtures by name
 */
export function searchFixtures(query: string): FixtureSchema[] {
  const lowerQuery = query.toLowerCase();
  return Array.from(fixtureLibrary.values()).filter(f => 
    f.name.toLowerCase().includes(lowerQuery) || 
    f.id.toLowerCase().includes(lowerQuery)
  );
}