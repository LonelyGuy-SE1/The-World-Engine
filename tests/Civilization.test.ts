import { describe, it, expect } from 'vitest';
import { CivilizationSystem, TECH_TREE } from '../src/engine/Civilization';

describe('CivilizationSystem', () => {
  it('creates civilization for new species', () => {
    const civ = new CivilizationSystem(Math.random);
    const speciesCiv = civ.getOrCreate(1, 0);
    
    expect(speciesCiv).toBeDefined();
    expect(speciesCiv.technologies.size).toBe(0);
    expect(speciesCiv.techLevel).toBe(0);
    expect(speciesCiv.kingdomName).toBeDefined();
  });

  it('returns same civilization on subsequent calls', () => {
    const civ = new CivilizationSystem(Math.random);
    const civ1 = civ.getOrCreate(1, 0);
    const civ2 = civ.getOrCreate(1, 100);
    expect(civ1).toBe(civ2);
  });
});

describe('TECH_TREE', () => {
  it('has 15 technologies', () => {
    expect(TECH_TREE.length).toBe(15);
  });

  it('all technologies have required fields', () => {
    for (const tech of TECH_TREE) {
      expect(tech.id).toBeDefined();
      expect(tech.name).toBeDefined();
      expect(tech.description).toBeDefined();
      expect(Array.isArray(tech.prereqs)).toBe(true);
      expect(tech.effects).toBeDefined();
      expect(typeof tech.minPopulation).toBe('number');
      expect(typeof tech.minAge).toBe('number');
    }
  });

  it('prerequisite references are valid', () => {
    const ids = new Set(TECH_TREE.map(t => t.id));
    for (const tech of TECH_TREE) {
      for (const prereq of tech.prereqs) {
        expect(ids.has(prereq)).toBe(true);
      }
    }
  });

  it('has at least 3 root technologies (no prereqs)', () => {
    const roots = TECH_TREE.filter(t => t.prereqs.length === 0);
    expect(roots.length).toBeGreaterThanOrEqual(3);
  });
});
