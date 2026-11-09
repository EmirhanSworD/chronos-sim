import type { AgentState } from '../core/Types.js';

export type AgentTrigger =
  | 'START_NAVIGATION'
  | 'OBSTACLE_BLOCKED'
  | 'PATH_RESOLVED'
  | 'TARGET_REACHED'
  | 'STOP'
  | 'RESET';

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

export type StateListener<TState extends string, TContext> = (
  from: TState,
  to: TState,
  context: TContext,
  reason?: string | undefined
) => void;

export type GuardCondition<TContext> = (context: TContext) => boolean;

interface TransitionRule<TState extends string, TTrigger extends string, TContext> {
  readonly from: TState;
  readonly trigger: TTrigger;
  readonly to: TState;
  readonly guard?: GuardCondition<TContext> | undefined;
}

/**
 * Generic Type-Safe Finite State Machine.
 * Enforces transition validity at compile-time and run-time with guards and lifecycle hooks.
 */
export class StateMachine<TState extends string, TTrigger extends string, TContext> {
  private currentState: TState;
  private readonly context: TContext;
  private readonly transitions: Map<string, TransitionRule<TState, TTrigger, TContext>[]> = new Map();
  private readonly enterListeners: Map<TState, StateListener<TState, TContext>[]> = new Map();
  private readonly exitListeners: Map<TState, StateListener<TState, TContext>[]> = new Map();
  private readonly anyTransitionListeners: StateListener<TState, TContext>[] = [];

  constructor(initialState: TState, initialContext: TContext) {
    this.currentState = initialState;
    this.context = initialContext;
  }

  /**
   * Registers a valid transition rule between states.
   */
  public addTransition(
    from: TState,
    trigger: TTrigger,
    to: TState,
    guard?: GuardCondition<TContext>
  ): this {
    const key = `${from}->${trigger}`;
    let rules = this.transitions.get(key);
    if (!rules) {
      rules = [];
      this.transitions.set(key, rules);
    }
    rules.push({ from, trigger, to, guard });
    return this;
  }

  /** Current state */
  public get state(): TState {
    return this.currentState;
  }

  /** Current state context */
  public get currentContext(): Readonly<TContext> {
    return this.context;
  }

  /**
   * Checks whether a trigger is valid and executable from the current state.
   */
  public canTrigger(trigger: TTrigger): boolean {
    const key = `${this.currentState}->${trigger}`;
    const rules = this.transitions.get(key);
    if (!rules || rules.length === 0) {
      return false;
    }
    return rules.some((rule) => !rule.guard || rule.guard(this.context));
  }

  /**
   * Attempts to execute a state transition.
   */
  public trigger(trigger: TTrigger, reason?: string): TransitionResult<TState> {
    const key = `${this.currentState}->${trigger}`;
    const rules = this.transitions.get(key);

    if (!rules || rules.length === 0) {
      return {
        success: false,
        from: this.currentState,
        to: this.currentState,
        trigger,
        reason: `Invalid transition: Trigger '${trigger}' not allowed in state '${this.currentState}'`,
      };
    }

    const matchedRule = rules.find((r) => !r.guard || r.guard(this.context));
    if (!matchedRule) {
      return {
        success: false,
        from: this.currentState,
        to: this.currentState,
        trigger,
        reason: `Guard condition rejected transition '${trigger}' from '${this.currentState}'`,
      };
    }

    const previous = this.currentState;
    const next = matchedRule.to;

    // Fire exit listeners
    const exitList = this.exitListeners.get(previous);
    if (exitList) {
      for (const fn of exitList) {
        fn(previous, next, this.context, reason);
      }
    }

    this.currentState = next;

    // Fire enter listeners
    const enterList = this.enterListeners.get(next);
    if (enterList) {
      for (const fn of enterList) {
        fn(previous, next, this.context, reason);
      }
    }

    // Fire generic transition listeners
    for (const fn of this.anyTransitionListeners) {
      fn(previous, next, this.context, reason);
    }

    return {
      success: true,
      from: previous,
      to: next,
      trigger,
      reason,
    };
  }

  /** Adds listener invoked when entering a specific state */
  public onEnter(state: TState, listener: StateListener<TState, TContext>): this {
    let list = this.enterListeners.get(state);
    if (!list) {
      list = [];
      this.enterListeners.set(state, list);
    }
    list.push(listener);
    return this;
  }

  /** Adds listener invoked when exiting a specific state */
  public onExit(state: TState, listener: StateListener<TState, TContext>): this {
    let list = this.exitListeners.get(state);
    if (!list) {
      list = [];
      this.exitListeners.set(state, list);
    }
    list.push(listener);
    return this;
  }

  /** Adds listener invoked on any successful state change */
  public onTransition(listener: StateListener<TState, TContext>): this {
    this.anyTransitionListeners.push(listener);
    return this;
  }
}

/**
 * Type-Safe Agent State Machine
 * Manages states: IDLE, NAVIGATING, BLOCKED, COMPLETED
 */
export class AgentStateMachine {
  private readonly fsm: StateMachine<AgentState, AgentTrigger, TransitionContext>;

  constructor(agentId: string, initialState: AgentState = 'IDLE') {
    this.fsm = new StateMachine<AgentState, AgentTrigger, TransitionContext>(initialState, { agentId });
    this.setupTransitions();
  }

  private setupTransitions(): void {
    // From IDLE
    this.fsm.addTransition('IDLE', 'START_NAVIGATION', 'NAVIGATING');
    this.fsm.addTransition('IDLE', 'OBSTACLE_BLOCKED', 'BLOCKED');
    this.fsm.addTransition('IDLE', 'RESET', 'IDLE');

    // From NAVIGATING
    this.fsm.addTransition('NAVIGATING', 'OBSTACLE_BLOCKED', 'BLOCKED');
    this.fsm.addTransition('NAVIGATING', 'TARGET_REACHED', 'COMPLETED');
    this.fsm.addTransition('NAVIGATING', 'START_NAVIGATION', 'NAVIGATING'); // Re-target / path recalculation
    this.fsm.addTransition('NAVIGATING', 'STOP', 'IDLE');
    this.fsm.addTransition('NAVIGATING', 'RESET', 'IDLE');

    // From BLOCKED
    this.fsm.addTransition('BLOCKED', 'PATH_RESOLVED', 'NAVIGATING');
    this.fsm.addTransition('BLOCKED', 'START_NAVIGATION', 'NAVIGATING');
    this.fsm.addTransition('BLOCKED', 'STOP', 'IDLE');
    this.fsm.addTransition('BLOCKED', 'RESET', 'IDLE');

    // From COMPLETED
    this.fsm.addTransition('COMPLETED', 'START_NAVIGATION', 'NAVIGATING');
    this.fsm.addTransition('COMPLETED', 'RESET', 'IDLE');
    this.fsm.addTransition('COMPLETED', 'STOP', 'IDLE');
  }

  public get state(): AgentState {
    return this.fsm.state;
  }

  public canTransition(trigger: AgentTrigger): boolean {
    return this.fsm.canTrigger(trigger);
  }

  public startNavigation(reason?: string): TransitionResult<AgentState> {
    return this.fsm.trigger('START_NAVIGATION', reason);
  }

  public block(reason?: string): TransitionResult<AgentState> {
    return this.fsm.trigger('OBSTACLE_BLOCKED', reason);
  }

  public resolvePath(reason?: string): TransitionResult<AgentState> {
    return this.fsm.trigger('PATH_RESOLVED', reason);
  }

  public reachTarget(reason?: string): TransitionResult<AgentState> {
    return this.fsm.trigger('TARGET_REACHED', reason);
  }

  public stop(reason?: string): TransitionResult<AgentState> {
    return this.fsm.trigger('STOP', reason);
  }

  public reset(reason?: string): TransitionResult<AgentState> {
    return this.fsm.trigger('RESET', reason);
  }

  public onTransition(listener: StateListener<AgentState, TransitionContext>): this {
    this.fsm.onTransition(listener);
    return this;
  }
}
