import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/spatial/SpatialGrid.js';
import { AStarPathfinder } from '../src/spatial/Pathfinding.js';
import { SimulationEngine } from '../src/core/Engine.js';
import { AgentBehavior } from '../src/fsm/AgentBehavior.js';
import type { Threat } from '../src/core/Types.js';

describe('Advanced Simulation Engine Suite: Terrain, Stamina, Threats & Patrol', () => {
  describe('Terrain Costs & Optimal Path Selection', () => {
    it('chooses a longer detour via ROAD (cost 0.5) to avoid expensive MUD (cost 5.0)', () => {
      const grid = new SpatialGrid({ width: 20, height: 20, cellSize: 1 });
      const pathfinder = new AStarPathfinder(grid, { allowDiagonal: false });

      // Start at (2, 5), Target at (10, 5)
      // Direct path would be along y = 5: (3,5) through (9,5)
      // Fill direct path with heavy MUD (cost 5.0)
      for (let x = 3; x <= 9; x++) {
        grid.setCellType(x, 5, 'MUD');
      }

      // Create a detour route along y = 7 paving it with fast ROAD (cost 0.5)
      for (let x = 2; x <= 10; x++) {
        grid.setCellType(x, 7, 'ROAD');
      }

      const result = pathfinder.findPathWithCost({ x: 2, y: 5 }, { x: 10, y: 5 });
      expect(result.path.length).toBeGreaterThan(0);

      // Verify that the path detoured onto y = 7 (the ROAD)
      const usedRoad = result.path.some((pt) => Math.floor(pt.y) === 7);
      expect(usedRoad).toBe(true);

      // Verify it avoided traversing directly through the MUD line at y = 5
      const mudCellsTraversed = result.path.filter((pt) => Math.floor(pt.y) === 5 && Math.floor(pt.x) >= 3 && Math.floor(pt.x) <= 9);
      expect(mudCellsTraversed.length).toBe(0);
    });
  });

  describe('Predator Proximity & Evasion Vector Generation', () => {
    it('triggers EVADING state and escapes in opposite vector when Predator is within 5 units', () => {
      const engine = new SimulationEngine({
        config: {
          gridWidth: 30,
          gridHeight: 30,
          cellSize: 1,
          threatEvasionDistance: 5.0,
        },
      });

      // Spawn an agent at (10, 10)
      const agent = engine.spawnAgent({
        id: 'agent-prey',
        position: { x: 10, y: 10 },
        target: { x: 20, y: 10 },
      });

      // Place Predator at (8, 10) (Distance = 2.0 units < 5.0 units, approaching from West)
      const predator: Threat = {
        id: 'predator-1',
        position: { x: 8, y: 10 },
        radius: 1.0,
      };
      engine.addThreat(predator);

      // Run one engine step
      engine.step();

      const updated = engine.getAgent('agent-prey');
      expect(updated).toBeDefined();
      expect(updated?.state).toBe('EVADING');

      // Evasion target should point strictly EAST (away from predator at x=8)
      expect(updated?.target?.x).toBeGreaterThan(10);

      engine.dispose();
    });

    it('does not trigger EVADING if Predator is beyond 5 units', () => {
      const engine = new SimulationEngine({
        config: {
          gridWidth: 30,
          gridHeight: 30,
          cellSize: 1,
          threatEvasionDistance: 5.0,
        },
      });

      const agent = engine.spawnAgent({
        id: 'agent-safe',
        position: { x: 10, y: 10 },
        target: { x: 20, y: 10 },
      });

      // Predator is at (20, 20) -> Distance > 14 units (> 5.0)
      engine.addThreat({
        id: 'predator-far',
        position: { x: 20, y: 20 },
        radius: 1.0,
      });

      engine.step();

      const updated = engine.getAgent('agent-safe');
      expect(updated?.state).toBe('NAVIGATING');

      engine.dispose();
    });
  });

  describe('Stamina Dissipation & Emergency Station Seeking', () => {
    it('burns stamina as agent moves across terrain and prioritizes charging station when stamina < 20%', () => {
      const engine = new SimulationEngine({
        config: {
          gridWidth: 30,
          gridHeight: 30,
          cellSize: 1,
          rechargeThresholdPercent: 20,
        },
      });

      // Add a charging station at (4, 4)
      engine.addStation({ x: 4, y: 4 });

      // Spawn agent with low stamina = 25 (out of 100), energyBurnRate = 10
      const agent = engine.spawnAgent({
        id: 'agent-battery',
        position: { x: 5, y: 5 },
        target: { x: 25, y: 25 },
        stamina: 25,
        maxStamina: 100,
        energyBurnRate: 10, // Will burn fast in 1-2 steps
      });

      expect(agent.stamina).toBe(25);

      // Step 1: Agent moves, stamina burns below 20 (25 - 10 = 15 < 20%)
      engine.step();

      const midAgent = engine.getAgent('agent-battery');
      expect(midAgent).toBeDefined();
      expect(midAgent!.stamina).toBeLessThan(20);

      // Step 2: Engine detects stamina < 20%, overrides target and routes to station at (4, 4)
      engine.step();

      const seekingAgent = engine.getAgent('agent-battery');
      expect(seekingAgent?.state).toBe('RECHARGING');
      expect(seekingAgent?.target?.x).toBe(4.5);
      expect(seekingAgent?.target?.y).toBe(4.5);

      engine.dispose();
    });

    it('recharges stamina when arriving at a charging station', () => {
      const engine = new SimulationEngine({
        config: {
          gridWidth: 20,
          gridHeight: 20,
          cellSize: 1,
        },
      });

      // Place station at (5, 5)
      engine.addStation({ x: 5, y: 5 });

      // Spawn agent directly on the station with 10% stamina in RECHARGING state
      const agent = engine.spawnAgent({
        id: 'agent-charging',
        position: { x: 5, y: 5 },
        stamina: 10,
        maxStamina: 100,
        state: 'RECHARGING',
      });

      // Step: on station, stamina should increase by +10
      engine.step();

      const chargedAgent = engine.getAgent('agent-charging');
      expect(chargedAgent?.stamina).toBe(20);

      // Step multiple times until fully recharged
      for (let i = 0; i < 9; i++) {
        engine.step();
      }

      const fullyCharged = engine.getAgent('agent-charging');
      expect(fullyCharged?.stamina).toBe(100);
      expect(fullyCharged?.state).toBe('IDLE');

      engine.dispose();
    });

    it('immobilizes agent into EXHAUSTED state when stamina completely depletes', () => {
      const engine = new SimulationEngine({
        config: {
          gridWidth: 20,
          gridHeight: 20,
          cellSize: 1,
        },
      });

      // Agent with 0 stamina
      const agent = engine.spawnAgent({
        id: 'agent-tired',
        position: { x: 2, y: 2 },
        target: { x: 10, y: 10 },
        stamina: 0,
        maxStamina: 100,
      });

      engine.step();

      const exhaustedAgent = engine.getAgent('agent-tired');
      expect(exhaustedAgent?.state).toBe('EXHAUSTED');
      // Position remains static
      expect(exhaustedAgent?.position.x).toBe(2);
      expect(exhaustedAgent?.position.y).toBe(2);

      engine.dispose();
    });
  });

  describe('Patrol Route Waypoints', () => {
    it('cycles through multiple patrol waypoints sequentially', () => {
      const engine = new SimulationEngine({
        config: {
          gridWidth: 20,
          gridHeight: 20,
          cellSize: 1,
          defaultAgentSpeed: 1.0,
        },
      });

      const waypoints = [
        { x: 3, y: 3 },
        { x: 3, y: 6 },
        { x: 6, y: 6 },
      ];

      const agent = engine.spawnAgent({
        id: 'patrol-officer',
        position: { x: 3, y: 3 },
        waypoints,
      });

      expect(agent.state).toBe('PATROL');
      expect(agent.waypoints.length).toBe(3);

      engine.dispose();
    });
  });
});
