import {
  Tile, Terrain, WorldConfig, DEFAULT_WORLD_CONFIG, SeededRandom
} from './types';

export class World {
  readonly width: number;
  readonly height: number;
  readonly config: WorldConfig;
  readonly tiles: Tile[];
  readonly rng: SeededRandom;

  globalTemperatureOffset: number = 0;
  seasonAngle: number = 0;
  weatherPatterns: Float32Array;
  windX: Float32Array;
  windY: Float32Array;
  territoryOwner: Int32Array;
  territoryStrength: Float32Array;
  private _weatherBlur: Float32Array;

  constructor(config: Partial<WorldConfig> = {}) {
    this.config = { ...DEFAULT_WORLD_CONFIG, ...config };
    this.width = this.config.width;
    this.height = this.config.height;
    this.rng = new SeededRandom(this.config.seed);
    this.tiles = new Array(this.width * this.height);
    this.weatherPatterns = new Float32Array(this.width * this.height);
    this.windX = new Float32Array(this.width * this.height);
    this.windY = new Float32Array(this.width * this.height);
    this.territoryOwner = new Int32Array(this.width * this.height);
    this.territoryStrength = new Float32Array(this.width * this.height);
    this._weatherBlur = new Float32Array(this.width * this.height);

    this.generateTerrain();
  }

  tileAt(x: number, y: number): Tile {
    return this.tiles[y * this.width + x];
  }

  tileIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  isValid(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isPassable(x: number, y: number): boolean {
    if (!this.isValid(x, y)) return false;
    const tile = this.tileAt(x, y);
    return tile.terrain !== Terrain.DeepWater;
  }

  private generateTerrain(): void {
    const rng = this.rng;
    const w = this.width;
    const h = this.height;

    const elevation = this.generateNoise(w, h, 6, 0.5);
    const moisture = this.generateNoise(w, h, 5, 0.6);
    const tempNoise = this.generateNoise(w, h, 3, 0.4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const elev = elevation[idx];
        const moist = moisture[idx];

        const latFactor = 1 - Math.abs(y / h - 0.5) * 2;
        const baseTemp = this.config.baseTemperature +
          (latFactor - 0.5) * this.config.temperatureVariance +
          (tempNoise[idx] - 0.5) * 15;

        const altTemp = baseTemp - elev * 30;

        const terrain = this.elevationToTerrain(elev, moist, altTemp);

        let food = 0, water = 0, fertility = 0;
        switch (terrain) {
          case Terrain.Grass:
            food = 40 + rng.nextFloat(0, 30);
            water = 20 + rng.nextFloat(0, 20);
            fertility = 0.6 + rng.nextFloat(0, 0.3);
            break;
          case Terrain.Forest:
            food = 60 + rng.nextFloat(0, 40);
            water = 30 + rng.nextFloat(0, 20);
            fertility = 0.8 + rng.nextFloat(0, 0.2);
            break;
          case Terrain.Sand:
            food = 5 + rng.nextFloat(0, 10);
            water = 2 + rng.nextFloat(0, 5);
            fertility = 0.1 + rng.nextFloat(0, 0.1);
            break;
          case Terrain.ShallowWater:
            food = 20 + rng.nextFloat(0, 20);
            water = 100;
            fertility = 0.4;
            break;
          case Terrain.Mountain:
            food = 2 + rng.nextFloat(0, 5);
            water = 10 + rng.nextFloat(0, 10);
            fertility = 0.05;
            break;
          case Terrain.Snow:
            food = 1 + rng.nextFloat(0, 3);
            water = 30;
            fertility = 0.02;
            break;
          default:
            food = 0; water = 100; fertility = 0;
        }

        this.tiles[idx] = {
          terrain,
          elevation: elev,
          temperature: altTemp,
          humidity: moist,
          foodResource: food,
          waterResource: water,
          energy: terrain === Terrain.Grass || terrain === Terrain.Forest ? 50 : 10,
          hazard: 0,
          fertility,
          pheromone: 0,
        };
      }
    }
  }

  private elevationToTerrain(elev: number, moisture: number, temp: number): Terrain {
    if (elev < 0.25) return Terrain.DeepWater;
    if (elev < 0.35) return Terrain.ShallowWater;
    if (elev > 0.85) return temp < -5 ? Terrain.Snow : Terrain.Mountain;
    if (elev > 0.75) return temp < 0 ? Terrain.Snow : Terrain.Mountain;

    // Midlands: biome based on moisture and temperature
    if (temp < -10) return Terrain.Snow;
    if (moisture > 0.6 && temp > 5) return Terrain.Forest;
    if (moisture < 0.3 && temp > 25) return Terrain.Sand;
    return Terrain.Grass;
  }

  private generateNoise(w: number, h: number, octaves: number, persistence: number): Float32Array {
    const result = new Float32Array(w * h);
    const rng = this.rng;

    let maxAmp = 0;
    let amp = 1;

    for (let oct = 0; oct < octaves; oct++) {
      const freq = Math.pow(2, oct);
      const gridW = Math.ceil(w / (w / freq / 2)) + 2;
      const gridH = Math.ceil(h / (h / freq / 2)) + 2;
      const scaleX = freq * 4 / w;
      const scaleY = freq * 4 / h;

      const grid = new Float32Array(gridW * gridH);
      for (let i = 0; i < grid.length; i++) {
        grid[i] = rng.next();
      }

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const fx = x * scaleX;
          const fy = y * scaleY;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          const dx = fx - ix;
          const dy = fy - iy;

          const sx = dx * dx * (3 - 2 * dx);
          const sy = dy * dy * (3 - 2 * dy);

          const gw = gridW;
          const i00 = Math.abs((iy % gridH) * gw + (ix % gw)) % grid.length;
          const i10 = Math.abs((iy % gridH) * gw + ((ix + 1) % gw)) % grid.length;
          const i01 = Math.abs(((iy + 1) % gridH) * gw + (ix % gw)) % grid.length;
          const i11 = Math.abs(((iy + 1) % gridH) * gw + ((ix + 1) % gw)) % grid.length;

          const v00 = grid[i00];
          const v10 = grid[i10];
          const v01 = grid[i01];
          const v11 = grid[i11];

          const top = v00 + sx * (v10 - v00);
          const bot = v01 + sx * (v11 - v01);
          const val = top + sy * (bot - top);

          result[y * w + x] += val * amp;
        }
      }

      maxAmp += amp;
      amp *= persistence;
    }

    // Normalize to 0–1
    for (let i = 0; i < result.length; i++) {
      result[i] /= maxAmp;
    }

    return result;
  }

  populationPressure: Float32Array = new Float32Array(0);

  claimTerritory(x: number, y: number, species: number): void {
    const idx = y * this.width + x;
    if (idx < 0 || idx >= this.territoryOwner.length) return;
    if (this.territoryOwner[idx] === species || this.territoryOwner[idx] === 0) {
      this.territoryOwner[idx] = species;
      this.territoryStrength[idx] = Math.min(1, this.territoryStrength[idx] + 0.02);
    } else {
      this.territoryStrength[idx] -= 0.01;
      if (this.territoryStrength[idx] <= 0) {
        this.territoryOwner[idx] = species;
        this.territoryStrength[idx] = 0.02;
      }
    }
  }

  recordAgentPresence(x: number, y: number): void {
    const idx = y * this.width + x;
    if (idx >= 0 && idx < this.populationPressure.length) {
      this.populationPressure[idx] = Math.min(50, this.populationPressure[idx] + 1);
    }
  }

  updateEnvironment(tick: number): void {
    if (this.populationPressure.length === 0) {
      this.populationPressure = new Float32Array(this.width * this.height);
    }

    this.seasonAngle = ((tick % this.config.ticksPerYear) / this.config.ticksPerYear) * Math.PI * 2;

    const seasonalTemp = Math.sin(this.seasonAngle) * 10;
    const climateDrift = Math.sin(tick * 0.00005) * 3;

    if (tick % 50 === 0) {
      this.updateWeatherPatterns();
      this.updateWind();
    }

    const doTerrainEvolution = tick % 200 === 0;

    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      const y = Math.floor(i / this.width);
      const latFactor = 1 - Math.abs(y / this.height - 0.5) * 2;

      const baseTempForLat = this.config.baseTemperature +
        (latFactor - 0.5) * this.config.temperatureVariance -
        tile.elevation * 30;
      tile.temperature = baseTempForLat + seasonalTemp + this.weatherPatterns[i] * 5
        + this.globalTemperatureOffset + climateDrift;

      if (tile.terrain !== Terrain.DeepWater) {
        const growthTempFactor = tile.temperature > 0 && tile.temperature < 40
          ? 1.0 - Math.abs(tile.temperature - 20) / 30
          : 0.1;

        const pressure = this.populationPressure[i];
        const depletionFactor = pressure > 5 ? 1 - (pressure - 5) * 0.015 : 1;
        const growRate = this.config.resourceRegrowRate * tile.fertility
          * growthTempFactor * (0.5 + tile.humidity * 0.5)
          * Math.max(0.2, depletionFactor);
        tile.foodResource = Math.min(100, tile.foodResource + growRate);

        // Water regrowth: water tiles regenerate fast, land tiles from humidity/rainfall
        if (tile.terrain === Terrain.ShallowWater) {
          tile.waterResource = Math.min(100, tile.waterResource + 0.5);
        } else {
          tile.waterResource = Math.min(100, tile.waterResource + tile.humidity * 0.08 + 0.01);
        }
      }

      tile.pheromone *= 0.98;

      if (tile.hazard > 0.001) {
        tile.hazard *= 0.999;
      }

      this.territoryStrength[i] *= 0.997;
      if (this.territoryStrength[i] < 0.01) {
        this.territoryOwner[i] = 0;
        this.territoryStrength[i] = 0;
      }

      if (tile.terrain !== Terrain.DeepWater) {
        tile.energy = Math.min(100, tile.energy + 0.1 * Math.max(0, tempFactor(tile.temperature)));
      }

      this.populationPressure[i] *= 0.995;

      if (doTerrainEvolution && tile.terrain !== Terrain.DeepWater && tile.terrain !== Terrain.ShallowWater) {
        const pressure = this.populationPressure[i];

        if (tile.terrain === Terrain.Grass && tile.fertility > 0.7
            && tile.humidity > 0.5 && tile.temperature > 5 && tile.temperature < 35
            && pressure < 2) {
          if (this.rng.next() < 0.002) {
            tile.terrain = Terrain.Forest;
            tile.fertility = Math.min(1, tile.fertility + 0.1);
          }
        }

        if (tile.terrain === Terrain.Forest && pressure > 15) {
          if (this.rng.next() < 0.005) {
            tile.terrain = Terrain.Grass;
            tile.fertility *= 0.8;
          }
        }

        if (tile.terrain === Terrain.Grass && pressure > 25) {
          if (this.rng.next() < 0.003) {
            tile.terrain = Terrain.Sand;
            tile.fertility *= 0.5;
          }
        }

        if (tile.terrain === Terrain.Sand && tile.humidity > 0.4
            && tile.temperature > 5 && pressure < 1) {
          if (this.rng.next() < 0.001) {
            tile.terrain = Terrain.Grass;
            tile.fertility = Math.min(1, tile.fertility + 0.15);
          }
        }

        if (tile.terrain === Terrain.Snow && tile.temperature > 5) {
          if (this.rng.next() < 0.001) {
            tile.terrain = Terrain.Mountain;
          }
        }
        if (tile.terrain === Terrain.Mountain && tile.temperature < -10) {
          if (this.rng.next() < 0.001) {
            tile.terrain = Terrain.Snow;
          }
        }
      }
    }
  }

  private updateWeatherPatterns(): void {
    const rng = this.rng;
    for (let i = 0; i < this.weatherPatterns.length; i++) {
      this.weatherPatterns[i] = this.weatherPatterns[i] * 0.9 + (rng.next() - 0.5) * 0.2;
    }

    // Blur for spatial coherence — reuse pre-allocated buffer
    const temp = this._weatherBlur;
    temp.fill(0);
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const idx = y * this.width + x;
        temp[idx] = (
          this.weatherPatterns[idx] * 0.5 +
          this.weatherPatterns[idx - 1] * 0.125 +
          this.weatherPatterns[idx + 1] * 0.125 +
          this.weatherPatterns[idx - this.width] * 0.125 +
          this.weatherPatterns[idx + this.width] * 0.125
        );
      }
    }
    this.weatherPatterns.set(temp);
  }

  private updateWind(): void {
    const w = this.width;
    const h = this.height;
    const globalWindX = Math.cos(this.seasonAngle * 2) * 0.5;
    const globalWindY = Math.sin(this.seasonAngle) * 0.3;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const tL = this.tiles[idx - 1].temperature;
        const tR = this.tiles[idx + 1].temperature;
        const tU = this.tiles[idx - w].temperature;
        const tD = this.tiles[idx + w].temperature;
        this.windX[idx] = globalWindX + (tL - tR) * 0.02;
        this.windY[idx] = globalWindY + (tU - tD) * 0.02;
      }
    }
  }

  getTilesInRadius(cx: number, cy: number, radius: number): { tile: Tile; x: number; y: number }[] {
    const result: { tile: Tile; x: number; y: number }[] = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (this.isValid(nx, ny) && dx * dx + dy * dy <= radius * radius) {
          result.push({ tile: this.tileAt(nx, ny), x: nx, y: ny });
        }
      }
    }
    return result;
  }

  getSnapshot(): {
    width: number;
    height: number;
    tiles: { terrain: number; food: number; temp: number }[];
  } {
    return {
      width: this.width,
      height: this.height,
      tiles: this.tiles.map(t => ({
        terrain: t.terrain,
        food: t.foodResource,
        temp: t.temperature,
      })),
    };
  }
}

function tempFactor(temp: number): number {
  if (temp < -10) return 0;
  if (temp > 50) return 0;
  return 1.0 - Math.abs(temp - 22) / 35;
}
