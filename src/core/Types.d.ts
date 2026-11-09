/**
 * chronos-sim: Core Type Definitions
 * Deterministic simulation and event-sourced state engine types.
 */
export interface Vector2D {
    readonly x: number;
    readonly y: number;
}
export type AgentState = 'IDLE' | 'NAVIGATING' | 'BLOCKED' | 'COMPLETED';
export interface Agent {
    readonly id: string;
    readonly position: Vector2D;
    readonly target: Vector2D | null;
    readonly state: AgentState;
    readonly path: readonly Vector2D[];
    readonly speed: number;
    readonly radius: number;
}
export interface SimulationConfig {
    readonly tickRateMs: number;
    readonly gridWidth: number;
    readonly gridHeight: number;
    readonly cellSize: number;
    readonly allowDiagonal: boolean;
    readonly diagonalCostMultiplier: number;
    readonly snapshotIntervalTicks: number;
    readonly defaultAgentSpeed: number;
    readonly maxAStarIterations: number;
}
export declare const DEFAULT_SIMULATION_CONFIG: SimulationConfig;
export interface AgentSpawnedEvent {
    readonly type: 'AGENT_SPAWNED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agent: Agent;
}
export interface AgentDespawnedEvent {
    readonly type: 'AGENT_DESPAWNED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentId: string;
}
export interface AgentMovedEvent {
    readonly type: 'AGENT_MOVED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentId: string;
    readonly from: Vector2D;
    readonly to: Vector2D;
}
export interface AgentStateChangedEvent {
    readonly type: 'AGENT_STATE_CHANGED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentId: string;
    readonly previousState: AgentState;
    readonly newState: AgentState;
    readonly reason?: string | undefined;
}
export interface PathCalculatedEvent {
    readonly type: 'PATH_CALCULATED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentId: string;
    readonly from: Vector2D;
    readonly to: Vector2D;
    readonly path: readonly Vector2D[];
    readonly pathLength: number;
}
export interface AgentReachedTargetEvent {
    readonly type: 'AGENT_REACHED_TARGET';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentId: string;
    readonly target: Vector2D;
}
export interface AgentBlockedEvent {
    readonly type: 'AGENT_BLOCKED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentId: string;
    readonly position: Vector2D;
    readonly target: Vector2D;
    readonly reason: string;
}
export interface ObstacleAddedEvent {
    readonly type: 'OBSTACLE_ADDED';
    readonly tick: number;
    readonly timestamp: number;
    readonly position: Vector2D;
}
export interface ObstacleRemovedEvent {
    readonly type: 'OBSTACLE_REMOVED';
    readonly tick: number;
    readonly timestamp: number;
    readonly position: Vector2D;
}
export interface SimulationStartedEvent {
    readonly type: 'SIMULATION_STARTED';
    readonly tick: number;
    readonly timestamp: number;
    readonly config: SimulationConfig;
}
export interface SimulationStoppedEvent {
    readonly type: 'SIMULATION_STOPPED';
    readonly tick: number;
    readonly timestamp: number;
}
export interface SnapshotCreatedEvent {
    readonly type: 'SNAPSHOT_CREATED';
    readonly tick: number;
    readonly timestamp: number;
    readonly agentCount: number;
    readonly obstacleCount: number;
}
export type SimulationEvent = AgentSpawnedEvent | AgentDespawnedEvent | AgentMovedEvent | AgentStateChangedEvent | PathCalculatedEvent | AgentReachedTargetEvent | AgentBlockedEvent | ObstacleAddedEvent | ObstacleRemovedEvent | SimulationStartedEvent | SimulationStoppedEvent | SnapshotCreatedEvent;
export type SimulationEventType = SimulationEvent['type'];
export interface TickEvent {
    readonly tick: number;
    readonly timestamp: number;
    readonly deltaMs: number;
    readonly activeAgents: number;
    readonly events: readonly SimulationEvent[];
}
export interface SimulationSnapshot {
    readonly tick: number;
    readonly timestamp: number;
    readonly agents: readonly Agent[];
    readonly obstacles: readonly Vector2D[];
    readonly config: SimulationConfig;
}
export declare function createVector(x: number, y: number): Vector2D;
export declare function vectorEquals(a: Vector2D, b: Vector2D, tolerance?: number): boolean;
export declare function vectorDistanceSq(a: Vector2D, b: Vector2D): number;
export declare function vectorDistance(a: Vector2D, b: Vector2D): number;
export declare function vectorManhattan(a: Vector2D, b: Vector2D): number;
export declare function vectorAdd(a: Vector2D, b: Vector2D): Vector2D;
export declare function vectorSubtract(a: Vector2D, b: Vector2D): Vector2D;
export declare function vectorLerp(a: Vector2D, b: Vector2D, t: number): Vector2D;
export declare function vectorRound(v: Vector2D): Vector2D;
export declare function vectorKey(v: Vector2D): string;
//# sourceMappingURL=Types.d.ts.map