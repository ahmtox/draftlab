import React, { memo, useMemo } from 'react';
import { Layer, Line, Circle } from 'react-konva';
import { useStore } from '../../../state/store';
import { worldToScreen } from '../viewport';
import { NODE_RADIUS_MM } from '../../../core/constants';
import { buildWallPolygon } from '../../../core/geometry/miter';
import * as vec from '../../../core/math/vec';

function WallsLayerComponent() {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const selectedWallIds = useStore((state) => state.selectedWallIds);
  const hoveredWallId = useStore((state) => state.hoveredWallId);

  const wallShapes = useMemo(() => {
    const shapes: Array<{
      key: string;
      polygon: number[];
      centerline: number[];
      nodeA: { x: number; y: number };
      nodeB: { x: number; y: number };
      isSelected: boolean;
      isHovered: boolean;
    }> = [];

    const nodeRadiusPx = NODE_RADIUS_MM * viewport.scale;

    for (const wall of scene.walls.values()) {
      const nodeA = scene.nodes.get(wall.nodeAId);
      const nodeB = scene.nodes.get(wall.nodeBId);

      if (!nodeA || !nodeB) continue;

      // ✅ Use mitering to compute wall polygon
      const polygonMm = buildWallPolygon(wall, scene);
      
      // Convert polygon to screen coordinates
      const polygon: number[] = [];
      for (const point of polygonMm) {
        const screenPt = worldToScreen(point, viewport);
        polygon.push(screenPt.x, screenPt.y);
      }

      // Centerline (for visual reference)
      const a = worldToScreen(nodeA, viewport);
      const b = worldToScreen(nodeB, viewport);
      const centerline = [a.x, a.y, b.x, b.y];

      shapes.push({
        key: wall.id,
        polygon,
        centerline,
        nodeA: a,
        nodeB: b,
        isSelected: selectedWallIds.has(wall.id),
        isHovered: hoveredWallId === wall.id,
      });
    }

    return { shapes, nodeRadiusPx };
  }, [viewport, scene, selectedWallIds, hoveredWallId]);

  return (
    <Layer>
      {wallShapes.shapes.map((shape) => (
        <React.Fragment key={shape.key}>
          {/* Wall polygon with mitered corners */}
          <Line
            points={shape.polygon}
            closed
            fill={shape.isSelected ? '#dbeafe' : shape.isHovered ? '#eff6ff' : '#f3f4f6'}
            stroke={shape.isSelected ? '#2563eb' : shape.isHovered ? '#3b82f6' : '#333333'}
            strokeWidth={shape.isSelected ? 2 : shape.isHovered ? 2 : 1}
            listening={false}
          />
          
          {/* Centerline */}
          <Line
            points={shape.centerline}
            stroke="#666666"
            strokeWidth={1}
            dash={[5, 5]}
            listening={false}
          />
          
          {/* Node circles */}
          <Circle
            x={shape.nodeA.x}
            y={shape.nodeA.y}
            radius={wallShapes.nodeRadiusPx}
            fill={shape.isSelected ? '#2563eb' : '#3b82f6'}
            listening={false}
          />
          <Circle
            x={shape.nodeB.x}
            y={shape.nodeB.y}
            radius={wallShapes.nodeRadiusPx}
            fill={shape.isSelected ? '#2563eb' : '#3b82f6'}
            listening={false}
          />
        </React.Fragment>
      ))}
    </Layer>
  );
}

export const WallsLayer = memo(WallsLayerComponent);