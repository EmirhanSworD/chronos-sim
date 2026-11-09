import type { AgentState } from '../core/Types.js';
export type AgentTrigger = 'START_NAVIGATION' | 'OBSTACLE_BLOCKED' | 'PATH_RESOLVED' | 'TARGET_REACHED' | 'STOP' | 'RESET';
export interface TransitionContext {
    readonly agentId: string;
    readonly tick?: number | undefined;
    readonly reason?: string | undefined;
}
export interface TransitionResult<TState extends string> {
    readonly success: boolean;
    readonly from: TState;
    readonly to: TState;
    readonly trigger: string;
    readonly reason?: string | undefined;
}
export type StateListener<TState extends string, TContext> = (from: TState, to: TState, context: TContext, reason?: string | undefined) => void;
export type GuardCondition<TContext> = (context: TContext) => boolean;
/**
 * Generic Type-Safe Finite State Machine.
 * Enforces transition validity at compile-time and run-time with guards and lifecycle hooks.
 */
export declare class StateMachine<TState extends string, TTrigger extends string, TContext> {
    private currentState;
    private readonly context;
    private readonly transitions;
    private readonly enterListeners;
    private readonly exitListeners;
    private readonly anyTransitionListeners;
    constructor(initialState: TState, initialContext: TContext);
    /**
     * Registers a valid transition rule between states.
     */
    addTransition(from: TState, trigger: TTrigger, to: TState, guard?: GuardCondition<TContext>): this;
    /** Current state */
    get state(): TState;
    /** Current state context */
    get currentContext(): Readonly<TContext>;
    /**
     * Checks whether a trigger is valid and executable from the current state.
     */
    canTrigger(trigger: TTrigger): boolean;
    /**
     * Attempts to execute a state transition.
     */
    trigger(trigger: TTrigger, reason?: string): TransitionResult<TState>;
    /** Adds listener invoked when entering a specific state */
    onEnter(state: TState, listener: StateListener<TState, TContext>): this;
    /** Adds listener invoked when exiting a specific state */
    onExit(state: TState, listener: StateListener<TState, TContext>): this;
    /** Adds listener invoked on any successful state change */
    onTransition(listener: StateListener<TState, TContext>): this;
}
/**
 * Type-Safe Agent State Machine
 * Manages states: IDLE, NAVIGATING, BLOCKED, COMPLETED
 */
export declare class AgentStateMachine {
    private readonly fsm;
    constructor(agentId: string, initialState?: AgentState);
    private setupTransitions;
    get state(): AgentState;
    canTransition(trigger: AgentTrigger): boolean;
    startNavigation(reason?: string): TransitionResult<AgentState>;
    block(reason?: string): TransitionResult<AgentState>;
    resolvePath(reason?: string): TransitionResult<AgentState>;
    reachTarget(reason?: string): TransitionResult<AgentState>;
    stop(reason?: string): TransitionResult<AgentState>;
    reset(reason?: string): TransitionResult<AgentState>;
    onTransition(listener: StateListener<AgentState, TransitionContext>): this;
}
//# sourceMappingURL=StateMachine.d.ts.map