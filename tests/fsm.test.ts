import { describe, it, expect } from 'vitest';
import { AgentStateMachine, StateMachine } from '../src/fsm/StateMachine.js';

describe('StateMachine & AgentStateMachine', () => {
  it('handles valid state transitions for AgentStateMachine', () => {
    const fsm = new AgentStateMachine('agent-1', 'IDLE');
    expect(fsm.state).toBe('IDLE');

    // IDLE -> NAVIGATING
    let res = fsm.startNavigation('Path found');
    expect(res.success).toBe(true);
    expect(fsm.state).toBe('NAVIGATING');

    // NAVIGATING -> BLOCKED
    res = fsm.block('Obstacle in front');
    expect(res.success).toBe(true);
    expect(fsm.state).toBe('BLOCKED');

    // BLOCKED -> NAVIGATING
    res = fsm.resolvePath('Alternative path found');
    expect(res.success).toBe(true);
    expect(fsm.state).toBe('NAVIGATING');

    // NAVIGATING -> COMPLETED
    res = fsm.reachTarget('Arrived at target');
    expect(res.success).toBe(true);
    expect(fsm.state).toBe('COMPLETED');

    // COMPLETED -> IDLE
    res = fsm.reset();
    expect(res.success).toBe(true);
    expect(fsm.state).toBe('IDLE');
  });

  it('rejects invalid transitions', () => {
    const fsm = new AgentStateMachine('agent-2', 'IDLE');

    // Cannot reach target directly from IDLE
    const res = fsm.reachTarget();
    expect(res.success).toBe(false);
    expect(fsm.state).toBe('IDLE');
    expect(res.reason).toContain('Invalid transition');
  });

  it('triggers transition listeners and guards in generic StateMachine', () => {
    interface Context {
      fuel: number;
    }
    const sm = new StateMachine<'OFF' | 'ON', 'TURN_ON' | 'TURN_OFF', Context>('OFF', { fuel: 10 });

    const transitionLog: string[] = [];

    sm.addTransition('OFF', 'TURN_ON', 'ON', (ctx) => ctx.fuel > 0);
    sm.addTransition('ON', 'TURN_OFF', 'OFF');

    sm.onTransition((from, to) => {
      transitionLog.push(`${from}->${to}`);
    });

    const res = sm.trigger('TURN_ON');
    expect(res.success).toBe(true);
    expect(sm.state).toBe('ON');
    expect(transitionLog).toEqual(['OFF->ON']);
  });
});
