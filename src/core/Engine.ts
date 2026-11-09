import type {
  Agent,
  AgentBlockedEvent,
  AgentDespawnedEvent,
  AgentMovedEvent,
  AgentReachedTargetEvent,
  AgentSpawnedEvent,
  AgentState,
  AgentStateChangedEvent,
  ObstacleAddedEvent,
  ObstacleRemovedEvent,
  PathCalculatedEvent,
  SimulationConfig,
  SimulationEvent,
  SimulationEventType,
  SimulationSnapshot,
  SimulationStartedEvent,
  SimulationStoppedEvent,
  SnapshotCreatedEvent,
  TickEvent,
  Vector2D,
} from './Types.js';
import {
  DEFAULT_SIMULATION_CONFIG,
  createVector,
  vectorDistance,
  vectorEquals,
  vectorLerp,
} from './Types.js';
import { SpatialGrid } from '../spatial/SpatialGrid.js';
import { AStarPathfinder } from '../spatial/Pathfinding.js';
import { AgentStateMachine } from '../fsm/StateMachine.js';
import type { EventStore } from '../storage/EventStore.js';

export interface SpawnAgentOptions {
  readonly id: string;
  readonly position: Vector2D;
  readonly target?: Vector2D | undefined;
  readonly speed?: number | undefined;
  readonly radius?: number | undefined;
}

export interface EngineOptions {
  readonly config?: Partial<SimulationConfig> | undefined;
  readonly eventStore?: EventStore | undefined;
}

type EventCallback = (event: SimulationEvent) => void;
type TickCallback = (tickEvent: TickEvent) => void;

/**
 * Deterministic Fixed-Timestep Simulation Engine (Chronos Engine).
 * Orchestrates spatial indexing, pathfinding, agent state machines,
 * dynamic obstacle checking, and event sourcing.
 */
export class SimulationEngine {
  readonly config: SimulationConfig;
  readonly spatialGrid: SpatialGrid;
  readonly pathfinder: AStarPathfinder;

  private currentTick = 0;
  private isRunning = false;
  private timerHandle: NodeJS.Timeout | null = null;
  private readonly eventStore: EventStore | null = null;

  /** Registered agents map: agentId -> mutable state record */
  private readonly agents: Map<string, Agent> = new Map();

  /** Agent state machines map: agentId -> FSM */
  private readonly fsms: Map<string, AgentStateMachine> = new Map();

  /** Event listeners */
  private readonly eventListeners: Set<EventCallback> = new Set();
  private readonly tickListeners: Set<TickCallback> = new Set();

  constructor(options?: EngineOptions | undefined) {
    this.config = {
      ...DEFAULT_SIMULATION_CONFIG,
      ...(options?.config ?? {}),
    };

    this.eventStore = options?.eventStore ?? null;

    this.spatialGrid = new SpatialGrid({
      width: this.config.gridWidth,
      height: this.config.gridHeight,
      cellSize: this.config.cellSize,
    });

    this.pathfinder = new AStarPathfinder(this.spatialGrid, {
      allowDiagonal: this.config.allowDiagonal,
      diagonalCost: this.config.diagonalCostMultiplier,
      cardinalCost: 1.0,
      preventCornerCutting: true,
      maxIterations: this.config.maxAStarIterations,
    });
  }

  // --- Public State Getters ---

  public get tick(): number {
    return this.currentTick;
  }

  public get active(): boolean {
    return this.isRunning;
  }

  public getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  public getAllAgents(): readonly Agent[] {
    return Array.from(this.agents.values());
  }

  public getAgentState(id: string): AgentState | undefined {
    return this.fsms.get(id)?.state;
  }

  // --- Event Subscription ---

  /** Subscribes to all discrete simulation events */
  public subscribe(listener: EventCallback): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** Subscribes to tick completion summaries */
  public onTick(listener: TickCallback): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  /** Subscribes to a specific simulation event type */
  public on<T extends SimulationEventType>(
    type: T,
    listener: (event: Extract<SimulationEvent, { type: T }>) => void
  ): () => void {
    const callback: EventCallback = (event) => {
      if (event.type === type) {
        listener(event as Extract<SimulationEvent, { type: T }>);
      }
    };
    return this.subscribe(callback);
  }

  // --- Agent & Obstacle Mutators ---

  /**
   * Spawns a new agent into the simulation.
   */
  public spawnAgent(options: SpawnAgentOptions): Agent {
    if (this.agents.has(options.id)) {
      throw new Error(`Agent with id '${options.id}' already exists.`);
    }

    if (!this.spatialGrid.isInBounds(options.position)) {
      throw new Error(`Spawn position (${options.position.x}, ${options.position.y}) is out of bounds.`);
    }

    const fsm = new AgentStateMachine(options.id, 'IDLE');
    this.fsms.set(options.id, fsm);

    const agent: Agent = {
      id: options.id,
      position: createVector(options.position.x, options.position.y),
      target: null,
      state: 'IDLE',
      path: [],
      speed: options.speed ?? this.config.defaultAgentSpeed,
      radius: options.radius ?? this.config.cellSize * 0.4,
    };

    this.agents.set(agent.id, agent);
    this.spatialGrid.insertAgent(agent);

    const spawnEvent: AgentSpawnedEvent = {
      type: 'AGENT_SPAWNED',
      tick: this.currentTick,
      timestamp: Date.now(),
      agent,
    };
    this.emitEvent(spawnEvent);

    // If initial target provided, compute path
    if (options.target) {
      this.setAgentTarget(agent.id, options.target);
    }

    return this.agents.get(agent.id) ?? agent;
  }

  /**
   * Removes an agent from the simulation.
   */
  public despawnAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    this.spatialGrid.removeAgent(agentId);
    this.agents.delete(agentId);
    this.fsms.delete(agentId);

    const despawnEvent: AgentDespawnedEvent = {
      type: 'AGENT_DESPAWNED',
      tick: this.currentTick,
      timestamp: Date.now(),
      agentId,
    };
    this.emitEvent(despawnEvent);

    return true;
  }

  /**
   * Assigns a destination target to an agent and triggers path calculation.
   */
  public setAgentTarget(agentId: string, target: Vector2D): boolean {
    const agent = this.agents.get(agentId);
    const fsm = this.fsms.get(agentId);
    if (!agent || !fsm) {
      return false;
    }

    const computedPath = this.pathfinder.findPath(agent.position, target);

    if (computedPath.length === 0) {
      // Path blocked or unreachable
      const previousState = fsm.state;
      fsm.block('No valid path to target');

      const updatedAgent: Agent = {
        ...agent,
        target: createVector(target.x, target.y),
        state: fsm.state,
        path: [],
      };
      this.agents.set(agentId, updatedAgent);
      this.spatialGrid.updateAgent(updatedAgent);

      if (previousState !== fsm.state) {
        this.emitEvent({
          type: 'AGENT_STATE_CHANGED',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId,
          previousState,
          newState: fsm.state,
          reason: 'Path unreachable',
        });
      }

      this.emitEvent({
        type: 'AGENT_BLOCKED',
        tick: this.currentTick,
        timestamp: Date.now(),
        agentId,
        position: agent.position,
        target,
        reason: 'Target is unreachable or blocked',
      });

      return false;
    }

    // Path successfully calculated
    const previousState = fsm.state;
    fsm.startNavigation('New target set with valid path');

    const updatedAgent: Agent = {
      ...agent,
      target: createVector(target.x, target.y),
      state: fsm.state,
      path: computedPath,
    };
    this.agents.set(agentId, updatedAgent);
    this.spatialGrid.updateAgent(updatedAgent);

    this.emitEvent({
      type: 'PATH_CALCULATED',
      tick: this.currentTick,
      timestamp: Date.now(),
      agentId,
      from: agent.position,
      to: target,
      path: computedPath,
      pathLength: computedPath.length,
    });

    if (previousState !== fsm.state) {
      this.emitEvent({
        type: 'AGENT_STATE_CHANGED',
        tick: this.currentTick,
        timestamp: Date.now(),
        agentId,
        previousState,
        newState: fsm.state,
        reason: 'Navigation started',
      });
    }

    return true;
  }

  /**
   * Adds a dynamic obstacle at the specified position.
   */
  public addObstacle(position: Vector2D): boolean {
    const added = this.spatialGrid.addObstacle(position);
    if (!added) {
      return false;
    }

    const event: ObstacleAddedEvent = {
      type: 'OBSTACLE_ADDED',
      tick: this.currentTick,
      timestamp: Date.now(),
      position: createVector(position.x, position.y),
    };
    this.emitEvent(event);

    return true;
  }

  /**
   * Removes a dynamic obstacle.
   */
  public removeObstacle(position: Vector2D): boolean {
    const removed = this.spatialGrid.removeObstacle(position);
    if (!removed) {
      return false;
    }

    const event: ObstacleRemovedEvent = {
      type: 'OBSTACLE_REMOVED',
      tick: this.currentTick,
      timestamp: Date.now(),
      position: createVector(position.x, position.y),
    };
    this.emitEvent(event);

    return true;
  }

  // --- Deterministic Step Execution ---

  /**
   * Executes a single fixed simulation tick deterministically.
   * Updates all agents, checks obstacle collisions, handles re-routing,
   * emits events, and persists snapshots at designated intervals.
   */
  public step(): TickEvent {
    this.currentTick++;
    const tickStart = Date.now();
    const tickEvents: SimulationEvent[] = [];

    // Temporary collector for events generated during this tick
    const tickEmitter = (event: SimulationEvent): void => {
      tickEvents.push(event);
      for (const listener of this.eventListeners) {
        listener(event);
      }
    };

    // Process agents in deterministic order by ID
    const sortedAgentIds = Array.from(this.agents.keys()).sort();

    for (const agentId of sortedAgentIds) {
      const agent = this.agents.get(agentId);
      const fsm = this.fsms.get(agentId);
      if (!agent || !fsm) {
        continue;
      }

      this.updateAgentStep(agent, fsm, tickEmitter);
    }

    // Check periodic snapshot creation
    if (this.currentTick % this.config.snapshotIntervalTicks === 0) {
      const snapshot = this.getSnapshot();
      if (this.eventStore) {
        this.eventStore.saveSnapshot(snapshot);
      }

      const snapshotEvent: SnapshotCreatedEvent = {
        type: 'SNAPSHOT_CREATED',
        tick: this.currentTick,
        timestamp: tickStart,
        agentCount: snapshot.agents.length,
        obstacleCount: snapshot.obstacles.length,
      };
      tickEmitter(snapshotEvent);
    }

    // Persist all tick events atomically to EventStore
    if (this.eventStore && tickEvents.length > 0) {
      this.eventStore.appendEvents(tickEvents);
    }

    const tickSummary: TickEvent = {
      tick: this.currentTick,
      timestamp: tickStart,
      deltaMs: this.config.tickRateMs,
      activeAgents: this.agents.size,
      events: tickEvents,
    };

    // Notify tick listeners
    for (const tickListener of this.tickListeners) {
      tickListener(tickSummary);
    }

    return tickSummary;
  }

  /**
   * Updates a single agent during the simulation tick.
   */
  private updateAgentStep(
    agent: Agent,
    fsm: AgentStateMachine,
    emit: (event: SimulationEvent) => void
  ): void {
    // 1. If agent is BLOCKED, attempt to re-route if target is assigned
    if (fsm.state === 'BLOCKED' && agent.target) {
      const newPath = this.pathfinder.findPath(agent.position, agent.target);
      if (newPath.length > 0) {
        fsm.resolvePath('Alternative path found');
        const updated: Agent = {
          ...agent,
          state: fsm.state,
          path: newPath,
        };
        this.agents.set(agent.id, updated);
        this.spatialGrid.updateAgent(updated);

        emit({
          type: 'PATH_CALCULATED',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId: agent.id,
          from: agent.position,
          to: agent.target,
          path: newPath,
          pathLength: newPath.length,
        });

        emit({
          type: 'AGENT_STATE_CHANGED',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId: agent.id,
          previousState: 'BLOCKED',
          newState: fsm.state,
          reason: 'Path unblocked',
        });
        return;
      }
      return;
    }

    // 2. If agent is not NAVIGATING, nothing to move
    if (fsm.state !== 'NAVIGATING' || agent.path.length === 0 || !agent.target) {
      return;
    }

    const nextWaypoint = agent.path[0];
    if (!nextWaypoint) {
      return;
    }

    // Check if next waypoint has become an obstacle
    if (this.spatialGrid.hasObstacle(nextWaypoint)) {
      // Current path is blocked! Attempt recalculation
      const recalculated = this.pathfinder.findPath(agent.position, agent.target);

      if (recalculated.length === 0) {
        // Trapped / completely blocked
        fsm.block('Waypoint occupied by obstacle, no detour found');
        const blockedAgent: Agent = {
          ...agent,
          state: fsm.state,
          path: [],
        };
        this.agents.set(agent.id, blockedAgent);
        this.spatialGrid.updateAgent(blockedAgent);

        emit({
          type: 'AGENT_BLOCKED',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId: agent.id,
          position: agent.position,
          target: agent.target,
          reason: 'Waypoint blocked by obstacle',
        });

        emit({
          type: 'AGENT_STATE_CHANGED',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId: agent.id,
          previousState: 'NAVIGATING',
          newState: 'BLOCKED',
          reason: 'Path blocked by dynamic obstacle',
        });
        return;
      }

      // Detour found, update path and continue navigation
      emit({
        type: 'PATH_CALCULATED',
        tick: this.currentTick,
        timestamp: Date.now(),
        agentId: agent.id,
        from: agent.position,
        to: agent.target,
        path: recalculated,
        pathLength: recalculated.length,
      });

      const detourAgent: Agent = {
        ...agent,
        path: recalculated,
      };
      this.agents.set(agent.id, detourAgent);
      agent = detourAgent;
    }

    // 3. Move towards waypoint
    const currentWaypoint = agent.path[0];
    if (!currentWaypoint) {
      return;
    }

    const dist = vectorDistance(agent.position, currentWaypoint);
    const stepDist = agent.speed;

    if (dist <= stepDist || vectorEquals(agent.position, currentWaypoint, 1e-4)) {
      // Waypoint reached
      const previousPos = agent.position;
      const newPos = createVector(currentWaypoint.x, currentWaypoint.y);
      const remainingPath = agent.path.slice(1);

      emit({
        type: 'AGENT_MOVED',
        tick: this.currentTick,
        timestamp: Date.now(),
        agentId: agent.id,
        from: previousPos,
        to: newPos,
      });

      if (remainingPath.length === 0) {
        // Destination target reached!
        fsm.reachTarget('Agent reached final target waypoint');
        const completedAgent: Agent = {
          ...agent,
          position: newPos,
          state: fsm.state,
          path: [],
        };
        this.agents.set(agent.id, completedAgent);
        this.spatialGrid.updateAgent(completedAgent);

        emit({
          type: 'AGENT_REACHED_TARGET',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId: agent.id,
          target: newPos,
        });

        emit({
          type: 'AGENT_STATE_CHANGED',
          tick: this.currentTick,
          timestamp: Date.now(),
          agentId: agent.id,
          previousState: 'NAVIGATING',
          newState: fsm.state,
          reason: 'Destination reached',
        });
      } else {
        // Advance to next waypoint
        const advancedAgent: Agent = {
          ...agent,
          position: newPos,
          path: remainingPath,
        };
        this.agents.set(agent.id, advancedAgent);
        this.spatialGrid.updateAgent(advancedAgent);
      }
    } else {
      // Partial step towards current waypoint
      const previousPos = agent.position;
      const newPos = vectorLerp(agent.position, currentWaypoint, stepDist / dist);

      const movedAgent: Agent = {
        ...agent,
        position: newPos,
      };
      this.agents.set(agent.id, movedAgent);
      this.spatialGrid.updateAgent(movedAgent);

      emit({
        type: 'AGENT_MOVED',
        tick: this.currentTick,
        timestamp: Date.now(),
        agentId: agent.id,
        from: previousPos,
        to: newPos,
      });
    }
  }

  /** Emits an event immediately to subscribers and EventStore */
  private emitEvent(event: SimulationEvent): void {
    if (this.eventStore) {
      this.eventStore.appendEvent(event);
    }
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  // --- Simulation Loop Control ---

  /**
   * Starts the fixed-timestep simulation ticker.
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const startedEvent: SimulationStartedEvent = {
      type: 'SIMULATION_STARTED',
      tick: this.currentTick,
      timestamp: Date.now(),
      config: this.config,
    };
    this.emitEvent(startedEvent);

    this.timerHandle = setInterval(() => {
      this.step();
    }, this.config.tickRateMs);
  }

  /**
   * Stops the simulation ticker.
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }

    this.isRunning = false;
    const stoppedEvent: SimulationStoppedEvent = {
      type: 'SIMULATION_STOPPED',
      tick: this.currentTick,
      timestamp: Date.now(),
    };
    this.emitEvent(stoppedEvent);
  }

  // --- Snapshot & State Restoration ---

  /**
   * Takes a full snapshot of the current simulation state.
   */
  public getSnapshot(): SimulationSnapshot {
    return {
      tick: this.currentTick,
      timestamp: Date.now(),
      agents: Array.from(this.agents.values()).map((a) => ({
        ...a,
        position: createVector(a.position.x, a.position.y),
        target: a.target ? createVector(a.target.x, a.target.y) : null,
        path: a.path.map((p) => createVector(p.x, p.y)),
      })),
      obstacles: this.spatialGrid.getAllObstacles().map((o) => createVector(o.x, o.y)),
      config: { ...this.config },
    };
  }

  /**
   * Restores the simulation state from a snapshot.
   */
  public restoreFromSnapshot(snapshot: SimulationSnapshot): void {
    this.currentTick = snapshot.tick;
    this.spatialGrid.clear();
    this.agents.clear();
    this.fsms.clear();

    for (const obstacle of snapshot.obstacles) {
      this.spatialGrid.addObstacle(obstacle);
    }

    for (const agentData of snapshot.agents) {
      const fsm = new AgentStateMachine(agentData.id, agentData.state);
      this.fsms.set(agentData.id, fsm);

      const agent: Agent = {
        id: agentData.id,
        position: createVector(agentData.position.x, agentData.position.y),
        target: agentData.target ? createVector(agentData.target.x, agentData.target.y) : null,
        state: agentData.state,
        path: agentData.path.map((p) => createVector(p.x, p.y)),
        speed: agentData.speed,
        radius: agentData.radius,
      };

      this.agents.set(agent.id, agent);
      this.spatialGrid.insertAgent(agent);
    }
  }

  /**
   * Cleans up all engine resources and stops active timers.
   */
  public dispose(): void {
    this.stop();
    this.eventListeners.clear();
    this.tickListeners.clear();
    this.spatialGrid.clear();
    this.agents.clear();
    this.fsms.clear();
  }
}
