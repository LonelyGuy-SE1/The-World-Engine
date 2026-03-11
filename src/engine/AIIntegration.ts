import { Traits, Agent, WorldConfig } from './types';
import { NeuralNet, } from './NeuralNet';
import { BRAIN_CONFIG, randomTraits, createAgent, createRandomAgent, SpeciesRegistry } from './Agent';
import { World } from './World';
import { SeededRandom } from './types';

// --- LLM Integration ---

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface GeneratedSpecies {
  name: string;
  description: string;
  traits: Partial<Traits>;
  behaviorHints: string[];
}

export class AIIntegration {
  private llmConfig: LLMConfig | null = null;

  setLLMConfig(config: LLMConfig): void {
    this.llmConfig = config;
  }

  async generateSpecies(
    worldDescription: string,
    existingSpecies: string[],
    niche: string
  ): Promise<GeneratedSpecies | null> {
    if (!this.llmConfig) return this.generateSpeciesFallback(niche);

    const prompt = `You are designing organisms for an artificial life simulation.

World context: ${worldDescription}
Existing species: ${existingSpecies.join(', ')}
Requested niche: ${niche}

Design a new species. Return JSON with:
{
  "name": "species name",
  "description": "brief description",
  "traits": {
    "speed": 0.5-2.0,
    "size": 0.5-2.0,
    "perceptionRadius": 2-8,
    "metabolism": 0.5-2.0,
    "reproductionThreshold": 0.3-0.9,
    "aggressionBias": 0-1,
    "socialBias": 0-1,
    "heatTolerance": -1 to 1,
    "foodEfficiency": 0.5-2.0
  },
  "behaviorHints": ["hint1", "hint2"]
}`;

    try {
      const response = await this.callLLM(prompt);
      const json = extractJSON(response);
      if (json) {
        return json as GeneratedSpecies;
      }
    } catch (e) {
      console.warn('LLM species generation failed, using fallback:', e);
    }

    return this.generateSpeciesFallback(niche);
  }

  async generateEvent(
    worldStats: string,
    currentYear: number
  ): Promise<{ name: string; description: string; effects: Record<string, number> } | null> {
    if (!this.llmConfig) return null;

    const prompt = `You are an environmental event generator for an artificial life simulation.

World stats: ${worldStats}
Current year: ${currentYear}

Generate a natural event. Return JSON with:
{
  "name": "event name",
  "description": "what happens",
  "effects": {
    "temperatureShift": number (-20 to 20),
    "resourceMultiplier": number (0.1 to 3),
    "hazardLevel": number (0 to 1)
  }
}`;

    try {
      const response = await this.callLLM(prompt);
      return extractJSON(response);
    } catch (e) {
      console.warn('LLM event generation failed:', e);
      return null;
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    if (!this.llmConfig) throw new Error('No LLM config');

    const { provider, apiKey, model, baseUrl } = this.llmConfig;

    let url: string;
    let headers: Record<string, string>;
    let body: unknown;

    if (provider === 'openai') {
      url = baseUrl || 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 500,
      };
    } else if (provider === 'anthropic') {
      url = baseUrl || 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      body = {
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      };
    } else {
      url = baseUrl || '';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      body = {
        model,
        messages: [{ role: 'user', content: prompt }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();

    if (provider === 'openai' || provider === 'custom') {
      return data.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      return data.content?.[0]?.text || '';
    }

    return '';
  }

  private generateSpeciesFallback(niche: string): GeneratedSpecies {
    const rng = new SeededRandom(Date.now());
    const archetypes: Record<string, Partial<Traits>> = {
      predator: {
        speed: 1.6, size: 1.4, aggressionBias: 0.85, socialBias: 0.2,
        perceptionRadius: 6, metabolism: 1.3, foodEfficiency: 1.1,
      },
      herbivore: {
        speed: 1.2, size: 1.0, aggressionBias: 0.1, socialBias: 0.7,
        perceptionRadius: 4, metabolism: 0.8, foodEfficiency: 1.4,
      },
      scavenger: {
        speed: 1.0, size: 0.7, aggressionBias: 0.3, socialBias: 0.4,
        perceptionRadius: 5, metabolism: 0.6, foodEfficiency: 1.6,
      },
      'pack hunter': {
        speed: 1.4, size: 1.1, aggressionBias: 0.7, socialBias: 0.8,
        perceptionRadius: 5, metabolism: 1.1, foodEfficiency: 1.0,
      },
      'cold-adapted': {
        speed: 0.9, size: 1.5, aggressionBias: 0.4, socialBias: 0.5,
        perceptionRadius: 3, metabolism: 0.7, heatTolerance: -0.8, foodEfficiency: 1.2,
      },
      'heat-adapted': {
        speed: 1.1, size: 0.8, aggressionBias: 0.3, socialBias: 0.3,
        perceptionRadius: 4, metabolism: 1.1, heatTolerance: 0.8, foodEfficiency: 0.9,
      },
    };

    const key = niche.toLowerCase();
    const archetype = archetypes[key] || archetypes.herbivore;
    const base = randomTraits(rng);
    const traits = { ...base, ...archetype };

    return {
      name: niche.charAt(0).toUpperCase() + niche.slice(1),
      description: `A ${niche} species generated algorithmically.`,
      traits,
      behaviorHints: [`Adapted for ${niche} niche`],
    };
  }

  applyGeneratedSpecies(
    spec: GeneratedSpecies,
    world: World,
    speciesRegistry: SpeciesRegistry,
    count: number,
    tick: number
  ): Agent[] {
    const rng = world.rng;
    const baseTraits = randomTraits(rng);
    const mergedTraits: Traits = { ...baseTraits, ...spec.traits } as Traits;

    mergedTraits.speed = clamp(mergedTraits.speed, 0.3, 3.0);
    mergedTraits.size = clamp(mergedTraits.size, 0.3, 3.0);
    mergedTraits.perceptionRadius = clamp(mergedTraits.perceptionRadius, 1, 10);
    mergedTraits.metabolism = clamp(mergedTraits.metabolism, 0.3, 3.0);
    mergedTraits.reproductionThreshold = clamp(mergedTraits.reproductionThreshold, 0.2, 0.95);
    mergedTraits.mutationRate = clamp(mergedTraits.mutationRate ?? 0.05, 0.005, 0.5);
    mergedTraits.aggressionBias = clamp(mergedTraits.aggressionBias, 0, 1);
    mergedTraits.socialBias = clamp(mergedTraits.socialBias, 0, 1);
    mergedTraits.heatTolerance = clamp(mergedTraits.heatTolerance, -1, 1);
    mergedTraits.foodEfficiency = clamp(mergedTraits.foodEfficiency, 0.3, 3.0);

    const sp = speciesRegistry.registerSpecies(mergedTraits, tick);

    const agents: Agent[] = [];
    for (let i = 0; i < count; i++) {
      const agent = createRandomAgent(world, sp.id, mergedTraits, tick, rng);
      agents.push(agent);
    }

    return agents;
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function extractJSON(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

export interface RLEnvironment {
  getState(agentId: number): Float32Array;
  step(agentId: number, action: number): { reward: number; done: boolean };
  reset(agentId: number): Float32Array;
}

export function createRLEnvironment(
  world: World,
  agents: Agent[],
  speciesRegistry: SpeciesRegistry
): RLEnvironment {
  return {
    getState(agentId: number): Float32Array {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return new Float32Array(39);

      const state = new Float32Array(39);
      state[0] = agent.energy / 100;
      state[1] = agent.health / agent.maxHealth;
      state[2] = agent.age / agent.maxAge;
      return state;
    },

    step(agentId: number, action: number): { reward: number; done: boolean } {
      const agent = agents.find(a => a.id === agentId);
      if (!agent || !agent.alive) return { reward: -1, done: true };

      const prevEnergy = agent.energy;
      const energyDelta = agent.energy - prevEnergy;
      const reward = energyDelta * 0.01 + (agent.alive ? 0.001 : -1);

      return { reward, done: !agent.alive };
    },

    reset(agentId: number): Float32Array {
      return this.getState(agentId);
    },
  };
}
