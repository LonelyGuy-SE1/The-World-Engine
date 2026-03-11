import {
  Agent, AgentAction, ACTION_COUNT, Genome, Traits, Psychology,
  MemoryEntry, NeuralNetConfig, SpeciesInfo, SeededRandom, Terrain,
  TERRAIN_MOVEMENT_COST
} from './types';
import { NeuralNet } from './NeuralNet';
import { World } from './World';

const INPUT_SIZE = 39;
const HIDDEN_SIZES = [28, 16];
const OUTPUT_SIZE = ACTION_COUNT;

export const BRAIN_CONFIG: NeuralNetConfig = {
  inputSize: INPUT_SIZE,
  hiddenSizes: HIDDEN_SIZES,
  outputSize: OUTPUT_SIZE,
};

const TOTAL_BRAIN_WEIGHTS = NeuralNet.calcTotalWeights(BRAIN_CONFIG);

const SPECIES_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F8C471', '#AEB6BF', '#D2B4DE',
  '#A3E4D7', '#FAD7A0', '#D5F5E3', '#FADBD8', '#D6EAF8',
];

const SPECIES_NAMES = [
  'Florens', 'Ventus', 'Ignis', 'Aquilis', 'Terrix',
  'Umbrae', 'Solari', 'Noctis', 'Primus', 'Verdis',
  'Glacius', 'Ferox', 'Silex', 'Maris', 'Aureon',
  'Nexus', 'Vortis', 'Pyrus', 'Corvus', 'Fulgur',
];

let nextAgentId = 1;
let nextSpeciesId = 1;

export function resetAgentIds(): void {
  nextAgentId = 1;
  nextSpeciesId = 1;
}

// --- Species Registry ---

export class SpeciesRegistry {
  species: Map<number, SpeciesInfo> = new Map();

  registerSpecies(traits: Traits, tick: number): SpeciesInfo {
    const id = nextSpeciesId++;
    const info: SpeciesInfo = {
      id,
      name: SPECIES_NAMES[(id - 1) % SPECIES_NAMES.length] + (id > SPECIES_NAMES.length ? ` ${Math.ceil(id / SPECIES_NAMES.length)}` : ''),
      color: SPECIES_COLORS[(id - 1) % SPECIES_COLORS.length],
      originTick: tick,
      founderTraits: { ...traits },
      population: 0,
      totalEverLived: 0,
      extinct: false,
      extinctTick: null,
    };
    this.species.set(id, info);
    return info;
  }

  updatePopulation(speciesId: number, delta: number): void {
    const info = this.species.get(speciesId);
    if (!info) return;
    info.population += delta;
    if (delta > 0) info.totalEverLived += delta;
    if (info.population <= 0 && !info.extinct) {
      info.extinct = true;
      info.population = 0;
    }
  }

  markExtinct(speciesId: number, tick: number): void {
    const info = this.species.get(speciesId);
    if (info && !info.extinct) {
      info.extinct = true;
      info.extinctTick = tick;
    }
  }

  getAliveSpecies(): SpeciesInfo[] {
    return Array.from(this.species.values()).filter(s => !s.extinct);
  }
}

// --- Trait Generation ---

export function randomTraits(rng: SeededRandom): Traits {
  return {
    speed: rng.nextFloat(0.7, 1.5),
    size: rng.nextFloat(0.6, 1.4),
    perceptionRadius: rng.nextFloat(2, 6),
    metabolism: rng.nextFloat(0.6, 1.4),
    reproductionThreshold: rng.nextFloat(0.4, 0.8),
    mutationRate: rng.nextFloat(0.03, 0.15),
    aggressionBias: rng.nextFloat(0.1, 0.7),
    socialBias: rng.nextFloat(0.1, 0.7),
    heatTolerance: rng.nextFloat(-0.5, 0.5),
    foodEfficiency: rng.nextFloat(0.7, 1.3),
  };
}

export function mutateTraits(traits: Traits, mutationRate: number, rng: SeededRandom): Traits {
  const mutate = (val: number, min: number, max: number): number => {
    if (rng.next() < mutationRate) {
      val += rng.nextGaussian() * 0.1;
      return Math.max(min, Math.min(max, val));
    }
    return val;
  };

  return {
    speed: mutate(traits.speed, 0.3, 3.0),
    size: mutate(traits.size, 0.3, 3.0),
    perceptionRadius: mutate(traits.perceptionRadius, 1, 10),
    metabolism: mutate(traits.metabolism, 0.3, 3.0),
    reproductionThreshold: mutate(traits.reproductionThreshold, 0.2, 0.95),
    mutationRate: mutate(traits.mutationRate, 0.005, 0.5),
    aggressionBias: mutate(traits.aggressionBias, 0, 1),
    socialBias: mutate(traits.socialBias, 0, 1),
    heatTolerance: mutate(traits.heatTolerance, -1, 1),
    foodEfficiency: mutate(traits.foodEfficiency, 0.3, 3.0),
  };
}

// --- Agent Creation ---

export function createAgent(
  x: number, y: number, species: number, genome: Genome,
  tick: number, generation: number, parentId: number | null
): Agent {
  const id = nextAgentId++;
  return {
    id,
    x,
    y,
    energy: 50 + genome.traits.size * 20,
    health: 100,
    maxHealth: 80 + genome.traits.size * 40,
    age: 0,
    maxAge: Math.floor(200 + genome.traits.size * 100 + (1 / genome.traits.metabolism) * 50),
    generation,
    species,
    genome,
    psychology: {
      fear: 0.1,
      aggression: genome.traits.aggressionBias * 0.5,
      curiosity: 0.5,
      socialBonding: genome.traits.socialBias * 0.5,
      hunger: 0.3,
      fatigue: 0,
    },
    memory: [],
    alive: true,
    lastAction: AgentAction.Stay,
    kills: 0,
    offspring: 0,
    foodEaten: 0,
    tickBorn: tick,
    parentId,
  };
}

export function createRandomAgent(
  world: World, species: number, traits: Traits, tick: number, rng: SeededRandom
): Agent {
  // Find a passable tile
  let x: number, y: number;
  let attempts = 0;
  do {
    x = rng.nextInt(0, world.width - 1);
    y = rng.nextInt(0, world.height - 1);
    attempts++;
  } while (!world.isPassable(x, y) && attempts < 1000);

  if (attempts >= 1000) {
    x = Math.floor(world.width / 2);
    y = Math.floor(world.height / 2);
  }

  const brain = new NeuralNet(BRAIN_CONFIG);
  brain.initializeRandom(() => rng.next());

  const genome: Genome = {
    brainWeights: brain.weights,
    traits,
  };

  return createAgent(x, y, species, genome, tick, 0, null);
}

export function buildInputVector(agent: Agent, world: World, nearbyAgents: Agent[]): Float32Array {
  const input = new Float32Array(INPUT_SIZE);
  let idx = 0;

  input[idx++] = agent.energy / 100;
  input[idx++] = agent.health / agent.maxHealth;
  input[idx++] = agent.age / agent.maxAge;
  input[idx++] = agent.psychology.hunger;
  input[idx++] = agent.psychology.fatigue;
  input[idx++] = agent.psychology.fear;
  input[idx++] = agent.psychology.aggression;
  input[idx++] = agent.psychology.curiosity;
  input[idx++] = agent.psychology.socialBonding;

  const tile = world.tileAt(agent.x, agent.y);
  for (let t = 0; t < 7; t++) {
    input[idx++] = tile.terrain === t ? 1 : 0;
  }
  input[idx++] = tile.foodResource / 100;
  input[idx++] = tile.waterResource / 100;
  input[idx++] = (tile.temperature + 50) / 110;
  input[idx++] = tile.hazard;

  let avgFood = 0, avgHazard = 0, bestDir = 0, bestFood = -1;
  const dirs = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  let count = 0;
  for (let d = 0; d < dirs.length; d++) {
    const nx = agent.x + dirs[d][0];
    const ny = agent.y + dirs[d][1];
    if (world.isValid(nx, ny)) {
      const t = world.tileAt(nx, ny);
      avgFood += t.foodResource;
      avgHazard += t.hazard;
      if (t.foodResource > bestFood) {
        bestFood = t.foodResource;
        bestDir = d;
      }
      count++;
    }
  }
  input[idx++] = count > 0 ? avgFood / count / 100 : 0;
  input[idx++] = count > 0 ? avgHazard / count : 0;
  input[idx++] = bestDir / 8;

  const sorted = nearbyAgents
    .filter(a => a.id !== agent.id && a.alive)
    .map(a => ({
      a,
      dist: Math.abs(a.x - agent.x) + Math.abs(a.y - agent.y),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  for (let i = 0; i < 3; i++) {
    if (i < sorted.length) {
      const other = sorted[i].a;
      const pr = Math.max(1, agent.genome.traits.perceptionRadius);
      input[idx++] = (other.x - agent.x) / pr;
      input[idx++] = (other.y - agent.y) / pr;
      input[idx++] = other.species === agent.species ? 1 : -1;
      input[idx++] = (other.energy - agent.energy) / 100;
    } else {
      input[idx++] = 0;
      input[idx++] = 0;
      input[idx++] = 0;
      input[idx++] = 0;
    }
  }

  let foodDx = 0, foodDy = 0, dangerDx = 0, dangerDy = 0;
  let foodCount = 0, dangerCount = 0;
  for (const mem of agent.memory) {
    if (mem.type === 'food') {
      foodDx += mem.x - agent.x;
      foodDy += mem.y - agent.y;
      foodCount++;
    } else if (mem.type === 'danger') {
      dangerDx += mem.x - agent.x;
      dangerDy += mem.y - agent.y;
      dangerCount++;
    }
  }
  const pr = Math.max(1, agent.genome.traits.perceptionRadius);
  input[idx++] = foodCount > 0 ? foodDx / foodCount / pr : 0;
  input[idx++] = foodCount > 0 ? foodDy / foodCount / pr : 0;
  input[idx++] = dangerCount > 0 ? dangerDx / dangerCount / pr : 0;
  input[idx++] = dangerCount > 0 ? dangerDy / dangerCount / pr : 0;

  return input;
}

export function decideAction(agent: Agent, world: World, nearbyAgents: Agent[]): AgentAction {
  const input = buildInputVector(agent, world, nearbyAgents);
  const brain = new NeuralNet(BRAIN_CONFIG, agent.genome.brainWeights);
  const output = brain.forward(input);

  let r = Math.random();
  for (let i = 0; i < ACTION_COUNT; i++) {
    r -= output[i];
    if (r <= 0) return i as AgentAction;
  }
  return AgentAction.Stay;
}

export function executeAction(
  agent: Agent, action: AgentAction, world: World,
  agentGrid: Map<string, Agent[]>
): void {
  agent.lastAction = action;
  const traits = agent.genome.traits;

  switch (action) {
    case AgentAction.MoveNorth:
    case AgentAction.MoveSouth:
    case AgentAction.MoveEast:
    case AgentAction.MoveWest: {
      const dx = action === AgentAction.MoveEast ? 1 : action === AgentAction.MoveWest ? -1 : 0;
      const dy = action === AgentAction.MoveSouth ? 1 : action === AgentAction.MoveNorth ? -1 : 0;
      const nx = agent.x + dx;
      const ny = agent.y + dy;

      if (world.isPassable(nx, ny)) {
        const tile = world.tileAt(nx, ny);
        const moveCost = TERRAIN_MOVEMENT_COST[tile.terrain] * traits.size / traits.speed;
        if (agent.energy >= moveCost) {
          removeFromGrid(agentGrid, agent);
          agent.x = nx;
          agent.y = ny;
          addToGrid(agentGrid, agent);
          agent.energy -= moveCost;

          agent.psychology.curiosity = Math.max(0, agent.psychology.curiosity - 0.01);
        }
      }
      break;
    }

    case AgentAction.Eat: {
      const tile = world.tileAt(agent.x, agent.y);
      const eatAmount = Math.min(tile.foodResource, 10 * traits.foodEfficiency);
      if (eatAmount > 0) {
        tile.foodResource -= eatAmount;
        agent.energy = Math.min(100, agent.energy + eatAmount * traits.foodEfficiency);
        agent.psychology.hunger = Math.max(0, agent.psychology.hunger - 0.2);
        agent.foodEaten++;

        addMemory(agent, 'food', agent.x, agent.y, eatAmount / 10);
      }
      break;
    }

    case AgentAction.Reproduce: {
      const energyThreshold = traits.reproductionThreshold * 100;
      if (agent.energy >= energyThreshold) {
        const key = `${agent.x},${agent.y}`;
        const here = agentGrid.get(key) || [];
        const mate = here.find(a =>
          a.id !== agent.id &&
          a.alive &&
          a.species === agent.species &&
          a.energy >= a.genome.traits.reproductionThreshold * 50
        );

        const spawnPos = findEmptyAdjacent(agent.x, agent.y, world);
        if (spawnPos) {
          const childGenome = mate
            ? crossoverAndMutate(agent.genome, mate.genome, agent.genome.traits.mutationRate, world.rng)
            : mutateGenome(agent.genome, agent.genome.traits.mutationRate, world.rng);

          const child = createAgent(
            spawnPos.x, spawnPos.y, agent.species, childGenome,
            0, agent.generation + 1, agent.id
          );
          child.energy = 30;

          agent.energy -= 30;
          agent.offspring++;
          if (mate) {
            mate.energy -= 15;
            mate.offspring++;
          }

          (agent as any)._pendingChild = child;
        }
      }
      break;
    }

    case AgentAction.Attack: {
      const key = `${agent.x},${agent.y}`;
      const here = agentGrid.get(key) || [];
      const target = here.find(a => a.id !== agent.id && a.alive);
      if (target) {
        const damage = 10 * traits.size * (0.5 + traits.aggressionBias);
        target.health -= damage;
        target.psychology.fear = Math.min(1, target.psychology.fear + 0.3);
        agent.energy -= 3;
        agent.psychology.aggression = Math.min(1, agent.psychology.aggression + 0.05);

        addMemory(target, 'danger', agent.x, agent.y, damage / 20);

        if (target.health <= 0) {
          target.alive = false;
          agent.kills++;
          agent.energy = Math.min(100, agent.energy + target.energy * 0.3);
          addMemory(agent, 'food', target.x, target.y, 0.5);
        }
      }
      break;
    }

    case AgentAction.Rest: {
      agent.energy = Math.min(100, agent.energy + 2);
      agent.health = Math.min(agent.maxHealth, agent.health + 1);
      agent.psychology.fatigue = Math.max(0, agent.psychology.fatigue - 0.1);
      break;
    }

    case AgentAction.Stay:
    default:
      break;
  }
}

export function updateAgentLifecycle(agent: Agent): void {
  agent.age++;
  const traits = agent.genome.traits;

  const baseDrain = 0.3 * traits.metabolism * (0.5 + traits.size * 0.5);
  agent.energy -= baseDrain;

  agent.psychology.hunger = Math.min(1, agent.psychology.hunger + 0.005);
  agent.psychology.fatigue = Math.min(1, agent.psychology.fatigue + 0.003);
  agent.psychology.fear = Math.max(0, agent.psychology.fear - 0.01);
  agent.psychology.aggression *= 0.995;
  agent.psychology.curiosity = Math.min(1, agent.psychology.curiosity + 0.002);

  if (agent.age > agent.maxAge * 0.8) {
    const ageFactor = (agent.age - agent.maxAge * 0.8) / (agent.maxAge * 0.2);
    agent.health -= ageFactor * 0.5;
  }

  if (agent.energy <= 0) {
    agent.health -= 5;
    agent.energy = 0;
  }

  if (agent.health <= 0 || agent.age >= agent.maxAge) {
    agent.alive = false;
  }

  if (agent.memory.length > 20) {
    agent.memory = agent.memory.slice(-20);
  }
}

export function applyTemperatureStress(agent: Agent, tile: { temperature: number }): void {
  const tolerance = agent.genome.traits.heatTolerance;
  const preferred = 15 + tolerance * 20; // preferred temperature
  const diff = Math.abs(tile.temperature - preferred);
  if (diff > 15) {
    const stress = (diff - 15) / 30;
    agent.health -= stress * 0.5;
    agent.energy -= stress * 0.3;
  }
}

function mutateGenome(genome: Genome, mutationRate: number, rng: SeededRandom): Genome {
  const brain = new NeuralNet(BRAIN_CONFIG, genome.brainWeights);
  const mutatedBrain = brain.mutate(mutationRate, 0.3, () => rng.next());
  const mutatedTraits = mutateTraits(genome.traits, mutationRate, rng);

  return {
    brainWeights: mutatedBrain.weights,
    traits: mutatedTraits,
  };
}

function crossoverAndMutate(g1: Genome, g2: Genome, mutationRate: number, rng: SeededRandom): Genome {
  const parent1Brain = new NeuralNet(BRAIN_CONFIG, g1.brainWeights);
  const parent2Brain = new NeuralNet(BRAIN_CONFIG, g2.brainWeights);
  const childBrain = NeuralNet.crossover(parent1Brain, parent2Brain, () => rng.next());
  const mutatedBrain = childBrain.mutate(mutationRate, 0.2, () => rng.next());

  const childTraits: Traits = {} as Traits;
  for (const key of Object.keys(g1.traits) as (keyof Traits)[]) {
    childTraits[key] = rng.next() < 0.5 ? g1.traits[key] : g2.traits[key];
  }
  const mutatedTraits = mutateTraits(childTraits, mutationRate, rng);

  return {
    brainWeights: mutatedBrain.weights,
    traits: mutatedTraits,
  };
}

function addMemory(agent: Agent, type: MemoryEntry['type'], x: number, y: number, intensity: number): void {
  agent.memory.push({ tick: 0, type, x, y, intensity });
}

function findEmptyAdjacent(x: number, y: number, world: World): { x: number; y: number } | null {
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (world.isPassable(nx, ny)) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

export function addToGrid(grid: Map<string, Agent[]>, agent: Agent): void {
  const key = `${agent.x},${agent.y}`;
  const list = grid.get(key);
  if (list) {
    list.push(agent);
  } else {
    grid.set(key, [agent]);
  }
}

export function removeFromGrid(grid: Map<string, Agent[]>, agent: Agent): void {
  const key = `${agent.x},${agent.y}`;
  const list = grid.get(key);
  if (list) {
    const idx = list.indexOf(agent);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length === 0) grid.delete(key);
  }
}

export function rebuildGrid(agents: Agent[]): Map<string, Agent[]> {
  const grid = new Map<string, Agent[]>();
  for (const agent of agents) {
    if (agent.alive) addToGrid(grid, agent);
  }
  return grid;
}
