import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAgent, createRandomAgent, randomTraits, SpeciesRegistry,
  decideAction, executeAction, buildInputVector, BRAIN_CONFIG,
  resetAgentIds,
} from '../src/engine/Agent';
import { NeuralNet } from '../src/engine/NeuralNet';
import { SpatialGrid } from '../src/engine/SpatialGrid';
import { World } from '../src/engine/World';
import { Agent, AgentAction, Genome, Traits, SeededRandom } from '../src/engine/types';

function defaultTraits(): Traits {
  return {
    speed: 1, size: 1, perceptionRadius: 3, metabolism: 1,
    reproductionThreshold: 0.5, mutationRate: 0.05,
    aggressionBias: 0.3, socialBias: 0.3,
    heatTolerance: 0, foodEfficiency: 1,
    nocturnal: 0, camouflage: 0, packHunting: 0, toolUse: 0,
    singing: 0, burrowing: 0, venom: 0, regeneration: 0,
    flight: 0, aquatic: 0, migrationDrive: 0, longevity: 1,
    immuneStrength: 0.5, learningRate: 0.5,
  };
}

function makeGenome(traits?: Partial<Traits>): Genome {
  const t = { ...defaultTraits(), ...traits };
  const brain = new NeuralNet(BRAIN_CONFIG);
  brain.initializeRandom(() => Math.random());
  return { brainWeights: brain.weights, traits: t };
}

describe('Agent', () => {
  beforeEach(() => {
    resetAgentIds();
  });

  describe('createAgent', () => {
    it('creates agent with correct initial values', () => {
      const genome = makeGenome();
      const agent = createAgent(5, 10, 1, genome, 0, 0, null);
      
      expect(agent.id).toBe(1);
      expect(agent.x).toBe(5);
      expect(agent.y).toBe(10);
      expect(agent.species).toBe(1);
      expect(agent.alive).toBe(true);
      expect(agent.age).toBe(0);
      expect(agent.generation).toBe(0);
      expect(agent.parentId).toBeNull();
      expect(agent.gestationCooldown).toBe(0);
    });

    it('calculates energy from size', () => {
      const small = createAgent(0, 0, 1, makeGenome({ size: 0.5 }), 0, 0, null);
      const large = createAgent(0, 0, 1, makeGenome({ size: 2.0 }), 0, 0, null);
      expect(large.energy).toBeGreaterThan(small.energy);
    });

    it('calculates maxAge from size and metabolism', () => {
      const fast = createAgent(0, 0, 1, makeGenome({ metabolism: 2.0 }), 0, 0, null);
      const slow = createAgent(0, 0, 1, makeGenome({ metabolism: 0.5 }), 0, 0, null);
      expect(slow.maxAge).toBeGreaterThan(fast.maxAge);
    });

    it('increments unique IDs', () => {
      const a1 = createAgent(0, 0, 1, makeGenome(), 0, 0, null);
      const a2 = createAgent(0, 0, 1, makeGenome(), 0, 0, null);
      expect(a2.id).toBe(a1.id + 1);
    });

    it('sets initial psychology', () => {
      const genome = makeGenome({ aggressionBias: 0.8 });
      const agent = createAgent(0, 0, 1, genome, 0, 0, null);
      expect(agent.psychology.aggression).toBe(0.4); // aggrBias * 0.5
      expect(agent.psychology.hunger).toBe(0.3);
      expect(agent.psychology.thirst).toBe(0.2);
    });
  });

  describe('createRandomAgent', () => {
    it('places agent on passable terrain', () => {
      const world = new World({ width: 32, height: 32, seed: 42 });
      const rng = new SeededRandom(42);
      const traits = defaultTraits();
      const agent = createRandomAgent(world, 1, traits, 0, rng);
      
      expect(agent.alive).toBe(true);
      expect(world.isPassable(agent.x, agent.y)).toBe(true);
    });
  });

  describe('randomTraits', () => {
    it('generates traits within valid ranges', () => {
      const rng = new SeededRandom(42);
      for (let i = 0; i < 50; i++) {
        const traits = randomTraits(rng);
        expect(traits.speed).toBeGreaterThanOrEqual(0.7);
        expect(traits.speed).toBeLessThanOrEqual(1.5);
        expect(traits.size).toBeGreaterThanOrEqual(0.6);
        expect(traits.size).toBeLessThanOrEqual(1.4);
        expect(traits.perceptionRadius).toBeGreaterThanOrEqual(2);
        expect(traits.perceptionRadius).toBeLessThanOrEqual(6);
        expect(traits.aggressionBias).toBeGreaterThanOrEqual(0.1);
        expect(traits.aggressionBias).toBeLessThanOrEqual(0.7);
        expect(traits.reproductionThreshold).toBeGreaterThanOrEqual(0.4);
        expect(traits.reproductionThreshold).toBeLessThanOrEqual(0.8);
      }
    });
  });

  describe('SpeciesRegistry', () => {
    it('registers species with unique IDs', () => {
      const registry = new SpeciesRegistry();
      const traits = defaultTraits();
      const sp1 = registry.registerSpecies(traits, 0);
      const sp2 = registry.registerSpecies(traits, 0);
      expect(sp1.id).not.toBe(sp2.id);
    });

    it('tracks population changes', () => {
      const registry = new SpeciesRegistry();
      const sp = registry.registerSpecies(defaultTraits(), 0);
      
      registry.updatePopulation(sp.id, 5);
      expect(sp.population).toBe(5);
      expect(sp.totalEverLived).toBe(5);
      
      registry.updatePopulation(sp.id, -2);
      expect(sp.population).toBe(3);
      expect(sp.totalEverLived).toBe(5); // doesn't decrease
    });

    it('marks species extinct when population reaches 0', () => {
      const registry = new SpeciesRegistry();
      const sp = registry.registerSpecies(defaultTraits(), 0);
      registry.updatePopulation(sp.id, 5);
      registry.updatePopulation(sp.id, -5);
      expect(sp.extinct).toBe(true);
      expect(sp.population).toBe(0);
    });

    it('getAliveSpecies filters extinct species', () => {
      const registry = new SpeciesRegistry();
      const sp1 = registry.registerSpecies(defaultTraits(), 0);
      const sp2 = registry.registerSpecies(defaultTraits(), 0);
      registry.updatePopulation(sp1.id, 5);
      registry.updatePopulation(sp2.id, 3);
      
      expect(registry.getAliveSpecies().length).toBe(2);
      
      registry.updatePopulation(sp1.id, -5);
      expect(registry.getAliveSpecies().length).toBe(1);
      expect(registry.getAliveSpecies()[0].id).toBe(sp2.id);
    });
  });

  describe('buildInputVector', () => {
    it('returns vector of size 52', () => {
      const world = new World({ width: 32, height: 32, seed: 42 });
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      const input = buildInputVector(agent, world, []);
      expect(input.length).toBe(52);
    });

    it('encodes agent state in first slots', () => {
      const world = new World({ width: 32, height: 32, seed: 42 });
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      agent.energy = 75;
      agent.health = 50;
      agent.maxHealth = 100;
      
      const input = buildInputVector(agent, world, []);
      expect(input[0]).toBeCloseTo(0.75, 1); // energy/100
      expect(input[1]).toBeCloseTo(0.5, 1);  // health/maxHealth
    });
  });

  describe('executeAction', () => {
    let world: World;
    let grid: SpatialGrid;
    let agents: Agent[];

    beforeEach(() => {
      world = new World({ width: 32, height: 32, seed: 42 });
      grid = new SpatialGrid(32, 32, 100);
      agents = [];
    });

    it('movement changes agent position', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      // Place on a grass tile we know is passable
      for (let y = 0; y < 32; y++) {
        for (let x = 1; x < 31; x++) {
          if (world.isPassable(x, y) && world.isPassable(x + 1, y)) {
            agent.x = x;
            agent.y = y;
            agent.energy = 80;
            const startX = agent.x;
            executeAction(agent, AgentAction.MoveEast, world, [agent], grid);
            expect(agent.x).toBe(startX + 1);
            expect(agent.energy).toBeLessThan(80);
            return;
          }
        }
      }
    });

    it('eating reduces food and increases energy', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      // Find tile with food
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const tile = world.tileAt(x, y);
          if (tile.foodResource > 20 && world.isPassable(x, y)) {
            agent.x = x;
            agent.y = y;
            agent.energy = 30;
            const foodBefore = tile.foodResource;
            const energyBefore = agent.energy;
            
            executeAction(agent, AgentAction.Eat, world, [agent], grid);
            
            expect(tile.foodResource).toBeLessThan(foodBefore);
            expect(agent.energy).toBeGreaterThan(energyBefore);
            expect(agent.foodEaten).toBe(1);
            return;
          }
        }
      }
    });

    it('drinking reduces water and lowers thirst', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      // Find tile with water
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const tile = world.tileAt(x, y);
          if (tile.waterResource > 20 && world.isPassable(x, y)) {
            agent.x = x;
            agent.y = y;
            agent.psychology.thirst = 0.8;
            const waterBefore = tile.waterResource;
            
            executeAction(agent, AgentAction.Drink, world, [agent], grid);
            
            expect(tile.waterResource).toBeLessThan(waterBefore);
            expect(agent.psychology.thirst).toBeLessThan(0.8);
            // Check water memory was added
            const waterMem = agent.memory.find(m => m.type === 'water');
            expect(waterMem).toBeDefined();
            return;
          }
        }
      }
    });

    it('resting recovers energy and health', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      agent.energy = 50;
      agent.health = 80;
      agent.psychology.fatigue = 0.5;
      
      executeAction(agent, AgentAction.Rest, world, [agent], grid);
      
      expect(agent.energy).toBe(52);
      expect(agent.health).toBe(81);
      expect(agent.psychology.fatigue).toBe(0.4);
    });

    it('reproduction requires maturity', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      agent.energy = 95;
      agent.age = 0; // Not mature
      
      grid.rebuild([agent]);
      executeAction(agent, AgentAction.Reproduce, world, [agent], grid);
      
      // Should not reproduce (too young)
      expect((agent as any)._pendingChild).toBeUndefined();
    });

    it('reproduction requires cooldown to be 0', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      agent.energy = 95;
      agent.age = 100;
      agent.gestationCooldown = 10;
      
      grid.rebuild([agent]);
      executeAction(agent, AgentAction.Reproduce, world, [agent], grid);
      
      expect((agent as any)._pendingChild).toBeUndefined();
    });

    it('attack damages target', () => {
      const attacker = createRandomAgent(world, 1, { ...defaultTraits(), aggressionBias: 0.9, size: 1.5 }, 0, new SeededRandom(42));
      const target = createRandomAgent(world, 2, defaultTraits(), 0, new SeededRandom(43));
      
      // Place them on the same passable tile
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          if (world.isPassable(x, y)) {
            attacker.x = x;
            attacker.y = y;
            target.x = x;
            target.y = y;
            
            const targetHealthBefore = target.health;
            agents = [attacker, target];
            grid.rebuild(agents);
            
            executeAction(attacker, AgentAction.Attack, world, agents, grid);
            
            expect(target.health).toBeLessThan(targetHealthBefore);
            return;
          }
        }
      }
    });

    it('movement adds memories for resource-rich tiles', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      // Find adjacent passable tiles where destination has high food
      for (let y = 1; y < 31; y++) {
        for (let x = 1; x < 31; x++) {
          const destTile = world.tileAt(x + 1, y);
          if (world.isPassable(x, y) && world.isPassable(x + 1, y) && destTile.foodResource > 30) {
            agent.x = x;
            agent.y = y;
            agent.energy = 80;
            agent.memory = [];
            
            executeAction(agent, AgentAction.MoveEast, world, [agent], grid);
            
            const foodMem = agent.memory.find(m => m.type === 'food');
            expect(foodMem).toBeDefined();
            return;
          }
        }
      }
    });
  });

  describe('decideAction', () => {
    let world: World;

    beforeEach(() => {
      world = new World({ width: 32, height: 32, seed: 42 });
    });

    it('returns a valid action', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      const action = decideAction(agent, world, []);
      expect(action).toBeGreaterThanOrEqual(0);
      expect(action).toBeLessThan(15);
    });

    it('prioritizes drinking when very thirsty', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      // Find tile with water
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const tile = world.tileAt(x, y);
          if (tile.waterResource > 20 && world.isPassable(x, y)) {
            agent.x = x;
            agent.y = y;
            agent.psychology.thirst = 0.9;
            agent.psychology.hunger = 0.1;
            agent.energy = 70;
            agent.health = 100;
            
            const action = decideAction(agent, world, []);
            expect(action).toBe(AgentAction.Drink);
            return;
          }
        }
      }
    });

    it('prioritizes eating when hungry and food available', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const tile = world.tileAt(x, y);
          if (tile.foodResource > 20 && world.isPassable(x, y)) {
            agent.x = x;
            agent.y = y;
            agent.psychology.hunger = 0.9;
            agent.psychology.thirst = 0.1;
            agent.energy = 15;
            agent.health = 100;
            
            const action = decideAction(agent, world, []);
            expect(action).toBe(AgentAction.Eat);
            return;
          }
        }
      }
    });

    it('flees when health is critical and scared', () => {
      const agent = createRandomAgent(world, 1, defaultTraits(), 0, new SeededRandom(42));
      agent.health = 10;
      agent.psychology.fear = 0.8;
      agent.psychology.thirst = 0.1;
      agent.psychology.hunger = 0.1;
      agent.energy = 50;
      
      // Create a threat nearby
      const threat = createRandomAgent(world, 2, defaultTraits(), 0, new SeededRandom(43));
      threat.x = agent.x + 1;
      threat.y = agent.y;
      
      const action = decideAction(agent, world, [threat]);
      // Should flee (Flee action or one of the movement actions)
      const isFleeAction = action === AgentAction.Flee ||
        (action >= AgentAction.MoveNorth && action <= AgentAction.MoveWest);
      expect(isFleeAction).toBe(true);
    });

    it('is deterministic for same state', () => {
      // Two agents with same genome but at same position should choose same action
      const traits = defaultTraits();
      const genome = makeGenome(traits);
      const a1 = createAgent(10, 10, 1, genome, 0, 0, null);
      a1.energy = 60;
      a1.psychology.hunger = 0.5;
      a1.psychology.thirst = 0.3;

      // Create second agent with same state but different ID => different hash
      // Determinism means same ID+age => same hash => same action
      // So we test that running decideAction twice on same agent gives same result
      const act1 = decideAction(a1, world, []);
      const act2 = decideAction(a1, world, []);
      expect(act1).toBe(act2);
    });
  });
});
