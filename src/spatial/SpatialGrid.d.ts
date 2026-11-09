import type { Agent, CellType, Vector2D } from '../core/Types.js';
export interface SpatialGridOptions {
    readonly width: number;
    readonly height: number;
    readonly cellSize: number;
}
/**
 * 2D Spatial Hash Grid with Terrain Costs & Dynamic Obstacle Tracking.
 * Provides O(1) average lookup for near neighbors, terrain cell types (EMPTY, WALL, MUD, ROAD, STATION),
 * dynamic obstacle management, and station queries.
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
    /** Map of cellKey -> CellType (MUD, ROAD, STATION, etc.) */
    private readonly cellTypes;
    /** Map of cellKey -> Station Vector2D */
    private readonly stations;
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
     * Sets the terrain type for a cell.
     */
    setCellType(cx: number, cy: number, type: CellType): void;
    /**
     * Gets the cell type for a cell coordinate.
     */
    getCellType(cx: number, cy: number): CellType;
    /**
     * Gets the traversal cost of a cell.
     * EMPTY: 1.0, ROAD: 0.5, MUD: 5.0, STATION: 1.0, WALL: Infinity.
     */
    getCellCost(cx: number, cy: number): number;
    /**
     * Registers a charging station at the specified position.
     */
    addStation(pos: Vector2D): void;
    /**
     * Removes a charging station at the specified position.
     */
    removeStation(pos: Vector2D): boolean;
    /** Returns all registered station positions */
    getStations(): readonly Vector2D[];
    /**
     * Finds the nearest charging station to a given position.
     */
    findNearestStation(pos: Vector2D): Vector2D | null;
    /** Returns all customized cell types */
    getAllCellTypes(): readonly {
        readonly x: number;
        readonly y: number;
        readonly type: CellType;
    }[];
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
     * Checks whether a cell coordinate is traversable (within bounds and not a wall).
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
    /** Resets agents, obstacles, and cell types */
    clear(): void;
}
//# sourceMappingURL=SpatialGrid.d.ts.map