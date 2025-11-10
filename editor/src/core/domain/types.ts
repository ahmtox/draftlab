export type Node = {
  id: string;
  x: number; // mm
  y: number; // mm
  locked?: boolean;
};

export type Wall = {
  id: string;
  nodeAId: string;
  nodeBId: string;
  thicknessMm: number;
  heightMm: number;
  raiseFromFloorMm: number;
};

export type Scene = {
  nodes: Map<string, Node>;
  walls: Map<string, Wall>;
};