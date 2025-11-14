import { Stage as KonvaStage } from 'react-konva';
import { useCallback, useRef, useEffect, useState } from 'react';
import { GridLayer } from './layers/GridLayer';
import { RoomFillsLayer, RoomLabelsLayer } from './layers/RoomsLayer';
import { WallsLayer } from './layers/WallsLayer';
import { PreviewLayer } from './layers/PreviewLayer';
import { GuidesLayer } from './layers/GuidesLayer';
import { MarqueeLayer } from './layers/MarqueeLayer';
import { MeasureLayer } from './layers/MeasureLayer';
import { RayVisualization } from '../../ui/debug/RayVisualization';
import { useStore } from '../../state/store';
import { MIN_ZOOM_SCALE, MAX_ZOOM_SCALE } from '../../core/constants';
import { WallTool } from '../../tools/wall.tool';
import { SelectTool } from '../../tools/select.tool';
import { MeasureTool } from '../../tools/measure.tool';
import { AddWallCommand } from '../../core/commands/add-wall';
import { MoveNodeCommand } from '../../core/commands/move-node';
import { MergeNodesCommand } from '../../core/commands/merge-nodes';
import { DeleteWallsCommand } from '../../core/commands/delete-walls';
import { clearMiterCache } from '../../core/geometry/miter';
import type { Vec2 } from '../../core/math/vec';

const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (args[0]?.includes?.('Recommended maximum number of layers')) {
    return; // Skip this specific warning
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
  
  const rafIdRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 48,
  });

  const wallToolRef = useRef<WallTool | null>(null);
  const selectToolRef = useRef<SelectTool | null>(null);
  const measureToolRef = useRef<MeasureTool | null>(null);

  const [wallToolContext, setWallToolContext] = useState<any>(null);
  const [selectToolContext, setSelectToolContext] = useState<any>(null);
  const [measureToolContext, setMeasureToolContext] = useState<any>(null);

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
          // ✅ Mark as live dragging
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
            rooms: new Map() // ✅ Clear rooms during drag
          }, true); // skipRoomDetection = true
        },
        (nodePositions, mergeTargets) => {
          // ✅ End live drag
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
          
          // ✅ NEW: Force room re-detection after gesture completes
          // This ensures rooms are detected even if nodes moved by tiny amounts
          const finalScene = useStore.getState().scene;
          useStore.getState().detectAndUpdateRooms();
        }
      );
    }

    if (!measureToolRef.current) {
      measureToolRef.current = new MeasureTool(
        (ctx) => setMeasureToolContext(ctx)
      );
    }
  }, [history, setScene, setSelectedWallIds]);

  useEffect(() => {
    wallToolRef.current?.reset();
    selectToolRef.current?.reset();
    measureToolRef.current?.reset();
  }, [activeTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKey(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKey(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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
        
        if (currentSelectedWallIds.size > 0) {
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
        } else if (activeTool === 'measure') {
          measureToolRef.current?.reset();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, history, setScene, setSelectedWallIds, setSelectedRoomId]);

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
    const pointer = e.target.getStage().getPointerPosition();
    const modifiers = {
      ctrlKey: e.evt.ctrlKey,
      shiftKey: e.evt.shiftKey,
    };
    
    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerDown(pointer, scene, viewport, shiftKey);
    } else if (activeTool === 'select') {
      selectToolRef.current?.handlePointerDown(pointer, scene, viewport, modifiers);
    } else if (activeTool === 'measure') {
      measureToolRef.current?.handlePointerDown(pointer, scene, viewport);
    }
  }, [activeTool, scene, viewport, shiftKey]);

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
    return 'crosshair';
  };

  return (
    <KonvaStage
      width={dimensions.width}
      height={dimensions.height}
      pixelRatio={window.devicePixelRatio} // ✅ Sharp rendering
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