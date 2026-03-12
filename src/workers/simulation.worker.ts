import {
  WorldConfig, DEFAULT_WORLD_CONFIG, SimulationState, Intervention, Agent
} from '../engine/types';
import { World } from '../engine/World';
import {
  SpeciesRegistry, createRandomAgent, randomTraits, decideAction,
  executeAction, updateAgentLifecycle, applyTemperatureStress,
  addToGrid, rebuildGrid, gridKey
} from '../engine/Agent';
import { SpatialGrid } from '../engine/SpatialGrid';

export type WorkerInMessage =
  | { type: 'init'; config: Partial<WorldConfig>; id: string }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'step'; count: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'intervention'; intervention: Intervention }
  | { type: 'getState' };

export type WorkerOutMessage =
  | { type: 'initialized'; id: string; worldWidth: number; worldHeight: number }
  | { type: 'stats'; tick: number; agentCount: number; speciesCount: number; avgEnergy: number }
  | {
    type: 'fullState';
    tick: number;
    tiles: { terrain: number; food: number; temp: number; hazard: number }[];
    agents: {
      id: number; x: number; y: number; species: number; energy: number;
      health: number; maxHealth: number; alive: boolean; size: number;
      lastAction: number;
    }[];
    species: { id: number; name: string; color: string; population: number; extinct: boolean }[];
  }
  | { type: 'error'; message: string };

let world: World | null = null;
let agents: Agent[] = [];
let agentGrid: Map<number, Agent[]> = new Map();
let grid: SpatialGrid | null = null;
let speciesRegistry: SpeciesRegistry = new SpeciesRegistry();
let tick = 0;
let running = false;
let speed = 1;
let instanceId = '';

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      try {
        const config = { ...DEFAULT_WORLD_CONFIG, ...msg.config };
        world = new World(config);
        agents = [];
        agentGrid = new Map();
        grid = new SpatialGrid(config.width, config.height, config.maxAgents);
        speciesRegistry = new SpeciesRegistry();
        tick = 0;
        instanceId = msg.id;

        // Create initial species and agents
        const agentsPerSpecies = Math.floor(config.initialAgents / config.initialSpecies);
        for (let s = 0; s < config.initialSpecies; s++) {
          const traits = randomTraits(world.rng);
          const sp = speciesRegistry.registerSpecies(traits, 0);
          for (let a = 0; a < agentsPerSpecies; a++) {
            const agent = createRandomAgent(world, sp.id, traits, 0, world.rng);
            agents.push(agent);
            addToGrid(agentGrid, agent, config.width);
            speciesRegistry.updatePopulation(sp.id, 1);
          }
        }

        postMessage({
          type: 'initialized',
          id: instanceId,
          worldWidth: world.width,
          worldHeight: world.height,
        } satisfies WorkerOutMessage);
      } catch (err: any) {
        postMessage({ type: 'error', message: err.message } satisfies WorkerOutMessage);
      }
      break;
    }

    case 'start':
      running = true;
      runLoop();
      break;

    case 'pause':
      running = false;
      break;

    case 'step':
      if (world) {
        for (let i = 0; i < msg.count; i++) {
          simulateTick();
        }
        sendFullState();
      }
      break;

    case 'setSpeed':
      speed = msg.speed;
      break;

    case 'intervention':
      // Queue intervention
      break;

    case 'getState':
      sendFullState();
      break;
  }
};

function runLoop(): void {
  if (!running || !world) return;

  const ticksThisFrame = Math.min(speed, 100);
  for (let i = 0; i < ticksThisFrame; i++) {
    simulateTick();
  }

  if (tick % 10 === 0) {
    sendStats();
  }

  if (tick % 50 === 0) {
    sendFullState();
  }

  setTimeout(runLoop, 0);
}

function simulateTick(): void {
  if (!world) return;

  tick++;
  world.updateEnvironment(tick);

  const newChildren: Agent[] = [];

  for (const agent of agents) {
    if (!agent.alive) continue;

    // Get nearby agents
    const pr = Math.ceil(agent.genome.traits.perceptionRadius);
    const nearbyAgents: Agent[] = [];
    for (let dy = -pr; dy <= pr; dy++) {
      for (let dx = -pr; dx <= pr; dx++) {
        const key = gridKey(agent.x + dx, agent.y + dy, world.width);
        const atTile = agentGrid.get(key);
        if (atTile) {
          for (const a of atTile) {
            if (a.alive && a.id !== agent.id) nearbyAgents.push(a);
          }
        }
      }
    }

    const action = decideAction(agent, world, nearbyAgents);
    grid!.rebuild(agents);
    executeAction(agent, action, world, agents, grid!);

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
    }
  }

  for (const child of newChildren) {
    if (agents.length < world.config.maxAgents) {
      agents.push(child);
      addToGrid(agentGrid, child, world.width);
      speciesRegistry.updatePopulation(child.species, 1);
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
      agents.splice(i, 1);
    }
  }

  for (const sp of speciesRegistry.species.values()) {
    if (sp.population <= 0 && !sp.extinct) {
      speciesRegistry.markExtinct(sp.id, tick);
    }
  }
}

function sendStats(): void {
  const alive = agents.filter(a => a.alive);
  const avgEnergy = alive.length > 0
    ? alive.reduce((s, a) => s + a.energy, 0) / alive.length
    : 0;

  postMessage({
    type: 'stats',
    tick,
    agentCount: alive.length,
    speciesCount: speciesRegistry.getAliveSpecies().length,
    avgEnergy,
  } satisfies WorkerOutMessage);
}

function sendFullState(): void {
  if (!world) return;

  const tiles = world.tiles.map(t => ({
    terrain: t.terrain,
    food: t.foodResource,
    temp: t.temperature,
    hazard: t.hazard,
  }));

  const agentData = agents.filter(a => a.alive).map(a => ({
    id: a.id,
    x: a.x,
    y: a.y,
    species: a.species,
    energy: a.energy,
    health: a.health,
    maxHealth: a.maxHealth,
    alive: a.alive,
    size: a.genome.traits.size,
    lastAction: a.lastAction,
  }));

  const speciesData = Array.from(speciesRegistry.species.values()).map(s => ({
    id: s.id,
    name: s.name,
    color: s.color,
    population: s.population,
    extinct: s.extinct,
  }));

  postMessage({
    type: 'fullState',
    tick,
    tiles,
    agents: agentData,
    species: speciesData,
  } satisfies WorkerOutMessage);
}
