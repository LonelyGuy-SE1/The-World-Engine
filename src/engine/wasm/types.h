#pragma once
#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>

// --- Terrain ---
enum Terrain : uint8_t
{
    DeepWater = 0,
    ShallowWater = 1,
    Sand = 2,
    Grass = 3,
    Forest = 4,
    Mountain = 5,
    Snow = 6,
    TERRAIN_COUNT = 7
};

static constexpr float TERRAIN_MOVEMENT_COST[TERRAIN_COUNT] = {
    1e9f, // DeepWater (impassable)
    3.0f, // ShallowWater
    1.5f, // Sand
    1.0f, // Grass
    1.3f, // Forest
    4.0f, // Mountain
    2.0f  // Snow
};

// --- Tile ---
struct Tile
{
    uint8_t terrain;
    float elevation;
    float temperature;
    float humidity;
    float foodResource;
    float waterResource;
    float energy;
    float hazard;
    float fertility;
    float pheromone;
};

// --- Psychology ---
struct Psychology
{
    float fear;
    float aggression;
    float curiosity;
    float socialBonding;
    float hunger;
    float thirst;
    float fatigue;
    float loneliness;
    float satisfaction;
};

// --- Traits ---
struct Traits
{
    float speed;
    float size;
    float perceptionRadius;
    float metabolism;
    float reproductionThreshold;
    float mutationRate;
    float aggressionBias;
    float socialBias;
    float heatTolerance;
    float foodEfficiency;
    float nocturnal;
    float camouflage;
    float packHunting;
    float toolUse;
    float singing;
    float burrowing;
    float venom;
    float regeneration;
    float flight;
    float aquatic;
    float migrationDrive;
    float longevity;
    float immuneStrength;
    float learningRate;
};

static constexpr int TRAIT_COUNT = 24;

// --- Memory Entry ---
enum MemoryType : uint8_t
{
    MEM_FOOD = 0,
    MEM_WATER = 1,
    MEM_DANGER = 2,
    MEM_MATE = 3,
    MEM_DEATH = 4,
    MEM_SOCIAL = 5
};

struct MemoryEntry
{
    int32_t tick;
    uint8_t type; // MemoryType
    int16_t x;
    int16_t y;
    float intensity;
};

// --- Agent Action ---
enum AgentAction : uint8_t
{
    MoveNorth = 0,
    MoveSouth = 1,
    MoveEast = 2,
    MoveWest = 3,
    Stay = 4,
    Eat = 5,
    Reproduce = 6,
    Attack = 7,
    Rest = 8,
    Drink = 9,
    Flee = 10,
    Build = 11,
    Communicate = 12,
    Forage = 13,
    Migrate = 14,
    ACTION_COUNT = 15
};

// --- Neural Net Config ---
static constexpr int INPUT_SIZE = 52;
static constexpr int HIDDEN1_SIZE = 28;
static constexpr int HIDDEN2_SIZE = 14;
static constexpr int OUTPUT_SIZE = ACTION_COUNT;

// Total weights: (52*28+28) + (28*14+14) + (14*15+15) = 1484 + 406 + 225 = 2115
static constexpr int TOTAL_BRAIN_WEIGHTS =
    (INPUT_SIZE * HIDDEN1_SIZE + HIDDEN1_SIZE) +
    (HIDDEN1_SIZE * HIDDEN2_SIZE + HIDDEN2_SIZE) +
    (HIDDEN2_SIZE * OUTPUT_SIZE + OUTPUT_SIZE);

// --- Agent ---
struct Agent
{
    int32_t id;
    int16_t x;
    int16_t y;
    float energy;
    float health;
    float maxHealth;
    int32_t age;
    int32_t maxAge;
    int32_t generation;
    int32_t species;
    // Genome: inline brain weights + traits
    float brainWeights[TOTAL_BRAIN_WEIGHTS];
    Traits traits;
    Psychology psychology;
    // Memory (fixed-size ring buffer)
    static constexpr int MAX_MEMORY = 32;
    MemoryEntry memory[MAX_MEMORY];
    int memoryCount;
    // State
    uint8_t alive;
    uint8_t lastAction;
    int32_t kills;
    int32_t offspring;
    int32_t foodEaten;
    int32_t tickBorn;
    int32_t parentId; // -1 = none
    int32_t gestationCooldown;
    // Extended fields
    float morale;
    int32_t alliances[5];
    int8_t allianceCount;
    int16_t shelterX;
    int16_t shelterY;
    float venomStack;
    uint8_t isBurrowed;
    int16_t migrationTargetX; // -1 = none
    int16_t migrationTargetY;
    int32_t communicationCooldown;
    float totalDistanceTraveled;
    // Temporary: pending child index (-1 = none)
    int32_t pendingChildIdx;
};

// --- Species Info ---
struct SpeciesInfo
{
    int32_t id;
    int32_t originTick;
    int32_t population;
    int32_t totalEverLived;
    uint8_t extinct;
    int32_t extinctTick;
    Traits founderTraits;
};

// --- World Config ---
struct WorldConfig
{
    int32_t width = 256;
    int32_t height = 256;
    int32_t initialAgents = 300;
    int32_t initialSpecies = 6;
    float baseTemperature = 15.0f;
    float temperatureVariance = 40.0f;
    float resourceRegrowRate = 0.12f;
    uint8_t weatherEnabled = 1;
    uint8_t mutationEnabled = 1;
    int32_t maxAgents = 200000;
    int32_t ticksPerYear = 365;
    uint32_t seed = 0;
};

static constexpr WorldConfig DEFAULT_CONFIG = {
    256, 256, 300, 6,
    15.0f, 40.0f, 0.12f,
    1, 1,
    200000, 365,
    0 // seed set at runtime
};

// --- PRNG ---
struct SeededRandom
{
    uint32_t state;

    void init(uint32_t seed) { state = seed; }

    float next()
    {
        state = state * 1664525u + 1013904223u;
        return static_cast<float>(state) / 4294967295.0f;
    }

    int nextInt(int mn, int mx)
    {
        return mn + static_cast<int>(next() * (mx - mn + 1));
    }

    float nextFloat(float mn, float mx)
    {
        return mn + next() * (mx - mn);
    }

    float nextGaussian()
    {
        float u1 = next() + 1e-10f;
        float u2 = next();
        return sqrtf(-2.0f * logf(u1)) * cosf(6.283185307f * u2);
    }
};

// --- Direction tables ---
static constexpr int DIRS_8[8][2] = {
    {-1, -1}, {0, -1}, {1, -1}, {-1, 0}, {1, 0}, {-1, 1}, {0, 1}, {1, 1}};
static constexpr int DIRS_4[4][2] = {
    {-1, 0}, {1, 0}, {0, -1}, {0, 1}};
// Seek dirs: dx, dy, action
static constexpr int SEEK_DIRS[4][3] = {
    {0, -1, MoveNorth}, {0, 1, MoveSouth}, {1, 0, MoveEast}, {-1, 0, MoveWest}};
static constexpr int EMPTY_ADJ[8][2] = {
    {0, -1}, {1, 0}, {0, 1}, {-1, 0}, {1, -1}, {-1, -1}, {1, 1}, {-1, 1}};
