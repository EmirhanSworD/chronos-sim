import type { Agent, Vector2D } from '../core/Types.js';
export interface SpatialGridOptions {
    readonly width: number;
    readonly height: number;
    readonly cellSize: number;
}
/**
 * 2D Spatial Hash Grid
 * Provides O(1) average lookup for near neighbors, dynamic obstacle tracking,
 * and spatial indexing of moving agents without brute-force pairwise distance checks.
 */
export declare class SpatialGrid {
    readonly width: number;
    readonly height: number;
    readonly cellSize: number;
    readonly cols: number;
    readonly rows: number;
    /** Map of cellKey -> Set of agent IDs located in that cell */
    private readonly agentCells;
    /** Map of agentId -> agent data and its current cellKey */
    private readonly agents;
    /** Map of cellKey -> Obstacle Vector2D */
    private readonly obstacles;
    constructor(options: SpatialGridOptions);
    /** Converts world coordinates to discrete grid cell coordinates */
    worldToCell(pos: Vector2D): {
        readonly cx: number;
        readonly cy: number;
    };
    /** Converts cell coordinates to world center of that cell */
    cellToWorld(cx: number, cy: number): Vector2D;
    /** Generates a unique string hash key for a cell coordinate */
    cellKey(cx: number, cy: number): string;
    /** Generates a cell hash key directly from world coordinates */
    posKey(pos: Vector2D): string;
    /** Checks if world position is inside simulation boundaries */
    isInBounds(pos: Vector2D): boolean;
    /** Checks if cell coordinates are inside grid bounds */
    isCellInBounds(cx: number, cy: number): boolean;
    /**
     * Registers a dynamic obstacle at the given position.
     * Returns true if newly added, false if already present or out of bounds.
     */
    addObstacle(pos: Vector2D): boolean;
    /**
     * Removes a dynamic obstacle at the given position.
     * Returns true if removed, false if not found.
     */
    removeObstacle(pos: Vector2D): boolean;
    /**
     * Checks whether a specific world coordinate or cell is blocked by an obstacle.
     */
    hasObstacle(pos: Vector2D): boolean;
    /**
     * Checks whether specific cell coordinates are blocked by an obstacle.
     */
    hasObstacleAtCell(cx: number, cy: number): boolean;
    /**
     * Checks whether a cell coordinate is traversable (within bounds and no obstacle).
     */
    isTraversableCell(cx: number, cy: number): boolean;
    /** Returns all registered obstacle positions */
    getAllObstacles(): readonly Vector2D[];
    /** Total obstacle count */
    get obstacleCount(): number;
    /** Clears all obstacles */
    clearObstacles(): void;
    /**
     * Inserts an agent into the spatial grid.
     */
    insertAgent(agent: Agent): void;
    /**
     * Updates an agent's position in the spatial grid in O(1) time.
     */
    updateAgent(agent: Agent): void;
    /**
     * Removes an agent from the spatial grid.
     */
    removeAgent(agentId: string): boolean;
    /** Retrieves an agent by its ID */
    getAgent(agentId: string): Agent | undefined;
    /** Returns all active agents currently registered */
    getAllAgents(): readonly Agent[];
    /** Total agent count */
    get agentCount(): number;
    /**
     * Queries all agents within a given Euclidean radius of the center.
     * Runs in O(1) average time when radius is bounded relative to cell size.
     */
    queryRadius(center: Vector2D, radius: number): Agent[];
    /**
     * Finds the nearest agent to the center within maxRadius, optionally matching a filter predicate.
     */
    queryNearest(center: Vector2D, maxRadius: number, filter?: (agent: Agent) => boolean): {
        readonly agent: Agent;
        readonly distanceSq: number;
    } | null;
    /**
     * Retrieves obstacles within a given radius.
     */
    queryObstaclesInRadius(center: Vector2D, radius: number): Vector2D[];
    /** Resets agents and obstacles */
    clear(): void;
}
//# sourceMappingURL=SpatialGrid.d.ts.map