/**
 * SpriteManager - Loads and manages SVG sprite assets from /sprites/
 * Uses Twemoji CC-BY-4.0 assets for creatures, plants, objects, and effects
 */

export interface SpriteSet {
  creatures: Map<string, HTMLImageElement>;
  plants: Map<string, HTMLImageElement>;
  objects: Map<string, HTMLImageElement>;
  effects: Map<string, HTMLImageElement>;
}

const CREATURE_NAMES = [
  'bear', 'fox', 'wolf', 'lion', 'boar', 'deer', 'rabbit', 'mouse',
  'snake', 'lizard', 'frog', 'eagle', 'turtle', 'ant', 'butterfly',
  'bee', 'bug', 'ladybug', 'bat', 'dragon',
];

const PLANT_NAMES = [
  'evergreen', 'deciduous', 'palm', 'cactus', 'herb', 'seedling',
  'mushroom', 'wheat', 'cherry_blossom', 'sunflower', 'rose',
  'hibiscus', 'bouquet', 'leaf',
];

const OBJECT_NAMES = [
  'rock', 'wood', 'bone', 'skull', 'house', 'tent', 'fire', 'droplet', 'gem',
];

const EFFECT_NAMES = [
  'heart', 'sleep', 'swords', 'sparkles', 'collision', 'dizzy',
  'exclamation', 'question', 'speech',
];

/**
 * Maps a species to a semantically appropriate creature sprite
 * based on its founder traits. Falls back to index-based cycling.
 */
export function speciesSpriteName(speciesIndex: number, founderTraits?: {
  aquatic?: number; flight?: number; size?: number;
  aggressionBias?: number; socialBias?: number; packHunting?: number;
  venom?: number; burrowing?: number; camouflage?: number; speed?: number;
}): string {
  if (!founderTraits) return CREATURE_NAMES[speciesIndex % CREATURE_NAMES.length];

  const t = founderTraits;
  // Aquatic creatures
  if ((t.aquatic ?? 0) > 0.5) return 'frog';
  // Flying creatures
  if ((t.flight ?? 0) > 0.5) {
    if ((t.size ?? 1) > 1.2) return 'eagle';
    return 'bat';
  }
  // Venomous
  if ((t.venom ?? 0) > 0.5) return 'snake';
  // Burrowing
  if ((t.burrowing ?? 0) > 0.5) return 'mouse';
  // Large predators
  if ((t.aggressionBias ?? 0) > 0.65 && (t.size ?? 1) > 1.3) return 'lion';
  // Pack hunters — wolves
  if ((t.packHunting ?? 0) > 0.4 && (t.aggressionBias ?? 0) > 0.5) return 'wolf';
  // Fast aggressive — fox
  if ((t.aggressionBias ?? 0) > 0.5 && (t.speed ?? 1) > 1.3) return 'fox';
  // Medium predators
  if ((t.aggressionBias ?? 0) > 0.5) return 'boar';
  // Large gentle — bear (forager)
  if ((t.size ?? 1) > 1.3 && (t.aggressionBias ?? 0) <= 0.5) return 'bear';
  // Social medium — deer
  if ((t.socialBias ?? 0) > 0.5 && (t.size ?? 1) > 0.8) return 'deer';
  // Small social — ant/bee
  if ((t.socialBias ?? 0) > 0.6 && (t.size ?? 1) < 0.8) return 'ant';
  // Tiny creatures
  if ((t.size ?? 1) < 0.7) {
    if ((t.camouflage ?? 0) > 0.3) return 'lizard';
    return 'rabbit';
  }
  // Slow armored
  if ((t.speed ?? 1) < 0.8) return 'turtle';
  // Default: cycle through remaining sprites
  const fallback = ['butterfly', 'bee', 'bug', 'ladybug', 'dragon', 'deer', 'rabbit'];
  return fallback[speciesIndex % fallback.length];
}

/**
 * Picks a plant sprite based on terrain and environmental conditions.
 */
export function plantSpriteForTerrain(
  terrainType: number,
  temperature: number,
  humidity: number,
  food: number,
): string {
  // Forest terrain
  if (terrainType === 4) {
    if (temperature < 0) return 'evergreen';
    if (humidity > 0.7) return 'deciduous';
    return food > 60 ? 'deciduous' : 'evergreen';
  }
  // Grass terrain
  if (terrainType === 3) {
    if (food > 70) return 'sunflower';
    if (food > 50) return 'wheat';
    if (humidity > 0.6) return 'herb';
    return 'seedling';
  }
  // Sand terrain
  if (terrainType === 2) {
    if (temperature > 30) return 'cactus';
    return 'palm';
  }
  // Mountain
  if (terrainType === 5) return 'mushroom';
  // Snow
  if (terrainType === 6) return 'evergreen';
  // Shallow water
  if (terrainType === 1) return 'leaf';
  return 'herb';
}

/**
 * Pick a shelter/structure sprite based on technology or population.
 */
export function shelterSpriteName(techLevel: number): string {
  if (techLevel >= 3) return 'house';
  if (techLevel >= 1) return 'tent';
  return 'wood'; // basic shelter = logs
}

class SpriteManager {
  private sprites: SpriteSet = {
    creatures: new Map(),
    plants: new Map(),
    objects: new Map(),
    effects: new Map(),
  };

  private bitmapCache: Map<string, ImageBitmap> = new Map();
  private loading: Promise<void> | null = null;
  private _ready = false;

  get ready(): boolean { return this._ready; }

  /**
   * Load all sprite assets. Call once at startup.
   * Base path defaults to the Vite public folder root.
   */
  async loadAll(basePath = '/sprites'): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this._loadAll(basePath);
    return this.loading;
  }

  private async _loadAll(base: string): Promise<void> {
    const loadCategory = async (
      names: string[],
      folder: string,
      map: Map<string, HTMLImageElement>,
    ) => {
      const promises = names.map(name => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => { map.set(name, img); resolve(); };
          img.onerror = () => { resolve(); }; // skip broken assets
          img.src = `${base}/${folder}/${name}.svg`;
        });
      });
      await Promise.all(promises);
    };

    await Promise.all([
      loadCategory(CREATURE_NAMES, 'creatures', this.sprites.creatures),
      loadCategory(PLANT_NAMES, 'plants', this.sprites.plants),
      loadCategory(OBJECT_NAMES, 'objects', this.sprites.objects),
      loadCategory(EFFECT_NAMES, 'effects', this.sprites.effects),
    ]);

    this._ready = true;
  }

  getCreature(name: string): HTMLImageElement | undefined {
    return this.sprites.creatures.get(name);
  }

  getPlant(name: string): HTMLImageElement | undefined {
    return this.sprites.plants.get(name);
  }

  getObject(name: string): HTMLImageElement | undefined {
    return this.sprites.objects.get(name);
  }

  getEffect(name: string): HTMLImageElement | undefined {
    return this.sprites.effects.get(name);
  }

  /**
   * Get a cached ImageBitmap at a specific size for faster drawing.
   */
  async getBitmap(
    category: 'creatures' | 'plants' | 'objects' | 'effects',
    name: string,
    size: number,
  ): Promise<ImageBitmap | null> {
    const key = `${category}/${name}@${size}`;
    const cached = this.bitmapCache.get(key);
    if (cached) return cached;

    const img = this.sprites[category].get(name);
    if (!img) return null;

    try {
      const bitmap = await createImageBitmap(img, {
        resizeWidth: size,
        resizeHeight: size,
        resizeQuality: 'medium',
      });
      this.bitmapCache.set(key, bitmap);
      return bitmap;
    } catch {
      return null;
    }
  }

  /** Get all loaded creature names */
  get creatureNames(): string[] { return CREATURE_NAMES; }
  /** Get all loaded plant names */
  get plantNames(): string[] { return PLANT_NAMES; }
  /** Get all loaded object names */
  get objectNames(): string[] { return OBJECT_NAMES; }
  /** Get all loaded effect names */
  get effectNames(): string[] { return EFFECT_NAMES; }
}

// Singleton instance
export const spriteManager = new SpriteManager();
