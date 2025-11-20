import type { Vec2 } from '../math/vec';

/**
 * Generate SVG path for a door with swing arc
 * @param width - door width in mm
 * @param swing - 'left' or 'right'
 * @returns SVG path data
 */
export function createDoorSymbol(width: number, swing: 'left' | 'right'): string {
  const thickness = 50; // door thickness in mm
  
  // Door leaf (rectangle)
  const leafPath = `M 0,0 L ${width},0 L ${width},${thickness} L 0,${thickness} Z`;
  
  // Swing arc (90 degrees)
  const arcRadius = width;
  const arcStart = swing === 'left' ? `0,0` : `${width},0`;
  const arcEnd = swing === 'left' ? `0,-${arcRadius}` : `${width},-${arcRadius}`;
  const arcPath = swing === 'left'
    ? `M ${arcStart} A ${arcRadius},${arcRadius} 0 0 0 ${arcEnd}`
    : `M ${arcStart} A ${arcRadius},${arcRadius} 0 0 1 ${arcEnd}`;
  
  return `${leafPath} ${arcPath}`;
}

/**
 * Generate SVG path for a bed (rectangle with headboard)
 * @param width - bed width in mm
 * @param length - bed length in mm
 * @returns SVG path data
 */
export function createBedSymbol(width: number, length: number): string {
  const headboardThickness = 100; // mm
  
  // Main mattress rectangle
  const mattress = `M 0,0 L ${width},0 L ${width},${length} L 0,${length} Z`;
  
  // Headboard (thicker rectangle at top)
  const headboard = `M 0,0 L ${width},0 L ${width},-${headboardThickness} L 0,-${headboardThickness} Z`;
  
  // Pillow indicators (two rounded rectangles)
  const pillow1 = `M ${width * 0.1},${length * 0.1} L ${width * 0.4},${length * 0.1} L ${width * 0.4},${length * 0.3} L ${width * 0.1},${length * 0.3} Z`;
  const pillow2 = `M ${width * 0.6},${length * 0.1} L ${width * 0.9},${length * 0.1} L ${width * 0.9},${length * 0.3} L ${width * 0.6},${length * 0.3} Z`;
  
  return `${mattress} ${headboard} ${pillow1} ${pillow2}`;
}

/**
 * Generate SVG path for an oven (rectangle with burners)
 * @param width - oven width in mm
 * @param depth - oven depth in mm
 * @returns SVG path data
 */
export function createOvenSymbol(width: number, depth: number): string {
  // Main appliance rectangle
  const body = `M 0,0 L ${width},0 L ${width},${depth} L 0,${depth} Z`;
  
  // Four burner circles (top view)
  const burnerRadius = Math.min(width, depth) * 0.1;
  const xOffset = width * 0.25;
  const yOffset = depth * 0.25;
  
  const burner1 = createCirclePath(xOffset, yOffset, burnerRadius);
  const burner2 = createCirclePath(width - xOffset, yOffset, burnerRadius);
  const burner3 = createCirclePath(xOffset, depth - yOffset, burnerRadius);
  const burner4 = createCirclePath(width - xOffset, depth - yOffset, burnerRadius);
  
  return `${body} ${burner1} ${burner2} ${burner3} ${burner4}`;
}

/**
 * Helper to create circle path
 */
function createCirclePath(cx: number, cy: number, r: number): string {
  return `M ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx + r},${cy} A ${r},${r} 0 1 1 ${cx - r},${cy}`;
}