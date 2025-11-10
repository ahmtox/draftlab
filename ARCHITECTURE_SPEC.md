# DraftLab Architecture

A 2D/3D floorplanning application built with React, TypeScript, Konva.js (2D), and three.js (3D), designed around a **renderer-agnostic core** with command/diff semantics for maximum flexibility, testability, and future extensibility.

---

## Design Philosophy

**1. Separation of Concerns**

The architecture is layered to ensure that **geometry, constraints, and business logic** remain completely independent of **UI frameworks and rendering libraries**. This allows us to:

- Swap or upgrade renderers (Konva → Canvas API, or add WebGPU later) without touching core logic
- Add 3D rendering (three.js) as a parallel adapter consuming the same model
- Test geometry and constraint solvers in isolation
- Enable future collaboration features via event sourcing

**2. Command Pattern for All Mutations**

Every state change (adding a wall, moving a node, editing dimensions) flows through **command objects** that implement `execute()` and `undo()`. This provides:

- Robust undo/redo with arbitrary stack depth
- Optimistic UI updates with rollback on failure
- Serializable history for autosave and collaboration
- Transactional edits (drag gestures coalesce into a single command on commit)

**3. Renderer as Dumb Adapter**

Renderers (Konva, three.js) are **pure consumers** of model diffs. They:

- Subscribe to change events from the core
- Translate model entities → drawable primitives
- Publish user interactions (pointer events, selections) back to the tool layer
- Never mutate the model directly

**4. Tools as State Machines**

User interactions are handled by **tool objects** (WallTool, SelectTool, RoomTool) that:

- Run explicit finite state machines (idle → preview → placing → commit/cancel)
- Query the snapping engine for geometric assistance
- Emit commands on completion
- Support modal modifiers (Shift = snap to angles/square)

**5. Data-Driven Parametrics**

Walls, rooms, and fixtures are **parametric entities** with:

- Editable measurements (length, thickness, height)
- Constraint modes (inside/outside/center length definitions)
- Serializable parameter schemas for fixtures (doors, beds, stairs)
- Automatic recomputation of dependent geometry (miters, room boundaries)

---

## File Structure

```
/src
  /core                          # Framework-agnostic geometry & logic
    /math                        # Robust 2D/3D primitives
      vec.ts                     # Vector operations (add, sub, dot, cross, normalize, distance)
      angle.ts                   # Angle utilities (normalize, difference, snap to wheel)
      line.ts                    # Infinite line (point + direction)
      segment.ts                 # Finite segment (intersection, projection, distance)
      rect.ts                    # Axis-aligned bounding box
      robust.ts                  # Epsilon comparisons, tolerance helpers
    
    /geometry                    # High-level geometric operations
      miter.ts                   # Multi-wall join solver (L/T/X junctions)
      offset.ts                  # Wall edge computation from centerline + thickness
      snapping.ts                # Snap candidate scoring (grid, nodes, edges, angles)
      guides.ts                  # Guide line generation (extension, parallel, perpendicular)
      room-detect.ts             # Planar cycle detection with tolerance (finds faces)
      intersect.ts               # Line/segment/ray intersection routines
      opening.ts                 # Wall opening intervals for doors/windows (3D cuts)
    
    /topology                    # Graph data structure
      graph.ts                   # Nodes (points), edges (walls), faces (rooms)
      half-edge.ts               # Half-edge structure with left/right face refs
      index.ts                   # Spatial index (quadtree/R-tree) for hit-testing
      diff.ts                    # Change sets (entity-addressable patches)
      ids.ts                     # Stable ID generation and mapping
    
    /constraints                 # Parametric constraint system
      constraint.ts              # Model: locks, equalities, angle/length constraints
      solver.ts                  # Priority-based constraint resolver
    
    /domain                      # Core entity types
      types.ts                   # Node, Wall, Room, Fixture, Material, Opening definitions
      factories.ts               # Entity creation with validation
      validation.ts              # Zod/Yup schema validation for runtime safety
    
    /parametrics                 # Measurement & editing
      wall-params.ts             # Inside/outside/center length computation
      dimension.ts               # Dimension objects (anchor, value, format, edit mode)
    
    /commands                    # Command pattern implementation
      base-command.ts            # ICommand interface (execute, undo, canMergeWith, label)
      add-wall.ts                # Create wall between two nodes
      edit-wall.ts               # Change thickness, height, material
      move-node.ts               # Reposition node with constraint resolution
      set-dimension.ts           # Edit wall length via dimension input
      delete-entity.ts           # Remove wall/fixture/room
      history.ts                 # Undo/redo stack with gesture batching
    
    /fixtures                    # Parametric fixture system
      schema.ts                  # JSON schema for fixture definitions
      library.ts                 # Registry, categories, search index
      placement.ts               # Anchor rules (wall/room/floor), clearance checks
      opening-rules.ts           # How fixtures create wall openings (doors, windows)
    
    /io                          # Serialization & import/export
      serialize.ts               # Scene → JSON with versioning
      deserialize.ts             # JSON → Scene with validation
      migrate.ts                 # Schema migrations between versions
      /export
        svg.ts                   # Vector export (walls, rooms, dimensions)
        dxf.ts                   # AutoCAD DXF R2000/R2010
        pdf.ts                   # Print-ready PDF with scale and title block
        json.ts                  # Native format (full fidelity)
      /import
        json.ts                  # Load native scenes with migration
        dxf.ts                   # Parse DXF geometry (lossy, no constraints)
    
    /workers                     # Heavy computation off main thread
      room-worker.ts             # Planar cycle detection (transferable buffers)
      geom-worker.ts             # Boolean operations, large mesh processing
    
    constants.ts                 # Tolerances (epsilon, mergeTol, snapPx, colinearTolDeg)
    config.ts                    # Runtime configuration
    units.ts                     # Unit conversion & formatting (metric/imperial with fractions)
    events.ts                    # Typed event bus (entity-addressable diffs with reason)
    result.ts                    # Result<T, Error> type for worker boundaries

  /renderers                     # Rendering adapters
    /konva                       # 2D renderer
      stage.tsx                  # Konva Stage wrapper with pan/zoom
      viewport.ts                # Screen ↔ world coordinate conversions
      /layers                    # Separated layers for performance (Z-order: rooms → walls → fixtures → dimensions)
        walls-layer.tsx          # Wall polygons (thickness + miters)
        fixtures-layer.tsx       # Fixture symbols with openings
        guides-layer.tsx         # Snap guides and alignment helpers
        overlay-layer.tsx        # Selection handles, dimensions, hover effects
      /adapters                  # Model → Konva shape translation
        wall-adapter.ts          # Converts Wall → Group(polygon + centerline + handles)
        fixture-adapter.ts       # Converts Fixture → symbol path with transforms
      hit-testing.ts             # Maps Konva pointer events → core hit queries (screen & world)
    
    /three                       # 3D renderer
      scene.tsx                  # Canvas + OrbitControls + deterministic lighting rig
      coordinate-system.ts       # +X right, +Y up (2D) / +Z up (3D) adapters
      /builders                  # Model → three.js mesh translation
        wall-mesh.ts             # Extrude walls with subtractive openings (no CSG)
        fixture-mesh.ts          # Load fixture 3D models (GLTF) or procedural
        materials.ts             # Material library (PBR, textures, scaleUV per mm)

  /tools                         # Interaction state machines
    select.tool.ts               # Selection, marquee, move, rotate, scale
    wall.tool.ts                 # Click-twice or drag to create wall
    room.tool.ts                 # Four-wall polygon with square constraint on Shift
    fixture.tool.ts              # Place fixture from library with anchor preview
    measure.tool.ts              # Distance/angle measurement overlay
    panzoom.tool.ts              # Pan (drag) and zoom (wheel/pinch)
    dimension-edit.tool.ts       # Click dimension → inline input → execute SetDimensionCommand
    tool-registry.ts             # Activate/deactivate tools, keyboard shortcuts

  /state                         # Application state management
    store.ts                     # Zustand store (UI state + subscriptions)
    selectors.ts                 # Derived state (selected entities, active tool)
    actions.ts                   # UI-only actions (panel visibility, theme)
    bridge.ts                    # Subscribe to core diffs → dispatch store updates (skip on selection-only)
    ephemeral.ts                 # Transient state (hover, in-progress previews)

  /ui                            # React components (Tailwind CSS)
    App.tsx                      # Root component with layout grid
    /panels                      # Side panels
      Inspector.tsx              # Property editor for selected entity
      Layers.tsx                 # Layer visibility and ordering
      Library.tsx                # Fixture browser with search and categories
      Properties.tsx             # Wall/room parameters (length, thickness, height)
    /chrome                      # Top-level UI
      Toolbar.tsx                # Tool buttons, mode toggles (2D/3D)
      StatusBar.tsx              # Coordinates, zoom level, snap mode
      ShortcutsHelp.tsx          # Keyboard shortcut overlay
      UndoHistory.tsx            # Undo/redo with labeled gestures
    /dialogs                     # Modal dialogs
      ExportDialog.tsx           # Format, scale, layers, lineweights (StyleMap)
      ImportDialog.tsx           # File picker and import options
      Preferences.tsx            # Units, grid settings, snap tolerances

  /services                      # Application services
    event-bus.ts                 # Typed pub/sub for cross-component events
    autosave.ts                  # Debounced scene serialization with commit labels
    file-storage.ts              # IndexedDB wrapper for projects and assets
    plugin-registry.ts           # Plugin hooks (custom tools, fixtures, inspectors)

  /styles
    globals.css                  # Global styles and CSS variables
    tailwind.css                 # Tailwind imports

  main.tsx                       # React entry point
  routes.tsx                     # Client-side routing (project list, editor)
```

---

## Core Data Model

### World Units: Millimeters

**All internal coordinates and measurements use millimeters** as the base unit. This provides:

- **Integer-friendly precision**: Common dimensions (e.g., 2400mm door height) are whole numbers
- **Sub-millimeter accuracy**: `0.1mm` tolerance is easily representable as `0.1` without floating-point issues
- **Direct DXF/CAD alignment**: Most CAD tools default to millimeters
- **Human-scale granularity**: Residential/commercial architecture rarely needs sub-mm precision

**Conversion factors** (stored in `/core/units.ts`):
```typescript
export const MM_PER_METER = 1000;
export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;
```

### Entities

```typescript
// Node: geometric point in 2D space
type Node = {
  id: string;
  x: number;          // world units (millimeters)
  y: number;          // world units (millimeters)
  locked?: boolean;   // prevent snapping/editing
};

// Wall: centerline between two nodes with thickness
type Wall = {
  id: string;
  a: string;          // node ID (start)
  b: string;          // node ID (end)
  thickness: number;  // perpendicular to centerline (millimeters)
  height: number;     // for 3D extrusion (millimeters)
  materialId?: string;
  constraints?: {
    length?: { mode: 'inside'|'outside'|'center'; value: number }; // millimeters
    angleLock?: number; // radians, for snapping
  };
  openings?: Opening[]; // intervals for doors/windows (derived from fixtures)
  meta?: { name?: string };
};

// Opening: interval on a wall for 3D cuts and 2D breaks
type Opening = {
  fixtureId: string;
  t0: number;         // parametric start [0,1]
  t1: number;         // parametric end [0,1]
  height?: number;    // top of opening (millimeters)
};

// Room: detected face (cycle) in the wall graph
type Room = {
  id: string;
  boundary: string[]; // ordered edge (wall) IDs forming a closed loop
  leftFaces?: string[]; // half-edge left face refs for inside/outside
  areaCache?: number; // precomputed for performance (square millimeters)
};

// Fixture: parametric object placed on/in walls or rooms
type Fixture = {
  id: string;
  kind: string;       // key into library (e.g., 'door', 'bed', 'stairs')
  params: Record<string, number|string|boolean>; // all number params in millimeters
  anchor: {
    type: 'wall'|'room'|'floor';
    refId: string;    // ID of anchored entity
    t?: number;       // parametric position on wall [0,1]
  };
  rotation?: number;  // radians
};

// Material: appearance properties for walls and fixtures
type Material = {
  id: string;
  name: string;
  color: string;      // hex or CSS
  texture?: string;   // URL for 3D mode
  roughness?: number; // PBR properties
  metalness?: number;
  scaleUV?: [number, number]; // texture scale (u per mm, v per mm)
};
```

### Scene

```typescript
type Scene = {
  schema: { name: 'floor-core', version: number };
  units: 'metric' | 'imperial'; // display units only, internal always mm
  entities: {
    nodes: Record<string, Node>;
    walls: Record<string, Wall>;
    rooms: Record<string, Room>;
    fixtures: Record<string, Fixture>;
    materials?: Record<string, Material>;
  };
  views?: {
    camera2D?: { x: number; y: number; zoom: number }; // x,y in mm
    camera3D?: { 
      position: [number, number, number]; // mm
      target: [number, number, number];   // mm
      azimuth: number;    // deterministic light angle (radians)
      elevation: number;  // radians
    };
  };
  meta?: { title?: string; notes?: string };
};
```

---

## State Management

### Core Model State

The **source of truth** lives in `/core` as immutable data structures. All mutations flow through **commands**:

```typescript
interface ICommand {
  execute(): Result<Diff, Error>;  // apply change, return diff or error
  undo(): Result<Diff, Error>;     // reverse change, return diff or error
  canMergeWith(other: ICommand): boolean; // coalesce during drag
  merge?(other: ICommand): ICommand;
  label: string;                   // for undo UI and autosave commits
}

// Entity-addressable patches for efficient diffing
type EntityKey = ['node'|'wall'|'room'|'fixture', string];
type Patch = { 
  op: 'add'|'remove'|'replace'; 
  key: EntityKey; 
  value?: unknown;
  path?: string[]; // for nested property changes
};
type Diff = Patch[];

// Events include reason for filtering
type ChangeEvent = {
  diff: Diff;
  reason: 'command'|'migration'|'import'|'selection-only';
};
```

### Command Lifecycle with Gesture Batching

```typescript
// Start a multi-command gesture
history.beginGesture();

// Execute commands during drag
history.push(new MoveNodeCommand(nodeId, oldPos, pos1));
history.push(new MoveNodeCommand(nodeId, pos1, pos2));
// ... many more moves

// End gesture on pointer up - coalesces into single undo entry
history.endGesture({ label: 'Move Node' });

// Later: undo shows "Move Node" in UI, undoes entire gesture
```

### UI State (Zustand)

```typescript
type UIState = {
  // Selection
  selectedIds: Set<string>;
  hoveredId: string | null;
  
  // Active tool
  activeTool: ToolName;
  toolOptions: Record<string, any>;
  
  // Panels
  inspectorOpen: boolean;
  libraryOpen: boolean;
  layersOpen: boolean;
  
  // Viewport
  zoom: number;
  pan: { x: number; y: number }; // screen pixels
  mode: '2D' | '3D';
  
  // Transient
  inProgressPreview?: Wall | Fixture; // ghost during tool use
  snapTarget?: SnapResult;
};
```

### Bridge

The **bridge** (`/state/bridge.ts`) subscribes to core events and translates diffs into Zustand actions:

```typescript
core.on('change', (event: ChangeEvent) => {
  // Skip expensive updates for selection-only changes
  if (event.reason === 'selection-only') return;
  
  // Update spatial index
  indexService.applyDiff(event.diff);
  
  // Trigger room detection if topology changed
  if (hasTopologyChange(event.diff)) {
    const buffers = serializeForWorker(nodes, walls);
    roomWorker.postMessage(
      { type: 'detectRooms', buffers }, 
      [buffers.nodesArray.buffer, buffers.wallsArray.buffer]
    );
  }
  
  // Notify UI store
  uiStore.getState().handleModelChange(event.diff);
});
```

---

## Rendering Pipeline

### 2D (Konva)

**Layers (Z-order: bottom to top)**

1. **Grid Layer**: dots or lines, cached, only redraws on zoom
2. **Rooms Layer**: translucent fills, optional hatching (below walls per spec)
3. **Walls Layer**: filled polygons (thickness + miters), cached per wall
4. **Fixtures Layer**: symbols from library, cached per fixture (above walls per spec)
5. **Guides Layer**: snap guides (extension lines, axes), redrawn every RAF during tool use
6. **Overlay Layer**: selection handles, dimensions, hover highlights (top per spec)

**Viewport Transform** (`/renderers/konva/viewport.ts`):

```typescript
type Viewport = {
  // Screen center (canvas pixels)
  centerX: number;
  centerY: number;
  
  // Pixels per millimeter (zoom level)
  scale: number; // e.g., 0.5 = 1mm draws as 0.5px, 2 = 1mm draws as 2px
};

// World mm → Screen px
function worldToScreen(worldMm: Vec2, viewport: Viewport): Vec2 {
  return {
    x: viewport.centerX + worldMm.x * viewport.scale,
    y: viewport.centerY - worldMm.y * viewport.scale, // flip Y for screen coords
  };
}

// Screen px → World mm
function screenToWorld(screenPx: Vec2, viewport: Viewport): Vec2 {
  return {
    x: (screenPx.x - viewport.centerX) / viewport.scale,
    y: (viewport.centerY - screenPx.y) / viewport.scale, // flip Y
  };
}
```

**Update Flow**

```
Core emits Diff (all values in mm)
  → Bridge filters by reason
  → WallAdapter.applyDiff(diff)
    → For each modified wall:
      - Recompute offset edges (miter.ts, mm units)
      - Transform to screen coords via viewport
      - Redraw Konva.Group (polygon + optional centerline)
      - Update cached hit bounds (incremental AABB in mm)
  → Layer caching busted only for touched entities
```

**Performance: Centerline-Only During Drag**

For very large scenes (>1000 walls), enable a **draft mode** while dragging:
- Render only wall centerlines (thin lines)
- On gesture commit, paint full thickness polygons
- Reduces draw calls by ~80% during interaction

### 3D (three.js)

**Coordinate System**

- **2D**: +X right, +Y up (millimeters)
- **3D**: +X right, +Y up, +Z up (horizontal floor plane, millimeters)
- Adapter: no rotation needed; three.js uses same orientation

**Mesh Generation**

```
Wall (mm) → ExtrudeGeometry(offsetEdges, height)
  → Subtract openings via subtractive geometry (no full CSG)
  → Apply Material(color, texture with scaleUV, roughness)
  → Add to scene.walls group

Fixture → Load GLTF (scale if needed) or build procedural mesh
  → Position at anchor.refId with rotation (mm coords)
  → Add to scene.fixtures group
```

**UVs & Textures**

- Generate UVs along wall length (U) and height (V)
- Use `material.scaleUV?: [uPerMm, vPerMm]` to repeat textures per millimeter
- Default: brick texture repeats every 500mm (U), 250mm (V)
  - `scaleUV: [1/500, 1/250]`

**Deterministic Light Rig**

- Store `azimuth` (0-2π radians) and `elevation` (0-π/2 radians) in `views.camera3D`
- One directional light + ambient
- Exports and screenshots use same angles for consistency

**Shared Model**

Both renderers subscribe to the **same diffs**. Switching 2D ↔ 3D is just toggling which adapter is active; the scene data never duplicates.

---

## Wall Geometry & Mitering

### Centerline to Edges (Millimeter Units)

Walls are stored as **centerlines** (node A → node B, mm) with a `thickness` property (mm). To render:

1. Compute perpendicular normal: `n = perpendicular(normalize(B - A))`
2. Offset edges: `left = [A + n * thickness/2, B + n * thickness/2]`, `right = [A - n * thickness/2, B - n * thickness/2]`
   - All arithmetic in millimeters

### Mitering at Junctions

When multiple walls meet at a node, their offset edges must be **joined cleanly** using the half-edge structure:

**Algorithm** (`/core/geometry/miter.ts`):

1. For each wall incident to node N, compute its left and right offset edges (mm)
2. Query half-edge structure for left/right face adjacency
3. For each adjacent pair of walls (sorted by angle):
   - Intersect `wall[i].right` with `wall[i+1].left`
   - Use intersection as the corner point (mm)
4. Handle degenerate cases (parallel walls, obtuse angles >170°) with butt or bevel fallbacks
5. Return a **polygon** (mm) for each wall that connects its offsets via miter points

**Join Types** (per node, overridable):

- **Miter**: extend edges until they intersect (default)
- **Bevel**: flat cut across the corner
- **Round**: arc (future, for curved walls)

---

## Snapping System

### Candidates & Queries (Millimeter Units)

During pointer move, the snapping engine queries a **spatial index** using **explicit screen/world contracts**:

```typescript
// World-space query (for programmatic/worker ops, mm)
queryNearPoint(worldMm: Vec2, radiusMm: number): Candidate[];

// Screen-space query (for interactive snapping, stable across zoom)
queryInScreenRadius(screenPx: Vec2, pxRadius: number, view: Viewport): Candidate[];
// Internally converts pxRadius to mm via viewport.scale before querying
```

**Nearby entities** (within `snapPx` screen pixels, converted to mm for distance checks):

- **Grid points** (if grid snapping enabled, grid spacing in mm)
- **Nodes** (endpoints of walls, mm coords)
- **Edge projections** (closest point on wall centerlines or room boundaries, mm)
- **Angle wheel** (15° increments from starting point when Shift held)
- **Guide lines** (parallel/perpendicular to nearby walls, extensions of walls, mm)

### Scoring with Hysteresis

```typescript
type SnapCandidate = {
  point: Vec2;        // mm world coords
  type: 'grid'|'node'|'edge'|'angle'|'guide';
  entityId?: string;  // for node/edge snaps
  priority: number;   // higher = stronger
  distance: number;   // to cursor (screen pixels for display, mm for ranking)
};
```

**Rules**:

- **Hysteresis**: if a candidate was active last frame and still valid, boost its priority by 1.2× (prevents jitter)
- **Distance weighting**: candidates within `snapPx` screen pixels are ranked; closest wins if priorities equal
- **Constraint stacking**: Shift+angle wheel (priority 9) overrides grid/node/edge snaps (priority 1-5)

### Guides

Guides are **visual feedback** lines drawn when a snap is active:

- **Extension guides**: extend wall centerlines beyond their endpoints (mm)
- **Axis guides**: horizontal/vertical lines through nearby nodes (mm)
- **Parallel/perpendicular guides**: show alignment with other walls (mm)

Generated by `/core/geometry/guides.ts` and rendered in a separate Konva layer for cheap RAF updates.

---

## Constraints & Parametrics

### Wall Length Modes (Millimeter Values)

Walls can have a **length constraint** with three modes:

```typescript
{ mode: 'inside'|'outside'|'center'; value: number } // value in mm
```

- **Inside**: dimension measured between inner edges (accounting for thickness of joined walls, using half-edge left/right faces, mm)
- **Outside**: dimension measured between outer edges (mm)
- **Center**: dimension measured along centerline (ignores thickness, mm)

When a dimension is edited (`SetDimensionCommand`):

1. Compute current length in the specified mode using half-edge faces (mm)
2. Calculate delta: `Δ = newLengthMm - currentLengthMm`
3. Move node B along the wall's direction by `Δ` (mm)
4. Re-run miter solver at affected junctions
5. Update room boundaries if topology changed (trigger worker)

### Room Constraints

The **RoomTool** can apply a **square constraint** (when Shift held):

1. User clicks first corner
2. Tool enters "square mode": cursor movement defines one side
3. Snap side length to grid (using screen-space snap with `snapPx`, converted to mm)
4. Generate four walls forming a square (all in mm)
5. Store constraint so future edits (dragging a corner) maintain squareness via constraint solver

---

## Room Detection

### Algorithm with Half-Edge Structure (Millimeter Tolerance)

Rooms are **planar cycles** in the wall graph, detected via:

1. Build half-edge data structure from wall topology with left/right face refs
2. Walk half-edges to find minimal cycles (faces)
3. Use half-edge orientation to determine "inside" vs "outside"
4. Filter out the "outer face" (unbounded region)
5. Ensure cycles are consistently oriented (clockwise or counter-clockwise)
6. Compute area and perimeter; cache in `Room` entity (area in mm², perimeter in mm)

**Tolerance Handling** (centralized in `/core/constants.ts`):

```typescript
type Tol = {
  epsilon: number;         // 1e-6 for float comparison
  mergeTol: number;        // 1mm for coincident nodes
  snapPx: number;          // 10px screen-space snap radius
  colinearTolDeg: number;  // 1° for merging near-parallel edges
  angleTolRad: number;     // 0.0175 rad (~1°) for angle snapping
};

const DEFAULT_TOL: Tol = {
  epsilon: 1e-6,
  mergeTol: 1.0,      // 1mm in world units
  snapPx: 10,
  colinearTolDeg: 1,
  angleTolRad: 0.0175,
};
```

- Treat nodes within `mergeTol` (1mm) as coincident
- Close small gaps automatically during detection
- Emit warnings if gaps > `mergeTol` but < `warningThreshold` (10mm)
- Use `colinearTolDeg` (1°) to merge near-parallel edges

**Worker Thread with Transferable Buffers**:

Room detection runs in `/core/workers/room-worker.ts` to avoid blocking UI during large scenes:

```typescript
// Main thread (all coords in mm)
const buffers = {
  nodesArray: new Float64Array(nodes.flatMap(n => [n.x, n.y])), // mm
  wallsArray: new Int32Array(walls.flatMap(w => [w.aIndex, w.bIndex]))
};
roomWorker.postMessage(
  { type: 'detectRooms', buffers, tolerances: DEFAULT_TOL }, 
  [buffers.nodesArray.buffer, buffers.wallsArray.buffer]
);

// Worker returns diff
roomWorker.onmessage = (e) => {
  const diff: Diff = e.data.diff; // added/removed Room entities
  core.applyDiff(diff, 'worker');
};
```

Results are posted back as a diff (added/removed `Room` entities), typically < 50ms for 100 walls.

---

## Fixtures & Parametrics

### Schema with Opening Rules (Millimeter Params)

```typescript
type FixtureSchema = {
  id: string;
  name: string;
  category: 'doors'|'windows'|'furniture'|'stairs'|'appliances';
  params: ParamDef[];       // user-editable parameters (numeric values in mm)
  symbol2D: (params: Record<string, any>) => Path2D | SVGElement;
  mesh3D?: (params: Record<string, any>) => Mesh | Promise<GLTF>;
  anchors: AnchorRule[];
  clearances?: ClearanceRule[];
  openingRule?: OpeningRule; // how this fixture creates wall openings
};

type ParamDef = {
  key: string;
  label: string;
  type: 'number'|'range'|'enum'|'color';
  default: any;       // for numbers: millimeters
  min?: number;       // millimeters
  max?: number;       // millimeters
  step?: number;      // millimeters
};

type AnchorRule = {
  type: 'wall'|'room'|'floor';
  offset?: { x: number; y: number }; // local to anchor (millimeters)
  snapToCenter?: boolean;
};

type OpeningRule = {
  widthParam: string;        // key into fixture.params (mm)
  heightParam?: string;      // for windows (leave undefined for doors = full height, mm)
  depthMode: 'cut'|'inset';  // cut = punch through, inset = recessed
};
```

### Opening Generation (Millimeter Calculations)

When a fixture with an `openingRule` is placed on a wall:

1. Query wall length (mm) and fixture `t` position
2. Compute `t0 = t - (widthMm/2)/wallLengthMm`, `t1 = t + (widthMm/2)/wallLengthMm`
3. Clamp to [0,1] and validate no overlap with existing openings
4. Append to `wall.openings` array
5. 2D renderer: break wall polygon at `[t0, t1]` to show gap
6. 3D builder: subtract opening volume from extruded wall mesh (mm coords)

### Library (Millimeter Defaults)

Fixtures are registered in `/core/fixtures/library.ts`:

```typescript
const fixtureLibrary = new Map<string, FixtureSchema>();

fixtureLibrary.set('door', {
  id: 'door',
  name: 'Door',
  category: 'doors',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 900, min: 600, max: 1500, step: 100 }, // mm
    { key: 'swing', label: 'Swing', type: 'enum', default: 'left', values: ['left', 'right'] },
    { key: 'height', label: 'Height', type: 'number', default: 2100 }, // mm
  ],
  symbol2D: (p) => createDoorSymbol(p.width, p.swing), // p.width in mm
  openingRule: { widthParam: 'width', depthMode: 'cut' },
  anchors: [{ type: 'wall', snapToCenter: true }],
});
```

### Placement

When placing a fixture (`FixtureTool`):

1. User selects from library (opens `Library` panel)
2. Tool enters "placing" mode with ghost preview
3. Cursor snaps to valid anchors using screen-space queries (walls at `t ∈ [0,1]`, room floor points, mm coords)
4. On click, execute `AddFixtureCommand({ kind, params, anchor, rotation })`
5. Command also updates `wall.openings` if `openingRule` present

**Clearance Checks** (future):

Fixtures can define `clearances` (e.g., "door needs 1000mm swing radius"). On placement/edit, check for intersections with walls/fixtures; warn if violated.

---

## Commands & History

### Command Interface with Labels

```typescript
interface ICommand {
  execute(): Result<Diff, Error>;
  undo(): Result<Diff, Error>;
  canMergeWith(other: ICommand): boolean;
  merge?(other: ICommand): ICommand;
  label: string; // for undo UI ("Move Node", "Add Wall", "Set Dimension")
}

// Result type for error handling across workers
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

### Gesture Batching

```typescript
// History manager API
class History {
  beginGesture(): void;
  push(cmd: ICommand): void;
  endGesture(meta: { label: string }): void;
  undo(): Result<Diff, Error>;
  redo(): Result<Diff, Error>;
  clear(): void;
}

// Usage during drag (all positions in mm)
onPointerDown() {
  this.history.beginGesture();
}

onPointerMove(posMm: Vec2) {
  const cmd = new MoveNodeCommand(this.nodeId, this.lastPosMm, posMm);
  this.history.push(cmd);
  this.lastPosMm = posMm;
}

onPointerUp() {
  this.history.endGesture({ label: 'Move Node' });
  // Undo stack now has single entry "Move Node" that undoes entire drag
}
```

### Merging (Drag Coalescing)

During a drag gesture, pointer moves generate many small `MoveNodeCommand`s. To avoid polluting the undo stack:

```typescript
class MoveNodeCommand implements ICommand {
  canMergeWith(other: ICommand): boolean {
    return other instanceof MoveNodeCommand && other.nodeId === this.nodeId;
  }
  
  merge(other: MoveNodeCommand): MoveNodeCommand {
    return new MoveNodeCommand(this.nodeId, this.oldPosMm, other.newPosMm);
  }
}
```

`endGesture()` collapses all pending moves into one with the provided label.

---

## Tools

### WallTool

**States**:

- **idle**: awaiting first click
- **firstPoint**: first node placed, awaiting second click or drag
- **preview**: showing ghost wall with snapping (RAF updates, mm coords)
- **placing**: mouse down and dragging (updates preview)
- **commit**: mouse up → `endGesture({ label: 'Add Wall' })` → execute `AddWallCommand`

**Shift Modifier**:

- Activates **angle wheel snapping** (15° increments from first point)
- Snapping engine adds `{ type: 'angle', priority: 9 }` candidates
- Overrides grid/node snaps via priority system

### RoomTool

**States**:

- **idle** → **corner1** → **corner2** → **corner3** → **corner4** → **commit**

**Shift Modifier**:

- Enforces **square constraint**: after corner1, cursor movement defines side length; all four sides are equal (mm)
- Snap side length to grid using screen-space `snapPx` for clean dimensions
- Constraint solver maintains squareness on future edits

**Execution**:

Executes a **compound command** with single label: `AddRoomCommand` that internally creates four `AddWallCommand`s and one `Room` entity.

### SelectTool

**Features**:

- Click entity → select (Ctrl/Cmd = multi-select)
- Marquee drag → select all intersecting entities (screen-space AABB query, converted to mm for bounds)
- Drag selected node → `beginGesture()` + `MoveNodeCommand`s (mm) + `endGesture({ label: 'Move Node' })`
- Drag selected wall → translate both nodes with constraint solving (mm)
- Handles for rotate/scale (future)

**Hit-Testing with Slop**:

- Define hit areas in **screen pixels** (`hitSlopPx = 8`) for stable interaction
- Resolve edits in **world coordinates (mm)** using viewport transform
- See `/renderers/konva/hit-testing.ts` for conversion

---

## Numeric Robustness

### Centralized Tolerances (Millimeter Units)

All geometry helpers accept a `Tol` object from `/core/constants.ts`:

```typescript
type Tol = {
  epsilon: number;         // 1e-6 for float comparison
  mergeTol: number;        // 1mm for coincident nodes
  snapPx: number;          // 10px screen-space snap radius
  colinearTolDeg: number;  // 1° for merging near-parallel edges
  angleTolRad: number;     // 0.0175 rad for angle snapping
};

const DEFAULT_TOL: Tol = {
  epsilon: 1e-6,
  mergeTol: 1.0,      // 1mm
  snapPx: 10,
  colinearTolDeg: 1,
  angleTolRad: 0.0175,
};
```

**Usage in geometry operations**:

```typescript
// vec.ts (all coords in mm)
export function almostEqual(a: Vec2, b: Vec2, tol: Tol): boolean {
  return distance(a, b) < tol.mergeTol; // 1mm tolerance
}

// segment.ts (all coords in mm)
export function intersect(s1: Segment, s2: Segment, tol: Tol): Vec2 | null {
  // use tol.epsilon for determinant check
}
```

No magic numbers in algorithms; all tolerances tunable per scene or tool.

---

## Units & Formatting

### Internal vs Display

- **Internal units**: always **millimeters** in core (geometry, storage, commands)
- **Display/parse**: metric (m, cm, mm) or imperial (ft-in with fractions) based on `scene.units`

### Formatting API

```typescript
// /core/units.ts
export const MM_PER_METER = 1000;
export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

export function formatLength(mm: number, units: 'metric'|'imperial'): string {
  if (units === 'metric') {
    if (mm < 1000) return `${Math.round(mm)} mm`;
    return `${(mm / 1000).toFixed(2)} m`;
  } else {
    const totalInches = mm / MM_PER_INCH;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    const wholeInches = Math.floor(inches);
    const frac = toFraction(inches - wholeInches); // e.g., "1/2", "3/4"
    return `${feet}'-${wholeInches}${frac ? ` ${frac}` : ''}"`;
  }
}

export function parseLength(input: string, units: 'metric'|'imperial'): number {
  // Returns millimeters
  // Parses "1'-3 1/2"" → mm
  // Parses "120 mm" → 120
  // Parses "1.5 m" → 1500
}

function toFraction(decimal: number): string {
  // Converts 0.5 → "1/2", 0.75 → "3/4", etc.
  // Supports 1/2, 1/4, 1/8, 1/16 denominators
}

// Utility for converting user input to mm
export function toMm(value: number, fromUnit: 'm'|'cm'|'mm'|'in'|'ft'): number {
  switch (fromUnit) {
    case 'm': return value * 1000;
    case 'cm': return value * 10;
    case 'mm': return value;
    case 'in': return value * MM_PER_INCH;
    case 'ft': return value * MM_PER_FOOT;
  }
}
```

**Usage in dimension rendering**:

```typescript
// overlay-layer.tsx
const lengthMm = wall.length; // already in mm
const lengthStr = formatLength(lengthMm, scene.units);
// Renders "3500 mm" or "3.50 m" or "11'-5 3/4""
```

---

## Multi-Project Persistence

### Storage Design

**IndexedDB Schema** (via `/services/file-storage.ts`):

```
Database: 'draftlab'

ObjectStores:
  - projects: { id, name, version, createdAt, updatedAt, units, tags[], thumbnailBlobId }
    Indexes: (name, updatedAt, tags)
  
  - scenes: { projectId, sceneVersion, json }
    Index: (projectId)
    # json contains all geometry in mm
  
  - assets: { id, projectId, kind, mime, bytes }
    Index: (projectId)
```

**API**:

```typescript
interface ProjectStore {
  createProject(name: string): Promise<ProjectMeta>;
  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<ProjectMeta>;
  saveScene(projectId: string, scene: Scene): Promise<void>; // scene coords in mm
  loadScene(projectId: string): Promise<Scene>; // returns scene coords in mm
  saveThumbnail(projectId: string, png: Blob): Promise<string>;
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string, newName?: string): Promise<ProjectMeta>;
}
```

**Autosave with Commit Labels**:

Debounced (2s) on every `endGesture()`. Saves:

- **Scene JSON** to `scenes` store with `sceneVersion` incremented (all coords in mm)
- **Thumbnail PNG** (rendered from Konva or three.js canvas) to `assets`
- **Commit message** from gesture label (e.g., "Move Node", "Add Wall")

**Cloud Sync (Optional)**:

The same API can be backed by a REST/GraphQL/Firebase adapter. The app checks for a `SYNC_BACKEND` env var and swaps implementations transparently. Diffs with `reason: 'selection-only'` are never synced.

---

## Import/Export

### Design Once, Render Anywhere

All exporters live in `/core/io/export/` and consume the **core Scene model** (all in mm, not Konva/three.js objects). This ensures exports are consistent regardless of active renderer.

### StyleMap for Paper-Space

Define stroke widths and colors in **paper-space millimeters**:

```typescript
type StyleMap = {
  layers: Record<string, {
    stroke: string;       // CSS color or hex
    strokeWidth: number;  // mm on paper
    fill?: string;
    vectorEffect?: 'non-scaling-stroke'; // for SVG screen rendering
  }>;
};

const DEFAULT_STYLES: StyleMap = {
  layers: {
    walls: { stroke: '#000', strokeWidth: 0.5 },
    wallEdges: { stroke: '#666', strokeWidth: 0.2 },
    rooms: { stroke: '#999', strokeWidth: 0.1, fill: '#f0f0f0' },
    fixtures: { stroke: '#333', strokeWidth: 0.3 },
    dimensions: { stroke: '#00f', strokeWidth: 0.15 },
  }
};
```

**Usage**:

- **SVG**: map to `vector-effect:non-scaling-stroke` for screen, fixed widths for print
- **DXF**: convert mm → DXF lineweight units (1 DXF unit = 0.01mm, so 0.5mm = 50 lineweight)
- **PDF**: use mm directly in page points (1pt = 0.3527mm)

### Formats

#### JSON (Native)

- Full fidelity: constraints, IDs, history, materials (all coords in mm)
- Versioned schema with migrations
- Used for autosave and project interchange

#### SVG (Vector Print)

- **Layers**: `<g id="rooms">`, `<g id="walls">`, `<g id="fixtures">`, `<g id="dimensions">` (Z-order per spec)
- **Units**: `viewBox` in millimeters; `width/height` in mm for print
- **Styles**: CSS classes per layer from StyleMap; exportable as standalone file or embedded in HTML

**Algorithm**:

```typescript
export function exportSVG(scene: Scene, opts: ExportOptions): string {
  const styleMap = opts.styleMap ?? DEFAULT_STYLES;
  // viewBox in mm
  const svg = ['<svg xmlns="..." viewBox="0 0 10000 10000">'];
  
  // Rooms layer (below walls per Z-order)
  svg.push(`<g id="rooms" style="stroke:${styleMap.layers.rooms.stroke}...">`);
  for (const room of Object.values(scene.entities.rooms)) {
    const path = buildRoomPath(room, scene); // path coords in mm
    svg.push(`<path d="${path}" />`);
  }
  svg.push('</g>');
  
  // Walls layer (coords in mm)
  svg.push(`<g id="walls" style="stroke:${styleMap.layers.walls.stroke}...">`);
  for (const wall of Object.values(scene.entities.walls)) {
    const [left, right] = computeOffsetEdges(wall, scene.entities.nodes); // mm
    const path = buildMiterPolygon(wall, left, right); // mm
    svg.push(`<path d="${path}" />`);
  }
  svg.push('</g>');
  
  // Fixtures, dimensions...
  
  svg.push('</svg>');
  return svg.join('\n');
}
```

#### DXF (CAD Interop)

- **Dialect**: R2000/R2010 (maximum compatibility)
- **Units**: DXF typically uses millimeters, so 1:1 mapping from our internal mm
- **Layers**: `A-WALL`, `A-WALL-CL` (centerlines optional), `A-ROOM`, `A-FIXTURE`, `A-DIMS`
- **Entities**:
  - Walls → `LWPOLYLINE` (offset boundaries with miters, closed, coords in mm)
  - Rooms → `LWPOLYLINE` (closed, mm) + optional `HATCH` (SOLID)
  - Fixtures → `BLOCK` definitions + `INSERT` instances with `ATTRIB`s for parameters (mm)
  - Dimensions → fallback to `LINE` + `TEXT` (real `DIMENSION` entities behind toggle "beta", mm)

**Caveats**:

- Export is **lossy**: constraints and parametrics are baked into geometry
- Import (future) will reconstruct centerlines from edge pairs with `mergeTol` (1mm) tolerance

**Algorithm**:

```typescript
export function exportDXF(scene: Scene, opts: ExportOptions): Uint8Array {
  const dxf = new DXFWriter();
  
  // HEADER: units (millimeters)
  dxf.setHeader('$INSUNITS', 4); // 4 = millimeters
  dxf.setHeader('$MEASUREMENT', 1); // 1 = metric
  
  // TABLES: layers, linetypes
  dxf.addLayer('A-WALL', { color: 7, lineweight: 50 }); // 0.50mm
  dxf.addLayer('A-ROOM', { color: 8, lineweight: 13 }); // 0.13mm
  
  // BLOCKS: fixture definitions (coords in mm)
  for (const [kind, schema] of fixtureLibrary) {
    const blockPath = schema.symbol2D({}).toPath(); // simplified, mm
    dxf.addBlock(kind, blockPath);
  }
  
  // ENTITIES: walls as LWPOLYLINE (coords in mm)
  for (const wall of Object.values(scene.entities.walls)) {
    const poly = buildMiterPolygon(wall, ...); // mm
    dxf.addLWPolyline('A-WALL', poly, { closed: true });
  }
  
  // Fixtures as INSERT, rooms as HATCH...
  
  return dxf.toBytes();
}
```

#### PDF (Print-Ready)

- **Page setup**: A4, Letter, Arch D, etc.
- **Scale**: user-defined (e.g., 1:50 means 1mm on paper = 50mm in world)
- **Title block**: optional metadata (project name, date, scale)
- **Tiling**: explicitly punted for MVP (single-page only); state in export dialog

**Scale Math**:

- Let `S = worldMmPerPaperMm`
- Example, 1:50 scale: `S = 50` (1mm on paper = 50mm in world)
- Example, 1:100 scale: `S = 100`

**Algorithm**:

```typescript
export async function exportPDF(scene: Scene, opts: ExportOptions): Promise<Blob> {
  const pdf = new PDFDocument({ size: opts.pageSize, layout: 'landscape' });
  
  // Compute scale transform: world mm → page points (1pt = 0.3527mm)
  const mmToPt = 1 / 0.3527; // ~2.83465
  const scale = mmToPt / opts.scale; // opts.scale = worldMmPerPaperMm
  pdf.scale(scale);
  
  // Apply StyleMap lineweights (paper mm → points)
  const lineWidthPt = opts.styleMap.layers.walls.strokeWidth * mmToPt;
  
  // Draw walls as vector paths (coords in world mm, scaled to paper)
  for (const wall of Object.values(scene.entities.walls)) {
    const poly = buildMiterPolygon(wall, ...); // world mm
    pdf.lineWidth(lineWidthPt);
    pdf.polygon(poly).stroke();
  }
  
  // Rooms, fixtures, dimensions with precomputed text metrics (no browser measurement)...
  
  return pdf.toBlob();
}
```

**Text Metrics**: Precompute a "paper mm → px" function using a known font (e.g., Helvetica 10pt); never rely on browser text measurement during export.

---

## Performance Optimizations

### Konva Layer Caching

- **Per-entity caching**: enable `cache()` on wall/fixture Groups after edits
- **Layer-level caching**: cache entire Walls/Rooms layers when no edits in progress
- **Bust strategy**: only invalidate touched entities via incremental AABB tracking (mm bounds)
- **Never cache globally**: cache per layer or entity to avoid stale data

### Pointer Event Throttling

- **RAF batching**: coalesce `pointermove` events to one update per frame (16ms)
- **Predictive snapping**: compute snap candidates ahead of cursor for smoother feel

### Spatial Index Incremental Updates

- **Touched AABBs**: only rebuild quadtree/R-tree quadrants containing modified entities (mm bounds)
- **No full rebuild**: on drag, mark dirty regions and update incrementally on gesture end

### Draft Mode During Drag

For scenes >1000 walls, enable **centerline-only rendering** while dragging:

```typescript
onGestureStart() {
  if (scene.entities.walls.size > 1000) {
    wallsLayer.cache(); // cache current state
    wallsLayer.setDraftMode(true); // switch to centerlines
  }
}

onGestureEnd() {
  wallsLayer.setDraftMode(false); // paint full thickness polygons
  wallsLayer.cache(); // re-cache
}
```

Reduces draw calls by ~80% during interaction.

---

## Extensibility

### Plugin System

Plugins register via `/services/plugin-registry.ts`:

```typescript
type Plugin = {
  id: string;
  name: string;
  version: string;
  init(api: PluginAPI): void;
};

interface PluginAPI {
  registerTool(tool: ITool): void;
  registerFixture(schema: FixtureSchema): void; // all params in mm
  registerCommand(cmdFactory: CommandFactory): void;
  registerInspectorSection(component: React.FC): void;
  on(event: string, handler: Function): void;
}
```

**Example** (custom door with parametric arch, mm params):

```typescript
const archDoorPlugin: Plugin = {
  id: 'arch-door',
  name: 'Arched Door',
  version: '1.0.0',
  init(api) {
    api.registerFixture({
      id: 'arch-door',
      name: 'Arched Door',
      category: 'doors',
      params: [
        { key: 'width', type: 'number', default: 1000, min: 600, max: 1500, step: 100 }, // mm
        { key: 'archHeight', type: 'number', default: 300, min: 100, max: 500, step: 50 }, // mm
      ],
      symbol2D: (p) => buildArchSymbol(p.width, p.archHeight), // p.width, p.archHeight in mm
      openingRule: { widthParam: 'width', depthMode: 'cut' },
      anchors: [{ type: 'wall' }],
    });
  },
};
```

---

## Testing Strategy

### Unit Tests (Vitest)

- **Math primitives**: property-based tests (e.g., `vec.normalize(v).length() ≈ 1`, mm coords)
- **Geometry**: golden tests for miter intersections, offsets, room detection (mm inputs/outputs)
- **Commands**: execute/undo idempotence, diff correctness, label preservation (mm coords)
- **Serialization**: round-trip equality, migration stability (mm preserved)
- **Tolerance handling**: verify `almostEqual` with various `Tol` configs (1mm default)

### Integration Tests

- **Renderer adapters**: mock core diffs (mm), verify Konva/three objects created correctly
- **Tools**: simulate pointer events (screen px → mm conversion), assert commands emitted with correct labels (mm coords)
- **Workers**: test transferable buffer round-trips (mm arrays)

### E2E Tests (Playwright)

- **Gestures**: double-click to add wall, Shift+drag for square room, dimension editing (verify mm values)
- **Undo/redo**: create wall → undo → verify scene state (mm coords) → redo → verify
- **Export**: generate SVG/DXF/PDF, parse outputs, verify entities present with correct Z-order and mm coords
- **Multi-project**: create project, save, reload, verify scene integrity and thumbnail (mm preserved)

---

## MVP Checklist

### Phase 1: Core Foundation

1. ✅ **Core types**: Node, Wall, Room, Fixture, Material, Opening (all in mm)
2. ✅ **Math library**: vec, segment, angle, rect with centralized `Tol` (mm units)
3. ✅ **Geometry**: offset, miter, intersect with tolerance (mm)
4. ✅ **Topology**: graph, half-edge structure with left/right faces (mm coords)
5. ✅ **Spatial index**: quadtree with screen/world query contracts (mm)
6. ✅ **Commands**: base interface with `label`, `Result<T, Error>`
7. ✅ **History**: undo/redo with gesture batching (`beginGesture` / `endGesture`)

### Phase 2: Basic Editing

8. ✅ **Commands**: AddWall, MoveNode, SetWallLength (inside/center/outside using half-edges, mm)
9. ✅ **Snapping**: node ↔ node, node ↔ edge, 15° wheel (Shift) with screen-space queries (mm distances)
10. ✅ **WallTool**: click-twice or drag, with preview and Shift angle wheel (mm coords)
11. ✅ **SelectTool**: click, marquee, drag with gesture batching (mm coords)
12. ✅ **Konva adapter**: walls layer with miters, handles, hover (incremental cache, mm → screen transform)

### Phase 3: Rooms & Dimensions

13. ✅ **Room detection**: worker with transferable buffers, half-edge cycles (mm coords, 1mm tolerance)
14. ✅ **RoomTool**: four-wall polygon, Shift = square constraint (mm)
15. ✅ **Dimensions**: display with `formatLength`, edit with `SetDimensionCommand` (mm internal)
16. ✅ **Guides layer**: extension, axis, parallel/perpendicular (RAF updates, mm coords)

### Phase 4: Fixtures & Openings

17. ✅ **Fixture library**: schema with `openingRule` (params in mm)
18. ✅ **Opening generation**: update `wall.openings` on fixture placement (mm intervals)
19. ✅ **2D rendering**: break wall polygons at openings (mm coords)
20. ✅ **FixtureTool**: drag-to-place with anchor snapping (mm coords)

### Phase 5: Persistence & Export

21. ✅ **IndexedDB store**: projects, scenes, assets with thumbnails (scenes store mm coords)
22. ✅ **Autosave**: debounced with commit labels from gestures (mm preserved)
23. ✅ **Serialization**: versioned JSON with migrations (mm units)
24. ✅ **Export SVG**: walls, rooms, fixtures, dimensions with StyleMap and Z-order (viewBox in mm)
25. ⏸️ **Export DXF**: LWPOLYLINE walls, HATCH rooms, BLOCK fixtures (mm coords, Phase 2)
26. ⏸️ **Export PDF**: single-page with scale and title block (mm → paper mm transform, Phase 2)

### Phase 6: 3D Mode (Future)

27. ⏸️ **three.js adapter**: extrude walls with openings (subtractive, no CSG, mm coords)
28. ⏸️ **Coordinate system**: +X/+Y/+Z adapters (mm scale)
29. ⏸️ **Materials**: textures with `scaleUV` per mm, PBR properties
30. ⏸️ **Light rig**: deterministic azimuth/elevation in `views.camera3D` (radians)
31. ⏸️ **3D fixtures**: GLTF loading (scale to mm) or procedural meshes

---

## Technology Choices: Rationale

| Choice | Rationale |
|--------|-----------|
| **TypeScript** | Type safety for complex geometry; self-documenting APIs; refactor confidence |
| **Millimeters as base unit** | Integer-friendly (2400mm not 2.4m), sub-mm precision (0.1mm = 0.1), CAD-standard, human-scale granularity |
| **Konva.js** | Canvas-based 2D with layer caching, hit-testing, and transform helpers; faster than SVG for many shapes; explicit screen/world queries |
| **three.js** | De-facto standard for WebGL; mature extrusion/material/lighting APIs; large community; deterministic rendering with stored camera params |
| **React** | Component model maps cleanly to panels/tools; hooks simplify subscriptions; ecosystem (DnD, virtualization) |
| **Tailwind** | Utility-first CSS avoids naming conflicts; rapid UI prototyping; purge keeps bundle small |
| **Zustand** | Minimal Redux alternative; no boilerplate; devtools support; works with React and vanilla JS; clean bridge to core diffs |
| **IndexedDB** | Client-side storage for offline-first; handles blobs (textures, thumbnails); 50MB+ quota; transactional |
| **Web Workers** | Offload heavy compute (room detection, mesh generation) without blocking UI; transferable buffers avoid cloning |
| **Command Pattern** | Undo/redo, collaboration, and event sourcing all stem from this single abstraction; labels for UX |
| **Half-Edge Structure** | Canonical left/right face refs eliminate "which side?" ambiguities for inside/outside lengths, room detection, and hatching |
| **Result Type** | Safe error handling across worker boundaries; avoids thrown exceptions in async contexts |

---

## Future Enhancements

### Phase 2 Features

- **Curved walls**: Bézier or arc segments, offset along normals, miter with tangents (mm arcs)
- **Multi-story**: vertical levels with stair/elevator connections (height in mm)
- **Boolean operations**: union/subtract rooms for complex shapes (full CSG, mm precision)
- **Advanced dimensions**: running dimensions, ordinate dimensions, angular dimensions (mm)
- **Annotations**: text labels, leaders, cloud revisions (mm anchors)

### Phase 3 Features

- **Collaboration**: operational transform or CRDT on command log with `reason: 'sync'` (mm coords)
- **BIM interop**: IFC import/export (walls → `IfcWall`, spaces → `IfcSpace`)
- **Rendering**: real-time GI in three.js (lightmaps, AO baking)
- **AI assist**: auto-room detection from sketches, furniture layout suggestions
- **PDF tiling**: multi-page exports for large scenes at scale

---

## Conclusion

This architecture prioritizes **flexibility, testability, and future extensibility**. By keeping the core renderer-agnostic and modeling all mutations as commands with labels and gesture batching, DraftLab can evolve from a 2D floorplanner to a full BIM tool without architectural rewrites. The layered structure—**core → renderers → tools → UI**—ensures clean boundaries and allows each layer to be developed, tested, and optimized independently.

Key decisions locked in:

- **Entity-addressable diffs** with `reason` filtering
- **Screen/world query contracts** in spatial index
- **Centralized tolerances** (`Tol` object)
- **Gesture batching** with labels for undo UI
- **Half-edge structure** for inside/outside semantics
- **Opening model** for 3D cuts and 2D breaks
- **StyleMap** for consistent exports
- **Result type** for safe worker communication
- **Deterministic 3D** with stored camera/light params

The MVP checklist provides a clear implementation path, and the tightened interfaces prevent common footguns. This is production-grade architecture.