export type Tol = {
  epsilon: number;
  mergeTol: number;
  snapPx: number;
  colinearTolDeg: number;
  angleTolRad: number;
};

export const DEFAULT_TOL: Tol = {
  epsilon: 1e-6,
  mergeTol: 1.0,      // 1mm
  snapPx: 10,
  colinearTolDeg: 1,
  angleTolRad: 0.0175,
};

// Grid settings
export const GRID_SPACING_MM = 1000; // 1 meter grid
export const GRID_DOT_SIZE = 2;
export const AXIS_STROKE_WIDTH = 2;

// Visual elements (in world millimeters - scales with zoom)
export const ORIGIN_RADIUS_MM = 30;     // Origin point radius in world mm (appears smaller when zoomed out)
export const NODE_RADIUS_MM = 30;        // Wall node radius in world mm
export const PREVIEW_NODE_RADIUS_MM = 30; // Preview node radius in world mm

// Wall constraints
export const MIN_WALL_LENGTH_MM = 100;  // Minimum wall length: 100mm (10cm)

// Zoom settings (scale = pixels per mm)
export const DEFAULT_ZOOM_SCALE = 0.1; // 100% zoom: 0.1px per mm (1cm = 1px)
export const MIN_ZOOM_SCALE = 0.001;   // 1% zoom: 0.001px per mm (can zoom out 100x)
export const MAX_ZOOM_SCALE = 0.5;     // 500% zoom: 0.5px per mm (can zoom in 5x)