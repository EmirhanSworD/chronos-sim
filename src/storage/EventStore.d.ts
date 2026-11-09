import type { SimulationEvent, SimulationEventType, SimulationFrame, SimulationSnapshot } from '../core/Types.js';
export interface EventStoreOptions {
    /** Database file path or ':memory:' */
    readonly path?: string | undefined;
    /** In-memory database shortcut */
    readonly inMemory?: boolean | undefined;
}
/**
 * High-Performance Event Store backed by SQLite with WAL (Write-Ahead-Log) mode.
 * Supports transactional appending of events, periodic snapshots, and complete per-tick
 * simulation frames for full deterministic Time-Travel Replay.
 */
export declare class EventStore {
    private readonly db;
    private readonly insertEventStmt;
    private readonly insertSnapshotStmt;
    private readonly insertFrameStmt;
    private readonly batchInsertEventsTx;
    private readonly saveSnapshotTx;
    private readonly saveFrameTx;
    constructor(options?: EventStoreOptions);
    private configurePragmas;
    private initTables;
    private extractAggregateId;
    appendEvent(event: SimulationEvent): void;
    appendEvents(events: readonly SimulationEvent[]): void;
    saveSnapshot(snapshot: SimulationSnapshot): void;
    /**
     * Serializes and stores a complete simulation frame for a specific tick.
     */
    saveFrame(frame: SimulationFrame): void;
    /**
     * Instantly retrieves the complete simulation frame at an exact historical tick.
     */
    getFrame(tick: number): SimulationFrame | null;
    /**
     * Retrieves a continuous range of historical simulation frames for replay interpolation.
     */
    getHistoryRange(fromTick: number, toTick: number): SimulationFrame[];
    /** Returns total count of recorded simulation frames */
    getFrameCount(): number;
    /** Retrieves the latest recorded simulation frame */
    getLatestFrame(): SimulationFrame | null;
    getEvents(fromTick?: number, toTick?: number): SimulationEvent[];
    getEventsByType(eventType: SimulationEventType): SimulationEvent[];
    getEventsForAgent(agentId: string): SimulationEvent[];
    getLatestSnapshot(): SimulationSnapshot | null;
    getSnapshotAtOrBefore(tick: number): SimulationSnapshot | null;
    getEventCount(): number;
    getSnapshotCount(): number;
    clear(): void;
    close(): void;
}
//# sourceMappingURL=EventStore.d.ts.map