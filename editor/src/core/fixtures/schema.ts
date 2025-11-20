import type { Vec2 } from '../math/vec';

export type ParamDef = {
  key: string;
  label: string;
  type: 'number' | 'range' | 'enum' | 'color';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  values?: string[];
  unit?: string; // 'mm' for display
};

export type AnchorRule = {
  type: 'wall' | 'room' | 'floor';
  offset?: Vec2;
  snapToCenter?: boolean;
};

export type OpeningRule = {
  widthParam: string;
  heightParam?: string;
  depthMode: 'cut' | 'inset';
};

export type FixtureSchema = {
  id: string;
  name: string;
  category: 'doors' | 'windows' | 'furniture' | 'appliances';
  params: ParamDef[];
  defaultRotation?: number; // radians
  anchors: AnchorRule[];
  openingRule?: OpeningRule;
  // 2D symbol generator (returns SVG path data)
  symbol2D: (params: Record<string, any>) => string;
};