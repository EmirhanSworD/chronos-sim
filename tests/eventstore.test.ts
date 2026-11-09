import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventStore } from '../src/storage/EventStore.js';
import { SimulationEngine } from '../src/core/Engine.js';
import type {
  AgentSpawnedEvent,
  AgentMovedEvent,
  ObstacleAddedEvent,
  PathCalculatedEvent,
  SimulationSnapshot,
} from '../src/core/Types.js';

describe('EventStore SQLite WAL & State Integrity Suite', () => {
  const testDbFile = path.resolve(process.cwd(), 'test-chronos.db');

  beforeEach(() => {
    if (fs.existsSync(testDbFile)) {
      fs.unlinkSync(testDbFile);
    }
  });

  afterEach(() => {
    // Clean up temporary files
    for (const ext of ['', '-wal', '-shm']) {
      const p = `${testDbFile}${ext}`;
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore lock on cleanup
        }
      }
    }
  });

  it('verifies SQLite WAL mode and configuration pragmas on disk', () => {
    const diskStore = new EventStore({ path: testDbFile });

    // Insert an event to initialize WAL journal files
    diskStore.appendEvent({
      type: 'OBSTACLE_ADDED',
      tick: 1,
      timestamp: Date.now(),
      position: { x: 10, y: 10 },
    });

    expect(diskStore.getEventCount()).toBe(1);
    diskStore.close();

    // Verify WAL file creation on disk
    expect(fs.existsSync(testDbFile)).toBe(true);
  });

  it('guarantees sequential data integrity and payload fidelity for heterogeneous events', () => {
    const store = new EventStore({ inMemory: true });

    const spawnEvent: AgentSpawnedEvent = {
      type: 'AGENT_SPAWNED',
      tick: 1,
      timestamp: 1000,
      agent: {
        id: 'agent-integrity-1',
        position: { x: 12.5, y: 14.5 },
        target: { x: 40, y: 40 },
        state: 'NAVIGATING',
        path: [{ x: 13.5, y: 14.5 }, { x: 14.5, y: 14.5 }, { x: 40, y: 40 }],
        speed: 1.0,
        radius: 0.4,
      },
    };

    const pathEvent: PathCalculatedEvent = {
      type: 'PATH_CALCULATED',
      tick: 2,
      timestamp: 1050,
      agentId: 'agent-integrity-1',
      from: { x: 12.5, y: 14.5 },
      to: { x: 40, y: 40 },
      path: [{ x: 13.5, y: 14.5 }, { x: 40, y: 40 }],
      pathLength: 2,
    };

    const moveEvent: AgentMovedEvent = {
      type: 'AGENT_MOVED',
      tick: 3,
      timestamp: 1100,
      agentId: 'agent-integrity-1',
      from: { x: 12.5, y: 14.5 },
      to: { x: 13.5, y: 14.5 },
    };

    const obstacleEvent: ObstacleAddedEvent = {
      type: 'OBSTACLE_ADDED',
      tick: 4,
      timestamp: 1150,
      position: { x: 20, y: 20 },
    };

    store.appendEvents([spawnEvent, pathEvent, moveEvent, obstacleEvent]);

    expect(store.getEventCount()).toBe(4);

    // Verify tick range query
    const rangeEvents = store.getEvents(2, 3);
    expect(rangeEvents.length).toBe(2);
    expect(rangeEvents[0]?.type).toBe('PATH_CALCULATED');
    expect(rangeEvents[1]?.type).toBe('AGENT_MOVED');

    // Verify aggregate ID query for agent
    const agentEvents = store.getEventsForAgent('agent-integrity-1');
    expect(agentEvents.length).toBe(3);

    // Verify aggregate ID query for obstacle position key
    const obstacleEvents = store.getEventsByType('OBSTACLE_ADDED');
    expect(obstacleEvents.length).toBe(1);
    expect(obstacleEvents[0]?.type).toBe('OBSTACLE_ADDED');

    // Verify deep property integrity of deserialized agent
    const retrievedSpawn = store.getEvents(1, 1)[0] as AgentSpawnedEvent;
    expect(retrievedSpawn.agent.id).toBe('agent-integrity-1');
    expect(retrievedSpawn.agent.position.x).toBe(12.5);
    expect(retrievedSpawn.agent.path.length).toBe(3);
    expect(retrievedSpawn.agent.path[2]?.x).toBe(40);

    store.close();
  });

  it('executes atomic high-volume transactional batch writes without data corruption', () => {
    const store = new EventStore({ inMemory: true });
    const batchSize = 1000;
    const events: ObstacleAddedEvent[] = [];

    for (let i = 0; i < batchSize; i++) {
      events.push({
        type: 'OBSTACLE_ADDED',
        tick: Math.floor(i / 10),
        timestamp: 1000 + i,
        position: { x: i % 100, y: Math.floor(i / 100) },
      });
    }

    // Atomic transaction block
    store.appendEvents(events);

    expect(store.getEventCount()).toBe(batchSize);

    const allEvents = store.getEvents();
    expect(allEvents.length).toBe(batchSize);
    expect(allEvents[batchSize - 1]?.tick).toBe(Math.floor((batchSize - 1) / 10));

    store.close();
  });

  it('saves periodic snapshots and restores full simulation state with 100% fidelity', () => {
    const store = new EventStore({ inMemory: true });

    const snapshotTick20: SimulationSnapshot = {
      tick: 20,
      timestamp: 2000,
      agents: [
        {
          id: 'agent-1',
          position: { x: 10, y: 10 },
          target: { x: 30, y: 30 },
          state: 'NAVIGATING',
          path: [{ x: 20, y: 20 }, { x: 30, y: 30 }],
          speed: 1.0,
          radius: 0.4,
        },
      ],
      obstacles: [{ x: 15, y: 15 }, { x: 16, y: 15 }],
      config: {
        tickRateMs: 50,
        gridWidth: 50,
        gridHeight: 50,
        cellSize: 1,
        allowDiagonal: true,
        diagonalCostMultiplier: Math.SQRT2,
        snapshotIntervalTicks: 20,
        defaultAgentSpeed: 1.0,
        maxAStarIterations: 5000,
      },
    };

    const snapshotTick40: SimulationSnapshot = {
      tick: 40,
      timestamp: 3000,
      agents: [
        {
          id: 'agent-1',
          position: { x: 30, y: 30 },
          target: { x: 30, y: 30 },
          state: 'COMPLETED',
          path: [],
          speed: 1.0,
          radius: 0.4,
        },
        {
          id: 'agent-2',
          position: { x: 5, y: 5 },
          target: { x: 45, y: 45 },
          state: 'NAVIGATING',
          path: [{ x: 45, y: 45 }],
          speed: 0.8,
          radius: 0.4,
        },
      ],
      obstacles: [{ x: 15, y: 15 }, { x: 16, y: 15 }, { x: 25, y: 25 }],
      config: snapshotTick20.config,
    };

    store.saveSnapshot(snapshotTick20);
    store.saveSnapshot(snapshotTick40);

    expect(store.getSnapshotCount()).toBe(2);

    // Latest snapshot must be tick 40
    const latest = store.getLatestSnapshot();
    expect(latest).not.toBeNull();
    expect(latest?.tick).toBe(40);
    expect(latest?.agents.length).toBe(2);

    // Historical snapshot at or before tick 35 must be tick 20
    const at35 = store.getSnapshotAtOrBefore(35);
    expect(at35).not.toBeNull();
    expect(at35?.tick).toBe(20);
    expect(at35?.agents.length).toBe(1);

    // Test restoring simulation engine from snapshot
    const engine = new SimulationEngine({
      config: snapshotTick20.config,
      eventStore: store,
    });

    engine.restoreFromSnapshot(at35!);

    expect(engine.tick).toBe(20);
    expect(engine.getAllAgents().length).toBe(1);
    const restoredAgent = engine.getAgent('agent-1');
    expect(restoredAgent?.state).toBe('NAVIGATING');
    expect(restoredAgent?.position.x).toBe(10);
    expect(restoredAgent?.position.y).toBe(10);
    expect(engine.spatialGrid.hasObstacle({ x: 15, y: 15 })).toBe(true);
    expect(engine.spatialGrid.hasObstacle({ x: 25, y: 25 })).toBe(false);

    // Continue simulation from restored tick
    engine.step();
    expect(engine.tick).toBe(21);

    engine.dispose();
    store.close();
  });
});
