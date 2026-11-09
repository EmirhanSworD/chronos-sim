import { createVector, vectorDistance, vectorNormalize, vectorScale, vectorAdd, } from '../core/Types.js';
/**
 * Agent Behavior & Decision Module
 * Handles stamina dissipation, emergency station re-routing,
 * and dynamic predator avoidance vector generation.
 */
export class AgentBehavior {
    /**
     * Evaluates threat proximity. If any threat is closer than threshold (default 5.0),
     * returns the threat and calculates an escape vector opposite to the threat position.
     */
    static evaluateThreatEvasion(agentPos, threats, grid, threshold = 5.0, evasionDistance = 4.0) {
        let closestThreat = null;
        let minDistance = threshold;
        for (const threat of threats) {
            const dist = vectorDistance(agentPos, threat.position);
            if (dist < minDistance) {
                minDistance = dist;
                closestThreat = threat;
            }
        }
        if (!closestThreat) {
            return { shouldEvade: false, threat: null, evasionTarget: null };
        }
        // Compute escape direction pointing strictly away from the predator
        const dx = agentPos.x - closestThreat.position.x;
        const dy = agentPos.y - closestThreat.position.y;
        let escapeDir = vectorNormalize({ x: dx, y: dy });
        // Handle exact collision center
        if (escapeDir.x === 0 && escapeDir.y === 0) {
            escapeDir = { x: 1, y: 0 };
        }
        // Search for a valid, traversable evasion cell in the escape trajectory
        let candidateTarget = null;
        // Try primary direction, then fan out at +/- 45, +/- 90 degrees if blocked by wall
        const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
        const baseAngle = Math.atan2(escapeDir.y, escapeDir.x);
        for (const angleOffset of angles) {
            const angle = baseAngle + angleOffset;
            const testDir = { x: Math.cos(angle), y: Math.sin(angle) };
            const rawTarget = vectorAdd(agentPos, vectorScale(testDir, evasionDistance));
            const cell = grid.worldToCell(rawTarget);
            const clampedCx = Math.max(0, Math.min(grid.cols - 1, cell.cx));
            const clampedCy = Math.max(0, Math.min(grid.rows - 1, cell.cy));
            if (grid.isTraversableCell(clampedCx, clampedCy)) {
                candidateTarget = grid.cellToWorld(clampedCx, clampedCy);
                break;
            }
        }
        // Fallback: stay within bounds
        if (!candidateTarget) {
            const fallbackX = Math.max(0, Math.min(grid.width - 1, agentPos.x + escapeDir.x * 2));
            const fallbackY = Math.max(0, Math.min(grid.height - 1, agentPos.y + escapeDir.y * 2));
            candidateTarget = createVector(fallbackX, fallbackY);
        }
        return {
            shouldEvade: true,
            threat: closestThreat,
            evasionTarget: candidateTarget,
        };
    }
    /**
     * Determines if agent stamina has fallen below the critical threshold (default 20%).
     */
    static isLowStamina(agent, thresholdPercent = 20) {
        if (agent.maxStamina <= 0)
            return true;
        const percent = (agent.stamina / agent.maxStamina) * 100;
        return percent < thresholdPercent;
    }
    /**
     * Calculates the stamina burn for moving through a specific terrain cell.
     * Mud (cost 5) expends more energy; Road (cost 0.5) conserves energy.
     */
    static calculateEnergyBurn(burnRate, terrainCost, isEvading = false) {
        const multiplier = isEvading ? 1.5 : 1.0;
        const effectiveCost = Math.max(0.5, Math.min(10.0, terrainCost));
        return burnRate * effectiveCost * multiplier;
    }
    /**
     * Applies energy burn to agent, clamping stamina between 0 and maxStamina.
     */
    static burnStamina(currentStamina, burn) {
        return Math.max(0, currentStamina - burn);
    }
    /**
     * Recharges agent stamina at a station, up to maxStamina.
     */
    static rechargeStamina(currentStamina, maxStamina, rechargeRate = 10.0) {
        return Math.min(maxStamina, currentStamina + rechargeRate);
    }
}
//# sourceMappingURL=AgentBehavior.js.map