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

export interface SimulationInstance {
  id: string;
  name: string;
  world: World;
  agents: Agent[];
  agentGrid: Map<number, Agent[]>;
  speciesRegistry: SpeciesRegistry;
  tick: number;
  state: SimulationState;
  stats: WorldStats;
  statsHistory: WorldStats[];
  pendingInterventions: Intervention[];
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
    const agentGrid = new Map<number, Agent[]>();
    const agentsPerSpecies = Math.floor(fullConfig.initialAgents / fullConfig.initialSpecies);

    for (let s = 0; s < fullConfig.initialSpecies; s++) {
      const traits = randomTraits(rng);
      const speciesInfo = speciesRegistry.registerSpecies(traits, 0);

      for (let a = 0; a < agentsPerSpecies; a++) {
        const agent = createRandomAgent(world, speciesInfo.id, traits, 0, rng);
        agents.push(agent);
        addToGrid(agentGrid, agent, fullConfig.width);
        speciesRegistry.updatePopulation(speciesInfo.id, 1);
      }
    }

    const instance: SimulationInstance = {
      id,
      name,
      world,
      agents,
      agentGrid,
      speciesRegistry,
      tick: 0,
      state: SimulationState.Paused,
      stats: this.computeStats(0, world, agents, speciesRegistry),
      statsHistory: [],
      pendingInterventions: [],
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
    const { world, agents, agentGrid, speciesRegistry, tick } = instance;

    this.processInterventions(instance);

    world.updateEnvironment(tick);

    const newChildren: Agent[] = [];

    for (const agent of agents) {
      if (!agent.alive) continue;

      const pr = Math.ceil(agent.genome.traits.perceptionRadius);
      const nearbyAgents: Agent[] = [];
      for (let dy = -pr; dy <= pr; dy++) {
        for (let dx = -pr; dx <= pr; dx++) {
          if (dx === 0 && dy === 0) continue;
          const key = gridKey(agent.x + dx, agent.y + dy, world.width);
          const atTile = agentGrid.get(key);
          if (atTile) {
            for (const a of atTile) {
              if (a.alive) nearbyAgents.push(a);
            }
          }
        }
      }
      const ownKey = gridKey(agent.x, agent.y, world.width);
      const ownTile = agentGrid.get(ownKey);
      if (ownTile) {
        for (const a of ownTile) {
          if (a.alive && a.id !== agent.id) nearbyAgents.push(a);
        }
      }

      const action = decideAction(agent, world, nearbyAgents);
      executeAction(agent, action, world, agentGrid);

      if ((agent as any)._pendingChild) {
        const child = (agent as any)._pendingChild as Agent;
        child.tickBorn = tick;
        newChildren.push(child);
        delete (agent as any)._pendingChild;
      }

      updateAgentLifecycle(agent);

      const tile = world.tileAt(agent.x, agent.y);
      applyTemperatureStress(agent, tile);

      if (tile.hazard > 0) {
        agent.health -= tile.hazard * 5;
        agent.psychology.fear = Math.min(1, agent.psychology.fear + tile.hazard * 0.1);
      }
    }

    for (const child of newChildren) {
      if (agents.length < world.config.maxAgents) {
        agents.push(child);
        addToGrid(agentGrid, child, world.width);
        speciesRegistry.updatePopulation(child.species, 1);
        this.onAgentBirth?.(instance.id, child);
      }
    }

    for (let i = agents.length - 1; i >= 0; i--) {
      if (!agents[i].alive) {
        const dead = agents[i];
        speciesRegistry.updatePopulation(dead.species, -1);

        const key = gridKey(dead.x, dead.y, world.width);
        const list = agentGrid.get(key);
        if (list) {
          const idx = list.indexOf(dead);
          if (idx >= 0) list.splice(idx, 1);
          if (list.length === 0) agentGrid.delete(key);
        }

        const tile = world.tileAt(dead.x, dead.y);
        tile.foodResource = Math.min(100, tile.foodResource + dead.energy * 0.5);

        this.onAgentDeath?.(instance.id, dead);
        agents.splice(i, 1);
      }
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
    const deadline = performance.now() + 12; // ~12ms budget to leave room for rendering
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
    const { world, agents, agentGrid, speciesRegistry } = instance;

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
        traits.aggressionBias = 0.9;
        traits.speed = 1.8;
        traits.size = 1.5;
        traits.perceptionRadius = 6;
        const sp = speciesRegistry.registerSpecies(traits, instance.tick);

        for (let i = 0; i < count; i++) {
          const agent = createRandomAgent(world, sp.id, traits, instance.tick, world.rng);
          agents.push(agent);
          addToGrid(agentGrid, agent, world.width);
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
    const alive = agents.filter(a => a.alive);
    const totalEnergy = alive.reduce((sum, a) => sum + a.energy, 0);
    const totalAge = alive.reduce((sum, a) => sum + a.age, 0);
    const totalFood = world.tiles.reduce((sum, t) => sum + t.foodResource, 0);
    const totalTemp = world.tiles.reduce((sum, t) => sum + t.temperature, 0);

    const speciesPopulations = new Map<number, number>();
    for (const a of alive) {
      speciesPopulations.set(a.species, (speciesPopulations.get(a.species) || 0) + 1);
    }

    const aliveSpeciesCount = speciesRegistry.getAliveSpecies().length;
    const totalExtinctions = Array.from(speciesRegistry.species.values())
      .filter(s => s.extinct).length;

    return {
      tick,
      year: Math.floor(tick / world.config.ticksPerYear),
      totalAgents: alive.length,
      totalSpecies: aliveSpeciesCount,
      averageEnergy: alive.length > 0 ? totalEnergy / alive.length : 0,
      averageAge: alive.length > 0 ? totalAge / alive.length : 0,
      totalBirths: alive.reduce((sum, a) => sum + a.offspring, 0),
      totalDeaths: 0,
      averageTemperature: totalTemp / world.tiles.length,
      totalFood,
      extinctions: totalExtinctions,
      speciesPopulations,
    };
  }
}
