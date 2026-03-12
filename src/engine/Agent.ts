import {
  Agent, AgentAction, ACTION_COUNT, Genome, Traits, Psychology,
  MemoryEntry, NeuralNetConfig, SpeciesInfo, SeededRandom, Terrain,
  TERRAIN_MOVEMENT_COST
} from './types';
import { NeuralNet } from './NeuralNet';
import { World } from './World';
import { SpatialGrid } from './SpatialGrid';

const INPUT_SIZE = 52;
const HIDDEN_SIZES = [28, 14];
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

// Pre-allocated direction arrays — hoisted to avoid per-call allocation
const DIRS_8: readonly (readonly [number, number])[] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const DIRS_4: readonly (readonly [number, number])[] = [[-1,0],[1,0],[0,-1],[0,1]];
const SEEK_DIRS: readonly (readonly [number, number, AgentAction])[] = [
  [0, -1, AgentAction.MoveNorth], [0, 1, AgentAction.MoveSouth],
  [1, 0, AgentAction.MoveEast], [-1, 0, AgentAction.MoveWest],
];
const EMPTY_ADJ_DIRS: readonly (readonly [number, number])[] = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[-1,-1],[1,1],[-1,1]];

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
    nocturnal: rng.nextFloat(0, 0.5),
    camouflage: rng.nextFloat(0, 0.4),
    packHunting: rng.nextFloat(0, 0.5),
    toolUse: rng.nextFloat(0, 0.3),
    singing: rng.nextFloat(0, 0.4),
    burrowing: rng.nextFloat(0, 0.3),
    venom: rng.nextFloat(0, 0.3),
    regeneration: rng.nextFloat(0, 0.3),
    flight: rng.nextFloat(0, 0.2),
    aquatic: rng.nextFloat(0, 0.3),
    migrationDrive: rng.nextFloat(0, 0.4),
    longevity: rng.nextFloat(0.7, 1.3),
    immuneStrength: rng.nextFloat(0.2, 0.8),
    learningRate: rng.nextFloat(0.1, 0.6),
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
    nocturnal: mutate(traits.nocturnal, 0, 1),
    camouflage: mutate(traits.camouflage, 0, 1),
    packHunting: mutate(traits.packHunting, 0, 1),
    toolUse: mutate(traits.toolUse, 0, 1),
    singing: mutate(traits.singing, 0, 1),
    burrowing: mutate(traits.burrowing, 0, 1),
    venom: mutate(traits.venom, 0, 1),
    regeneration: mutate(traits.regeneration, 0, 1),
    flight: mutate(traits.flight, 0, 1),
    aquatic: mutate(traits.aquatic, 0, 1),
    migrationDrive: mutate(traits.migrationDrive, 0, 1),
    longevity: mutate(traits.longevity, 0.3, 3.0),
    immuneStrength: mutate(traits.immuneStrength, 0, 1),
    learningRate: mutate(traits.learningRate, 0, 1),
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
    maxAge: Math.floor((200 + genome.traits.size * 100 + (1 / genome.traits.metabolism) * 50) * genome.traits.longevity),
    generation,
    species,
    genome,
    psychology: {
      fear: 0.1,
      aggression: genome.traits.aggressionBias * 0.5,
      curiosity: 0.5,
      socialBonding: genome.traits.socialBias * 0.5,
      hunger: 0.3,
      thirst: 0.2,
      fatigue: 0,
      loneliness: 0.3,
      satisfaction: 0.5,
    },
    memory: [],
    alive: true,
    lastAction: AgentAction.Stay,
    kills: 0,
    offspring: 0,
    foodEaten: 0,
    tickBorn: tick,
    parentId,
    gestationCooldown: 0,
    morale: 0.5,
    alliances: [],
    shelterX: -1,
    shelterY: -1,
    venomStack: 0,
    isBurrowed: false,
    migrationTarget: null,
    communicationCooldown: 0,
    totalDistanceTraveled: 0,
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

const _inputBuffer = new Float32Array(INPUT_SIZE);

export function buildInputVector(agent: Agent, world: World, nearbyAgents: Agent[]): Float32Array {
  const input = _inputBuffer;
  input.fill(0);
  let idx = 0;

  input[idx++] = agent.energy / 100;
  input[idx++] = agent.health / agent.maxHealth;
  input[idx++] = agent.age / agent.maxAge;
  input[idx++] = agent.psychology.hunger;
  input[idx++] = agent.psychology.thirst;
  input[idx++] = agent.psychology.fatigue;
  input[idx++] = agent.psychology.fear;
  input[idx++] = agent.psychology.aggression;
  input[idx++] = agent.psychology.curiosity;
  input[idx++] = agent.psychology.socialBonding;
  input[idx++] = agent.psychology.loneliness;
  input[idx++] = agent.psychology.satisfaction;
  input[idx++] = agent.morale;

  const tile = world.tileAt(agent.x, agent.y);
  for (let t = 0; t < 7; t++) {
    input[idx++] = tile.terrain === t ? 1 : 0;
  }
  input[idx++] = tile.foodResource / 100;
  input[idx++] = tile.waterResource / 100;
  input[idx++] = (tile.temperature + 50) / 110;
  input[idx++] = tile.hazard;

  let avgFood = 0, avgHazard = 0, bestDir = 0, bestFood = -1;
  let count = 0;
  for (let d = 0; d < DIRS_8.length; d++) {
    const nx = agent.x + DIRS_8[d][0];
    const ny = agent.y + DIRS_8[d][1];
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

  const pr = Math.max(1, agent.genome.traits.perceptionRadius);
  let c0: Agent | null = null, d0 = Infinity;
  let c1: Agent | null = null, d1 = Infinity;
  let c2: Agent | null = null, d2 = Infinity;
  for (let ni = 0; ni < nearbyAgents.length; ni++) {
    const na = nearbyAgents[ni];
    if (na.id === agent.id || !na.alive) continue;
    const d = Math.abs(na.x - agent.x) + Math.abs(na.y - agent.y);
    if (d < d0) { c2 = c1; d2 = d1; c1 = c0; d1 = d0; c0 = na; d0 = d; }
    else if (d < d1) { c2 = c1; d2 = d1; c1 = na; d1 = d; }
    else if (d < d2) { c2 = na; d2 = d; }
  }
  if (c0) { input[idx++] = (c0.x - agent.x) / pr; input[idx++] = (c0.y - agent.y) / pr; input[idx++] = c0.species === agent.species ? 1 : -1; input[idx++] = (c0.energy - agent.energy) / 100; } else { idx += 4; }
  if (c1) { input[idx++] = (c1.x - agent.x) / pr; input[idx++] = (c1.y - agent.y) / pr; input[idx++] = c1.species === agent.species ? 1 : -1; input[idx++] = (c1.energy - agent.energy) / 100; } else { idx += 4; }
  if (c2) { input[idx++] = (c2.x - agent.x) / pr; input[idx++] = (c2.y - agent.y) / pr; input[idx++] = c2.species === agent.species ? 1 : -1; input[idx++] = (c2.energy - agent.energy) / 100; } else { idx += 4; }

  let foodDx = 0, foodDy = 0, dangerDx = 0, dangerDy = 0;
  let foodCount = 0, dangerCount = 0;
  for (let mi = 0; mi < agent.memory.length; mi++) {
    const mem = agent.memory[mi];
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
  input[idx++] = foodCount > 0 ? foodDx / foodCount / pr : 0;
  input[idx++] = foodCount > 0 ? foodDy / foodCount / pr : 0;
  input[idx++] = dangerCount > 0 ? dangerDx / dangerCount / pr : 0;
  input[idx++] = dangerCount > 0 ? dangerDy / dangerCount / pr : 0;

  // New trait signals
  const t = agent.genome.traits;
  input[idx++] = t.nocturnal;
  input[idx++] = t.camouflage;
  input[idx++] = t.packHunting;
  input[idx++] = t.toolUse;
  input[idx++] = t.venom;
  input[idx++] = t.regeneration;
  input[idx++] = t.flight;
  input[idx++] = t.aquatic;
  input[idx++] = t.migrationDrive;
  input[idx++] = t.immuneStrength;
  input[idx++] = agent.alliances.length / 5;
  input[idx++] = agent.isBurrowed ? 1 : 0;

  return input;
}

const brainCache = new WeakMap<Float32Array, NeuralNet>();

function getCachedBrain(weights: Float32Array): NeuralNet {
  let brain = brainCache.get(weights);
  if (!brain) {
    brain = new NeuralNet(BRAIN_CONFIG, weights);
    brainCache.set(weights, brain);
  }
  return brain;
}

export function decideAction(agent: Agent, world: World, nearbyAgents: Agent[]): AgentAction {
  const traits = agent.genome.traits;
  const psy = agent.psychology;
  const isPredator = traits.aggressionBias > 0.6;
  const tile = world.tileAt(agent.x, agent.y);

  // ── SURVIVAL PRIORITY 1: Flee if about to die ──
  if (agent.health < 20 && psy.fear > 0.5) {
    // Burrowing creatures can hide instead of fleeing
    if (traits.burrowing > 0.5 && !agent.isBurrowed) {
      agent.isBurrowed = true;
      return AgentAction.Rest;
    }
    return AgentAction.Flee;
  }

  // Emerge from burrow when safe
  if (agent.isBurrowed && psy.fear < 0.3) {
    agent.isBurrowed = false;
  }

  // ── SURVIVAL PRIORITY 2: Critical thirst ──
  if (psy.thirst > 0.75) {
    if (tile.waterResource > 8) return AgentAction.Drink;
    // Move toward water
    return seekTerrain(agent, world, true);
  }

  // ── SURVIVAL PRIORITY 3: Critical hunger ──
  if (psy.hunger > 0.75 || agent.energy < 25) {
    // Predators hunt for food
    if (isPredator) {
      const prey = findNearestPrey(agent, nearbyAgents);
      if (prey) {
        const d = Math.abs(prey.x - agent.x) + Math.abs(prey.y - agent.y);
        if (d <= 1) return AgentAction.Attack;
        return chaseTarget(agent, prey);
      }
    }
    // Herbivores eat from tile
    if (tile.foodResource > 5) return AgentAction.Eat;
    // Move toward food
    return seekTerrain(agent, world, false);
  }

  // ── PRIORITY 4: Predator hunting (not starving but wants to hunt) ──
  if (isPredator && agent.energy < 75) {
    const prey = findNearestPrey(agent, nearbyAgents);
    if (prey) {
      const d = Math.abs(prey.x - agent.x) + Math.abs(prey.y - agent.y);
      if (d <= 1) return AgentAction.Attack;
      return chaseTarget(agent, prey);
    }
  }

  // ── PRIORITY 5: Territory defense ──
  if (traits.aggressionBias > 0.4) {
    for (let i = 0; i < nearbyAgents.length; i++) {
      const other = nearbyAgents[i];
      if (other.species !== agent.species && other.alive) {
        const d = Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y);
        if (d <= 1) {
          const tIdx = agent.y * world.width + agent.x;
          const isMyTerritory = world.territoryOwner[tIdx] === agent.species;
          const aggrChance = isMyTerritory
            ? traits.aggressionBias * 0.7
            : traits.aggressionBias * 0.3;
          // Deterministic pseudo-random based on agent state
          const hash = ((agent.id * 2654435761 + agent.age * 340573321) >>> 0) / 0xffffffff;
          if (hash < aggrChance) return AgentAction.Attack;
        }
      }
    }
  }

  // ── PRIORITY 6: Thirst (moderate) ──
  if (psy.thirst > 0.45 && tile.waterResource > 8) return AgentAction.Drink;

  // ── PRIORITY 7: Hunger (moderate) ──
  if (psy.hunger > 0.45 && tile.foodResource > 5) return AgentAction.Eat;

  // ── PRIORITY 8: Rest when exhausted ──
  if (psy.fatigue > 0.7 || agent.health < agent.maxHealth * 0.4) return AgentAction.Rest;

  // ── PRIORITY 9: Reproduce if well-fed and healthy ──
  const reproThreshold = Math.min(90, isPredator
    ? traits.reproductionThreshold * 60
    : traits.reproductionThreshold * 100);
  if (agent.energy >= reproThreshold && agent.health > agent.maxHealth * 0.5 && psy.hunger < 0.4 && psy.thirst < 0.4) {
    // Check local carrying capacity: don't breed if area is overcrowded
    let localPop = 0;
    for (let i = 0; i < nearbyAgents.length; i++) {
      if (nearbyAgents[i].species === agent.species) localPop++;
    }
    const localFood = tile.foodResource + tile.waterResource;
    if (localPop < 8 && localFood > 20) {
      return AgentAction.Reproduce;
    }
  }

  // ── PRIORITY 10: Communicate (social species, lonely) ──
  if (traits.socialBias > 0.5 && psy.loneliness > 0.5 && agent.communicationCooldown <= 0) {
    let hasSameSpecies = false;
    for (let i = 0; i < nearbyAgents.length; i++) {
      if (nearbyAgents[i].species === agent.species) { hasSameSpecies = true; break; }
    }
    if (hasSameSpecies) return AgentAction.Communicate;
  }

  // ── PRIORITY 11: Migration (seasonal movers) ──
  if (traits.migrationDrive > 0.5 && (agent.migrationTarget || psy.curiosity > 0.6)) {
    return AgentAction.Migrate;
  }

  // ── PRIORITY 12: Forage (tool users with moderate hunger) ──
  if (traits.toolUse > 0.3 && psy.hunger > 0.3 && tile.foodResource > 3) {
    return AgentAction.Forage;
  }

  // ── PRIORITY 13: Build shelter (tool users with no home) ──
  if (traits.toolUse > 0.4 && agent.shelterX < 0 && agent.energy > 50
      && tile.terrain >= Terrain.Sand && tile.terrain <= Terrain.Forest) {
    return AgentAction.Build;
  }

  // ── PRIORITY 14: Pack hunting ──
  if (traits.packHunting > 0.4 && isPredator) {
    let allyCount = 0;
    for (let i = 0; i < nearbyAgents.length; i++) {
      if (nearbyAgents[i].species === agent.species) allyCount++;
    }
    if (allyCount >= 2) {
      const prey = findNearestPrey(agent, nearbyAgents);
      if (prey) {
        const d = Math.abs(prey.x - agent.x) + Math.abs(prey.y - agent.y);
        if (d <= 1) return AgentAction.Attack;
        return chaseTarget(agent, prey);
      }
    }
  }

  // ── FALLBACK: Neural net decides (exploration, social behavior, curiosity) ──
  const input = buildInputVector(agent, world, nearbyAgents);
  const brain = getCachedBrain(agent.genome.brainWeights);
  const output = brain.forward(input);

  // Deterministic selection using agent state as pseudo-random
  let r = ((agent.id * 374761393 + agent.age * 668265263) >>> 0) / 0xffffffff;
  for (let i = 0; i < ACTION_COUNT; i++) {
    r -= output[i];
    if (r <= 0) return i as AgentAction;
  }
  return AgentAction.Stay;
}

function findNearestPrey(agent: Agent, nearby: Agent[]): Agent | null {
  let closest: Agent | null = null;
  let closestDist = Infinity;
  for (let i = 0; i < nearby.length; i++) {
    const o = nearby[i];
    if (o.species !== agent.species && o.alive) {
      const d = Math.abs(o.x - agent.x) + Math.abs(o.y - agent.y);
      if (d < closestDist) { closestDist = d; closest = o; }
    }
  }
  return closest;
}

function chaseTarget(agent: Agent, target: Agent): AgentAction {
  const dx = target.x - agent.x;
  const dy = target.y - agent.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? AgentAction.MoveEast : AgentAction.MoveWest;
  }
  return dy > 0 ? AgentAction.MoveSouth : AgentAction.MoveNorth;
}

/** Move toward water (seekWater=true) or food (seekWater=false) */
function seekTerrain(agent: Agent, world: World, seekWater: boolean): AgentAction {
  let bestVal = -1, bestAct: AgentAction = AgentAction.Stay;
  for (const [dx, dy, act] of SEEK_DIRS) {
    const nx = agent.x + dx, ny = agent.y + dy;
    if (!world.isValid(nx, ny)) continue;
    const t = world.tileAt(nx, ny);
    const v = seekWater ? t.waterResource : t.foodResource;
    if (v > bestVal) { bestVal = v; bestAct = act; }
  }
  // If nothing nearby, use memory
  if (bestVal <= 0) {
    const memType = seekWater ? 'water' : 'food';
    for (const mem of agent.memory) {
      if (mem.type === memType) {
        const dx = mem.x - agent.x, dy = mem.y - agent.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          return dx > 0 ? AgentAction.MoveEast : AgentAction.MoveWest;
        }
        return dy > 0 ? AgentAction.MoveSouth : AgentAction.MoveNorth;
      }
    }
    // Deterministic wander based on agent state
    return SEEK_DIRS[(agent.age + agent.id) & 3][2];
  }
  return bestAct;
}

export function executeAction(
  agent: Agent, action: AgentAction, world: World,
  agents: Agent[], grid: SpatialGrid
): void {
  agent.lastAction = action;
  const traits = agent.genome.traits;
  const isPredator = traits.aggressionBias > 0.6;

  switch (action) {
    case AgentAction.MoveNorth:
    case AgentAction.MoveSouth:
    case AgentAction.MoveEast:
    case AgentAction.MoveWest: {
      const dx = action === AgentAction.MoveEast ? 1 : action === AgentAction.MoveWest ? -1 : 0;
      const dy = action === AgentAction.MoveSouth ? 1 : action === AgentAction.MoveNorth ? -1 : 0;
      const nx = agent.x + dx;
      const ny = agent.y + dy;

      if (world.isPassable(nx, ny) || (traits.aquatic > 0.5 && world.isValid(nx, ny) && world.tileAt(nx, ny).terrain <= Terrain.ShallowWater) || (traits.flight > 0.5 && world.isValid(nx, ny) && world.tileAt(nx, ny).terrain !== Terrain.DeepWater)) {
        const tile = world.tileAt(nx, ny);
        const tileIdx = world.tileIndex(agent.x, agent.y);
        const windFactor = 1 - (world.windX[tileIdx] * dx + world.windY[tileIdx] * dy) * 0.5;
        const predatorBonus = isPredator ? 0.55 : 1.0;
        const flightDiscount = traits.flight > 0.3 ? (1 - traits.flight * 0.4) : 1.0;
        const moveCost = TERRAIN_MOVEMENT_COST[tile.terrain] * traits.size / traits.speed * Math.max(0.5, windFactor) * predatorBonus * flightDiscount;
        if (agent.energy >= moveCost) {
          agent.x = nx;
          agent.y = ny;
          agent.energy -= moveCost;
          agent.psychology.curiosity = Math.max(0, agent.psychology.curiosity - 0.01);
          // Observe environment while moving — remember resource-rich areas
          if (tile.foodResource > 30) addMemory(agent, 'food', nx, ny, tile.foodResource / 100);
          if (tile.waterResource > 30) addMemory(agent, 'water', nx, ny, tile.waterResource / 100);
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
      // Maturity check: must be at least 15% of max age
      if (agent.age < agent.maxAge * 0.15) break;
      // Gestation cooldown
      if (agent.gestationCooldown > 0) break;
      // Threshold capped at 95 so it's always reachable with energy cap of 100
      const threshold = Math.min(95, isPredator
        ? traits.reproductionThreshold * 80
        : traits.reproductionThreshold * 120);
      if (agent.energy >= threshold) {
        let mate: Agent | undefined;
        let gIdx = grid.firstAt(agent.x, agent.y);
        while (gIdx >= 0) {
          const a = agents[gIdx];
          if (a.id !== agent.id && a.alive && a.species === agent.species &&
              a.energy >= a.genome.traits.reproductionThreshold * 60 &&
              a.gestationCooldown <= 0) {
            mate = a; break;
          }
          gIdx = grid.next(gIdx);
        }

        const spawnPos = findEmptyAdjacent(agent.x, agent.y, world);
        if (spawnPos) {
          const childGenome = mate
            ? crossoverAndMutate(agent.genome, mate.genome, traits.mutationRate, world.rng)
            : mutateGenome(agent.genome, traits.mutationRate, world.rng);

          const birthCost = isPredator ? 35 : 50;
          const child = createAgent(
            spawnPos.x, spawnPos.y, agent.species, childGenome,
            0, agent.generation + 1, agent.id
          );
          child.energy = birthCost * 0.6;

          agent.energy -= birthCost;
          agent.offspring++;
          agent.gestationCooldown = 30 + Math.floor(traits.size * 25);
          if (mate) {
            mate.energy -= Math.floor(birthCost * 0.4);
            mate.offspring++;
            mate.gestationCooldown = 20 + Math.floor(mate.genome.traits.size * 15);
          }

          (agent as any)._pendingChild = child;
        }
      }
      break;
    }

    case AgentAction.Attack: {
      let target: Agent | undefined;
      let gIdx = grid.firstAt(agent.x, agent.y);
      while (gIdx >= 0) {
        const a = agents[gIdx];
        if (a.id !== agent.id && a.alive) {
          if (a.species !== agent.species || traits.aggressionBias > 0.8) {
            target = a; break;
          }
        }
        gIdx = grid.next(gIdx);
      }
      if (!target) {
        for (const [adx, ady] of DIRS_4) {
          let gIdx2 = grid.firstAt(agent.x + adx, agent.y + ady);
          while (gIdx2 >= 0) {
            const a = agents[gIdx2];
            if (a.alive && a.species !== agent.species) { target = a; break; }
            gIdx2 = grid.next(gIdx2);
          }
          if (target) break;
        }
      }
      if (target) {
        // Pack hunting bonus: count allies within perception range
        let packBonus = 1.0;
        if (traits.packHunting > 0.3) {
          let allyCount = 0;
          let gIdxPack = grid.firstAt(agent.x, agent.y);
          while (gIdxPack >= 0) {
            const a = agents[gIdxPack];
            if (a.id !== agent.id && a.alive && a.species === agent.species) allyCount++;
            gIdxPack = grid.next(gIdxPack);
          }
          packBonus = 1 + allyCount * traits.packHunting * 0.3;
        }
        // Camouflage evasion: target with high camouflage may dodge
        const evadeChance = target.genome.traits.camouflage * 0.4;
        const hitHash = ((agent.id * 2654435761 + agent.age * 340573321) >>> 0) / 0xffffffff;
        if (hitHash < evadeChance) {
          // Attack missed — target evaded
          agent.energy -= 1.5;
          break;
        }
        const damage = 20 * traits.size * (0.5 + traits.aggressionBias * 0.8) * packBonus;
        target.health -= damage;
        // Apply venom damage-over-time
        if (traits.venom > 0.2) {
          target.venomStack = Math.min(3, target.venomStack + traits.venom);
        }
        target.psychology.fear = Math.min(1, target.psychology.fear + 0.3);
        agent.energy -= 1.5;
        agent.psychology.aggression = Math.min(1, agent.psychology.aggression + 0.05);

        addMemory(target, 'danger', agent.x, agent.y, damage / 20);

        if (target.health <= 0) {
          target.alive = false;
          agent.kills++;
          agent.energy = Math.min(100, agent.energy + target.energy * 0.7 + 20);
          agent.health = Math.min(agent.maxHealth, agent.health + 8);
          addMemory(agent, 'food', target.x, target.y, 0.9);
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

    case AgentAction.Drink: {
      const tile = world.tileAt(agent.x, agent.y);
      const drinkAmount = Math.min(tile.waterResource, 12);
      if (drinkAmount > 2) {
        tile.waterResource -= drinkAmount;
        agent.psychology.thirst = Math.max(0, agent.psychology.thirst - 0.35);
        agent.energy = Math.min(100, agent.energy + drinkAmount * 0.15);
        agent.health = Math.min(agent.maxHealth, agent.health + 0.5);
        addMemory(agent, 'water', agent.x, agent.y, drinkAmount / 12);
      }
      break;
    }

    case AgentAction.Stay:
    default:
      // Passive regeneration for agents with regen trait
      if (traits.regeneration > 0.2) {
        agent.health = Math.min(agent.maxHealth, agent.health + traits.regeneration * 0.5);
      }
      break;

    case AgentAction.Flee: {
      // Flee: move away from nearest threat, faster than normal move
      let threatDx = 0, threatDy = 0;
      let gIdxFlee = grid.firstAt(agent.x, agent.y);
      while (gIdxFlee >= 0) {
        const a = agents[gIdxFlee];
        if (a.id !== agent.id && a.alive && a.species !== agent.species) {
          threatDx += agent.x - a.x;
          threatDy += agent.y - a.y;
        }
        gIdxFlee = grid.next(gIdxFlee);
      }
      for (const [adx, ady] of DIRS_4) {
        let gIdx2 = grid.firstAt(agent.x + adx, agent.y + ady);
        while (gIdx2 >= 0) {
          const a = agents[gIdx2];
          if (a.alive && a.species !== agent.species) {
            threatDx += agent.x - a.x;
            threatDy += agent.y - a.y;
          }
          gIdx2 = grid.next(gIdx2);
        }
      }
      // Move 1-2 tiles in flee direction (flight trait boosts flee distance)
      const fleeSteps = traits.flight > 0.5 ? 2 : 1;
      for (let s = 0; s < fleeSteps; s++) {
        let nx: number, ny: number;
        if (Math.abs(threatDx) >= Math.abs(threatDy)) {
          nx = agent.x + (threatDx > 0 ? 1 : -1);
          ny = agent.y;
        } else {
          nx = agent.x;
          ny = agent.y + (threatDy > 0 ? 1 : -1);
        }
        if (world.isPassable(nx, ny)) {
          agent.x = nx;
          agent.y = ny;
          agent.totalDistanceTraveled++;
        }
      }
      agent.energy -= 1.5;
      agent.psychology.fear = Math.min(1, agent.psychology.fear + 0.1);
      break;
    }

    case AgentAction.Build: {
      // Build: create or reinforce a shelter at current position
      if (traits.toolUse > 0.2) {
        const tile = world.tileAt(agent.x, agent.y);
        if (tile.terrain >= Terrain.Sand && tile.terrain <= Terrain.Forest) {
          agent.shelterX = agent.x;
          agent.shelterY = agent.y;
          agent.energy -= 3;
          agent.psychology.satisfaction = Math.min(1, agent.psychology.satisfaction + 0.15);
          // Building strengthens territory
          world.claimTerritory(agent.x, agent.y, agent.species);
          world.claimTerritory(agent.x, agent.y, agent.species);
        }
      }
      break;
    }

    case AgentAction.Communicate: {
      // Communicate: share info with nearby allies, form alliances
      if (agent.communicationCooldown > 0) break;
      const socialRadius = Math.ceil(traits.singing > 0.3 ? traits.perceptionRadius * 1.5 : traits.perceptionRadius);
      for (let i = 0; i < nearbyAgents.length; i++) {
        const other = nearbyAgents[i];
        if (other.species === agent.species && other.alive) {
          const d = Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y);
          if (d <= socialRadius) {
            // Form alliance
            if (agent.alliances.length < 5 && !agent.alliances.includes(other.id)) {
              agent.alliances.push(other.id);
            }
            if (other.alliances.length < 5 && !other.alliances.includes(agent.id)) {
              other.alliances.push(agent.id);
            }
            // Share food memories
            for (const mem of agent.memory) {
              if (mem.type === 'food' && other.memory.length < 30) {
                other.memory.push({ ...mem });
              }
            }
            other.psychology.socialBonding = Math.min(1, other.psychology.socialBonding + 0.1);
            other.psychology.loneliness = Math.max(0, other.psychology.loneliness - 0.15);
          }
        }
      }
      agent.psychology.loneliness = Math.max(0, agent.psychology.loneliness - 0.2);
      agent.psychology.socialBonding = Math.min(1, agent.psychology.socialBonding + 0.1);
      agent.communicationCooldown = 5;
      agent.energy -= 0.5;
      break;
    }

    case AgentAction.Forage: {
      // Forage: enhanced gathering using tool use trait
      const tile = world.tileAt(agent.x, agent.y);
      const bonus = 1 + traits.toolUse * 1.5;
      const eatAmt = Math.min(tile.foodResource, 8 * traits.foodEfficiency * bonus);
      if (eatAmt > 0) {
        tile.foodResource -= eatAmt;
        agent.energy = Math.min(100, agent.energy + eatAmt * traits.foodEfficiency * bonus);
        agent.psychology.hunger = Math.max(0, agent.psychology.hunger - 0.25);
        agent.foodEaten++;
        addMemory(agent, 'food', agent.x, agent.y, eatAmt / 10);
        agent.psychology.satisfaction = Math.min(1, agent.psychology.satisfaction + 0.05);
      }
      // Also check adjacent tiles
      for (const [dx, dy] of DIRS_4) {
        const nx = agent.x + dx, ny = agent.y + dy;
        if (!world.isValid(nx, ny)) continue;
        const adjTile = world.tileAt(nx, ny);
        if (adjTile.foodResource > 15 && traits.toolUse > 0.3) {
          const adjAmt = Math.min(adjTile.foodResource * 0.3, 5);
          adjTile.foodResource -= adjAmt;
          agent.energy = Math.min(100, agent.energy + adjAmt * traits.foodEfficiency);
        }
      }
      break;
    }

    case AgentAction.Migrate: {
      // Migrate: move toward a seasonal target location
      if (!agent.migrationTarget) {
        // Pick a migration target based on season and traits
        const worldW = world.width, worldH = world.height;
        const hash = ((agent.id * 2654435761 + agent.species * 340573321) >>> 0) / 0xffffffff;
        agent.migrationTarget = {
          x: Math.floor(hash * worldW),
          y: Math.floor(((hash * 1.618) % 1) * worldH),
        };
      }
      const mt = agent.migrationTarget;
      const mdx = mt.x - agent.x, mdy = mt.y - agent.y;
      const dist = Math.abs(mdx) + Math.abs(mdy);
      if (dist <= 3) {
        agent.migrationTarget = null; // arrived
        agent.psychology.satisfaction = Math.min(1, agent.psychology.satisfaction + 0.2);
      } else {
        // Move toward target (flight trait allows 2 steps)
        const steps = traits.flight > 0.5 ? 2 : 1;
        for (let s = 0; s < steps; s++) {
          let nx: number, ny: number;
          if (Math.abs(mdx) >= Math.abs(mdy)) {
            nx = agent.x + (mdx > 0 ? 1 : -1); ny = agent.y;
          } else {
            nx = agent.x; ny = agent.y + (mdy > 0 ? 1 : -1);
          }
          if (world.isPassable(nx, ny) || (traits.aquatic > 0.5 && world.isValid(nx, ny))) {
            agent.x = nx; agent.y = ny;
            agent.totalDistanceTraveled++;
          }
        }
        agent.energy -= 0.8;
      }
      break;
    }
  }

  // Venom DOT processing
  if (agent.venomStack > 0) {
    agent.health -= agent.venomStack * 0.5;
    agent.venomStack = Math.max(0, agent.venomStack - 0.2);
  }

  // Passive regeneration
  if (traits.regeneration > 0.2 && action !== AgentAction.Stay) {
    agent.health = Math.min(agent.maxHealth, agent.health + traits.regeneration * 0.3);
  }

  // Track distance
  if (action <= AgentAction.MoveWest) {
    agent.totalDistanceTraveled++;
  }

  // Communication cooldown decay
  if (agent.communicationCooldown > 0) agent.communicationCooldown--;

  // Morale calculation
  agent.morale = Math.max(0, Math.min(1,
    0.5
    + (1 - agent.psychology.hunger) * 0.15
    + (1 - agent.psychology.thirst) * 0.15
    + (1 - agent.psychology.fear) * 0.1
    + agent.psychology.satisfaction * 0.1
    - agent.psychology.loneliness * 0.1
    + (agent.health / agent.maxHealth) * 0.1
  ));
}

export function updateAgentLifecycle(agent: Agent): void {
  agent.age++;
  const traits = agent.genome.traits;

  const baseDrain = 0.15 * traits.metabolism * (0.5 + traits.size * 0.5);
  agent.energy -= baseDrain;

  agent.psychology.hunger = Math.min(1, agent.psychology.hunger + 0.005);
  agent.psychology.thirst = Math.min(1, agent.psychology.thirst + 0.007);
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

  // Dehydration damage
  if (agent.psychology.thirst > 0.9) {
    agent.health -= (agent.psychology.thirst - 0.9) * 8;
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
  for (const [dx, dy] of EMPTY_ADJ_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (world.isPassable(nx, ny)) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

export function gridKey(x: number, y: number, width: number): number {
  return y * width + x;
}

export function addToGrid(grid: Map<number, Agent[]>, agent: Agent, width: number = 0): void {
  const key = width > 0 ? gridKey(agent.x, agent.y, width) : agent.y * 16384 + agent.x;
  const list = grid.get(key);
  if (list) {
    list.push(agent);
  } else {
    grid.set(key, [agent]);
  }
}

export function removeFromGrid(grid: Map<number, Agent[]>, agent: Agent, width: number = 0): void {
  const key = width > 0 ? gridKey(agent.x, agent.y, width) : agent.y * 16384 + agent.x;
  const list = grid.get(key);
  if (list) {
    const idx = list.indexOf(agent);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length === 0) grid.delete(key);
  }
}

export function rebuildGrid(agents: Agent[], width: number = 0): Map<number, Agent[]> {
  const grid = new Map<number, Agent[]>();
  for (const agent of agents) {
    if (agent.alive) addToGrid(grid, agent, width);
  }
  return grid;
}
