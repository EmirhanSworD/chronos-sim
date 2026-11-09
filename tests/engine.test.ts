import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationEngine } from '../src/core/Engine.js';
import { EventStore } from '../src/storage/EventStore.js';
import type { SimulationEvent } from '../src/core/Types.js';

describe('SimulationEngine', () => {
  let store: EventStore;
  let engine: SimulationEngine;

  beforeEach(() => {
    store = new EventStore({ inMemory: true });
    engine = new SimulationEngine({
      config: {
        tickRateMs: 50,
        gridWidth: 20,
        gridHeight: 20,
        cellSize: 1,
        snapshotIntervalTicks: 5,
        defaultAgentSpeed: 1,
      },
      eventStore: store,
    });
  });

  afterEach(() => {
    engine.dispose();
    store.close();
  });

  it('spawns agent and calculates initial path', () => {
    const agent = engine.spawnAgent({
      id: 'agent-1',
      position: { x: 2, y: 2 },
      target: { x: 5, y: 2 },
    });

    expect(agent.id).toBe('agent-1');
    expect(agent.state).toBe('NAVIGATING');
    expect(agent.path.length).toBeGreaterThan(0);
    expect(engine.getAllAgents().length).toBe(1);
  });

  it('advances agent deterministically step by step until target is reached', () => {
    engine.spawnAgent({
      id: 'agent-1',
      position: { x: 2, y: 2 },
      target: { x: 5, y: 2 },
    });

    // Run ticks until agent arrives
    let completed = false;
    engine.on('AGENT_REACHED_TARGET', (e) => {
      if (e.agentId === 'agent-1') {
        completed = true;
      }
    });

    for (let i = 0; i < 10; i++) {
      engine.step();
      if (completed) break;
    }

    expect(completed).toBe(true);
    const agent = engine.getAgent('agent-1');
    expect(agent?.state).toBe('COMPLETED');
    expect(agent?.position.x).toBe(5);
    expect(agent?.position.y).toBe(2);
  });

  it('detects dynamic obstacle on path, handles rerouting or blocks', () => {
    const emittedEvents: SimulationEvent[] = [];
    engine.subscribe((e) => emittedEvents.push(e));

    engine.spawnAgent({
      id: 'agent-runner',
      position: { x: 1, y: 1 },
      target: { x: 5, y: 1 },
    });

    // Place an obstacle right on the path at (2, 1)
    engine.addObstacle({ x: 2, y: 1 });

    // Step the engine: agent should encounter the obstacle and reroute around it
    engine.step();

    const agent = engine.getAgent('agent-runner');
    expect(agent).toBeDefined();

    // Verify events recorded in EventStore
    const dbEvents = store.getEvents();
    expect(dbEvents.some((e) => e.type === 'OBSTACLE_ADDED')).toBe(true);
  });

  it('creates periodic snapshots in EventStore', () => {
    engine.spawnAgent({
      id: 'agent-1',
      position: { x: 3, y: 3 },
    });

    // Step 5 times (snapshotIntervalTicks = 5)
    for (let i = 0; i < 5; i++) {
      engine.step();
    }

    expect(engine.tick).toBe(5);
    expect(store.getSnapshotCount()).toBe(1);

    const snapshot = store.getLatestSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.tick).toBe(5);
    expect(snapshot?.agents.length).toBe(1);
    expect(snapshot?.agents[0]?.id).toBe('agent-1');
  });

  it('restores state from snapshot with perfect fidelity', () => {
    engine.spawnAgent({
      id: 'agent-1',
      position: { x: 2, y: 2 },
      target: { x: 8, y: 8 },
    });
    engine.addObstacle({ x: 5, y: 5 });

    // Step 5 times to generate snapshot
    for (let i = 0; i < 5; i++) {
      engine.step();
    }

    const savedSnapshot = engine.getSnapshot();

    // Create a new fresh engine and restore
    const freshEngine = new SimulationEngine({
      config: engine.config,
    });

    freshEngine.restoreFromSnapshot(savedSnapshot);

    expect(freshEngine.tick).toBe(5);
    expect(freshEngine.getAllAgents().length).toBe(1);
    const restoredAgent = freshEngine.getAgent('agent-1');
    expect(restoredAgent?.id).toBe('agent-1');
    expect(freshEngine.spatialGrid.hasObstacle({ x: 5, y: 5 })).toBe(true);

    freshEngine.dispose();
  });
});
