import React, { memo, useMemo } from 'react';
import { Layer, Line, Circle } from 'react-konva';
import { useStore } from '../../../state/store';
import { worldToScreen } from '../viewport';
import { NODE_RADIUS_MM } from '../../../core/constants';
import * as vec from '../../../core/math/vec';

function WallsLayerComponent() {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);

  const wallShapes = useMemo(() => {
    const shapes: Array<{
      key: string;
      polygon: number[];
      centerline: number[];
      nodeA: { x: number; y: number };
      nodeB: { x: number; y: number };
    }> = [];

    // Calculate node radius in screen pixels (world mm * scale)
    const nodeRadiusPx = NODE_RADIUS_MM * viewport.scale;

    for (const wall of scene.walls.values()) {
      const nodeA = scene.nodes.get(wall.nodeAId);
      const nodeB = scene.nodes.get(wall.nodeBId);

      if (!nodeA || !nodeB) continue;

      const a = worldToScreen({ x: nodeA.x, y: nodeA.y }, viewport);
      const b = worldToScreen({ x: nodeB.x, y: nodeB.y }, viewport);

      // Calculate perpendicular for thickness
      const dir = vec.normalize(vec.sub(nodeB, nodeA));
      const perp = vec.perpendicular(dir);
      const halfThickness = wall.thicknessMm / 2;

      // Offset edges in world space, then convert to screen
      const aLeft = worldToScreen(vec.add(nodeA, vec.scale(perp, halfThickness)), viewport);
      const aRight = worldToScreen(vec.sub(nodeA, vec.scale(perp, halfThickness)), viewport);
      const bLeft = worldToScreen(vec.add(nodeB, vec.scale(perp, halfThickness)), viewport);
      const bRight = worldToScreen(vec.sub(nodeB, vec.scale(perp, halfThickness)), viewport);

      shapes.push({
        key: wall.id,
        polygon: [
          aLeft.x, aLeft.y,
          bLeft.x, bLeft.y,
          bRight.x, bRight.y,
          aRight.x, aRight.y,
        ],
        centerline: [a.x, a.y, b.x, b.y],
        nodeA: a,
        nodeB: b,
      });
    }

    return { shapes, nodeRadiusPx };
  }, [scene.nodes, scene.walls, viewport]);

  return (
    <Layer listening={false}>
      {wallShapes.shapes.map((shape) => (
        <React.Fragment key={shape.key}>
          {/* Wall polygon */}
          <Line
            points={shape.polygon}
            closed
            fill="#cccccc"
            stroke="#333333"
            strokeWidth={1}
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
          
          {/* Node circles - scales with zoom */}
          <Circle
            x={shape.nodeA.x}
            y={shape.nodeA.y}
            radius={wallShapes.nodeRadiusPx}
            fill="#3b82f6"
            listening={false}
          />
          <Circle
            x={shape.nodeB.x}
            y={shape.nodeB.y}
            radius={wallShapes.nodeRadiusPx}
            fill="#3b82f6"
            listening={false}
          />
        </React.Fragment>
      ))}
    </Layer>
  );
}

export const WallsLayer = memo(WallsLayerComponent);