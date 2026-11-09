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
 * Optimized A* (A-Star) Pathfinding Algorithm with Terrain Costs.
 * Evaluates variable cell movement costs (EMPTY: 1, ROAD: 0.5, MUD: 5, WALL: Infinity),
 * selects the cheapest available route, and supports 8-directional movement with corner-cutting prevention.
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
     * Calculates the cheapest path between start and target world coordinates,
     * factoring in terrain costs (gCost += terrainCost * stepDistance).
     */
    findPath(start: Vector2D, target: Vector2D): Vector2D[];
    /**
     * Calculates the cheapest path and returns both waypoints and accumulated traversal cost.
     */
    findPathWithCost(start: Vector2D, target: Vector2D): {
        readonly path: Vector2D[];
        readonly totalCost: number;
    };
    /**
     * Admissible Octile heuristic scaled by the minimum possible terrain cost (ROAD = 0.5)
     * to guarantee that A* never overestimates and consistently finds the cost-optimal route.
     */
    private heuristic;
    /**
     * Reconstructs world coordinate waypoint list from target node.
     */
    private reconstructPath;
}
//# sourceMappingURL=Pathfinding.d.ts.map