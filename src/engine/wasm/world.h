#pragma once
#include "types.h"
#include <cmath>
#include <cstring>

static float tempFactor(float temp)
{
    if (temp < -10.0f)
        return 0.0f;
    if (temp > 50.0f)
        return 0.0f;
    return 1.0f - fabsf(temp - 22.0f) / 35.0f;
}

class World
{
public:
    int width, height;
    WorldConfig config;
    Tile *tiles;
    SeededRandom rng;

    float globalTemperatureOffset;
    float seasonAngle;
    float *weatherPatterns;
    float *windX;
    float *windY;
    int32_t *territoryOwner;
    float *territoryStrength;
    float *populationPressure;
    float *_weatherBlur;

    World() : width(0), height(0), tiles(nullptr), globalTemperatureOffset(0),
              seasonAngle(0), weatherPatterns(nullptr), windX(nullptr), windY(nullptr),
              territoryOwner(nullptr), territoryStrength(nullptr),
              populationPressure(nullptr), _weatherBlur(nullptr) {}

    World(int w, int h, uint32_t seed) : World()
    {
        WorldConfig cfg;
        cfg.width = w;
        cfg.height = h;
        cfg.seed = seed;
        init(cfg);
    }

    void init(const WorldConfig &cfg)
    {
        config = cfg;
        width = cfg.width;
        height = cfg.height;
        rng.init(cfg.seed);

        int sz = width * height;
        tiles = new Tile[sz];
        weatherPatterns = new float[sz]();
        windX = new float[sz]();
        windY = new float[sz]();
        territoryOwner = new int32_t[sz]();
        territoryStrength = new float[sz]();
        populationPressure = new float[sz]();
        _weatherBlur = new float[sz]();

        generateTerrain();
    }

    ~World()
    {
        delete[] tiles;
        delete[] weatherPatterns;
        delete[] windX;
        delete[] windY;
        delete[] territoryOwner;
        delete[] territoryStrength;
        delete[] populationPressure;
        delete[] _weatherBlur;
    }

    Tile &tileAt(int x, int y) { return tiles[y * width + x]; }
    const Tile &tileAt(int x, int y) const { return tiles[y * width + x]; }
    int tileIndex(int x, int y) const { return y * width + x; }
    bool isValid(int x, int y) const { return x >= 0 && x < width && y >= 0 && y < height; }

    bool isPassable(int x, int y) const
    {
        if (!isValid(x, y))
            return false;
        return tiles[y * width + x].terrain != DeepWater;
    }

    void claimTerritory(int x, int y, int species)
    {
        int idx = y * width + x;
        if (idx < 0 || idx >= width * height)
            return;
        if (territoryOwner[idx] == species || territoryOwner[idx] == 0)
        {
            territoryOwner[idx] = species;
            territoryStrength[idx] = fminf(1.0f, territoryStrength[idx] + 0.02f);
        }
        else
        {
            territoryStrength[idx] -= 0.01f;
            if (territoryStrength[idx] <= 0.0f)
            {
                territoryOwner[idx] = species;
                territoryStrength[idx] = 0.02f;
            }
        }
    }

    void recordAgentPresence(int x, int y)
    {
        int idx = y * width + x;
        if (idx >= 0 && idx < width * height)
        {
            populationPressure[idx] = fminf(50.0f, populationPressure[idx] + 1.0f);
        }
    }

    void updateEnvironment(int tick)
    {
        seasonAngle = ((float)(tick % config.ticksPerYear) / (float)config.ticksPerYear) * 6.283185307f;
        float seasonalTemp = sinf(seasonAngle) * 10.0f;
        float climateDrift = sinf((float)tick * 0.00005f) * 3.0f;

        if (tick % 50 == 0)
        {
            updateWeatherPatterns();
            updateWind();
        }

        bool doTerrainEvolution = (tick % 200 == 0);
        int sz = width * height;

        for (int i = 0; i < sz; i++)
        {
            Tile &tile = tiles[i];
            int y = i / width;
            float latFactor = 1.0f - fabsf((float)y / (float)height - 0.5f) * 2.0f;

            float baseTempForLat = config.baseTemperature +
                                   (latFactor - 0.5f) * config.temperatureVariance -
                                   tile.elevation * 30.0f;
            tile.temperature = baseTempForLat + seasonalTemp + weatherPatterns[i] * 5.0f + globalTemperatureOffset + climateDrift;

            if (tile.terrain != DeepWater)
            {
                float growthTempFactor = (tile.temperature > 0.0f && tile.temperature < 40.0f)
                                             ? 1.0f - fabsf(tile.temperature - 20.0f) / 30.0f
                                             : 0.1f;

                float pressure = populationPressure[i];
                float depletionFactor = pressure > 5.0f ? 1.0f - (pressure - 5.0f) * 0.015f : 1.0f;
                float growRate = config.resourceRegrowRate * tile.fertility * growthTempFactor * (0.5f + tile.humidity * 0.5f) * fmaxf(0.2f, depletionFactor);
                tile.foodResource = fminf(100.0f, tile.foodResource + growRate);

                if (tile.terrain == ShallowWater)
                {
                    tile.waterResource = fminf(100.0f, tile.waterResource + 0.5f);
                }
                else
                {
                    tile.waterResource = fminf(100.0f, tile.waterResource + tile.humidity * 0.08f + 0.01f);
                }
            }

            tile.pheromone *= 0.98f;
            if (tile.hazard > 0.001f)
                tile.hazard *= 0.999f;

            territoryStrength[i] *= 0.997f;
            if (territoryStrength[i] < 0.01f)
            {
                territoryOwner[i] = 0;
                territoryStrength[i] = 0.0f;
            }

            if (tile.terrain != DeepWater)
            {
                tile.energy = fminf(100.0f, tile.energy + 0.1f * fmaxf(0.0f, tempFactor(tile.temperature)));
            }

            populationPressure[i] *= 0.995f;

            if (doTerrainEvolution && tile.terrain != DeepWater && tile.terrain != ShallowWater)
            {
                float p = populationPressure[i];
                if (tile.terrain == Grass && tile.fertility > 0.7f && tile.humidity > 0.5f && tile.temperature > 5.0f && tile.temperature < 35.0f && p < 2.0f)
                {
                    if (rng.next() < 0.002f)
                    {
                        tile.terrain = Forest;
                        tile.fertility = fminf(1.0f, tile.fertility + 0.1f);
                    }
                }
                if (tile.terrain == Forest && p > 15.0f)
                {
                    if (rng.next() < 0.005f)
                    {
                        tile.terrain = Grass;
                        tile.fertility *= 0.8f;
                    }
                }
                if (tile.terrain == Grass && p > 25.0f)
                {
                    if (rng.next() < 0.003f)
                    {
                        tile.terrain = Sand;
                        tile.fertility *= 0.5f;
                    }
                }
                if (tile.terrain == Sand && tile.humidity > 0.4f && tile.temperature > 5.0f && p < 1.0f)
                {
                    if (rng.next() < 0.001f)
                    {
                        tile.terrain = Grass;
                        tile.fertility = fminf(1.0f, tile.fertility + 0.15f);
                    }
                }
                if (tile.terrain == Snow && tile.temperature > 5.0f)
                {
                    if (rng.next() < 0.001f)
                        tile.terrain = Mountain;
                }
                if (tile.terrain == Mountain && tile.temperature < -10.0f)
                {
                    if (rng.next() < 0.001f)
                        tile.terrain = Snow;
                }
            }
        }
    }

private:
    void updateWeatherPatterns()
    {
        int sz = width * height;
        for (int i = 0; i < sz; i++)
        {
            weatherPatterns[i] = weatherPatterns[i] * 0.9f + (rng.next() - 0.5f) * 0.2f;
        }
        // Blur
        memset(_weatherBlur, 0, sz * sizeof(float));
        for (int y = 1; y < height - 1; y++)
        {
            for (int x = 1; x < width - 1; x++)
            {
                int idx = y * width + x;
                _weatherBlur[idx] =
                    weatherPatterns[idx] * 0.5f +
                    weatherPatterns[idx - 1] * 0.125f +
                    weatherPatterns[idx + 1] * 0.125f +
                    weatherPatterns[idx - width] * 0.125f +
                    weatherPatterns[idx + width] * 0.125f;
            }
        }
        memcpy(weatherPatterns, _weatherBlur, sz * sizeof(float));
    }

    void updateWind()
    {
        float globalWindX = cosf(seasonAngle * 2.0f) * 0.5f;
        float globalWindY = sinf(seasonAngle) * 0.3f;
        for (int y = 1; y < height - 1; y++)
        {
            for (int x = 1; x < width - 1; x++)
            {
                int idx = y * width + x;
                float tL = tiles[idx - 1].temperature;
                float tR = tiles[idx + 1].temperature;
                float tU = tiles[idx - width].temperature;
                float tD = tiles[idx + width].temperature;
                windX[idx] = globalWindX + (tL - tR) * 0.02f;
                windY[idx] = globalWindY + (tU - tD) * 0.02f;
            }
        }
    }

    uint8_t elevationToTerrain(float elev, float moisture, float temp)
    {
        if (elev < 0.25f)
            return DeepWater;
        if (elev < 0.35f)
            return ShallowWater;
        if (elev > 0.85f)
            return temp < -5.0f ? Snow : Mountain;
        if (elev > 0.75f)
            return temp < 0.0f ? Snow : Mountain;
        if (temp < -10.0f)
            return Snow;
        if (moisture > 0.6f && temp > 5.0f)
            return Forest;
        if (moisture < 0.3f && temp > 25.0f)
            return Sand;
        return Grass;
    }

    void generateTerrain()
    {
        int w = width, h = height;
        float *elevation = generateNoise(w, h, 6, 0.5f);
        float *moisture = generateNoise(w, h, 5, 0.6f);
        float *tempNoise = generateNoise(w, h, 3, 0.4f);

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int idx = y * w + x;
                float elev = elevation[idx];
                float moist = moisture[idx];

                float latFactor = 1.0f - fabsf((float)y / (float)h - 0.5f) * 2.0f;
                float baseTemp = config.baseTemperature +
                                 (latFactor - 0.5f) * config.temperatureVariance +
                                 (tempNoise[idx] - 0.5f) * 15.0f;
                float altTemp = baseTemp - elev * 30.0f;

                uint8_t terrain = elevationToTerrain(elev, moist, altTemp);

                float food = 0, water = 0, fertility = 0;
                switch (terrain)
                {
                case Grass:
                    food = 40.0f + rng.nextFloat(0, 30);
                    water = 20.0f + rng.nextFloat(0, 20);
                    fertility = 0.6f + rng.nextFloat(0, 0.3f);
                    break;
                case Forest:
                    food = 60.0f + rng.nextFloat(0, 40);
                    water = 30.0f + rng.nextFloat(0, 20);
                    fertility = 0.8f + rng.nextFloat(0, 0.2f);
                    break;
                case Sand:
                    food = 5.0f + rng.nextFloat(0, 10);
                    water = 2.0f + rng.nextFloat(0, 5);
                    fertility = 0.1f + rng.nextFloat(0, 0.1f);
                    break;
                case ShallowWater:
                    food = 20.0f + rng.nextFloat(0, 20);
                    water = 100.0f;
                    fertility = 0.4f;
                    break;
                case Mountain:
                    food = 2.0f + rng.nextFloat(0, 5);
                    water = 10.0f + rng.nextFloat(0, 10);
                    fertility = 0.05f;
                    break;
                case Snow:
                    food = 1.0f + rng.nextFloat(0, 3);
                    water = 30.0f;
                    fertility = 0.02f;
                    break;
                default:
                    food = 0;
                    water = 100;
                    fertility = 0;
                }

                tiles[idx].terrain = terrain;
                tiles[idx].elevation = elev;
                tiles[idx].temperature = altTemp;
                tiles[idx].humidity = moist;
                tiles[idx].foodResource = food;
                tiles[idx].waterResource = water;
                tiles[idx].energy = (terrain == Grass || terrain == Forest) ? 50.0f : 10.0f;
                tiles[idx].hazard = 0.0f;
                tiles[idx].fertility = fertility;
                tiles[idx].pheromone = 0.0f;
            }
        }

        delete[] elevation;
        delete[] moisture;
        delete[] tempNoise;
    }

    float *generateNoise(int w, int h, int octaves, float persistence)
    {
        float *result = new float[w * h]();
        float maxAmp = 0.0f;
        float amp = 1.0f;

        for (int oct = 0; oct < octaves; oct++)
        {
            float freq = powf(2.0f, (float)oct);
            float scaleX = freq * 4.0f / (float)w;
            float scaleY = freq * 4.0f / (float)h;

            int gridW = (int)ceilf((float)w / ((float)w / freq / 2.0f)) + 2;
            int gridH = (int)ceilf((float)h / ((float)h / freq / 2.0f)) + 2;
            int gridSz = gridW * gridH;

            float *grid = new float[gridSz];
            for (int i = 0; i < gridSz; i++)
                grid[i] = rng.next();

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float fx = (float)x * scaleX;
                    float fy = (float)y * scaleY;
                    int ix = (int)fx;
                    int iy = (int)fy;
                    float dx = fx - (float)ix;
                    float dy = fy - (float)iy;

                    float sx = dx * dx * (3.0f - 2.0f * dx);
                    float sy = dy * dy * (3.0f - 2.0f * dy);

                    int gw = gridW;
                    int i00 = abs((iy % gridH) * gw + (ix % gw)) % gridSz;
                    int i10 = abs((iy % gridH) * gw + ((ix + 1) % gw)) % gridSz;
                    int i01 = abs(((iy + 1) % gridH) * gw + (ix % gw)) % gridSz;
                    int i11 = abs(((iy + 1) % gridH) * gw + ((ix + 1) % gw)) % gridSz;

                    float v00 = grid[i00], v10 = grid[i10];
                    float v01 = grid[i01], v11 = grid[i11];
                    float top = v00 + sx * (v10 - v00);
                    float bot = v01 + sx * (v11 - v01);
                    float val = top + sy * (bot - top);

                    result[y * w + x] += val * amp;
                }
            }

            delete[] grid;
            maxAmp += amp;
            amp *= persistence;
        }

        float invMaxAmp = 1.0f / maxAmp;
        for (int i = 0; i < w * h; i++)
            result[i] *= invMaxAmp;
        return result;
    }

    // Disable copy
    World(const World &) = delete;
    World &operator=(const World &) = delete;
};
