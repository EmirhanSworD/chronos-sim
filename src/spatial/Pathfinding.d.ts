import type { Vector2D } from '../core/Types.js';
import type { SpatialGrid } from './SpatialGrid.js';
export interface PathfindingOptions {
    readonly allowDiagonal?: boolean | undefined;
    readonly diagonalCost?: number | undefined;
    readonly cardinalCost?: number | undefined;
    readonly preventCornerCutting?: boolean | undefined;
    readonly maxIterations?: number | undefined;
}
/**
 * Optimized A* (A-Star) Pathfinding Algorithm.
 * Supports dynamic obstacles, 8-directional movement, corner-cutting prevention,
 * and admissible Octile heuristic with deterministic tie-breaking.
 */
export declare class AStarPathfinder {
    private readonly grid;
    private readonly allowDiagonal;
    private readonly diagonalCost;
    private readonly cardinalCost;
    private readonly preventCornerCutting;
    private readonly maxIterations;
    private readonly directions;
    constructor(grid: SpatialGrid, options?: PathfindingOptions);
    /**
     * Calculates the shortest path between start and target world coordinates.
     * Returns an array of waypoints (cell centers in world coordinates),
     * excluding the starting point and including the target.
     * Returns empty array if no traversable path exists.
     */
    findPath(start: Vector2D, target: Vector2D): Vector2D[];
    /**
     * Admissible Octile heuristic for 8-directional movement,
     * falls back to Manhattan heuristic if diagonal is disabled.
     */
    private heuristic;
    /**
     * Reconstructs world coordinate waypoint list from target node.
     */
    private reconstructPath;
}
//# sourceMappingURL=Pathfinding.d.ts.map