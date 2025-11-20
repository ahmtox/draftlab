import React, { memo, useMemo } from 'react';
import { Layer, Group, Path, Circle, Rect } from 'react-konva';
import { useStore } from '../../../state/store';
import { worldToScreen } from '../viewport';
import { getFixture } from '../../../core/fixtures/library';
import type { Vec2 } from '../../../core/math/vec';

interface FixturesLayerProps {
  ghostFixture?: {
    schema: { id: string; symbol2D: (params: any) => string };
    positionMm: Vec2;
    rotation: number;
    params: Record<string, any>;
  } | null;
}

function FixturesLayerComponent({ ghostFixture }: FixturesLayerProps) {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const selectedFixtureId = useStore((state) => state.selectedFixtureId);
  const setSelectedFixtureId = useStore((state) => state.setSelectedFixtureId);
  const activeTool = useStore((state) => state.activeTool);

  const fixtureShapes = useMemo(() => {
    const shapes: Array<{
      key: string;
      fixtureId?: string;
      positionScreen: Vec2;
      rotation: number;
      pathData: string;
      color: string;
      opacity: number;
      isSelected: boolean;
      bounds: { width: number; height: number };
      isClickable: boolean;
    }> = [];

    if (scene.fixtures) {
      for (const fixture of scene.fixtures.values()) {
        if (!fixture.position) continue;

        const schema = getFixture(fixture.kind);
        if (!schema) continue;

        const positionScreen = worldToScreen(fixture.position, viewport);
        const pathData = schema.symbol2D(fixture.params);
        const isSelected = selectedFixtureId === fixture.id;

        let width = fixture.params.width || 1000;
        let height = fixture.params.length || fixture.params.depth || 1000;

        shapes.push({
          key: fixture.id,
          fixtureId: fixture.id,
          positionScreen,
          rotation: fixture.rotation || 0,
          pathData,
          color: isSelected ? '#3b82f6' : '#4b5563',
          opacity: 1,
          isSelected,
          bounds: { width, height },
          isClickable: true,
        });
      }
    }

    if (ghostFixture && ghostFixture.positionMm) {
      const positionScreen = worldToScreen(ghostFixture.positionMm, viewport);
      const pathData = ghostFixture.schema.symbol2D(ghostFixture.params);

      let width = ghostFixture.params.width || 1000;
      let height = ghostFixture.params.length || ghostFixture.params.depth || 1000;

      shapes.push({
        key: 'ghost-fixture',
        positionScreen,
        rotation: ghostFixture.rotation,
        pathData,
        color: '#3b82f6',
        opacity: 0.5,
        isSelected: false,
        bounds: { width, height },
        isClickable: false,
      });
    }

    return shapes;
  }, [scene.fixtures, viewport, ghostFixture, selectedFixtureId]);

  const handleFixtureClick = (e: any, fixtureId: string | undefined) => {
    if (activeTool === 'select' && fixtureId) {
      e.cancelBubble = true;
      setSelectedFixtureId(selectedFixtureId === fixtureId ? null : fixtureId);
    }
  };

  return (
    <Layer listening={true}>
      {fixtureShapes.map((shape) => (
        <Group
          key={shape.key}
          x={shape.positionScreen.x}
          y={shape.positionScreen.y}
          rotation={(shape.rotation * 180) / Math.PI}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          listening={shape.isClickable}
          onClick={(e) => shape.isClickable && handleFixtureClick(e, shape.fixtureId)}
          onTap={(e) => shape.isClickable && handleFixtureClick(e, shape.fixtureId)}
        >
          {shape.isSelected && (
            <Rect
              x={-shape.bounds.width / 2}
              y={-shape.bounds.height / 2}
              width={shape.bounds.width}
              height={shape.bounds.height}
              stroke="#3b82f6"
              strokeWidth={3 / viewport.scale}
              dash={[10 / viewport.scale, 5 / viewport.scale]}
              listening={false}
            />
          )}
          <Circle
            x={0}
            y={0}
            radius={4 / viewport.scale}
            fill={shape.color}
            opacity={shape.opacity}
            listening={false}
          />
          <Path
            data={shape.pathData}
            fill="transparent"
            stroke={shape.color}
            strokeWidth={2 / viewport.scale}
            opacity={shape.opacity}
            listening={false}
          />
        </Group>
      ))}
    </Layer>
  );
}

export const FixturesLayer = memo(FixturesLayerComponent);