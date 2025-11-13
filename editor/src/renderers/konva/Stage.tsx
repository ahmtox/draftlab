import { Stage as KonvaStage } from 'react-konva';
import { useCallback, useRef, useEffect, useState } from 'react';
import { GridLayer } from './layers/GridLayer';
import { RoomsLayer } from './layers/RoomsLayer';
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
import type { Vec2 } from '../../core/math/vec';

export function Stage() {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const activeTool = useStore((state) => state.activeTool);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  const history = useStore((state) => state.history);
  const selectedWallIds = useStore((state) => state.selectedWallIds);
  const setSelectedWallIds = useStore((state) => state.setSelectedWallIds);
  const setSelectedRoomId = useStore((state) => state.setSelectedRoomId); // ✅ NEW
  
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

  // Track Shift key state
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
          // CRITICAL: Update both local state AND Zustand store immediately
          setSelectToolContext(ctx);
          setSelectedWallIds(ctx.selectedWallIds);
        },
        (wallIds, nodePositions) => {
          // Live preview during drag
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
            rooms: currentScene.rooms // Preserve rooms during drag
          });
        },
        (nodePositions, mergeTargets) => {
          // Commit multi-wall drag
          history.beginGesture();

          // Add MoveNodeCommands
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

          // Add MergeNodeCommands
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
        }
      );
    }

    // Initialize measure tool
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

  // Track Shift key globally
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      }
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        useStore.getState().redo();
      }
      // Delete/Backspace: Delete selected walls
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
          
          // Clear selection after delete
          setSelectedWallIds(new Set());
        }
      }
      // ✅ Escape: Clear selection (walls AND rooms) or cancel measurement
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (activeTool === 'select') {
          setSelectedWallIds(new Set());
          setSelectedRoomId(null); // ✅ Clear room selection too
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

  // Determine what preview to show
  const showWallPreview = activeTool === 'wall' && wallToolContext?.state !== 'idle' && wallToolContext?.firstPointMm && wallToolContext?.currentPointMm;
  const showWallHover = activeTool === 'wall' && wallToolContext?.state === 'idle' && wallToolContext?.hoverPointMm;

  // Collect snap candidates from all active tools
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

  // Determine cursor style based on tool
  const getCursorStyle = () => {
    if (activeTool === 'select') return 'default';
    if (activeTool === 'measure') return 'crosshair';
    return 'crosshair';
  };

  return (
    <KonvaStage
      width={dimensions.width}
      height={dimensions.height}
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
      {/* Z-ORDER: Bottom to Top per Architecture Spec */}
      
      {/* 1. Grid Layer (bottom) */}
      <GridLayer />
      
      {/* 2. Rooms Layer (fills below walls, labels on top) */}
      <RoomsLayer />
      
      {/* 3. Walls Layer */}
      <WallsLayer />
      
      {/* 4. Preview layers (above walls) */}
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

      {/* 5. Guides layer (snap indicators) */}
      <GuidesLayer snapCandidates={allSnapCandidates} />

      {/* 6. Marquee selection */}
      {selectToolContext?.state === 'marquee' && (
        <MarqueeLayer
          marqueeStart={selectToolContext.marqueeStart}
          marqueeCurrent={selectToolContext.marqueeCurrent}
        />
      )}

      {/* 7. Measure layer */}
      <MeasureLayer measureContext={measureToolContext} />

      {/* 8. Debug: Ray visualization (top) */}
      <RayVisualization />
    </KonvaStage>
  );
}