import type { Agent, AgentState, SimulationConfig, SimulationEvent, SimulationEventType, SimulationSnapshot, TickEvent, Vector2D } from './Types.js';
import { SpatialGrid } from '../spatial/SpatialGrid.js';
import { AStarPathfinder } from '../spatial/Pathfinding.js';
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
export declare class SimulationEngine {
    readonly config: SimulationConfig;
    readonly spatialGrid: SpatialGrid;
    readonly pathfinder: AStarPathfinder;
    private currentTick;
    private isRunning;
    private timerHandle;
    private readonly eventStore;
    /** Registered agents map: agentId -> mutable state record */
    private readonly agents;
    /** Agent state machines map: agentId -> FSM */
    private readonly fsms;
    /** Event listeners */
    private readonly eventListeners;
    private readonly tickListeners;
    constructor(options?: EngineOptions | undefined);
    get tick(): number;
    get active(): boolean;
    getAgent(id: string): Agent | undefined;
    getAllAgents(): readonly Agent[];
    getAgentState(id: string): AgentState | undefined;
    /** Subscribes to all discrete simulation events */
    subscribe(listener: EventCallback): () => void;
    /** Subscribes to tick completion summaries */
    onTick(listener: TickCallback): () => void;
    /** Subscribes to a specific simulation event type */
    on<T extends SimulationEventType>(type: T, listener: (event: Extract<SimulationEvent, {
        type: T;
    }>) => void): () => void;
    /**
     * Spawns a new agent into the simulation.
     */
    spawnAgent(options: SpawnAgentOptions): Agent;
    /**
     * Removes an agent from the simulation.
     */
    despawnAgent(agentId: string): boolean;
    /**
     * Assigns a destination target to an agent and triggers path calculation.
     */
    setAgentTarget(agentId: string, target: Vector2D): boolean;
    /**
     * Adds a dynamic obstacle at the specified position.
     */
    addObstacle(position: Vector2D): boolean;
    /**
     * Removes a dynamic obstacle.
     */
    removeObstacle(position: Vector2D): boolean;
    /**
     * Executes a single fixed simulation tick deterministically.
     * Updates all agents, checks obstacle collisions, handles re-routing,
     * emits events, and persists snapshots at designated intervals.
     */
    step(): TickEvent;
    /**
     * Updates a single agent during the simulation tick.
     */
    private updateAgentStep;
    /** Emits an event immediately to subscribers and EventStore */
    private emitEvent;
    /**
     * Starts the fixed-timestep simulation ticker.
     */
    start(): void;
    /**
     * Stops the simulation ticker.
     */
    stop(): void;
    /**
     * Takes a full snapshot of the current simulation state.
     */
    getSnapshot(): SimulationSnapshot;
    /**
     * Restores the simulation state from a snapshot.
     */
    restoreFromSnapshot(snapshot: SimulationSnapshot): void;
    /**
     * Cleans up all engine resources and stops active timers.
     */
    dispose(): void;
}
export {};
//# sourceMappingURL=Engine.d.ts.map