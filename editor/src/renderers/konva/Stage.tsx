import { Stage as KonvaStage } from 'react-konva';
import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { GridLayer } from './layers/GridLayer';
import { RoomFillsLayer, RoomLabelsLayer } from './layers/RoomsLayer';
import { WallsLayer } from './layers/WallsLayer';
import { FixturesLayer } from './layers/FixturesLayer';
import { PreviewLayer } from './layers/PreviewLayer';
import { GuidesLayer } from './layers/GuidesLayer';
import { MarqueeLayer } from './layers/MarqueeLayer';
import { MeasureLayer } from './layers/MeasureLayer';
import { RayVisualization } from '../../ui/debug/RayVisualization';
import { useStore } from '../../state/store';
import { MIN_ZOOM_SCALE, MAX_ZOOM_SCALE, NODE_RADIUS_MM } from '../../core/constants';
import { WallTool } from '../../tools/wall.tool';
import { SelectTool } from '../../tools/select.tool';
import { MeasureTool } from '../../tools/measure.tool';
import { FixtureTool } from '../../tools/fixture.tool';
import type { FixtureToolContext } from '../../tools/fixture.tool';
import { AddWallCommand } from '../../core/commands/add-wall';
import { MoveNodeCommand } from '../../core/commands/move-node';
import { MergeNodesCommand } from '../../core/commands/merge-nodes';
import { DeleteWallsCommand } from '../../core/commands/delete-walls';
import { AddFixtureCommand } from '../../core/commands/add-fixture';
import { RotateFixtureCommand } from '../../core/commands/rotate-fixture';
import { MoveFixtureCommand } from '../../core/commands/move-fixture';
import { clearMiterCache } from '../../core/geometry/miter';
import { screenToWorld } from './viewport';
import { hitTestFixtures } from '../../core/geometry/hit-testing';
import type { Vec2 } from '../../core/math/vec';

const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (args[0]?.includes?.('Recommended maximum number of layers')) {
    return;
  }
  originalWarn(...args);
};

export function Stage() {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const activeTool = useStore((state) => state.activeTool);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  const history = useStore((state) => state.history);
  const selectedWallIds = useStore((state) => state.selectedWallIds);
  const setSelectedWallIds = useStore((state) => state.setSelectedWallIds);
  const setSelectedRoomId = useStore((state) => state.setSelectedRoomId);
  const selectedFixtureId = useStore((state) => state.selectedFixtureId);
  const setSelectedFixtureId = useStore((state) => state.setSelectedFixtureId);
  const activeFixtureSchema = useStore((state) => state.activeFixtureSchema);
  const setActiveTool = useStore((state) => state.setActiveTool);
  
  const rafIdRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 48,
  });

  const wallToolRef = useRef<WallTool | null>(null);
  const selectToolRef = useRef<SelectTool | null>(null);
  const measureToolRef = useRef<MeasureTool | null>(null);
  const fixtureToolRef = useRef<FixtureTool | null>(null);

  const [wallToolContext, setWallToolContext] = useState<any>(null);
  const [selectToolContext, setSelectToolContext] = useState<any>(null);
  const [measureToolContext, setMeasureToolContext] = useState<any>(null);
  const [fixtureToolContext, setFixtureToolContext] = useState<FixtureToolContext | null>(null);

  const [shiftKey, setShiftKey] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 48,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!wallToolRef.current) {
      wallToolRef.current = new WallTool(
        (ctx) => setWallToolContext(ctx),
        (startMm, endMm, startNodeId, endNodeId) => {
          const params = useStore.getState().wallParams;
          const cmd = new AddWallCommand(
            startMm, 
            endMm, 
            params, 
            () => useStore.getState().scene,
            setScene,
            startNodeId,
            endNodeId
          );
          
          history.push(cmd);
        }
      );
    }

    if (!selectToolRef.current) {
      selectToolRef.current = new SelectTool(
        (ctx) => {
          setSelectToolContext(ctx);
          setSelectedWallIds(ctx.selectedWallIds);
        },
        (wallIds, nodePositions) => {
          useStore.getState().setIsLiveDragging(true);
          
          clearMiterCache();
          
          const currentScene = useStore.getState().scene;
          const newNodes = new Map(currentScene.nodes);

          for (const [nodeId, position] of nodePositions) {
            const node = newNodes.get(nodeId);
            if (node) {
              newNodes.set(nodeId, { ...node, x: position.x, y: position.y });
            }
          }

          setScene({ 
            nodes: newNodes, 
            walls: currentScene.walls,
            rooms: new Map(),
            fixtures: currentScene.fixtures,
          }, true);
        },
        (nodePositions, mergeTargets) => {
          useStore.getState().setIsLiveDragging(false);
          
          history.beginGesture();

          for (const [nodeId, { original, final }] of nodePositions) {
            const moved = original.x !== final.x || original.y !== final.y;
            if (moved) {
              const cmd = new MoveNodeCommand(
                nodeId,
                original,
                final,
                () => useStore.getState().scene,
                setScene
              );
              history.push(cmd);
            }
          }

          for (const [fromNodeId, toNodeId] of mergeTargets) {
            const cmd = new MergeNodesCommand(
              fromNodeId,
              toNodeId,
              () => useStore.getState().scene,
              setScene
            );
            history.push(cmd);
          }

          history.endGesture({ label: 'Move Selection' });
          
          useStore.getState().detectAndUpdateRooms();
        },
        // Fixture drag update callback
        (fixtureId: string, position: Vec2) => {
          const currentScene = useStore.getState().scene;
          const fixture = currentScene.fixtures?.get(fixtureId);
          if (!fixture) return;

          const newFixtures = new Map(currentScene.fixtures);
          newFixtures.set(fixtureId, {
            ...fixture,
            position: { x: position.x, y: position.y },
          });

          setScene({
            nodes: currentScene.nodes,
            walls: currentScene.walls,
            rooms: currentScene.rooms,
            fixtures: newFixtures,
          }, true);
        },
        // Fixture drag commit callback
        (fixtureId: string, originalPos: Vec2, finalPos: Vec2) => {
          const cmd = new MoveFixtureCommand(
            fixtureId,
            originalPos,
            finalPos,
            () => useStore.getState().scene,
            setScene
          );
          history.push(cmd);
        },
        // ✅ NEW: Getter function for selected fixture ID
        () => useStore.getState().selectedFixtureId
      );
    }

    if (!measureToolRef.current) {
      measureToolRef.current = new MeasureTool(
        (ctx) => setMeasureToolContext(ctx)
      );
    }

    if (!fixtureToolRef.current) {
      fixtureToolRef.current = new FixtureTool(
        (ctx) => {
          setFixtureToolContext(ctx);
        },
        (schema, positionMm, rotation) => {
          const cmd = new AddFixtureCommand(
            schema,
            positionMm,
            rotation,
            () => useStore.getState().scene,
            setScene
          );
          history.push(cmd);
        }
      );
    }
  }, [history, setScene, setSelectedWallIds]);

  useEffect(() => {
    wallToolRef.current?.reset();
    selectToolRef.current?.reset();
    measureToolRef.current?.reset();
    fixtureToolRef.current?.reset();
  }, [activeTool]);

  // Start placing when fixture schema is selected
  useEffect(() => {
    if (activeTool === 'fixture' && activeFixtureSchema && fixtureToolRef.current) {
      fixtureToolRef.current.startPlacing(activeFixtureSchema);
    }
  }, [activeTool, activeFixtureSchema]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKey(true);
        if (activeTool === 'select' && selectToolRef.current) {
          selectToolRef.current.handleKeyDown(e.key);
        }
      }
      
      // Fixture tool: Rotate with R key
      if (activeTool === 'fixture' && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        fixtureToolRef.current?.rotate(Math.PI / 2); // 90 degrees
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKey(false);
        if (activeTool === 'select' && selectToolRef.current) {
          selectToolRef.current.handleKeyUp(e.key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      }
      else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        useStore.getState().redo();
      }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool === 'select') {
        e.preventDefault();
        
        const currentSelectedWallIds = useStore.getState().selectedWallIds;
        const currentSelectedFixtureId = useStore.getState().selectedFixtureId;
        
        if (currentSelectedFixtureId) {
          // TODO: Implement DeleteFixtureCommand
          console.log('Delete fixture:', currentSelectedFixtureId);
          useStore.getState().setSelectedFixtureId(null);
        } else if (currentSelectedWallIds.size > 0) {
          const cmd = new DeleteWallsCommand(
            currentSelectedWallIds,
            () => useStore.getState().scene,
            setScene
          );
          
          history.push(cmd);
          setSelectedWallIds(new Set());
        }
      }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (activeTool === 'select') {
          setSelectedWallIds(new Set());
          setSelectedRoomId(null);
          useStore.getState().setSelectedFixtureId(null);
        } else if (activeTool === 'measure') {
          measureToolRef.current?.reset();
        } else if (activeTool === 'fixture') {
          fixtureToolRef.current?.cancel();
          setActiveTool('select');
        }
      }
      else if (activeTool === 'select' && (e.key === 'r' || e.key === 'R')) {
        const currentSelectedFixtureId = useStore.getState().selectedFixtureId;
        if (currentSelectedFixtureId) {
          e.preventDefault();
          const scene = useStore.getState().scene;
          const fixture = scene.fixtures?.get(currentSelectedFixtureId);
          if (fixture) {
            const oldRotation = fixture.rotation || 0;
            const newRotation = oldRotation + Math.PI / 2;
            
            const cmd = new RotateFixtureCommand(
              fixture.id,
              oldRotation,
              newRotation,
              () => useStore.getState().scene,
              setScene
            );
            
            history.push(cmd);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, history, setScene, setSelectedWallIds, setSelectedRoomId, setActiveTool]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();

    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      const stage = e.target.getStage();
      const pointer = stage.getPointerPosition();

      const delta = e.evt.deltaY;
      const scaleBy = 1.1;
      const oldScale = viewport.scale;
      const newScale = delta > 0 ? oldScale / scaleBy : oldScale * scaleBy;

      const clampedScale = Math.max(MIN_ZOOM_SCALE, Math.min(MAX_ZOOM_SCALE, newScale));

      const mousePointTo = {
        x: (pointer.x - viewport.centerX) / oldScale,
        y: -(pointer.y - viewport.centerY) / oldScale,
      };

      const newCenterX = pointer.x - mousePointTo.x * clampedScale;
      const newCenterY = pointer.y + mousePointTo.y * clampedScale;

      setViewport({
        centerX: newCenterX,
        centerY: newCenterY,
        scale: clampedScale,
      });

      rafIdRef.current = null;
    });
  }, [viewport, setViewport]);

  const handleMouseDown = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const modifiers = {
      ctrlKey: e.evt.ctrlKey || e.evt.metaKey,
      shiftKey: e.evt.shiftKey,
    };

    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerDown(pointer, scene, viewport, shiftKey);
    } else if (activeTool === 'select') {
      const worldPos = screenToWorld(pointer, viewport);
      const fixtureId = hitTestFixtures(worldPos, scene, NODE_RADIUS_MM);

      if (fixtureId) {
        setSelectedFixtureId(fixtureId);
        setSelectedWallIds(new Set());
        setSelectedRoomId(null);
        selectToolRef.current?.handlePointerDown(pointer, scene, viewport, modifiers); // hand off to SelectTool
        return;
      }

      setSelectedFixtureId(null);
      selectToolRef.current?.handlePointerDown(pointer, scene, viewport, modifiers);
    } else if (activeTool === 'measure') {
      measureToolRef.current?.handlePointerDown(pointer, scene, viewport);
    } else if (activeTool === 'fixture') {
      fixtureToolRef.current?.handlePointerDown(pointer, scene, viewport);
    }
  }, [activeTool, scene, viewport, shiftKey, setSelectedFixtureId, setSelectedWallIds, setSelectedRoomId]);

  const handleMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const buttons = e.evt.buttons;

    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerMove(pointer, scene, viewport, buttons, shiftKey);
    } else if (activeTool === 'select') {
      selectToolRef.current?.handlePointerMove(pointer, scene, viewport);
    } else if (activeTool === 'measure') {
      measureToolRef.current?.handlePointerMove(pointer, scene, viewport);
    } else if (activeTool === 'fixture') {
      fixtureToolRef.current?.handlePointerMove(pointer, scene, viewport);
    }
  }, [activeTool, scene, viewport, shiftKey]);

  const handleMouseUp = useCallback((e: any) => {
    const pointer = e.target.getStage().getPointerPosition();

    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerUp(pointer, scene, viewport, shiftKey);
    } else if (activeTool === 'select') {
      selectToolRef.current?.handlePointerUp(pointer, scene, viewport);
    } else if (activeTool === 'measure') {
      measureToolRef.current?.handlePointerUp(pointer, scene, viewport);
    }
  }, [activeTool, scene, viewport, shiftKey]);

  const showWallPreview = activeTool === 'wall' && wallToolContext?.state !== 'idle' && wallToolContext?.firstPointMm && wallToolContext?.currentPointMm;
  const showWallHover = activeTool === 'wall' && wallToolContext?.state === 'idle' && wallToolContext?.hoverPointMm;

  const allSnapCandidates: (any | null)[] = [];

  if (activeTool === 'wall') {
    allSnapCandidates.push(wallToolContext?.snapCandidate || null);
  } else if (activeTool === 'select') {
    allSnapCandidates.push(selectToolContext?.snapCandidateA || null);
    allSnapCandidates.push(selectToolContext?.snapCandidateB || null);
    allSnapCandidates.push(...(selectToolContext?.snapCandidates || []));
  } else if (activeTool === 'measure') {
    allSnapCandidates.push(measureToolContext?.snapCandidate || null);
  }

  const getCursorStyle = () => {
    if (activeTool === 'select') return 'default';
    if (activeTool === 'measure') return 'crosshair';
    if (activeTool === 'fixture') return 'crosshair';
    return 'crosshair';
  };

  const ghostFixture = useMemo(() => {
    if (
      activeTool === 'fixture' &&
      fixtureToolContext?.state === 'placing' &&
      fixtureToolContext.schema &&
      fixtureToolContext.ghostPositionMm
    ) {
      const params: Record<string, any> = {};
      for (const paramDef of fixtureToolContext.schema.params) {
        params[paramDef.key] = paramDef.default;
      }

      return {
        schema: fixtureToolContext.schema,
        positionMm: fixtureToolContext.ghostPositionMm,
        rotation: fixtureToolContext.ghostRotation,
        params,
      };
    }
    return null;
  }, [activeTool, fixtureToolContext]);

  return (
    <KonvaStage
      width={dimensions.width}
      height={dimensions.height}
      pixelRatio={window.devicePixelRatio}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ 
        display: 'block', 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        cursor: getCursorStyle()
      }}
    >
      <GridLayer />
      <RoomFillsLayer />
      <WallsLayer />
      <FixturesLayer ghostFixture={ghostFixture} />
      <RoomLabelsLayer />
      
      {showWallPreview && (
        <PreviewLayer
          previewWall={{
            startMm: wallToolContext.firstPointMm,
            endMm: wallToolContext.currentPointMm,
          }}
          hoverPoint={null}
        />
      )}

      {showWallHover && (
        <PreviewLayer
          previewWall={null}
          hoverPoint={wallToolContext.hoverPointMm}
        />
      )}

      <GuidesLayer snapCandidates={allSnapCandidates} />

      {selectToolContext?.state === 'marquee' && (
        <MarqueeLayer
          marqueeStart={selectToolContext.marqueeStart}
          marqueeCurrent={selectToolContext.marqueeCurrent}
        />
      )}

      <MeasureLayer measureContext={measureToolContext} />
      <RayVisualization />
    </KonvaStage>
  );
}