import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/spatial/SpatialGrid.js';
import type { Agent } from '../src/core/Types.js';

describe('SpatialGrid', () => {
  it('correctly maps world coordinates to cells and bounds', () => {
    const grid = new SpatialGrid({ width: 100, height: 100, cellSize: 10 });
    expect(grid.cols).toBe(10);
    expect(grid.rows).toBe(10);

    const cell = grid.worldToCell({ x: 25, y: 35 });
    expect(cell.cx).toBe(2);
    expect(cell.cy).toBe(3);

    const world = grid.cellToWorld(2, 3);
    expect(world.x).toBe(25);
    expect(world.y).toBe(35);

    expect(grid.isInBounds({ x: 0, y: 0 })).toBe(true);
    expect(grid.isInBounds({ x: 99.9, y: 99.9 })).toBe(true);
    expect(grid.isInBounds({ x: 100, y: 50 })).toBe(false);
    expect(grid.isInBounds({ x: -1, y: 50 })).toBe(false);
  });

  it('manages dynamic obstacles correctly', () => {
    const grid = new SpatialGrid({ width: 50, height: 50, cellSize: 1 });

    expect(grid.hasObstacle({ x: 10, y: 10 })).toBe(false);
    expect(grid.addObstacle({ x: 10, y: 10 })).toBe(true);
    expect(grid.hasObstacle({ x: 10, y: 10 })).toBe(true);
    expect(grid.hasObstacleAtCell(10, 10)).toBe(true);

    // Duplicate add should return false
    expect(grid.addObstacle({ x: 10, y: 10 })).toBe(false);

    expect(grid.obstacleCount).toBe(1);
    expect(grid.getAllObstacles().length).toBe(1);

    // Remove obstacle
    expect(grid.removeObstacle({ x: 10, y: 10 })).toBe(true);
    expect(grid.hasObstacle({ x: 10, y: 10 })).toBe(false);
    expect(grid.obstacleCount).toBe(0);
  });

  it('indexes agents and performs O(1) near neighbor queries', () => {
    const grid = new SpatialGrid({ width: 100, height: 100, cellSize: 5 });

    const agent1: Agent = {
      id: 'a1',
      position: { x: 10, y: 10 },
      target: null,
      state: 'IDLE',
      path: [],
      speed: 1,
      radius: 1,
      stamina: 100,
      maxStamina: 100,
      energyBurnRate: 0.5,
      waypoints: [],
    };

    const agent2: Agent = {
      id: 'a2',
      position: { x: 12, y: 10 },
      target: null,
      state: 'IDLE',
      path: [],
      speed: 1,
      radius: 1,
      stamina: 100,
      maxStamina: 100,
      energyBurnRate: 0.5,
      waypoints: [],
    };

    const agent3: Agent = {
      id: 'a3',
      position: { x: 50, y: 50 },
      target: null,
      state: 'IDLE',
      path: [],
      speed: 1,
      radius: 1,
      stamina: 100,
      maxStamina: 100,
      energyBurnRate: 0.5,
      waypoints: [],
    };

    grid.insertAgent(agent1);
    grid.insertAgent(agent2);
    grid.insertAgent(agent3);

    expect(grid.agentCount).toBe(3);

    // Query neighbors around agent1 with radius 3 (should find a1 and a2, but not a3)
    const neighbors = grid.queryRadius({ x: 10, y: 10 }, 3);
    const neighborIds = neighbors.map((a) => a.id).sort();
    expect(neighborIds).toEqual(['a1', 'a2']);

    // Query nearest
    const nearest = grid.queryNearest({ x: 11, y: 10 }, 5);
    expect(nearest).not.toBeNull();
    expect(nearest?.agent.id).toBeDefined();

    // Move agent1 to cell near agent3
    const updatedAgent1: Agent = {
      ...agent1,
      position: { x: 51, y: 50 },
    };
    grid.updateAgent(updatedAgent1);

    const neighborsAtOldPos = grid.queryRadius({ x: 10, y: 10 }, 1);
    expect(neighborsAtOldPos.length).toBe(0);

    const neighborsAtNewPos = grid.queryRadius({ x: 50, y: 50 }, 3);
    expect(neighborsAtNewPos.map((a) => a.id).sort()).toEqual(['a1', 'a3']);

    // Remove agent
    expect(grid.removeAgent('a1')).toBe(true);
    expect(grid.agentCount).toBe(2);
    expect(grid.getAgent('a1')).toBeUndefined();
  });
});
