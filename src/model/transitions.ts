/**
 * Single commit point for cross-domain life transitions.
 *
 * Organization join/promotion/departure, retirement and salary updates are the
 * places where identity, career and economy can drift apart. Callers submit an
 * action; the guard runs it and then re-checks every state relation. A broken
 * relation fails loudly at the transition that produced it instead of surfacing
 * decades later in a report.
 *
 * The guard never repairs state. Repair belongs to whoever owns the field.
 */
import {
  StateInvariantError,
  stateInvariantViolations
} from './state-invariants';
import type {
  LifeStateRegistry,
  Violation,
  ViolationCode
} from './state-invariants';

export interface TransitionOptions {
  /**
   * Relations that are legitimately transient inside this commit, e.g. the
   * deferred retirement done by the annual pipeline before the organization
   * departure is finalized in the same year.
   */
  readonly deferred?: readonly ViolationCode[];
}

export interface LifeGuards {
  /** Every violated relation for a state, filtered by nothing. */
  violations(state: unknown): Violation[];
  /** Throw unless the state satisfies all relations. */
  assert(state: unknown, context?: string): void;
  /**
   * Run `action`, then verify the state. `action` is not rolled back on failure:
   * the invariants tell you the commit is invalid, and the caller aborts the
   * life rather than continuing from a state nobody can describe.
   */
  commit<T>(name: string, state: unknown, action: () => T, options?: TransitionOptions): T;
}

export function createLifeGuards(registry: LifeStateRegistry): LifeGuards {
  const violations = (state: unknown) => stateInvariantViolations(state, registry);

  const assert = (state: unknown, context = 'Life state invariant failed') => {
    const found = violations(state);
    if (found.length) throw new StateInvariantError(context, found);
  };

  return {
    violations,
    assert,
    commit(name, state, action, options = {}) {
      const deferred = new Set<ViolationCode>(options.deferred ?? []);
      const value = action();
      const found = violations(state).filter(item => !deferred.has(item.code));
      if (found.length) {
        throw new StateInvariantError(`Transition "${name}" left an inconsistent life state`, found);
      }
      return value;
    }
  };
}
