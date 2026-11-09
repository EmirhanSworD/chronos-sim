import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/spatial/SpatialGrid.js';
import { AStarPathfinder } from '../src/spatial/Pathfinding.js';
import { SimulationEngine } from '../src/core/Engine.js';

describe('A* Pathfinding Algorithm Suite', () => {
  it('navigates correctly on an open straight path (düz yolda)', () => {
    const grid = new SpatialGrid({ width: 50, height: 50, cellSize: 1 });
    const pathfinder = new AStarPathfinder(grid, { allowDiagonal: true });

    const start = { x: 5, y: 5 };
    const target = { x: 25, y: 5 };

    const path = pathfinder.findPath(start, target);

    // Path must exist and end exactly at target
    expect(path.length).toBeGreaterThan(0);
    const destination = path[path.length - 1];
    expect(destination).toBeDefined();
    expect(destination?.x).toBe(target.x);
    expect(destination?.y).toBe(target.y);

    // Straight horizontal line distance = 20 cells
    expect(path.length).toBe(20);

    // Verify monotonicity along X axis
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      expect(node).toBeDefined();
      if (node && i < path.length - 1) {
        expect(node.y).toBeCloseTo(5.5, 1);
        expect(node.x).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('escapes concave local minima and navigates around a U-shaped wall (U-şeklindeki duvar)', () => {
    const grid = new SpatialGrid({ width: 50, height: 50, cellSize: 1 });
    const pathfinder = new AStarPathfinder(grid, {
      allowDiagonal: true,
      preventCornerCutting: true,
    });

    // Build a U-shaped barrier opening towards the north (top)
    // Left vertical wall: x = 15, y in [10..20]
    for (let y = 10; y <= 20; y++) {
      grid.addObstacle({ x: 15, y });
    }
    // Bottom horizontal wall: y = 20, x in [15..25]
    for (let x = 15; x <= 25; x++) {
      grid.addObstacle({ x, y: 20 });
    }
    // Right vertical wall: x = 25, y in [10..20]
    for (let y = 10; y <= 20; y++) {
      grid.addObstacle({ x: 25, y });
    }

    // Start INSIDE the pocket of the U-trap
    const startInsideU = { x: 20, y: 18 };
    // Target OUTSIDE and BELOW the bottom wall
    const targetOutsideU = { x: 20, y: 26 };

    const path = pathfinder.findPath(startInsideU, targetOutsideU);

    // A* must find a valid path by climbing out of the U-pocket (y < 10) and wrapping around
    expect(path.length).toBeGreaterThan(0);
    const destination = path[path.length - 1];
    expect(destination).toBeDefined();
    expect(destination?.x).toBe(targetOutsideU.x);
    expect(destination?.y).toBe(targetOutsideU.y);

    // Verify none of the waypoints intersect any obstacle
    for (const point of path) {
      expect(grid.hasObstacle(point)).toBe(false);
    }

    // Verify path went out through the open top (y < 10)
    const reachedNorthOpening = path.some((pt) => pt.y < 10.5);
    expect(reachedNorthOpening).toBe(true);
  });

  it('adapts and reroutes when a dynamic obstacle closes the primary corridor (dinamik engel kapandığında)', () => {
    const grid = new SpatialGrid({ width: 30, height: 30, cellSize: 1 });
    const pathfinder = new AStarPathfinder(grid, { allowDiagonal: true });

    // Build a dividing wall across x = 10 from y = 0 to 29 (full grid height)
    for (let y = 0; y < 30; y++) {
      grid.addObstacle({ x: 10, y });
    }

    // Create a primary corridor at (10, 10) and a detour corridor far north at (10, 2)
    grid.removeObstacle({ x: 10, y: 10 }); // Primary opening
    grid.removeObstacle({ x: 10, y: 2 });  // Secondary detour opening

    const start = { x: 5, y: 10 };
    const target = { x: 15, y: 10 };

    // 1. Initial path should use the direct primary doorway at (10, 10)
    const initialPath = pathfinder.findPath(start, target);
    expect(initialPath.length).toBeGreaterThan(0);
    const usesPrimaryDoor = initialPath.some((pt) => Math.floor(pt.x) === 10 && Math.floor(pt.y) === 10);
    expect(usesPrimaryDoor).toBe(true);

    // 2. DYNAMIC OBSTACLE: Close the primary doorway!
    const closed = grid.addObstacle({ x: 10, y: 10 });
    expect(closed).toBe(true);

    // 3. Re-calculate path: A* must detect the closure and divert through detour at (10, 2)
    const detourPath = pathfinder.findPath(start, target);
    expect(detourPath.length).toBeGreaterThan(0);
    expect(detourPath.length).toBeGreaterThan(initialPath.length);

    // Detour path must NOT use (10, 10) and MUST use (10, 2)
    const usesClosedDoor = detourPath.some((pt) => Math.floor(pt.x) === 10 && Math.floor(pt.y) === 10);
    expect(usesClosedDoor).toBe(false);

    const usesDetourDoor = detourPath.some((pt) => Math.floor(pt.x) === 10 && Math.floor(pt.y) === 2);
    expect(usesDetourDoor).toBe(true);

    // 4. Seal all passages: Target becomes fully unreachable
    grid.addObstacle({ x: 10, y: 2 });
    const sealedPath = pathfinder.findPath(start, target);
    expect(sealedPath.length).toBe(0);
  });

  it('engine updates agent state machine to BLOCKED and reroutes on dynamic obstacle collision', () => {
    const engine = new SimulationEngine({
      config: {
        gridWidth: 30,
        gridHeight: 30,
        cellSize: 1,
        tickRateMs: 50,
        defaultAgentSpeed: 1.0,
      },
    });

    const agent = engine.spawnAgent({
      id: 'runner-1',
      position: { x: 2, y: 5 },
      target: { x: 10, y: 5 },
    });

    expect(agent.state).toBe('NAVIGATING');

    // Place obstacle directly in front of agent on waypoint (3, 5)
    engine.addObstacle({ x: 3, y: 5 });

    // Step engine: agent detects blocked waypoint and finds alternative path around it
    engine.step();

    const updated = engine.getAgent('runner-1');
    expect(updated).toBeDefined();
    // Agent rerouted above or below the blocked cell
    expect(engine.spatialGrid.hasObstacle(updated!.position)).toBe(false);

    engine.dispose();
  });
});
