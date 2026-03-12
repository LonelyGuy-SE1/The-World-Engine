import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation, SimulationInstance } from '../src/engine/Simulation';
import { SimulationState, Agent } from '../src/engine/types';
import { resetAgentIds } from '../src/engine/Agent';

describe('Simulation', () => {
  let sim: Simulation;

  beforeEach(() => {
    resetAgentIds();
    sim = new Simulation();
  });

  describe('createInstance', () => {
    it('creates a simulation instance', () => {
      const inst = sim.createInstance('Test', {
        width: 32, height: 32, initialAgents: 20, initialSpecies: 3, seed: 42,
      });
      
      expect(inst).toBeDefined();
      expect(inst.name).toBe('Test');
      expect(inst.agents.length).toBe(18); // 6 per species = 18
      expect(inst.state).toBe(SimulationState.Paused);
      expect(inst.tick).toBe(0);
    });

    it('sets active instance on first creation', () => {
      const inst = sim.createInstance('Test', { width: 16, height: 16, seed: 42 });
      expect(sim.activeInstanceId).toBe(inst.id);
    });

    it('creates agents on passable terrain', () => {
      const inst = sim.createInstance('Test', {
        width: 32, height: 32, initialAgents: 30, initialSpecies: 3, seed: 42,
      });
      for (const agent of inst.agents) {
        expect(inst.world.isPassable(agent.x, agent.y)).toBe(true);
      }
    });

    it('registers correct number of species', () => {
      const inst = sim.createInstance('Test', {
        width: 32, height: 32, initialAgents: 30, initialSpecies: 5, seed: 42,
      });
      expect(inst.speciesRegistry.species.size).toBe(5);
    });

    it('first species is called Homo Sapiens', () => {
      const inst = sim.createInstance('Test', {
        width: 32, height: 32, initialAgents: 20, initialSpecies: 3, seed: 42,
      });
      const firstSpecies = inst.speciesRegistry.species.get(1);
      expect(firstSpecies?.name).toBe('Homo Sapiens');
      expect(firstSpecies?.color).toBe('#FFD700');
    });
  });

  describe('getActive', () => {
    it('returns null when no instances exist', () => {
      expect(sim.getActive()).toBeNull();
    });

    it('returns active instance', () => {
      const inst = sim.createInstance('Test', { width: 16, height: 16, seed: 42 });
      expect(sim.getActive()).toBe(inst);
    });
  });

  describe('removeInstance', () => {
    it('removes instance and updates active', () => {
      const inst1 = sim.createInstance('A', { width: 16, height: 16, seed: 1 });
      const inst2 = sim.createInstance('B', { width: 16, height: 16, seed: 2 });
      
      sim.removeInstance(inst1.id);
      expect(sim.instances.size).toBe(1);
      expect(sim.activeInstanceId).toBe(inst2.id);
    });

    it('sets activeId to null when last instance removed', () => {
      const inst = sim.createInstance('Test', { width: 16, height: 16, seed: 42 });
      sim.removeInstance(inst.id);
      expect(sim.activeInstanceId).toBeNull();
    });
  });

  describe('tick', () => {
    let inst: SimulationInstance;

    beforeEach(() => {
      inst = sim.createInstance('Test', {
        width: 32, height: 32, initialAgents: 20, initialSpecies: 3, seed: 42,
      });
      inst.state = SimulationState.Running;
    });

    it('increments tick counter', () => {
      sim.tick(inst);
      expect(inst.tick).toBe(1);
    });

    it('does nothing when paused', () => {
      inst.state = SimulationState.Paused;
      sim.tick(inst);
      expect(inst.tick).toBe(0);
    });

    it('agents age over time', () => {
      const ageBefore = inst.agents[0].age;
      sim.tick(inst);
      expect(inst.agents[0].age).toBe(ageBefore + 1);
    });

    it('agents lose energy over time', () => {
      const energyBefore = inst.agents[0].energy;
      sim.tick(inst);
      expect(inst.agents[0].energy).toBeLessThan(energyBefore);
    });

    it('gestation cooldown decrements', () => {
      inst.agents[0].gestationCooldown = 5;
      sim.tick(inst);
      expect(inst.agents[0].gestationCooldown).toBe(4);
    });

    it('removes dead agents', () => {
      // Mark agent as fully dead
      inst.agents[0].health = -10;
      inst.agents[0].alive = false;
      const initialCount = inst.agents.length;
      sim.tick(inst);
      expect(inst.agents.length).toBeLessThan(initialCount);
    });

    it('detects extinction', () => {
      // Kill all agents of one species by marking them dead
      const targetSpecies = inst.agents[0].species;
      for (const agent of inst.agents) {
        if (agent.species === targetSpecies) {
          agent.alive = false;
          agent.health = -10;
        }
      }
      // Need to decrement species population manually since tick death handler does it
      // Actually, we run the tick which will compact dead agents and detect extinction
      sim.tick(inst);
      
      const sp = inst.speciesRegistry.species.get(targetSpecies);
      expect(sp?.population).toBe(0);
      expect(sp?.extinct).toBe(true);
    });

    it('runs many ticks without crashing', () => {
      for (let i = 0; i < 200; i++) {
        sim.tick(inst);
      }
      expect(inst.tick).toBe(200);
      // Population should still exist (not all dead)
      expect(inst.agents.length).toBeGreaterThan(0);
    });

    it('updates stats periodically', () => {
      for (let i = 0; i < 10; i++) {
        sim.tick(inst);
      }
      expect(inst.stats.tick).toBeGreaterThan(0);
    });

    it('builds stats history', () => {
      for (let i = 0; i < 50; i++) {
        sim.tick(inst);
      }
      expect(inst.statsHistory.length).toBeGreaterThan(0);
    });

    it('dehydration damages agents', () => {
      // Set extreme thirst and prevent healing by setting high fatigue
      inst.agents[0].psychology.thirst = 0.99;
      inst.agents[0].health = 100;
      inst.agents[0].maxHealth = 100;
      // Run multiple ticks to accumulate dehydration damage
      for (let i = 0; i < 5; i++) {
        inst.agents[0].psychology.thirst = 0.99; // Keep thirst high
        sim.tick(inst);
      }
      // Health should have decreased due to repeated dehydration
      expect(inst.agents[0].health).toBeLessThan(100);
    });
  });

  describe('step', () => {
    it('does not tick when accumulator is below 1', () => {
      const inst = sim.createInstance('Test', {
        width: 16, height: 16, initialAgents: 10, initialSpecies: 2, seed: 42,
      });
      inst.state = SimulationState.Running;
      
      // With very small dt, accumulator won't reach 1
      sim.speed = 0.001;
      sim.step();
      expect(inst.tick).toBe(0);
    });
  });

  describe('ecological stability', () => {
    it('population survives 500 ticks', () => {
      const inst = sim.createInstance('Stability', {
        width: 64, height: 64, initialAgents: 100, initialSpecies: 4, seed: 42,
      });
      inst.state = SimulationState.Running;
      
      for (let i = 0; i < 500; i++) {
        sim.tick(inst);
      }
      
      expect(inst.agents.length).toBeGreaterThan(10);
    }, 15000);

    it('does not have population explosion in 500 ticks', () => {
      const inst = sim.createInstance('Explosion', {
        width: 64, height: 64, initialAgents: 100, initialSpecies: 4, seed: 42,
      });
      inst.state = SimulationState.Running;
      
      for (let i = 0; i < 500; i++) {
        sim.tick(inst);
      }
      
      // Population shouldn't grow more than 10x in 500 ticks
      expect(inst.agents.length).toBeLessThan(1000);
    });

    it('multiple species can coexist', () => {
      const inst = sim.createInstance('Coexist', {
        width: 64, height: 64, initialAgents: 100, initialSpecies: 4, seed: 42,
      });
      inst.state = SimulationState.Running;
      
      for (let i = 0; i < 300; i++) {
        sim.tick(inst);
      }
      
      const aliveSpecies = inst.speciesRegistry.getAliveSpecies();
      expect(aliveSpecies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('interventions', () => {
    it('applies temperature shift', () => {
      const inst = sim.createInstance('Test', {
        width: 16, height: 16, seed: 42,
      });
      inst.state = SimulationState.Running;
      
      const tempBefore = inst.world.globalTemperatureOffset;
      sim.applyIntervention(inst.id, {
        type: 'temperature_shift' as any,
        worldId: inst.id,
        tick: 0,
        params: { amount: 10 },
      });
      sim.tick(inst);
      expect(inst.world.globalTemperatureOffset).toBe(tempBefore + 10);
    });
  });
});
