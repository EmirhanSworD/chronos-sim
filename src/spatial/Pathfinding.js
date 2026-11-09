/**
 * Min-Heap Priority Queue for fast O(log N) node extraction.
 */
class MinHeap {
    items = [];
    get size() {
        return this.items.length;
    }
    isEmpty() {
        return this.items.length === 0;
    }
    push(node) {
        node.heapIndex = this.items.length;
        this.items.push(node);
        this.bubbleUp(node.heapIndex);
    }
    pop() {
        if (this.items.length === 0) {
            return undefined;
        }
        const root = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0 && last !== undefined) {
            this.items[0] = last;
            last.heapIndex = 0;
            this.sinkDown(0);
        }
        return root;
    }
    update(node) {
        this.bubbleUp(node.heapIndex);
        this.sinkDown(node.heapIndex);
    }
    bubbleUp(index) {
        let current = index;
        const node = this.items[current];
        if (!node)
            return;
        while (current > 0) {
            const parentIndex = (current - 1) >> 1;
            const parent = this.items[parentIndex];
            if (!parent)
                break;
            if (node.f < parent.f || (node.f === parent.f && node.h < parent.h)) {
                this.items[current] = parent;
                parent.heapIndex = current;
                current = parentIndex;
            }
            else {
                break;
            }
        }
        this.items[current] = node;
        node.heapIndex = current;
    }
    sinkDown(index) {
        let current = index;
        const length = this.items.length;
        const node = this.items[current];
        if (!node)
            return;
        while (true) {
            const leftChildIndex = (current << 1) + 1;
            const rightChildIndex = leftChildIndex + 1;
            let swapIndex = -1;
            if (leftChildIndex < length) {
                const left = this.items[leftChildIndex];
                if (left && (left.f < node.f || (left.f === node.f && left.h < node.h))) {
                    swapIndex = leftChildIndex;
                }
            }
            if (rightChildIndex < length) {
                const right = this.items[rightChildIndex];
                const compareTarget = swapIndex === -1 ? node : this.items[swapIndex];
                if (right && compareTarget && (right.f < compareTarget.f || (right.f === compareTarget.f && right.h < compareTarget.h))) {
                    swapIndex = rightChildIndex;
                }
            }
            if (swapIndex === -1) {
                break;
            }
            const swapNode = this.items[swapIndex];
            if (!swapNode)
                break;
            this.items[current] = swapNode;
            swapNode.heapIndex = current;
            current = swapIndex;
        }
        this.items[current] = node;
        node.heapIndex = current;
    }
}
/**
 * Optimized A* (A-Star) Pathfinding Algorithm.
 * Supports dynamic obstacles, 8-directional movement, corner-cutting prevention,
 * and admissible Octile heuristic with deterministic tie-breaking.
 */
export class AStarPathfinder {
    grid;
    allowDiagonal;
    diagonalCost;
    cardinalCost;
    preventCornerCutting;
    maxIterations;
    directions;
    constructor(grid, options) {
        this.grid = grid;
        this.allowDiagonal = options?.allowDiagonal ?? true;
        this.diagonalCost = options?.diagonalCost ?? Math.SQRT2;
        this.cardinalCost = options?.cardinalCost ?? 1.0;
        this.preventCornerCutting = options?.preventCornerCutting ?? true;
        this.maxIterations = options?.maxIterations ?? 10000;
        const dirs = [
            { dx: 1, dy: 0, isDiagonal: false, cost: this.cardinalCost },
            { dx: -1, dy: 0, isDiagonal: false, cost: this.cardinalCost },
            { dx: 0, dy: 1, isDiagonal: false, cost: this.cardinalCost },
            { dx: 0, dy: -1, isDiagonal: false, cost: this.cardinalCost },
        ];
        if (this.allowDiagonal) {
            dirs.push({ dx: 1, dy: 1, isDiagonal: true, cost: this.diagonalCost }, { dx: -1, dy: 1, isDiagonal: true, cost: this.diagonalCost }, { dx: 1, dy: -1, isDiagonal: true, cost: this.diagonalCost }, { dx: -1, dy: -1, isDiagonal: true, cost: this.diagonalCost });
        }
        this.directions = dirs;
    }
    /**
     * Calculates the shortest path between start and target world coordinates.
     * Returns an array of waypoints (cell centers in world coordinates),
     * excluding the starting point and including the target.
     * Returns empty array if no traversable path exists.
     */
    findPath(start, target) {
        const startCell = this.grid.worldToCell(start);
        const targetCell = this.grid.worldToCell(target);
        // If out of bounds or target is blocked, no path exists
        if (!this.grid.isCellInBounds(startCell.cx, startCell.cy) || !this.grid.isCellInBounds(targetCell.cx, targetCell.cy)) {
            return [];
        }
        if (this.grid.hasObstacleAtCell(targetCell.cx, targetCell.cy)) {
            return [];
        }
        // Already at target cell
        if (startCell.cx === targetCell.cx && startCell.cy === targetCell.cy) {
            return [{ x: target.x, y: target.y }];
        }
        const openHeap = new MinHeap();
        const nodeMap = new Map();
        const startH = this.heuristic(startCell.cx, startCell.cy, targetCell.cx, targetCell.cy);
        const startNode = {
            cx: startCell.cx,
            cy: startCell.cy,
            g: 0,
            h: startH,
            f: startH,
            parent: null,
            heapIndex: -1,
            closed: false,
        };
        const startKey = this.grid.cellKey(startCell.cx, startCell.cy);
        nodeMap.set(startKey, startNode);
        openHeap.push(startNode);
        let iterations = 0;
        while (!openHeap.isEmpty()) {
            if (++iterations > this.maxIterations) {
                // Exceeded budget, path unreachable within limits
                return [];
            }
            const current = openHeap.pop();
            if (!current) {
                break;
            }
            current.closed = true;
            // Target reached!
            if (current.cx === targetCell.cx && current.cy === targetCell.cy) {
                return this.reconstructPath(current, target);
            }
            for (const dir of this.directions) {
                const nx = current.cx + dir.dx;
                const ny = current.cy + dir.dy;
                // Bounds and obstacle check
                if (!this.grid.isTraversableCell(nx, ny)) {
                    continue;
                }
                // Prevent corner cutting across diagonal obstacles
                if (dir.isDiagonal && this.preventCornerCutting) {
                    const ortho1Walkable = this.grid.isTraversableCell(current.cx + dir.dx, current.cy);
                    const ortho2Walkable = this.grid.isTraversableCell(current.cx, current.cy + dir.dy);
                    if (!ortho1Walkable || !ortho2Walkable) {
                        continue;
                    }
                }
                const neighborKey = this.grid.cellKey(nx, ny);
                let neighbor = nodeMap.get(neighborKey);
                if (neighbor && neighbor.closed) {
                    continue;
                }
                const tentativeG = current.g + dir.cost;
                if (!neighbor) {
                    const h = this.heuristic(nx, ny, targetCell.cx, targetCell.cy);
                    neighbor = {
                        cx: nx,
                        cy: ny,
                        g: tentativeG,
                        h,
                        // Small tie-breaking nudges search towards direct line
                        f: tentativeG + h * 1.0001,
                        parent: current,
                        heapIndex: -1,
                        closed: false,
                    };
                    nodeMap.set(neighborKey, neighbor);
                    openHeap.push(neighbor);
                }
                else if (tentativeG < neighbor.g) {
                    neighbor.parent = current;
                    neighbor.g = tentativeG;
                    neighbor.f = tentativeG + neighbor.h * 1.0001;
                    openHeap.update(neighbor);
                }
            }
        }
        // No path found
        return [];
    }
    /**
     * Admissible Octile heuristic for 8-directional movement,
     * falls back to Manhattan heuristic if diagonal is disabled.
     */
    heuristic(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        if (!this.allowDiagonal) {
            return (dx + dy) * this.cardinalCost;
        }
        const minD = Math.min(dx, dy);
        const maxD = Math.max(dx, dy);
        return (this.diagonalCost - this.cardinalCost) * minD + this.cardinalCost * maxD;
    }
    /**
     * Reconstructs world coordinate waypoint list from target node.
     */
    reconstructPath(endNode, finalTarget) {
        const path = [];
        let current = endNode;
        while (current !== null && current.parent !== null) {
            if (current === endNode) {
                // Last waypoint is exact final target coordinate
                path.push({ x: finalTarget.x, y: finalTarget.y });
            }
            else {
                path.push(this.grid.cellToWorld(current.cx, current.cy));
            }
            current = current.parent;
        }
        // Reverse to get start-to-end order
        path.reverse();
        return path;
    }
}
//# sourceMappingURL=Pathfinding.js.map