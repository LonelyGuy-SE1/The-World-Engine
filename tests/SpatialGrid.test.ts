import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/engine/SpatialGrid';
import { Agent, AgentAction } from '../src/engine/types';

function makeAgent(id: number, x: number, y: number, alive = true): Agent {
  return {
    id, x, y, alive,
    energy: 50, health: 100, maxHealth: 100, age: 0, maxAge: 300,
    generation: 0, species: 1, kills: 0, offspring: 0, foodEaten: 0,
    tickBorn: 0, parentId: null, gestationCooldown: 0,
    lastAction: AgentAction.Stay,
    genome: {
      brainWeights: new Float32Array(0),
      traits: {
        speed: 1, size: 1, perceptionRadius: 3, metabolism: 1,
        reproductionThreshold: 0.5, mutationRate: 0.05,
        aggressionBias: 0.3, socialBias: 0.3,
        heatTolerance: 0, foodEfficiency: 1,
      },
    },
    psychology: {
      fear: 0, aggression: 0, curiosity: 0.5, socialBonding: 0,
      hunger: 0.3, thirst: 0.2, fatigue: 0,
    },
    memory: [],
  };
}

describe('SpatialGrid', () => {
  it('creates grid with correct dimensions', () => {
    const grid = new SpatialGrid(10, 10, 100);
    expect(grid.width).toBe(10);
    expect(grid.height).toBe(10);
  });

  it('rebuilds with agents at correct positions', () => {
    const grid = new SpatialGrid(10, 10, 100);
    const agents = [
      makeAgent(1, 3, 4),
      makeAgent(2, 3, 4), // same cell
      makeAgent(3, 7, 2),
    ];
    grid.rebuild(agents);

    // Both agents at (3,4)
    let idx = grid.firstAt(3, 4);
    const found: number[] = [];
    while (idx >= 0) {
      found.push(agents[idx].id);
      idx = grid.next(idx);
    }
    expect(found.sort()).toEqual([1, 2]);

    // One agent at (7,2) 
    idx = grid.firstAt(7, 2);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(agents[idx].id).toBe(3);
    expect(grid.next(idx)).toBe(-1);
  });

  it('returns -1 for empty cells', () => {
    const grid = new SpatialGrid(10, 10, 100);
    grid.rebuild([makeAgent(1, 0, 0)]);
    expect(grid.firstAt(5, 5)).toBe(-1);
  });

  it('returns -1 for out-of-bounds coordinates', () => {
    const grid = new SpatialGrid(10, 10, 100);
    grid.rebuild([]);
    expect(grid.firstAt(-1, 0)).toBe(-1);
    expect(grid.firstAt(0, -1)).toBe(-1);
    expect(grid.firstAt(10, 0)).toBe(-1);
    expect(grid.firstAt(0, 10)).toBe(-1);
  });

  it('filters dead agents on rebuild', () => {
    const grid = new SpatialGrid(10, 10, 100);
    const agents = [
      makeAgent(1, 5, 5, true),
      makeAgent(2, 5, 5, false), // dead agent
      makeAgent(3, 5, 5, true),
    ];
    grid.rebuild(agents);

    const found: number[] = [];
    let idx = grid.firstAt(5, 5);
    while (idx >= 0) {
      found.push(agents[idx].id);
      idx = grid.next(idx);
    }
    // Only alive agents should be in the grid
    expect(found.sort()).toEqual([1, 3]);
  });

  it('grows nextLink array when needed', () => {
    const grid = new SpatialGrid(10, 10, 2); // Small initial maxAgents
    const agents = Array.from({ length: 20 }, (_, i) =>
      makeAgent(i + 1, i % 10, 0)
    );
    // Should not throw
    grid.rebuild(agents);
    
    let found = 0;
    for (let x = 0; x < 10; x++) {
      let idx = grid.firstAt(x, 0);
      while (idx >= 0) {
        found++;
        idx = grid.next(idx);
      }
    }
    expect(found).toBe(20);
  });

  it('handles rebuild clearing previous state', () => {
    const grid = new SpatialGrid(10, 10, 100);
    grid.rebuild([makeAgent(1, 3, 3)]);
    expect(grid.firstAt(3, 3)).toBeGreaterThanOrEqual(0);

    grid.rebuild([makeAgent(2, 7, 7)]);
    expect(grid.firstAt(3, 3)).toBe(-1);
    expect(grid.firstAt(7, 7)).toBeGreaterThanOrEqual(0);
  });
});
