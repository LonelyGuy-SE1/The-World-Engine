import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/World';
import { Terrain } from '../src/engine/types';

describe('World', () => {
  const config = { width: 32, height: 32, seed: 42 };

  describe('constructor', () => {
    it('creates world with correct dimensions', () => {
      const world = new World(config);
      expect(world.width).toBe(32);
      expect(world.height).toBe(32);
    });

    it('generates tiles for all grid positions', () => {
      const world = new World(config);
      expect(world.tiles.length).toBe(32 * 32);
      for (const tile of world.tiles) {
        expect(tile).toBeDefined();
        expect(tile.terrain).toBeDefined();
      }
    });

    it('is deterministic with the same seed', () => {
      const w1 = new World({ ...config, seed: 12345 });
      const w2 = new World({ ...config, seed: 12345 });
      for (let i = 0; i < w1.tiles.length; i++) {
        expect(w1.tiles[i].terrain).toBe(w2.tiles[i].terrain);
        expect(w1.tiles[i].foodResource).toBe(w2.tiles[i].foodResource);
        expect(w1.tiles[i].waterResource).toBe(w2.tiles[i].waterResource);
      }
    });

    it('produces different worlds with different seeds', () => {
      const w1 = new World({ ...config, seed: 111 });
      const w2 = new World({ ...config, seed: 222 });
      let diffs = 0;
      for (let i = 0; i < w1.tiles.length; i++) {
        if (w1.tiles[i].terrain !== w2.tiles[i].terrain) diffs++;
      }
      expect(diffs).toBeGreaterThan(0);
    });
  });

  describe('tileAt', () => {
    it('returns tile at given coordinates', () => {
      const world = new World(config);
      const tile = world.tileAt(5, 5);
      expect(tile).toBeDefined();
      expect(tile.terrain).toBeDefined();
    });
  });

  describe('isValid', () => {
    it('returns true for in-bounds coordinates', () => {
      const world = new World(config);
      expect(world.isValid(0, 0)).toBe(true);
      expect(world.isValid(31, 31)).toBe(true);
      expect(world.isValid(15, 15)).toBe(true);
    });

    it('returns false for out-of-bounds coordinates', () => {
      const world = new World(config);
      expect(world.isValid(-1, 0)).toBe(false);
      expect(world.isValid(0, -1)).toBe(false);
      expect(world.isValid(32, 0)).toBe(false);
      expect(world.isValid(0, 32)).toBe(false);
    });
  });

  describe('isPassable', () => {
    it('deep water is not passable', () => {
      const world = new World(config);
      // Find a deep water tile
      let found = false;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          if (world.tileAt(x, y).terrain === Terrain.DeepWater) {
            expect(world.isPassable(x, y)).toBe(false);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    });

    it('grass is passable', () => {
      const world = new World(config);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          if (world.tileAt(x, y).terrain === Terrain.Grass) {
            expect(world.isPassable(x, y)).toBe(true);
            return;
          }
        }
      }
    });

    it('returns false for out-of-bounds', () => {
      const world = new World(config);
      expect(world.isPassable(-1, 0)).toBe(false);
      expect(world.isPassable(32, 32)).toBe(false);
    });
  });

  describe('terrain generation', () => {
    it('generates diverse terrain types', () => {
      // Use a larger world to ensure diversity
      const world = new World({ width: 64, height: 64, seed: 42 });
      const terrainTypes = new Set<Terrain>();
      for (const tile of world.tiles) {
        terrainTypes.add(tile.terrain);
      }
      // Should have at least 4 different terrain types
      expect(terrainTypes.size).toBeGreaterThanOrEqual(4);
    });

    it('tiles have valid resource ranges', () => {
      const world = new World({ width: 64, height: 64, seed: 42 });
      for (const tile of world.tiles) {
        expect(tile.foodResource).toBeGreaterThanOrEqual(0);
        expect(tile.foodResource).toBeLessThanOrEqual(100);
        expect(tile.waterResource).toBeGreaterThanOrEqual(0);
        expect(tile.waterResource).toBeLessThanOrEqual(100);
        expect(tile.fertility).toBeGreaterThanOrEqual(0);
        expect(tile.fertility).toBeLessThanOrEqual(1.1); // slightly over 1 due to random variance
        expect(tile.elevation).toBeGreaterThanOrEqual(0);
        expect(tile.elevation).toBeLessThanOrEqual(1);
        expect(tile.hazard).toBeGreaterThanOrEqual(0);
        expect(tile.hazard).toBeLessThanOrEqual(1);
      }
    });

    it('forests have more food than deserts', () => {
      const world = new World({ width: 64, height: 64, seed: 42 });
      let forestFood = 0, forestCount = 0;
      let sandFood = 0, sandCount = 0;
      for (const tile of world.tiles) {
        if (tile.terrain === Terrain.Forest) {
          forestFood += tile.foodResource;
          forestCount++;
        } else if (tile.terrain === Terrain.Sand) {
          sandFood += tile.foodResource;
          sandCount++;
        }
      }
      if (forestCount > 0 && sandCount > 0) {
        expect(forestFood / forestCount).toBeGreaterThan(sandFood / sandCount);
      }
    });
  });

  describe('territory', () => {
    it('claims territory for species', () => {
      const world = new World(config);
      world.claimTerritory(5, 5, 1);
      const idx = 5 * 32 + 5;
      expect(world.territoryOwner[idx]).toBe(1);
      expect(world.territoryStrength[idx]).toBeGreaterThan(0);
    });

    it('contests territory from different species', () => {
      const world = new World(config);
      // Species 1 claims with strength
      for (let i = 0; i < 20; i++) world.claimTerritory(5, 5, 1);
      const idx = 5 * 32 + 5;
      const initialStrength = world.territoryStrength[idx];
      
      // Species 2 tries to contest
      world.claimTerritory(5, 5, 2);
      expect(world.territoryStrength[idx]).toBeLessThan(initialStrength);
    });
  });

  describe('updateEnvironment', () => {
    it('runs without error', () => {
      const world = new World(config);
      expect(() => world.updateEnvironment(5)).not.toThrow();
      expect(() => world.updateEnvironment(50)).not.toThrow();
      expect(() => world.updateEnvironment(200)).not.toThrow();
    });

    it('food regrows over time', () => {
      const world = new World(config);
      // Find a grass tile and deplete its food
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const tile = world.tileAt(x, y);
          if (tile.terrain === Terrain.Grass && tile.foodResource > 20) {
            const originalFood = tile.foodResource;
            tile.foodResource = 5;
            // Run many environment updates
            for (let t = 0; t < 100; t++) {
              world.updateEnvironment(t * 5);
            }
            expect(tile.foodResource).toBeGreaterThan(5);
            return;
          }
        }
      }
    });
  });
});
