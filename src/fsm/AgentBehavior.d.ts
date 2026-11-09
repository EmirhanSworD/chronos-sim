import type { Agent, Threat, Vector2D } from '../core/Types.js';
import type { SpatialGrid } from '../spatial/SpatialGrid.js';
export interface EvasionResult {
    readonly shouldEvade: boolean;
    readonly threat: Threat | null;
    readonly evasionTarget: Vector2D | null;
}
/**
 * Agent Behavior & Decision Module
 * Handles stamina dissipation, emergency station re-routing,
 * and dynamic predator avoidance vector generation.
 */
export declare class AgentBehavior {
    /**
     * Evaluates threat proximity. If any threat is closer than threshold (default 5.0),
     * returns the threat and calculates an escape vector opposite to the threat position.
     */
    static evaluateThreatEvasion(agentPos: Vector2D, threats: readonly Threat[], grid: SpatialGrid, threshold?: number, evasionDistance?: number): EvasionResult;
    /**
     * Determines if agent stamina has fallen below the critical threshold (default 20%).
     */
    static isLowStamina(agent: Agent, thresholdPercent?: number): boolean;
    /**
     * Calculates the stamina burn for moving through a specific terrain cell.
     * Mud (cost 5) expends more energy; Road (cost 0.5) conserves energy.
     */
    static calculateEnergyBurn(burnRate: number, terrainCost: number, isEvading?: boolean): number;
    /**
     * Applies energy burn to agent, clamping stamina between 0 and maxStamina.
     */
    static burnStamina(currentStamina: number, burn: number): number;
    /**
     * Recharges agent stamina at a station, up to maxStamina.
     */
    static rechargeStamina(currentStamina: number, maxStamina: number, rechargeRate?: number): number;
}
//# sourceMappingURL=AgentBehavior.d.ts.map