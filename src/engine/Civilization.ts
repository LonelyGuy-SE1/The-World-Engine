import { SpeciesRegistry } from './Agent';
import { Agent } from './types';
import { EventLog, EventType } from './EventLog';

export interface Technology {
  id: string;
  name: string;
  description: string;
  prereqs: string[];
  effects: Partial<{
    foodEfficiency: number;
    speed: number;
    perceptionRadius: number;
    metabolism: number;
    heatTolerance: number;
    combatBonus: number;
  }>;
  minPopulation: number;
  minAge: number;
}

export const TECH_TREE: Technology[] = [
  { id: 'fire', name: 'Fire', description: 'Control of fire for warmth and cooking', prereqs: [], effects: { heatTolerance: 0.3, foodEfficiency: 0.2 }, minPopulation: 20, minAge: 50 },
  { id: 'tools', name: 'Stone Tools', description: 'Basic tools for hunting and gathering', prereqs: [], effects: { foodEfficiency: 0.3, combatBonus: 0.2 }, minPopulation: 15, minAge: 40 },
  { id: 'language', name: 'Language', description: 'Complex communication', prereqs: [], effects: { perceptionRadius: 1 }, minPopulation: 30, minAge: 60 },
  { id: 'cooking', name: 'Cooking', description: 'Prepared food is more nutritious', prereqs: ['fire'], effects: { foodEfficiency: 0.3, metabolism: -0.1 }, minPopulation: 25, minAge: 70 },
  { id: 'agriculture', name: 'Agriculture', description: 'Farming and food cultivation', prereqs: ['tools'], effects: { foodEfficiency: 0.5 }, minPopulation: 40, minAge: 100 },
  { id: 'social_org', name: 'Social Organization', description: 'Tribes and social hierarchy', prereqs: ['language'], effects: { combatBonus: 0.3 }, minPopulation: 50, minAge: 80 },
  { id: 'metalwork', name: 'Metalwork', description: 'Working with metals for tools and weapons', prereqs: ['fire', 'tools'], effects: { combatBonus: 0.4, foodEfficiency: 0.2 }, minPopulation: 60, minAge: 150 },
  { id: 'writing', name: 'Writing', description: 'Recording knowledge for future generations', prereqs: ['language', 'social_org'], effects: { perceptionRadius: 1 }, minPopulation: 80, minAge: 200 },
  { id: 'architecture', name: 'Architecture', description: 'Building permanent structures', prereqs: ['tools', 'social_org'], effects: { heatTolerance: 0.2, metabolism: -0.15 }, minPopulation: 70, minAge: 180 },
  { id: 'medicine', name: 'Medicine', description: 'Healing and disease prevention', prereqs: ['fire', 'agriculture'], effects: { metabolism: -0.1 }, minPopulation: 50, minAge: 200 },
  { id: 'laws', name: 'Laws & Governance', description: 'Codified rules for society', prereqs: ['writing', 'social_org'], effects: { combatBonus: 0.2 }, minPopulation: 100, minAge: 300 },
  { id: 'philosophy', name: 'Philosophy', description: 'Deep thought about existence', prereqs: ['writing'], effects: { perceptionRadius: 1 }, minPopulation: 60, minAge: 250 },
  { id: 'warfare', name: 'Organized Warfare', description: 'Military tactics and strategy', prereqs: ['metalwork', 'social_org'], effects: { combatBonus: 0.6, speed: 0.2 }, minPopulation: 80, minAge: 250 },
  { id: 'trade', name: 'Trade Networks', description: 'Exchange of goods between groups', prereqs: ['agriculture', 'language'], effects: { foodEfficiency: 0.4 }, minPopulation: 70, minAge: 200 },
  { id: 'religion', name: 'Religion', description: 'Shared beliefs and spiritual practices', prereqs: ['language', 'social_org'], effects: { combatBonus: 0.1 }, minPopulation: 40, minAge: 120 },
];

const KINGDOM_PREFIXES = [
  'Realm', 'Dominion', 'Republic', 'Empire', 'Horde',
  'Alliance', 'Syndicate', 'Enclave', 'Dynasty', 'Collective',
  'Pact', 'Sovereignty', 'Federation', 'Conclave', 'Citadel',
];

export interface SpeciesCivilization {
  technologies: Set<string>;
  techLevel: number;
  kingdomName: string;
  foundedTick: number;
  atWar: Set<number>; // species IDs currently fighting
  warHistory: Array<{ enemyId: number; startTick: number; endTick: number | null }>;
}

export class CivilizationSystem {
  speciesCivs: Map<number, SpeciesCivilization> = new Map();
  private _rng: () => number;

  constructor(rng?: () => number) {
    this._rng = rng || Math.random;
  }

  getOrCreate(speciesId: number, tick: number): SpeciesCivilization {
    let civ = this.speciesCivs.get(speciesId);
    if (!civ) {
      civ = {
        technologies: new Set(),
        techLevel: 0,
        kingdomName: KINGDOM_PREFIXES[speciesId % KINGDOM_PREFIXES.length],
        foundedTick: tick,
        atWar: new Set(),
        warHistory: [],
      };
      this.speciesCivs.set(speciesId, civ);
    }
    return civ;
  }

  update(
    tick: number,
    agents: Agent[],
    speciesRegistry: SpeciesRegistry,
    eventLog: EventLog,
    territoryOwner: Int32Array,
    territoryStrength: Float32Array,
    worldWidth: number
  ): void {
    // Aggregate per-species stats
    const speciesStats = new Map<number, { count: number; totalAge: number; totalEnergy: number }>();

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (!agent.alive) continue;
      let s = speciesStats.get(agent.species);
      if (!s) {
        s = { count: 0, totalAge: 0, totalEnergy: 0 };
        speciesStats.set(agent.species, s);
      }
      s.count++;
      s.totalAge += agent.age;
      s.totalEnergy += agent.energy;
    }

    // Technology discovery
    for (const [speciesId, stats] of speciesStats) {
      const sp = speciesRegistry.species.get(speciesId);
      if (!sp || sp.extinct) continue;

      const avgAge = stats.totalAge / stats.count;
      const civ = this.getOrCreate(speciesId, tick);

      for (const tech of TECH_TREE) {
        if (civ.technologies.has(tech.id)) continue;

        const hasPrereqs = tech.prereqs.every(p => civ.technologies.has(p));
        if (!hasPrereqs) continue;
        if (stats.count < tech.minPopulation) continue;
        if (avgAge < tech.minAge) continue;

        const prob = 0.002 * (stats.count / tech.minPopulation) * (avgAge / tech.minAge);
        if (this._rng() < prob) {
          civ.technologies.add(tech.id);
          civ.techLevel++;

          eventLog.log(tick, EventType.TechDiscovery,
            `${sp.name} discovered ${tech.name}: ${tech.description}`,
            { speciesId, techId: tech.id }
          );
        }
      }

      // Kingdom formation
      if (stats.count >= 50 && civ.techLevel >= 2 && !civ.kingdomName.includes(' of ')) {
        civ.kingdomName = `${KINGDOM_PREFIXES[speciesId % KINGDOM_PREFIXES.length]} of ${sp.name}`;
        eventLog.log(tick, EventType.KingdomFormed,
          `The ${civ.kingdomName} has been established! (pop: ${stats.count})`,
          { speciesId }
        );
      }
    }

    // Detect wars from territory conflicts
    const conflicts = new Map<string, number>(); // "id1-id2" -> overlap count
    for (let i = 0; i < territoryOwner.length; i++) {
      const owner = territoryOwner[i];
      if (owner <= 0 || territoryStrength[i] < 0.1) continue;
      // Check cardinal neighbors for different owners
      const x = i % worldWidth;
      const y = (i / worldWidth) | 0;
      const neighbors = [i - 1, i + 1, i - worldWidth, i + worldWidth];
      for (const ni of neighbors) {
        if (ni < 0 || ni >= territoryOwner.length) continue;
        const nOwner = territoryOwner[ni];
        if (nOwner > 0 && nOwner !== owner && territoryStrength[ni] > 0.1) {
          const key = Math.min(owner, nOwner) + '-' + Math.max(owner, nOwner);
          conflicts.set(key, (conflicts.get(key) || 0) + 1);
        }
      }
    }

    // Process conflicts into wars
    for (const [key, count] of conflicts) {
      if (count < 15) continue; // minimum border friction for a "war"
      const [a, b] = key.split('-').map(Number);
      const civA = this.speciesCivs.get(a);
      const civB = this.speciesCivs.get(b);
      if (!civA || !civB) continue;

      if (!civA.atWar.has(b)) {
        civA.atWar.add(b);
        civB.atWar.add(a);
        const spA = speciesRegistry.species.get(a);
        const spB = speciesRegistry.species.get(b);
        civA.warHistory.push({ enemyId: b, startTick: tick, endTick: null });
        civB.warHistory.push({ enemyId: a, startTick: tick, endTick: null });
        eventLog.log(tick, EventType.War,
          `War erupted between ${spA?.name || a} and ${spB?.name || b}! (${count} border conflicts)`,
          { speciesA: a, speciesB: b, borderConflicts: count }
        );
      }
    }

    // End wars with no border friction
    for (const [speciesId, civ] of this.speciesCivs) {
      for (const enemyId of civ.atWar) {
        const key = Math.min(speciesId, enemyId) + '-' + Math.max(speciesId, enemyId);
        if ((conflicts.get(key) || 0) < 5) {
          civ.atWar.delete(enemyId);
          const enemy = this.speciesCivs.get(enemyId);
          if (enemy) enemy.atWar.delete(speciesId);
          for (const w of civ.warHistory) {
            if (w.enemyId === enemyId && w.endTick === null) w.endTick = tick;
          }
        }
      }
    }
  }

  getTechEffects(speciesId: number): Record<string, number> {
    const civ = this.speciesCivs.get(speciesId);
    if (!civ) return {};

    const effects: Record<string, number> = {};
    for (const techId of civ.technologies) {
      const tech = TECH_TREE.find(t => t.id === techId);
      if (!tech) continue;
      for (const [k, v] of Object.entries(tech.effects)) {
        effects[k] = (effects[k] || 0) + (v as number);
      }
    }
    return effects;
  }
}
