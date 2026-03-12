import {
  WorldConfig, DEFAULT_WORLD_CONFIG, WorldStats, SimulationState,
  Agent, AgentAction, Intervention, InterventionType, SeededRandom,
  Terrain
} from './types';
import { World } from './World';
import {
  SpeciesRegistry, createRandomAgent, randomTraits, decideAction,
  executeAction, updateAgentLifecycle, applyTemperatureStress,
  addToGrid, rebuildGrid, createAgent, BRAIN_CONFIG, resetAgentIds,
  gridKey
} from './Agent';
import { NeuralNet } from './NeuralNet';
import { SpatialGrid } from './SpatialGrid';

export interface SimulationInstance {
  id: string;
  name: string;
  world: World;
  agents: Agent[];
  grid: SpatialGrid;
  speciesRegistry: SpeciesRegistry;
  tick: number;
  state: SimulationState;
  stats: WorldStats;
  statsHistory: WorldStats[];
  pendingInterventions: Intervention[];
  processOffset: number;
  extendedOffset: number;
}

export class Simulation {
  instances: Map<string, SimulationInstance> = new Map();
  activeInstanceId: string | null = null;
  speed: number = 1; // ticks per frame
  maxTicksPerFrame: number = 100;
  onStatsUpdate?: (instanceId: string, stats: WorldStats) => void;
  onAgentBirth?: (instanceId: string, agent: Agent) => void;
  onAgentDeath?: (instanceId: string, agent: Agent) => void;

  createInstance(name: string, config: Partial<WorldConfig> = {}): SimulationInstance {
    const id = `world_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullConfig = { ...DEFAULT_WORLD_CONFIG, ...config };
    const world = new World(fullConfig);
    const speciesRegistry = new SpeciesRegistry();
    const rng = world.rng;

    const agents: Agent[] = [];
    const grid = new SpatialGrid(fullConfig.width, fullConfig.height, Math.max(fullConfig.maxAgents, 10000));
    const agentsPerSpecies = Math.floor(fullConfig.initialAgents / fullConfig.initialSpecies);

    for (let s = 0; s < fullConfig.initialSpecies; s++) {
      const traits = randomTraits(rng);
      if (s === fullConfig.initialSpecies - 1) {
        traits.aggressionBias = 0.85;
        traits.speed = 2.0;
        traits.size = 1.6;
        traits.perceptionRadius = 5;
      }
      const speciesInfo = speciesRegistry.registerSpecies(traits, 0);

      for (let a = 0; a < agentsPerSpecies; a++) {
        const agent = createRandomAgent(world, speciesInfo.id, traits, 0, rng);
        agents.push(agent);
        speciesRegistry.updatePopulation(speciesInfo.id, 1);
      }
    }

    grid.rebuild(agents);

    const instance: SimulationInstance = {
      id,
      name,
      world,
      agents,
      grid,
      speciesRegistry,
      tick: 0,
      state: SimulationState.Paused,
      stats: this.computeStats(0, world, agents, speciesRegistry),
      statsHistory: [],
      pendingInterventions: [],
      processOffset: 0,
      extendedOffset: 0,
    };

    this.instances.set(id, instance);
    if (!this.activeInstanceId) this.activeInstanceId = id;

    return instance;
  }

  cloneInstance(sourceId: string, newName: string): SimulationInstance | null {
    const source = this.instances.get(sourceId);
    if (!source) return null;

    // Create a new world with same config but new seed
    const newConfig = { ...source.world.config, seed: Date.now() };
    const instance = this.createInstance(newName, newConfig);

    // Copy world state
    for (let i = 0; i < source.world.tiles.length; i++) {
      Object.assign(instance.world.tiles[i], source.world.tiles[i]);
    }
    instance.world.globalTemperatureOffset = source.world.globalTemperatureOffset;
    instance.tick = source.tick;

    return instance;
  }

  removeInstance(id: string): void {
    this.instances.delete(id);
    if (this.activeInstanceId === id) {
      this.activeInstanceId = this.instances.size > 0
        ? this.instances.keys().next().value ?? null
        : null;
    }
  }

  getActive(): SimulationInstance | null {
    return this.activeInstanceId ? this.instances.get(this.activeInstanceId) ?? null : null;
  }

  tick(instance: SimulationInstance): void {
    if (instance.state !== SimulationState.Running) return;

    instance.tick++;
    const { world, agents, grid, speciesRegistry } = instance;
    const tick = instance.tick;

    this.processInterventions(instance);

    if (tick % 5 === 0) {
      world.updateEnvironment(tick);
    }

    grid.rebuild(agents);

    const agentCount = agents.length;
    const maxBatch = Math.min(
      agentCount,
      agentCount <= 2000 ? agentCount : agentCount <= 10000 ? 2000 : agentCount <= 40000 ? 1200 : 700
    );
    const batchSize = Math.min(maxBatch, agentCount);
    const start = instance.processOffset % Math.max(1, agentCount);

    const newChildren: Agent[] = [];
    const nearbyBuf: Agent[] = [];

    for (let b = 0; b < batchSize; b++) {
      const aIdx = (start + b) % agentCount;
      const agent = agents[aIdx];
      if (!agent.alive) continue;

      nearbyBuf.length = 0;
      const pr = Math.min(2, Math.ceil(agent.genome.traits.perceptionRadius));
      outer:
      for (let dy = -pr; dy <= pr; dy++) {
        const ny = agent.y + dy;
        if (ny < 0 || ny >= world.height) continue;
        for (let dx = -pr; dx <= pr; dx++) {
          const nx = agent.x + dx;
          if (nx < 0 || nx >= world.width) continue;
          let gIdx = grid.firstAt(nx, ny);
          while (gIdx >= 0) {
            const a = agents[gIdx];
            if (a.alive && a.id !== agent.id) nearbyBuf.push(a);
            gIdx = grid.next(gIdx);
            if (nearbyBuf.length >= 12) break outer;
          }
        }
      }

      if (nearbyBuf.length === 0) {
        const tile = world.tileAt(agent.x, agent.y);
        if (agent.energy < 60 && tile.foodResource > 5) {
          executeAction(agent, 5, world, agents, grid);
        } else if (agent.energy >= 80 && agent.genome.traits.reproductionThreshold * 100 <= agent.energy) {
          executeAction(agent, 6, world, agents, grid);
        } else {
          const dirs = [0, 1, 2, 3, 4];
          executeAction(agent, dirs[(tick + agent.id) % 5], world, agents, grid);
        }
      } else {
        const action = decideAction(agent, world, nearbyBuf);
        executeAction(agent, action, world, agents, grid);
      }

      if ((agent as any)._pendingChild) {
        const child = (agent as any)._pendingChild as Agent;
        child.tickBorn = tick;
        newChildren.push(child);
        delete (agent as any)._pendingChild;
      }
    }

    instance.processOffset = (start + batchSize) % Math.max(1, agentCount);

    let writeIdx = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.age++;
      const t = a.genome.traits;
      a.energy -= 0.15 * t.metabolism * (0.5 + t.size * 0.5);
      if (a.age > a.maxAge * 0.8) {
        a.health -= (a.age - a.maxAge * 0.8) / (a.maxAge * 0.2) * 0.5;
      }
      if (a.energy <= 0) { a.health -= 5; a.energy = 0; }

      if (a.health <= 0 || a.age >= a.maxAge || !a.alive) {
        a.alive = false;
        speciesRegistry.updatePopulation(a.species, -1);
        const tile = world.tileAt(a.x, a.y);
        tile.foodResource = Math.min(100, tile.foodResource + a.energy * 0.5);
        this.onAgentDeath?.(instance.id, a);
        continue;
      }

      if (writeIdx !== i) agents[writeIdx] = a;
      writeIdx++;
    }
    agents.length = writeIdx;

    for (const child of newChildren) {
      if (agents.length < world.config.maxAgents) {
        agents.push(child);
        speciesRegistry.updatePopulation(child.species, 1);
        this.onAgentBirth?.(instance.id, child);
      }
    }

    if (tick % 5 === 0) {
      const extCount = agents.length;
      const extBatch = Math.min(Math.max(5000, Math.floor(extCount / 5)), extCount);
      const extStart = instance.extendedOffset % Math.max(1, extCount);
      for (let i = 0; i < extBatch; i++) {
        const idx = (extStart + i) % extCount;
        const agent = agents[idx];

        agent.psychology.hunger = Math.min(1, agent.psychology.hunger + 0.025);
        agent.psychology.fatigue = Math.min(1, agent.psychology.fatigue + 0.015);
        agent.psychology.fear = Math.max(0, agent.psychology.fear - 0.05);
        agent.psychology.aggression *= 0.975;
        agent.psychology.curiosity = Math.min(1, agent.psychology.curiosity + 0.01);

        const tile = world.tileAt(agent.x, agent.y);
        applyTemperatureStress(agent, tile);

        if (tile.hazard > 0) {
          agent.health -= tile.hazard * 25;
          agent.psychology.fear = Math.min(1, agent.psychology.fear + tile.hazard * 0.5);
        }

        world.recordAgentPresence(agent.x, agent.y);
        world.claimTerritory(agent.x, agent.y, agent.species);

        if (agent.memory.length > 30) {
          agent.memory.length = 15;
        }

        const tIdx = agent.y * world.width + agent.x;
        const owner = world.territoryOwner[tIdx];
        if (owner > 0 && owner !== agent.species && world.territoryStrength[tIdx] > 0.3) {
          agent.psychology.fear = Math.min(1, agent.psychology.fear + 0.1);
          agent.psychology.aggression = Math.min(1, agent.psychology.aggression + 0.05);
        }
      }
      instance.extendedOffset = (extStart + extBatch) % Math.max(1, extCount);
    }

    for (const sp of speciesRegistry.species.values()) {
      if (sp.population <= 0 && !sp.extinct) {
        speciesRegistry.markExtinct(sp.id, tick);
      }
    }

    if (tick % 10 === 0) {
      instance.stats = this.computeStats(tick, world, agents, speciesRegistry);
      this.onStatsUpdate?.(instance.id, instance.stats);

      if (tick % 100 === 0) {
        instance.statsHistory.push({ ...instance.stats });
        if (instance.statsHistory.length > 1000) {
          instance.statsHistory.shift();
        }
      }
    }
  }

  step(ticksPerFrame: number = this.speed): void {
    const count = Math.min(ticksPerFrame, this.maxTicksPerFrame);
    const deadline = performance.now() + 14; // ~12ms budget to leave room for rendering
    for (const instance of this.instances.values()) {
      if (instance.state === SimulationState.Running) {
        for (let i = 0; i < count; i++) {
          this.tick(instance);
          if (performance.now() >= deadline) break;
        }
      }
    }
  }

  applyIntervention(instanceId: string, intervention: Intervention): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    instance.pendingInterventions.push(intervention);
  }

  private processInterventions(instance: SimulationInstance): void {
    while (instance.pendingInterventions.length > 0) {
      const intervention = instance.pendingInterventions.shift()!;
      this.executeIntervention(instance, intervention);
    }
  }

  private executeIntervention(instance: SimulationInstance, intervention: Intervention): void {
    const { world, agents, grid, speciesRegistry } = instance;

    switch (intervention.type) {
      case InterventionType.TemperatureShift: {
        const amount = intervention.params.amount as number || 0;
        world.globalTemperatureOffset += amount;
        break;
      }

      case InterventionType.ResourceMultiplier: {
        const multiplier = intervention.params.multiplier as number || 1;
        for (const tile of world.tiles) {
          tile.foodResource *= multiplier;
          tile.fertility *= multiplier;
        }
        break;
      }

      case InterventionType.IntroducePredator: {
        const count = intervention.params.count as number || 10;
        const traits = randomTraits(world.rng);
        traits.aggressionBias = 0.95;
        traits.speed = 2.5;
        traits.size = 1.8;
        traits.perceptionRadius = 6;
        const sp = speciesRegistry.registerSpecies(traits, instance.tick);

        for (let i = 0; i < count; i++) {
          const agent = createRandomAgent(world, sp.id, traits, instance.tick, world.rng);
          agents.push(agent);
          speciesRegistry.updatePopulation(sp.id, 1);
        }
        break;
      }

      case InterventionType.RemoveSpecies: {
        const speciesId = intervention.params.speciesId as number;
        for (const agent of agents) {
          if (agent.species === speciesId && agent.alive) {
            agent.alive = false;
          }
        }
        break;
      }

      case InterventionType.MutationRateChange: {
        const multiplier = intervention.params.multiplier as number || 1;
        for (const agent of agents) {
          agent.genome.traits.mutationRate *= multiplier;
          agent.genome.traits.mutationRate = Math.min(0.5, agent.genome.traits.mutationRate);
        }
        break;
      }

      case InterventionType.AddHazard: {
        const cx = intervention.params.x as number || Math.floor(world.width / 2);
        const cy = intervention.params.y as number || Math.floor(world.height / 2);
        const radius = intervention.params.radius as number || 10;
        const intensity = intervention.params.intensity as number || 0.5;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (world.isValid(nx, ny) && dx * dx + dy * dy <= radius * radius) {
              const tile = world.tileAt(nx, ny);
              tile.hazard = Math.min(1, tile.hazard + intensity);
            }
          }
        }
        break;
      }

      case InterventionType.ClimateEvent: {
        const eventType = intervention.params.eventType as string || 'ice_age';
        if (eventType === 'ice_age') {
          world.globalTemperatureOffset -= 15;
        } else if (eventType === 'heat_wave') {
          world.globalTemperatureOffset += 20;
        } else if (eventType === 'flood') {
          // Raise water levels
          for (const tile of world.tiles) {
            if (tile.elevation < 0.4 && tile.terrain !== Terrain.DeepWater) {
              tile.terrain = Terrain.ShallowWater;
              tile.waterResource = 100;
            }
          }
        }
        break;
      }
    }
  }

  private computeStats(
    tick: number, world: World, agents: Agent[], speciesRegistry: SpeciesRegistry
  ): WorldStats {
    let aliveCount = 0, totalEnergy = 0, totalAge = 0, totalBirths = 0;
    const speciesPopulations = new Map<number, number>();
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.alive) continue;
      aliveCount++;
      totalEnergy += a.energy;
      totalAge += a.age;
      totalBirths += a.offspring;
      speciesPopulations.set(a.species, (speciesPopulations.get(a.species) || 0) + 1);
    }

    let totalFood = 0, totalTemp = 0;
    for (let i = 0; i < world.tiles.length; i++) {
      totalFood += world.tiles[i].foodResource;
      totalTemp += world.tiles[i].temperature;
    }

    const aliveSpeciesCount = speciesRegistry.getAliveSpecies().length;
    let totalExtinctions = 0;
    for (const s of speciesRegistry.species.values()) {
      if (s.extinct) totalExtinctions++;
    }

    return {
      tick,
      year: Math.floor(tick / world.config.ticksPerYear),
      totalAgents: aliveCount,
      totalSpecies: aliveSpeciesCount,
      averageEnergy: aliveCount > 0 ? totalEnergy / aliveCount : 0,
      averageAge: aliveCount > 0 ? totalAge / aliveCount : 0,
      totalBirths,
      totalDeaths: 0,
      averageTemperature: totalTemp / world.tiles.length,
      totalFood,
      extinctions: totalExtinctions,
      speciesPopulations,
    };
  }
}
