/**
 * Generic Type-Safe Finite State Machine.
 * Enforces transition validity at compile-time and run-time with guards and lifecycle hooks.
 */
export class StateMachine {
    currentState;
    context;
    transitions = new Map();
    enterListeners = new Map();
    exitListeners = new Map();
    anyTransitionListeners = [];
    constructor(initialState, initialContext) {
        this.currentState = initialState;
        this.context = initialContext;
    }
    /**
     * Registers a valid transition rule between states.
     */
    addTransition(from, trigger, to, guard) {
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
    get state() {
        return this.currentState;
    }
    /** Current state context */
    get currentContext() {
        return this.context;
    }
    /**
     * Checks whether a trigger is valid and executable from the current state.
     */
    canTrigger(trigger) {
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
    trigger(trigger, reason) {
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
    onEnter(state, listener) {
        let list = this.enterListeners.get(state);
        if (!list) {
            list = [];
            this.enterListeners.set(state, list);
        }
        list.push(listener);
        return this;
    }
    /** Adds listener invoked when exiting a specific state */
    onExit(state, listener) {
        let list = this.exitListeners.get(state);
        if (!list) {
            list = [];
            this.exitListeners.set(state, list);
        }
        list.push(listener);
        return this;
    }
    /** Adds listener invoked on any successful state change */
    onTransition(listener) {
        this.anyTransitionListeners.push(listener);
        return this;
    }
}
/**
 * Type-Safe Agent State Machine
 * Manages states: IDLE, NAVIGATING, BLOCKED, COMPLETED
 */
export class AgentStateMachine {
    fsm;
    constructor(agentId, initialState = 'IDLE') {
        this.fsm = new StateMachine(initialState, { agentId });
        this.setupTransitions();
    }
    setupTransitions() {
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
    get state() {
        return this.fsm.state;
    }
    canTransition(trigger) {
        return this.fsm.canTrigger(trigger);
    }
    startNavigation(reason) {
        return this.fsm.trigger('START_NAVIGATION', reason);
    }
    block(reason) {
        return this.fsm.trigger('OBSTACLE_BLOCKED', reason);
    }
    resolvePath(reason) {
        return this.fsm.trigger('PATH_RESOLVED', reason);
    }
    reachTarget(reason) {
        return this.fsm.trigger('TARGET_REACHED', reason);
    }
    stop(reason) {
        return this.fsm.trigger('STOP', reason);
    }
    reset(reason) {
        return this.fsm.trigger('RESET', reason);
    }
    onTransition(listener) {
        this.fsm.onTransition(listener);
        return this;
    }
}
//# sourceMappingURL=StateMachine.js.map