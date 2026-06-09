import { describe, it, expect } from 'vitest';
import {
  isAllowedEdge,
  assertAllowedEdge,
  allowedChildren,
  createsCycle,
  assertNoCycle,
} from '../containment';

describe('containment — allowed edges', () => {
  it('accepts the legal edges from §1.1', () => {
    expect(isAllowedEdge('question', 'option')).toBe(true);
    expect(isAllowedEdge('question', 'question')).toBe(true);
    expect(isAllowedEdge('option', 'evidence')).toBe(true);
    expect(isAllowedEdge('option', 'statement')).toBe(true);
    expect(isAllowedEdge('option', 'question')).toBe(true);
    expect(isAllowedEdge('evidence', 'evidence')).toBe(true);
    expect(isAllowedEdge('evidence', 'statement')).toBe(true);
    expect(isAllowedEdge('statement', 'statement')).toBe(true);
  });

  it('rejects illegal edges', () => {
    expect(isAllowedEdge('question', 'evidence')).toBe(false);
    expect(isAllowedEdge('question', 'statement')).toBe(false);
    expect(isAllowedEdge('statement', 'option')).toBe(false);
    expect(isAllowedEdge('statement', 'evidence')).toBe(false);
    expect(isAllowedEdge('evidence', 'option')).toBe(false);
    expect(isAllowedEdge('option', 'option')).toBe(false);
  });

  it('assertAllowedEdge throws on illegal, passes on legal', () => {
    expect(() => assertAllowedEdge('option', 'evidence')).not.toThrow();
    expect(() => assertAllowedEdge('question', 'evidence')).toThrow(/Illegal containment edge/);
  });

  it('allowedChildren returns the table row', () => {
    expect(allowedChildren('option')).toEqual(['evidence', 'statement', 'question']);
    expect(allowedChildren('statement')).toEqual(['statement']);
  });
});

describe('containment — cycle guard', () => {
  it('detects a node placed under its own descendant', () => {
    // parent's ancestor chain contains the child id => cycle
    expect(createsCycle('a', ['root', 'a', 'b'])).toBe(true);
    expect(createsCycle('z', ['root', 'a', 'b'])).toBe(false);
  });

  it('assertNoCycle throws only on a cycle', () => {
    expect(() => assertNoCycle('z', ['root', 'a'])).not.toThrow();
    expect(() => assertNoCycle('a', ['root', 'a'])).toThrow(/Cycle detected/);
  });
});
