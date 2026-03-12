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
import { EventLog, EventType, WorldEvent } from './EventLog';
import { CivilizationSystem, SpeciesCivilization, TECH_TREE } from './Civilization';

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
  eventLog: EventLog;
  civilization: CivilizationSystem;
  lastSeason: number;
  lastPopMilestone: number;
  statsHistoryIdx: number;
}

export class Simulation {
  instances: Map<string, SimulationInstance> = new Map();
  activeInstanceId: string | null = null;
  speed: number = 1; // user-facing speed multiplier
  /** ticks per second at speed=1 */
  baseTickRate: number = 4;
  private _tickAccumulator: number = 0;
  private _lastStepTime: number = 0;
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
      if (s === 0) {
        // Human-like species
        traits.perceptionRadius = 6;
        traits.socialBias = 0.8;
        traits.aggressionBias = 0.3;
        traits.speed = 1.2;
        traits.size = 1.0;
        traits.metabolism = 0.8;
        traits.foodEfficiency = 1.3;
      } else if (s === fullConfig.initialSpecies - 1) {
        traits.aggressionBias = 0.85;
        traits.speed = 2.0;
        traits.size = 1.6;
        traits.perceptionRadius = 5;
      }
      const speciesInfo = speciesRegistry.registerSpecies(traits, 0);
      if (s === 0) {
        speciesInfo.name = 'Homo Sapiens';
        speciesInfo.color = '#FFD700';
      }

      for (let a = 0; a < agentsPerSpecies; a++) {
        const agent = createRandomAgent(world, speciesInfo.id, traits, 0, rng);
        agents.push(agent);
        speciesRegistry.updatePopulation(speciesInfo.id, 1);
      }
    }

    grid.rebuild(agents);

    const eventLog = new EventLog();
    const civilization = new CivilizationSystem(() => rng.next());

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
      eventLog,
      civilization,
      lastSeason: 0,
      lastPopMilestone: 0,
      statsHistoryIdx: 0,
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

    // Rebuild spatial grid each tick to stay in sync with compaction
    grid.rebuild(agents);

    const agentCount = agents.length;
    // Adaptive batch sizing — ensure we process a meaningful fraction even at high pop
    const batchSize = Math.min(agentCount,
      agentCount <= 1000 ? agentCount :
      agentCount <= 5000 ? Math.max(800, Math.floor(agentCount * 0.4)) :
      agentCount <= 15000 ? Math.max(600, Math.floor(agentCount * 0.15)) :
      Math.max(400, Math.floor(agentCount * 0.05))
    );
    const start = instance.processOffset % Math.max(1, agentCount);

    const newChildren: Agent[] = [];
    const nearbyBuf: Agent[] = [];

    for (let b = 0; b < batchSize; b++) {
      const aIdx = (start + b) % agentCount;
      const agent = agents[aIdx];
      if (!agent.alive) continue;

      nearbyBuf.length = 0;
      // Allow perception up to 5 tiles — the trait actually matters now
      const pr = Math.min(5, Math.ceil(agent.genome.traits.perceptionRadius));
      outer:
      for (let dy = -pr; dy <= pr; dy++) {
        const ny = agent.y + dy;
        if (ny < 0 || ny >= world.height) continue;
        for (let dx = -pr; dx <= pr; dx++) {
          if (dx * dx + dy * dy > pr * pr) continue; // circular radius
          const nx = agent.x + dx;
          if (nx < 0 || nx >= world.width) continue;
          let gIdx = grid.firstAt(nx, ny);
          while (gIdx >= 0) {
            const a = agents[gIdx];
            if (a.alive && a.id !== agent.id) nearbyBuf.push(a);
            gIdx = grid.next(gIdx);
            if (nearbyBuf.length >= 16) break outer;
          }
        }
      }

      // All agents go through the same decision system
      const action = decideAction(agent, world, nearbyBuf);
      executeAction(agent, action, world, agents, grid);

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
      if (a.gestationCooldown > 0) a.gestationCooldown--;
      const t = a.genome.traits;
      // Base metabolic cost: smaller, slower creatures are cheaper to maintain
      a.energy -= 0.12 * t.metabolism * (0.4 + t.size * 0.4 + t.speed * 0.2);
      // Aging health decline (starts at 80% of max age, accelerates)
      if (a.age > a.maxAge * 0.8) {
        a.health -= (a.age - a.maxAge * 0.8) / (a.maxAge * 0.2) * 0.4;
      }
      // Starvation damage
      if (a.energy <= 0) { a.health -= 3; a.energy = 0; }
      // Dehydration damage
      if (a.psychology.thirst > 0.9) {
        a.health -= (a.psychology.thirst - 0.9) * 5;
      }

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
        agent.psychology.thirst = Math.min(1, agent.psychology.thirst + 0.012);
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
        instance.eventLog.log(tick, EventType.Extinction,
          `${sp.name} has gone extinct! (lived ${tick - sp.originTick} ticks)`,
          { speciesId: sp.id }
        );
      }
    }

    // Season change detection
    const tpy = world.config.ticksPerYear;
    const currentSeason = Math.floor((tick % tpy) / (tpy / 4));
    if (currentSeason !== instance.lastSeason) {
      const seasonNames = ['Spring', 'Summer', 'Autumn', 'Winter'];
      instance.eventLog.log(tick, EventType.SeasonChange,
        `${seasonNames[currentSeason]} has arrived (Year ${Math.floor(tick / tpy)})`,
        { season: currentSeason }
      );
      instance.lastSeason = currentSeason;
    }

    // Civilization update every 50 ticks
    if (tick % 50 === 0) {
      instance.civilization.update(
        tick, agents, speciesRegistry, instance.eventLog,
        world.territoryOwner, world.territoryStrength, world.width
      );
    }

    if (tick % 5 === 0) {
      instance.stats = this.computeStats(tick, world, agents, speciesRegistry);
      this.onStatsUpdate?.(instance.id, instance.stats);

      if (tick % 25 === 0) {
        // Ring-buffer style: overwrite oldest instead of shift() (O(1) vs O(n))
        if (instance.statsHistory.length < 4000) {
          instance.statsHistory.push({ ...instance.stats });
        } else {
          instance.statsHistory[instance.statsHistoryIdx % 4000] = { ...instance.stats };
        }
        instance.statsHistoryIdx++;
      }
    }
  }

  step(): void {
    const now = performance.now();
    const dt = this._lastStepTime > 0 ? Math.min(now - this._lastStepTime, 200) : 16;
    this._lastStepTime = now;

    const ticksPerSec = this.baseTickRate * this.speed;
    this._tickAccumulator += (dt / 1000) * ticksPerSec;

    if (this._tickAccumulator < 1) return;

    const deadline = now + 14;
    let maxRan = 0;

    for (const instance of this.instances.values()) {
      if (instance.state !== SimulationState.Running) continue;
      let ran = 0;
      const budget = Math.floor(this._tickAccumulator);
      for (let i = 0; i < budget; i++) {
        if (performance.now() >= deadline) break;
        this.tick(instance);
        ran++;
      }
      if (ran > maxRan) maxRan = ran;
    }

    // Only subtract ticks we actually ran — prevents tick loss under load
    this._tickAccumulator -= maxRan;
    if (this._tickAccumulator > 20) this._tickAccumulator = 20;
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

      case InterventionType.SpawnCustomAgent: {
        const count = intervention.params.count as number || 10;
        const traits = randomTraits(world.rng);
        // Apply any trait overrides from params
        if (intervention.params.speed) traits.speed = intervention.params.speed as number;
        if (intervention.params.size) traits.size = intervention.params.size as number;
        if (intervention.params.aggressionBias !== undefined) traits.aggressionBias = intervention.params.aggressionBias as number;
        if (intervention.params.socialBias !== undefined) traits.socialBias = intervention.params.socialBias as number;
        if (intervention.params.perceptionRadius) traits.perceptionRadius = intervention.params.perceptionRadius as number;
        if (intervention.params.metabolism) traits.metabolism = intervention.params.metabolism as number;
        if (intervention.params.heatTolerance !== undefined) traits.heatTolerance = intervention.params.heatTolerance as number;
        if (intervention.params.foodEfficiency) traits.foodEfficiency = intervention.params.foodEfficiency as number;

        const sp = speciesRegistry.registerSpecies(traits, instance.tick);
        if (intervention.params.speciesName) {
          sp.name = intervention.params.speciesName as string;
        }

        for (let i = 0; i < count; i++) {
          const agent = createRandomAgent(world, sp.id, traits, instance.tick, world.rng);
          agents.push(agent);
          speciesRegistry.updatePopulation(sp.id, 1);
        }

        instance.eventLog.log(instance.tick, EventType.NewSpecies,
          `${sp.name} (${count} individuals) introduced to the world!`,
          { speciesId: sp.id, count }
        );
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
