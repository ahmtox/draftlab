import { Layer, Line, Circle } from 'react-konva';
import { memo, useMemo } from 'react';
import { GRID_SPACING_MM, AXIS_STROKE_WIDTH, ORIGIN_RADIUS_MM } from '../../../core/constants';
import { worldToScreen, screenToWorld } from '../viewport';
import { useStore } from '../../../state/store';

function GridLayerComponent() {
  const viewport = useStore((state) => state.viewport);

  const width = window.innerWidth;
  const height = window.innerHeight;

  // Memoize grid lines calculation
  const gridLines = useMemo(() => {
    const lines: { points: number[]; key: string }[] = [];
    
    // Convert all four corners AND edges to ensure full coverage
    const corners = [
      screenToWorld({ x: -10, y: -10 }, viewport),
      screenToWorld({ x: width + 10, y: -10 }, viewport),
      screenToWorld({ x: -10, y: height + 10 }, viewport),
      screenToWorld({ x: width + 10, y: height + 10 }, viewport),
    ];

    // Find the absolute min/max in world space
    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y));
    const maxY = Math.max(...corners.map(c => c.y));

    // Add generous padding to ensure no gaps
    const padding = GRID_SPACING_MM * 3;
    const startX = Math.floor((minX - padding) / GRID_SPACING_MM) * GRID_SPACING_MM;
    const endX = Math.ceil((maxX + padding) / GRID_SPACING_MM) * GRID_SPACING_MM;
    const startY = Math.floor((minY - padding) / GRID_SPACING_MM) * GRID_SPACING_MM;
    const endY = Math.ceil((maxY + padding) / GRID_SPACING_MM) * GRID_SPACING_MM;

    // Add vertical grid lines (extend beyond visible area)
    for (let x = startX; x <= endX; x += GRID_SPACING_MM) {
      const top = worldToScreen({ x, y: endY }, viewport);
      const bottom = worldToScreen({ x, y: startY }, viewport);
      lines.push({
        points: [top.x, top.y, bottom.x, bottom.y],
        key: `v-${x}`,
      });
    }

    // Add horizontal grid lines (extend beyond visible area)
    for (let y = startY; y <= endY; y += GRID_SPACING_MM) {
      const left = worldToScreen({ x: startX, y }, viewport);
      const right = worldToScreen({ x: endX, y }, viewport);
      lines.push({
        points: [left.x, left.y, right.x, right.y],
        key: `h-${y}`,
      });
    }

    return lines;
  }, [viewport.centerX, viewport.centerY, viewport.scale, width, height]);

  // Memoize axis lines - extend far beyond visible area for infinite feel
  const axes = useMemo(() => {
    const origin = worldToScreen({ x: 0, y: 0 }, viewport);
    const farDistance = 10000000; // 10km in mm to ensure coverage
    const xAxisEnd = worldToScreen({ x: farDistance, y: 0 }, viewport);
    const yAxisEnd = worldToScreen({ x: 0, y: farDistance }, viewport);
    const xAxisStart = worldToScreen({ x: -farDistance, y: 0 }, viewport);
    const yAxisStart = worldToScreen({ x: 0, y: -farDistance }, viewport);

    // Calculate origin radius in screen pixels (world mm * scale)
    const originRadiusPx = ORIGIN_RADIUS_MM * viewport.scale;

    return {
      origin,
      originRadiusPx,
      xAxis: [xAxisStart.x, xAxisStart.y, xAxisEnd.x, xAxisEnd.y],
      yAxis: [yAxisStart.x, yAxisStart.y, yAxisEnd.x, yAxisEnd.y],
    };
  }, [viewport.centerX, viewport.centerY, viewport.scale]);

  return (
    <Layer listening={false}>
      {/* Grid lines */}
      {gridLines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke="#e5e5e5"
          strokeWidth={1}
          listening={false}
        />
      ))}

      {/* X axis (red) - full infinite width */}
      <Line
        points={axes.xAxis}
        stroke="#ff0000"
        strokeWidth={AXIS_STROKE_WIDTH}
        listening={false}
      />

      {/* Y axis (green) - full infinite height */}
      <Line
        points={axes.yAxis}
        stroke="#00ff00"
        strokeWidth={AXIS_STROKE_WIDTH}
        listening={false}
      />

      {/* Origin point - scales with zoom */}
      <Circle
        x={axes.origin.x}
        y={axes.origin.y}
        radius={axes.originRadiusPx}
        fill="#0000ff"
        listening={false}
      />
    </Layer>
  );
}

// Memoize the entire component to prevent unnecessary re-renders
export const GridLayer = memo(GridLayerComponent);