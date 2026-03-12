import { describe, it, expect } from 'vitest';
import {
  Terrain, TERRAIN_MOVEMENT_COST, TERRAIN_COLORS, TERRAIN_NAMES,
  SeededRandom, DEFAULT_WORLD_CONFIG, AgentAction, ACTION_COUNT,
  SimulationState,
} from '../src/engine/types';

describe('Terrain', () => {
  it('has 7 terrain types', () => {
    const terrains = [
      Terrain.DeepWater, Terrain.ShallowWater, Terrain.Sand,
      Terrain.Grass, Terrain.Forest, Terrain.Mountain, Terrain.Snow,
    ];
    expect(terrains.length).toBe(7);
  });

  it('has movement costs for all terrains', () => {
    for (let t = 0; t <= 6; t++) {
      expect(TERRAIN_MOVEMENT_COST[t as Terrain]).toBeDefined();
    }
    expect(TERRAIN_MOVEMENT_COST[Terrain.DeepWater]).toBe(Infinity);
    expect(TERRAIN_MOVEMENT_COST[Terrain.Grass]).toBe(1.0);
  });

  it('has colors for all terrains', () => {
    for (let t = 0; t <= 6; t++) {
      expect(TERRAIN_COLORS[t as Terrain]).toBeDefined();
      expect(TERRAIN_COLORS[t as Terrain]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('has names for all terrains', () => {
    for (let t = 0; t <= 6; t++) {
      expect(TERRAIN_NAMES[t as Terrain]).toBeDefined();
      expect(typeof TERRAIN_NAMES[t as Terrain]).toBe('string');
    }
  });
});

describe('SeededRandom', () => {
  it('produces deterministic sequences from the same seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces different sequences from different seeds', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(99);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (rng1.next() === rng2.next()) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it('next() returns values in [0, 1]', () => {
    const rng = new SeededRandom(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('nextInt returns values in [min, max]', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextFloat returns values in [min, max]', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextFloat(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('nextGaussian produces centered distribution', () => {
    const rng = new SeededRandom(42);
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      sum += rng.nextGaussian();
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('getSeed returns current internal state', () => {
    const rng = new SeededRandom(42);
    rng.next();
    const s = rng.getSeed();
    expect(typeof s).toBe('number');
    expect(s).not.toBe(42); // state should have advanced
  });
});

describe('AgentAction', () => {
  it('has 15 actions', () => {
    expect(ACTION_COUNT).toBe(15);
  });

  it('movement actions are 0-3', () => {
    expect(AgentAction.MoveNorth).toBe(0);
    expect(AgentAction.MoveSouth).toBe(1);
    expect(AgentAction.MoveEast).toBe(2);
    expect(AgentAction.MoveWest).toBe(3);
  });
});

describe('DEFAULT_WORLD_CONFIG', () => {
  it('has reasonable defaults', () => {
    expect(DEFAULT_WORLD_CONFIG.width).toBe(256);
    expect(DEFAULT_WORLD_CONFIG.height).toBe(256);
    expect(DEFAULT_WORLD_CONFIG.initialAgents).toBe(300);
    expect(DEFAULT_WORLD_CONFIG.initialSpecies).toBe(6);
    expect(DEFAULT_WORLD_CONFIG.resourceRegrowRate).toBe(0.12);
    expect(DEFAULT_WORLD_CONFIG.ticksPerYear).toBe(365);
    expect(DEFAULT_WORLD_CONFIG.maxAgents).toBe(200000);
  });
});

describe('SimulationState', () => {
  it('has three states', () => {
    expect(SimulationState.Stopped).toBe('stopped');
    expect(SimulationState.Running).toBe('running');
    expect(SimulationState.Paused).toBe('paused');
  });
});
