#pragma once
#include "types.h"
#include "world.h"
#include "neural_net.h"
#include "spatial_grid.h"
#include <cmath>
#include <cstring>

// --- Species Registry ---
struct SpeciesRegistry
{
    static constexpr int MAX_SPECIES = 64;
    SpeciesInfo species[MAX_SPECIES];
    int count;

    SpeciesRegistry() : count(0) {}

    int registerSpecies(const Traits &traits, int tick)
    {
        if (count >= MAX_SPECIES)
            return count; // safety
        SpeciesInfo &s = species[count];
        s.id = count + 1;
        s.originTick = tick;
        s.founderTraits = traits;
        s.population = 0;
        s.totalEverLived = 0;
        s.extinct = 0;
        s.extinctTick = -1;
        count++;
        return s.id;
    }

    SpeciesInfo *get(int id)
    {
        if (id < 1 || id > count)
            return nullptr;
        return &species[id - 1];
    }

    void updatePopulation(int id, int delta)
    {
        SpeciesInfo *s = get(id);
        if (!s)
            return;
        s->population += delta;
        if (delta > 0)
            s->totalEverLived += delta;
        if (s->population <= 0 && !s->extinct)
        {
            s->extinct = 1;
            s->population = 0;
        }
    }

    void markExtinct(int id, int tick)
    {
        SpeciesInfo *s = get(id);
        if (s && !s->extinct)
        {
            s->extinct = 1;
            s->extinctTick = tick;
        }
    }
};

// --- Trait Generation ---
inline void randomTraits(Traits &t, SeededRandom &rng)
{
    t.speed = rng.nextFloat(0.7f, 1.5f);
    t.size = rng.nextFloat(0.6f, 1.4f);
    t.perceptionRadius = rng.nextFloat(2.0f, 6.0f);
    t.metabolism = rng.nextFloat(0.6f, 1.4f);
    t.reproductionThreshold = rng.nextFloat(0.4f, 0.8f);
    t.mutationRate = rng.nextFloat(0.03f, 0.15f);
    t.aggressionBias = rng.nextFloat(0.1f, 0.7f);
    t.socialBias = rng.nextFloat(0.1f, 0.7f);
    t.heatTolerance = rng.nextFloat(-0.5f, 0.5f);
    t.foodEfficiency = rng.nextFloat(0.7f, 1.3f);
    t.nocturnal = rng.nextFloat(0.0f, 0.5f);
    t.camouflage = rng.nextFloat(0.0f, 0.4f);
    t.packHunting = rng.nextFloat(0.0f, 0.5f);
    t.toolUse = rng.nextFloat(0.0f, 0.3f);
    t.singing = rng.nextFloat(0.0f, 0.4f);
    t.burrowing = rng.nextFloat(0.0f, 0.3f);
    t.venom = rng.nextFloat(0.0f, 0.3f);
    t.regeneration = rng.nextFloat(0.0f, 0.3f);
    t.flight = rng.nextFloat(0.0f, 0.2f);
    t.aquatic = rng.nextFloat(0.0f, 0.3f);
    t.migrationDrive = rng.nextFloat(0.0f, 0.4f);
    t.longevity = rng.nextFloat(0.7f, 1.3f);
    t.immuneStrength = rng.nextFloat(0.2f, 0.8f);
    t.learningRate = rng.nextFloat(0.1f, 0.6f);
}

inline float mutateVal(float val, float mn, float mx, float mutRate, SeededRandom &rng)
{
    if (rng.next() < mutRate)
    {
        val += rng.nextGaussian() * 0.1f;
        if (val < mn)
            val = mn;
        if (val > mx)
            val = mx;
    }
    return val;
}

inline void mutateTraits(const Traits &src, Traits &dst, float mutRate, SeededRandom &rng)
{
    dst.speed = mutateVal(src.speed, 0.3f, 3.0f, mutRate, rng);
    dst.size = mutateVal(src.size, 0.3f, 3.0f, mutRate, rng);
    dst.perceptionRadius = mutateVal(src.perceptionRadius, 1.0f, 10.0f, mutRate, rng);
    dst.metabolism = mutateVal(src.metabolism, 0.3f, 3.0f, mutRate, rng);
    dst.reproductionThreshold = mutateVal(src.reproductionThreshold, 0.2f, 0.95f, mutRate, rng);
    dst.mutationRate = mutateVal(src.mutationRate, 0.005f, 0.5f, mutRate, rng);
    dst.aggressionBias = mutateVal(src.aggressionBias, 0.0f, 1.0f, mutRate, rng);
    dst.socialBias = mutateVal(src.socialBias, 0.0f, 1.0f, mutRate, rng);
    dst.heatTolerance = mutateVal(src.heatTolerance, -1.0f, 1.0f, mutRate, rng);
    dst.foodEfficiency = mutateVal(src.foodEfficiency, 0.3f, 3.0f, mutRate, rng);
    dst.nocturnal = mutateVal(src.nocturnal, 0.0f, 1.0f, mutRate, rng);
    dst.camouflage = mutateVal(src.camouflage, 0.0f, 1.0f, mutRate, rng);
    dst.packHunting = mutateVal(src.packHunting, 0.0f, 1.0f, mutRate, rng);
    dst.toolUse = mutateVal(src.toolUse, 0.0f, 1.0f, mutRate, rng);
    dst.singing = mutateVal(src.singing, 0.0f, 1.0f, mutRate, rng);
    dst.burrowing = mutateVal(src.burrowing, 0.0f, 1.0f, mutRate, rng);
    dst.venom = mutateVal(src.venom, 0.0f, 1.0f, mutRate, rng);
    dst.regeneration = mutateVal(src.regeneration, 0.0f, 1.0f, mutRate, rng);
    dst.flight = mutateVal(src.flight, 0.0f, 1.0f, mutRate, rng);
    dst.aquatic = mutateVal(src.aquatic, 0.0f, 1.0f, mutRate, rng);
    dst.migrationDrive = mutateVal(src.migrationDrive, 0.0f, 1.0f, mutRate, rng);
    dst.longevity = mutateVal(src.longevity, 0.3f, 3.0f, mutRate, rng);
    dst.immuneStrength = mutateVal(src.immuneStrength, 0.0f, 1.0f, mutRate, rng);
    dst.learningRate = mutateVal(src.learningRate, 0.0f, 1.0f, mutRate, rng);
}

// --- Agent Creation ---
static int g_nextAgentId = 1;

inline void resetAgentIds() { g_nextAgentId = 1; }

inline void initAgent(Agent &a, int x, int y, int species, const Traits &traits,
                      const float *brainWeights, int tick, int generation, int parentId)
{
    a.id = g_nextAgentId++;
    a.x = (int16_t)x;
    a.y = (int16_t)y;
    a.species = species;
    a.energy = 50.0f + traits.size * 20.0f;
    a.health = 100.0f;
    a.maxHealth = 80.0f + traits.size * 40.0f;
    a.age = 0;
    a.maxAge = (int)((200.0f + traits.size * 100.0f + (1.0f / traits.metabolism) * 50.0f) * traits.longevity);
    a.generation = generation;
    a.traits = traits;
    memcpy(a.brainWeights, brainWeights, TOTAL_BRAIN_WEIGHTS * sizeof(float));
    a.psychology = {0.1f, traits.aggressionBias * 0.5f, 0.5f, traits.socialBias * 0.5f,
                    0.3f, 0.2f, 0.0f, 0.3f, 0.5f};
    a.memoryCount = 0;
    a.alive = 1;
    a.lastAction = Stay;
    a.kills = 0;
    a.offspring = 0;
    a.foodEaten = 0;
    a.tickBorn = tick;
    a.parentId = parentId;
    a.gestationCooldown = 0;
    a.morale = 0.5f;
    a.allianceCount = 0;
    for (int i = 0; i < 5; i++)
        a.alliances[i] = -1;
    a.shelterX = -1;
    a.shelterY = -1;
    a.venomStack = 0.0f;
    a.isBurrowed = 0;
    a.migrationTargetX = -1;
    a.migrationTargetY = -1;
    a.communicationCooldown = 0;
    a.totalDistanceTraveled = 0.0f;
    a.pendingChildIdx = -1;
}

inline void createRandomAgent(Agent &a, World &world, int species, const Traits &traits,
                              int tick, SeededRandom &rng)
{
    int x, y, attempts = 0;
    do
    {
        x = rng.nextInt(0, world.width - 1);
        y = rng.nextInt(0, world.height - 1);
        attempts++;
    } while (!world.isPassable(x, y) && attempts < 1000);
    if (attempts >= 1000)
    {
        x = world.width / 2;
        y = world.height / 2;
    }

    float tempWeights[TOTAL_BRAIN_WEIGHTS];
    NeuralNet::initializeRandom(tempWeights, rng);
    initAgent(a, x, y, species, traits, tempWeights, tick, 0, -1);
}

// --- Memory ---
inline void addMemory(Agent &a, uint8_t type, int x, int y, float intensity)
{
    if (a.memoryCount < Agent::MAX_MEMORY)
    {
        MemoryEntry &m = a.memory[a.memoryCount++];
        m.tick = 0;
        m.type = type;
        m.x = (int16_t)x;
        m.y = (int16_t)y;
        m.intensity = intensity;
    }
    else
    {
        // Overwrite oldest
        memmove(&a.memory[0], &a.memory[1], (Agent::MAX_MEMORY - 1) * sizeof(MemoryEntry));
        MemoryEntry &m = a.memory[Agent::MAX_MEMORY - 1];
        m.tick = 0;
        m.type = type;
        m.x = (int16_t)x;
        m.y = (int16_t)y;
        m.intensity = intensity;
    }
}

// --- Input Vector ---
static float g_inputBuffer[INPUT_SIZE];

inline float *buildInputVector(const Agent &agent, const World &world,
                               const Agent **nearbyAgents, int nearbyCount)
{
    float *input = g_inputBuffer;
    memset(input, 0, INPUT_SIZE * sizeof(float));
    int idx = 0;

    input[idx++] = agent.energy / 100.0f;
    input[idx++] = agent.health / agent.maxHealth;
    input[idx++] = (float)agent.age / (float)agent.maxAge;
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

    const Tile &tile = world.tileAt(agent.x, agent.y);
    for (int t = 0; t < 7; t++)
        input[idx++] = (tile.terrain == t) ? 1.0f : 0.0f;
    input[idx++] = tile.foodResource / 100.0f;
    input[idx++] = tile.waterResource / 100.0f;
    input[idx++] = (tile.temperature + 50.0f) / 110.0f;
    input[idx++] = tile.hazard;

    float avgFood = 0, avgHazard = 0;
    int bestDir = 0;
    float bestFood = -1;
    int count = 0;
    for (int d = 0; d < 8; d++)
    {
        int nx = agent.x + DIRS_8[d][0];
        int ny = agent.y + DIRS_8[d][1];
        if (world.isValid(nx, ny))
        {
            const Tile &t = world.tileAt(nx, ny);
            avgFood += t.foodResource;
            avgHazard += t.hazard;
            if (t.foodResource > bestFood)
            {
                bestFood = t.foodResource;
                bestDir = d;
            }
            count++;
        }
    }
    input[idx++] = count > 0 ? avgFood / (float)count / 100.0f : 0.0f;
    input[idx++] = count > 0 ? avgHazard / (float)count : 0.0f;
    input[idx++] = (float)bestDir / 8.0f;

    float pr = fmaxf(1.0f, agent.traits.perceptionRadius);
    // Nearest 3 agents
    const Agent *c0 = nullptr;
    float d0 = 1e9f;
    const Agent *c1 = nullptr;
    float d1 = 1e9f;
    const Agent *c2 = nullptr;
    float d2 = 1e9f;
    for (int ni = 0; ni < nearbyCount; ni++)
    {
        const Agent *na = nearbyAgents[ni];
        if (na->id == agent.id || !na->alive)
            continue;
        float d = (float)(abs(na->x - agent.x) + abs(na->y - agent.y));
        if (d < d0)
        {
            c2 = c1;
            d2 = d1;
            c1 = c0;
            d1 = d0;
            c0 = na;
            d0 = d;
        }
        else if (d < d1)
        {
            c2 = c1;
            d2 = d1;
            c1 = na;
            d1 = d;
        }
        else if (d < d2)
        {
            c2 = na;
            d2 = d;
        }
    }
    auto encodeNearest = [&](const Agent *c)
    {
        if (c)
        {
            input[idx++] = (float)(c->x - agent.x) / pr;
            input[idx++] = (float)(c->y - agent.y) / pr;
            input[idx++] = (c->species == agent.species) ? 1.0f : -1.0f;
            input[idx++] = (c->energy - agent.energy) / 100.0f;
        }
        else
        {
            idx += 4;
        }
    };
    encodeNearest(c0);
    encodeNearest(c1);
    encodeNearest(c2);

    float foodDx = 0, foodDy = 0, dangerDx = 0, dangerDy = 0;
    int foodCount2 = 0, dangerCount2 = 0;
    for (int mi = 0; mi < agent.memoryCount; mi++)
    {
        const MemoryEntry &mem = agent.memory[mi];
        if (mem.type == MEM_FOOD)
        {
            foodDx += mem.x - agent.x;
            foodDy += mem.y - agent.y;
            foodCount2++;
        }
        else if (mem.type == MEM_DANGER)
        {
            dangerDx += mem.x - agent.x;
            dangerDy += mem.y - agent.y;
            dangerCount2++;
        }
    }
    input[idx++] = foodCount2 > 0 ? foodDx / (float)foodCount2 / pr : 0.0f;
    input[idx++] = foodCount2 > 0 ? foodDy / (float)foodCount2 / pr : 0.0f;
    input[idx++] = dangerCount2 > 0 ? dangerDx / (float)dangerCount2 / pr : 0.0f;
    input[idx++] = dangerCount2 > 0 ? dangerDy / (float)dangerCount2 / pr : 0.0f;

    // New trait signals
    const Traits &t = agent.traits;
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
    input[idx++] = (float)agent.allianceCount / 5.0f;
    input[idx++] = agent.isBurrowed ? 1.0f : 0.0f;

    return input;
}

// --- Decision helpers ---
inline const Agent *findNearestPrey(const Agent &agent, const Agent **nearby, int count)
{
    const Agent *closest = nullptr;
    float closestDist = 1e9f;
    for (int i = 0; i < count; i++)
    {
        const Agent *o = nearby[i];
        if (o->species != agent.species && o->alive)
        {
            float d = (float)(abs(o->x - agent.x) + abs(o->y - agent.y));
            if (d < closestDist)
            {
                closestDist = d;
                closest = o;
            }
        }
    }
    return closest;
}

inline uint8_t chaseTarget(const Agent &agent, const Agent *target)
{
    int dx = target->x - agent.x;
    int dy = target->y - agent.y;
    if (abs(dx) >= abs(dy))
        return dx > 0 ? MoveEast : MoveWest;
    return dy > 0 ? MoveSouth : MoveNorth;
}

inline uint8_t seekTerrain(const Agent &agent, const World &world, bool seekWater)
{
    float bestVal = -1.0f;
    uint8_t bestAct = Stay;
    for (int d = 0; d < 4; d++)
    {
        int nx = agent.x + SEEK_DIRS[d][0];
        int ny = agent.y + SEEK_DIRS[d][1];
        if (!world.isValid(nx, ny))
            continue;
        const Tile &t = world.tileAt(nx, ny);
        float v = seekWater ? t.waterResource : t.foodResource;
        if (v > bestVal)
        {
            bestVal = v;
            bestAct = (uint8_t)SEEK_DIRS[d][2];
        }
    }
    if (bestVal <= 0.0f)
    {
        uint8_t memType = seekWater ? MEM_WATER : MEM_FOOD;
        for (int mi = 0; mi < agent.memoryCount; mi++)
        {
            if (agent.memory[mi].type == memType)
            {
                int dx = agent.memory[mi].x - agent.x;
                int dy = agent.memory[mi].y - agent.y;
                if (abs(dx) >= abs(dy))
                    return dx > 0 ? MoveEast : MoveWest;
                return dy > 0 ? MoveSouth : MoveNorth;
            }
        }
        return SEEK_DIRS[(agent.age + agent.id) & 3][2];
    }
    return bestAct;
}

inline bool findEmptyAdjacent(int x, int y, const World &world, int &outX, int &outY)
{
    for (int d = 0; d < 8; d++)
    {
        int nx = x + EMPTY_ADJ[d][0];
        int ny = y + EMPTY_ADJ[d][1];
        if (world.isPassable(nx, ny))
        {
            outX = nx;
            outY = ny;
            return true;
        }
    }
    return false;
}

// --- Decide Action ---
static NeuralNet g_brain; // shared buffer for forward pass

inline uint8_t decideAction(Agent &agent, const World &world,
                            const Agent **nearbyAgents, int nearbyCount)
{
    const Traits &traits = agent.traits;
    const Psychology &psy = agent.psychology;
    bool isPredator = traits.aggressionBias > 0.6f;
    const Tile &tile = world.tileAt(agent.x, agent.y);

    // PRIORITY 1: Flee if about to die
    if (agent.health < 20.0f && psy.fear > 0.5f)
    {
        if (traits.burrowing > 0.5f && !agent.isBurrowed)
        {
            agent.isBurrowed = 1;
            return Rest;
        }
        return Flee;
    }
    if (agent.isBurrowed && psy.fear < 0.3f)
        agent.isBurrowed = 0;

    // PRIORITY 2: Critical thirst
    if (psy.thirst > 0.75f)
    {
        if (tile.waterResource > 8.0f)
            return Drink;
        return seekTerrain(agent, world, true);
    }

    // PRIORITY 3: Critical hunger
    if (psy.hunger > 0.75f || agent.energy < 25.0f)
    {
        if (isPredator)
        {
            const Agent *prey = findNearestPrey(agent, nearbyAgents, nearbyCount);
            if (prey)
            {
                float d = (float)(abs(prey->x - agent.x) + abs(prey->y - agent.y));
                if (d <= 1.0f)
                    return Attack;
                return chaseTarget(agent, prey);
            }
        }
        if (tile.foodResource > 5.0f)
            return Eat;
        return seekTerrain(agent, world, false);
    }

    // PRIORITY 4: Hunting (not starving)
    if (isPredator && agent.energy < 75.0f)
    {
        const Agent *prey = findNearestPrey(agent, nearbyAgents, nearbyCount);
        if (prey)
        {
            float d = (float)(abs(prey->x - agent.x) + abs(prey->y - agent.y));
            if (d <= 1.0f)
                return Attack;
            return chaseTarget(agent, prey);
        }
    }

    // PRIORITY 5: Territory defense
    if (traits.aggressionBias > 0.4f)
    {
        for (int i = 0; i < nearbyCount; i++)
        {
            const Agent *other = nearbyAgents[i];
            if (other->species != agent.species && other->alive)
            {
                float d = (float)(abs(other->x - agent.x) + abs(other->y - agent.y));
                if (d <= 1.0f)
                {
                    int tIdx = agent.y * world.width + agent.x;
                    bool isMyTerritory = world.territoryOwner[tIdx] == agent.species;
                    float aggrChance = isMyTerritory
                                           ? traits.aggressionBias * 0.7f
                                           : traits.aggressionBias * 0.3f;
                    uint32_t hash = (uint32_t)(agent.id * 2654435761u + agent.age * 340573321u);
                    float h = (float)hash / 4294967295.0f;
                    if (h < aggrChance)
                        return Attack;
                }
            }
        }
    }

    // PRIORITY 6: Moderate thirst
    if (psy.thirst > 0.45f && tile.waterResource > 8.0f)
        return Drink;

    // PRIORITY 7: Moderate hunger
    if (psy.hunger > 0.45f && tile.foodResource > 5.0f)
        return Eat;

    // PRIORITY 8: Rest when exhausted
    if (psy.fatigue > 0.7f || agent.health < agent.maxHealth * 0.4f)
        return Rest;

    // PRIORITY 9: Reproduce
    float reproThreshold = fminf(90.0f, isPredator
                                            ? traits.reproductionThreshold * 60.0f
                                            : traits.reproductionThreshold * 100.0f);
    if (agent.energy >= reproThreshold && agent.health > agent.maxHealth * 0.5f && psy.hunger < 0.4f && psy.thirst < 0.4f)
    {
        int localPop = 0;
        for (int i = 0; i < nearbyCount; i++)
        {
            if (nearbyAgents[i]->species == agent.species)
                localPop++;
        }
        float localFood = tile.foodResource + tile.waterResource;
        if (localPop < 8 && localFood > 20.0f)
            return Reproduce;
    }

    // PRIORITY 10: Communicate
    if (traits.socialBias > 0.5f && psy.loneliness > 0.5f && agent.communicationCooldown <= 0)
    {
        for (int i = 0; i < nearbyCount; i++)
        {
            if (nearbyAgents[i]->species == agent.species)
                return Communicate;
        }
    }

    // PRIORITY 11: Migration
    if (traits.migrationDrive > 0.5f && (agent.migrationTargetX >= 0 || psy.curiosity > 0.6f))
        return Migrate;

    // PRIORITY 12: Forage
    if (traits.toolUse > 0.3f && psy.hunger > 0.3f && tile.foodResource > 3.0f)
        return Forage;

    // PRIORITY 13: Build shelter
    if (traits.toolUse > 0.4f && agent.shelterX < 0 && agent.energy > 50.0f && tile.terrain >= Sand && tile.terrain <= Forest)
        return Build;

    // PRIORITY 14: Pack hunting
    if (traits.packHunting > 0.4f && isPredator)
    {
        int allyCount = 0;
        for (int i = 0; i < nearbyCount; i++)
        {
            if (nearbyAgents[i]->species == agent.species)
                allyCount++;
        }
        if (allyCount >= 2)
        {
            const Agent *prey = findNearestPrey(agent, nearbyAgents, nearbyCount);
            if (prey)
            {
                float d = (float)(abs(prey->x - agent.x) + abs(prey->y - agent.y));
                if (d <= 1.0f)
                    return Attack;
                return chaseTarget(agent, prey);
            }
        }
    }

    // FALLBACK: Neural net
    float *input = buildInputVector(agent, world, nearbyAgents, nearbyCount);
    g_brain.forward(agent.brainWeights, input);

    uint32_t r_raw = (uint32_t)(agent.id * 374761393u + agent.age * 668265263u);
    float r = (float)r_raw / 4294967295.0f;
    for (int i = 0; i < ACTION_COUNT; i++)
    {
        r -= g_brain.outputBuf[i];
        if (r <= 0.0f)
            return (uint8_t)i;
    }
    return Stay;
}

// --- Execute Action ---
inline void executeAction(Agent &agent, uint8_t action, World &world,
                          Agent *agents, int agentCount, SpatialGrid &grid)
{
    agent.lastAction = action;
    const Traits &traits = agent.traits;
    bool isPredator = traits.aggressionBias > 0.6f;

    switch (action)
    {
    case MoveNorth:
    case MoveSouth:
    case MoveEast:
    case MoveWest:
    {
        int dx = (action == MoveEast) ? 1 : (action == MoveWest) ? -1
                                                                 : 0;
        int dy = (action == MoveSouth) ? 1 : (action == MoveNorth) ? -1
                                                                   : 0;
        int nx = agent.x + dx;
        int ny = agent.y + dy;
        bool canMove = world.isPassable(nx, ny) || (traits.aquatic > 0.5f && world.isValid(nx, ny) && world.tileAt(nx, ny).terrain <= ShallowWater) || (traits.flight > 0.5f && world.isValid(nx, ny) && world.tileAt(nx, ny).terrain != DeepWater);
        if (canMove)
        {
            const Tile &tile = world.tileAt(nx, ny);
            int tileIdx = world.tileIndex(agent.x, agent.y);
            float windFactor = 1.0f - (world.windX[tileIdx] * dx + world.windY[tileIdx] * dy) * 0.5f;
            float predatorBonus = isPredator ? 0.55f : 1.0f;
            float flightDiscount = traits.flight > 0.3f ? (1.0f - traits.flight * 0.4f) : 1.0f;
            float moveCost = TERRAIN_MOVEMENT_COST[tile.terrain] * traits.size / traits.speed * fmaxf(0.5f, windFactor) * predatorBonus * flightDiscount;
            if (agent.energy >= moveCost)
            {
                agent.x = (int16_t)nx;
                agent.y = (int16_t)ny;
                agent.energy -= moveCost;
                agent.psychology.curiosity = fmaxf(0.0f, agent.psychology.curiosity - 0.01f);
                if (tile.foodResource > 30.0f)
                    addMemory(agent, MEM_FOOD, nx, ny, tile.foodResource / 100.0f);
                if (tile.waterResource > 30.0f)
                    addMemory(agent, MEM_WATER, nx, ny, tile.waterResource / 100.0f);
            }
        }
        break;
    }

    case Eat:
    {
        Tile &tile = world.tileAt(agent.x, agent.y);
        float eatAmt = fminf(tile.foodResource, 10.0f * traits.foodEfficiency);
        if (eatAmt > 0.0f)
        {
            tile.foodResource -= eatAmt;
            agent.energy = fminf(100.0f, agent.energy + eatAmt * traits.foodEfficiency);
            agent.psychology.hunger = fmaxf(0.0f, agent.psychology.hunger - 0.2f);
            agent.foodEaten++;
            addMemory(agent, MEM_FOOD, agent.x, agent.y, eatAmt / 10.0f);
        }
        break;
    }

    case Reproduce:
    {
        if (agent.age < agent.maxAge * 0.15f)
            break;
        if (agent.gestationCooldown > 0)
            break;
        float threshold = fminf(95.0f, isPredator
                                           ? traits.reproductionThreshold * 80.0f
                                           : traits.reproductionThreshold * 120.0f);
        if (agent.energy >= threshold)
        {
            int mateIdx = -1;
            int gIdx = grid.firstAt(agent.x, agent.y);
            while (gIdx >= 0)
            {
                Agent &a = agents[gIdx];
                if (a.id != agent.id && a.alive && a.species == agent.species && a.energy >= a.traits.reproductionThreshold * 60.0f && a.gestationCooldown <= 0)
                {
                    mateIdx = gIdx;
                    break;
                }
                gIdx = grid.next(gIdx);
            }

            int spawnX, spawnY;
            if (findEmptyAdjacent(agent.x, agent.y, world, spawnX, spawnY))
            {
                float birthCost = isPredator ? 35.0f : 50.0f;

                // Prepare child genome
                float childWeights[TOTAL_BRAIN_WEIGHTS];
                Traits childTraits;
                if (mateIdx >= 0)
                {
                    Agent &mate = agents[mateIdx];
                    NeuralNet::crossover(agent.brainWeights, mate.brainWeights, childWeights,
                                         TOTAL_BRAIN_WEIGHTS, world.rng);
                    float tempW[TOTAL_BRAIN_WEIGHTS];
                    NeuralNet::mutate(childWeights, tempW, TOTAL_BRAIN_WEIGHTS,
                                      traits.mutationRate, 0.2f, world.rng);
                    memcpy(childWeights, tempW, TOTAL_BRAIN_WEIGHTS * sizeof(float));

                    // Crossover traits
                    const float *t1 = reinterpret_cast<const float *>(&agent.traits);
                    const float *t2 = reinterpret_cast<const float *>(&mate.traits);
                    float *ct = reinterpret_cast<float *>(&childTraits);
                    for (int i = 0; i < TRAIT_COUNT; i++)
                    {
                        ct[i] = world.rng.next() < 0.5f ? t1[i] : t2[i];
                    }
                    Traits mutT;
                    mutateTraits(childTraits, mutT, traits.mutationRate, world.rng);
                    childTraits = mutT;

                    mate.energy -= birthCost * 0.4f;
                    mate.offspring++;
                    mate.gestationCooldown = 20 + (int)(mate.traits.size * 15.0f);
                }
                else
                {
                    NeuralNet::mutate(agent.brainWeights, childWeights, TOTAL_BRAIN_WEIGHTS,
                                      traits.mutationRate, 0.3f, world.rng);
                    mutateTraits(agent.traits, childTraits, traits.mutationRate, world.rng);
                }

                // Store pending child index — will be finalized in simulation loop
                // We signal by setting pendingChildIdx to a magic value and storing data
                // Actually, we create the child directly in a temp buffer
                agent.pendingChildIdx = agentCount; // placeholder; simulation handles it
                agent.energy -= birthCost;
                agent.offspring++;
                agent.gestationCooldown = 30 + (int)(traits.size * 25.0f);

                // The simulation will read this and create the child
                // Store child data in a side buffer (see simulation.h)
            }
        }
        break;
    }

    case Attack:
    {
        int targetIdx = -1;
        int gIdx = grid.firstAt(agent.x, agent.y);
        while (gIdx >= 0)
        {
            Agent &a = agents[gIdx];
            if (a.id != agent.id && a.alive)
            {
                if (a.species != agent.species || traits.aggressionBias > 0.8f)
                {
                    targetIdx = gIdx;
                    break;
                }
            }
            gIdx = grid.next(gIdx);
        }
        if (targetIdx < 0)
        {
            for (int d = 0; d < 4; d++)
            {
                int gIdx2 = grid.firstAt(agent.x + DIRS_4[d][0], agent.y + DIRS_4[d][1]);
                while (gIdx2 >= 0)
                {
                    if (agents[gIdx2].alive && agents[gIdx2].species != agent.species)
                    {
                        targetIdx = gIdx2;
                        break;
                    }
                    gIdx2 = grid.next(gIdx2);
                }
                if (targetIdx >= 0)
                    break;
            }
        }
        if (targetIdx >= 0)
        {
            Agent &target = agents[targetIdx];
            // Pack bonus
            float packBonus = 1.0f;
            if (traits.packHunting > 0.3f)
            {
                int allyCount = 0;
                int gp = grid.firstAt(agent.x, agent.y);
                while (gp >= 0)
                {
                    if (agents[gp].id != agent.id && agents[gp].alive && agents[gp].species == agent.species)
                        allyCount++;
                    gp = grid.next(gp);
                }
                packBonus = 1.0f + allyCount * traits.packHunting * 0.3f;
            }
            // Camouflage evasion
            float evadeChance = target.traits.camouflage * 0.4f;
            uint32_t hitHash = (uint32_t)(agent.id * 2654435761u + agent.age * 340573321u);
            float h = (float)hitHash / 4294967295.0f;
            if (h < evadeChance)
            {
                agent.energy -= 1.5f;
                break;
            }

            float damage = 20.0f * traits.size * (0.5f + traits.aggressionBias * 0.8f) * packBonus;
            target.health -= damage;
            if (traits.venom > 0.2f)
                target.venomStack = fminf(3.0f, target.venomStack + traits.venom);
            target.psychology.fear = fminf(1.0f, target.psychology.fear + 0.3f);
            agent.energy -= 1.5f;
            agent.psychology.aggression = fminf(1.0f, agent.psychology.aggression + 0.05f);
            addMemory(target, MEM_DANGER, agent.x, agent.y, damage / 20.0f);
            if (target.health <= 0.0f)
            {
                target.alive = 0;
                agent.kills++;
                agent.energy = fminf(100.0f, agent.energy + target.energy * 0.7f + 20.0f);
                agent.health = fminf(agent.maxHealth, agent.health + 8.0f);
                addMemory(agent, MEM_FOOD, target.x, target.y, 0.9f);
            }
        }
        break;
    }

    case Rest:
        agent.energy = fminf(100.0f, agent.energy + 2.0f);
        agent.health = fminf(agent.maxHealth, agent.health + 1.0f);
        agent.psychology.fatigue = fmaxf(0.0f, agent.psychology.fatigue - 0.1f);
        break;

    case Drink:
    {
        Tile &tile = world.tileAt(agent.x, agent.y);
        float drinkAmt = fminf(tile.waterResource, 12.0f);
        if (drinkAmt > 2.0f)
        {
            tile.waterResource -= drinkAmt;
            agent.psychology.thirst = fmaxf(0.0f, agent.psychology.thirst - 0.35f);
            agent.energy = fminf(100.0f, agent.energy + drinkAmt * 0.15f);
            agent.health = fminf(agent.maxHealth, agent.health + 0.5f);
            addMemory(agent, MEM_WATER, agent.x, agent.y, drinkAmt / 12.0f);
        }
        break;
    }

    case Flee:
    {
        int threatDx = 0, threatDy = 0;
        int gf = grid.firstAt(agent.x, agent.y);
        while (gf >= 0)
        {
            Agent &a = agents[gf];
            if (a.id != agent.id && a.alive && a.species != agent.species)
            {
                threatDx += agent.x - a.x;
                threatDy += agent.y - a.y;
            }
            gf = grid.next(gf);
        }
        for (int d = 0; d < 4; d++)
        {
            int g2 = grid.firstAt(agent.x + DIRS_4[d][0], agent.y + DIRS_4[d][1]);
            while (g2 >= 0)
            {
                if (agents[g2].alive && agents[g2].species != agent.species)
                {
                    threatDx += agent.x - agents[g2].x;
                    threatDy += agent.y - agents[g2].y;
                }
                g2 = grid.next(g2);
            }
        }
        int fleeSteps = traits.flight > 0.5f ? 2 : 1;
        for (int s = 0; s < fleeSteps; s++)
        {
            int nx, ny;
            if (abs(threatDx) >= abs(threatDy))
            {
                nx = agent.x + (threatDx > 0 ? 1 : -1);
                ny = agent.y;
            }
            else
            {
                nx = agent.x;
                ny = agent.y + (threatDy > 0 ? 1 : -1);
            }
            if (world.isPassable(nx, ny))
            {
                agent.x = (int16_t)nx;
                agent.y = (int16_t)ny;
                agent.totalDistanceTraveled++;
            }
        }
        agent.energy -= 1.5f;
        agent.psychology.fear = fminf(1.0f, agent.psychology.fear + 0.1f);
        break;
    }

    case Build:
        if (traits.toolUse > 0.2f)
        {
            Tile &tile = world.tileAt(agent.x, agent.y);
            if (tile.terrain >= Sand && tile.terrain <= Forest)
            {
                agent.shelterX = agent.x;
                agent.shelterY = agent.y;
                agent.energy -= 3.0f;
                agent.psychology.satisfaction = fminf(1.0f, agent.psychology.satisfaction + 0.15f);
                world.claimTerritory(agent.x, agent.y, agent.species);
                world.claimTerritory(agent.x, agent.y, agent.species);
            }
        }
        break;

    case Communicate:
    {
        if (agent.communicationCooldown > 0)
            break;
        int socialRadius = (int)ceilf(traits.singing > 0.3f
                                          ? traits.perceptionRadius * 1.5f
                                          : traits.perceptionRadius);
        for (int dy = -socialRadius; dy <= socialRadius; dy++)
        {
            for (int dx = -socialRadius; dx <= socialRadius; dx++)
            {
                int gi = grid.firstAt(agent.x + dx, agent.y + dy);
                while (gi >= 0)
                {
                    Agent &other = agents[gi];
                    if (other.alive && other.id != agent.id && other.species == agent.species)
                    {
                        int d = abs(other.x - agent.x) + abs(other.y - agent.y);
                        if (d <= socialRadius)
                        {
                            // Form alliance
                            if (agent.allianceCount < 5)
                            {
                                bool found = false;
                                for (int i = 0; i < agent.allianceCount; i++)
                                    if (agent.alliances[i] == other.id)
                                    {
                                        found = true;
                                        break;
                                    }
                                if (!found)
                                    agent.alliances[agent.allianceCount++] = other.id;
                            }
                            if (other.allianceCount < 5)
                            {
                                bool found = false;
                                for (int i = 0; i < other.allianceCount; i++)
                                    if (other.alliances[i] == agent.id)
                                    {
                                        found = true;
                                        break;
                                    }
                                if (!found)
                                    other.alliances[other.allianceCount++] = agent.id;
                            }
                            // Share food memories
                            for (int mi = 0; mi < agent.memoryCount; mi++)
                            {
                                if (agent.memory[mi].type == MEM_FOOD && other.memoryCount < Agent::MAX_MEMORY)
                                {
                                    other.memory[other.memoryCount++] = agent.memory[mi];
                                }
                            }
                            other.psychology.socialBonding = fminf(1.0f, other.psychology.socialBonding + 0.1f);
                            other.psychology.loneliness = fmaxf(0.0f, other.psychology.loneliness - 0.15f);
                        }
                    }
                    gi = grid.next(gi);
                }
            }
        }
        agent.psychology.loneliness = fmaxf(0.0f, agent.psychology.loneliness - 0.2f);
        agent.psychology.socialBonding = fminf(1.0f, agent.psychology.socialBonding + 0.1f);
        agent.communicationCooldown = 5;
        agent.energy -= 0.5f;
        break;
    }

    case Forage:
    {
        Tile &tile = world.tileAt(agent.x, agent.y);
        float bonus = 1.0f + traits.toolUse * 1.5f;
        float eatAmt = fminf(tile.foodResource, 8.0f * traits.foodEfficiency * bonus);
        if (eatAmt > 0.0f)
        {
            tile.foodResource -= eatAmt;
            agent.energy = fminf(100.0f, agent.energy + eatAmt * traits.foodEfficiency * bonus);
            agent.psychology.hunger = fmaxf(0.0f, agent.psychology.hunger - 0.25f);
            agent.foodEaten++;
            addMemory(agent, MEM_FOOD, agent.x, agent.y, eatAmt / 10.0f);
            agent.psychology.satisfaction = fminf(1.0f, agent.psychology.satisfaction + 0.05f);
        }
        for (int d = 0; d < 4; d++)
        {
            int nx = agent.x + DIRS_4[d][0], ny = agent.y + DIRS_4[d][1];
            if (!world.isValid(nx, ny))
                continue;
            Tile &adj = world.tileAt(nx, ny);
            if (adj.foodResource > 15.0f && traits.toolUse > 0.3f)
            {
                float adjAmt = fminf(adj.foodResource * 0.3f, 5.0f);
                adj.foodResource -= adjAmt;
                agent.energy = fminf(100.0f, agent.energy + adjAmt * traits.foodEfficiency);
            }
        }
        break;
    }

    case Migrate:
    {
        if (agent.migrationTargetX < 0)
        {
            uint32_t hash = (uint32_t)(agent.id * 2654435761u + agent.species * 340573321u);
            float h = (float)hash / 4294967295.0f;
            agent.migrationTargetX = (int16_t)(h * world.width);
            agent.migrationTargetY = (int16_t)(fmodf(h * 1.618f, 1.0f) * world.height);
        }
        int mdx = agent.migrationTargetX - agent.x;
        int mdy = agent.migrationTargetY - agent.y;
        int dist = abs(mdx) + abs(mdy);
        if (dist <= 3)
        {
            agent.migrationTargetX = -1;
            agent.migrationTargetY = -1;
            agent.psychology.satisfaction = fminf(1.0f, agent.psychology.satisfaction + 0.2f);
        }
        else
        {
            int steps = traits.flight > 0.5f ? 2 : 1;
            for (int s = 0; s < steps; s++)
            {
                int nx, ny;
                if (abs(mdx) >= abs(mdy))
                {
                    nx = agent.x + (mdx > 0 ? 1 : -1);
                    ny = agent.y;
                }
                else
                {
                    nx = agent.x;
                    ny = agent.y + (mdy > 0 ? 1 : -1);
                }
                if (world.isPassable(nx, ny) || (traits.aquatic > 0.5f && world.isValid(nx, ny)))
                {
                    agent.x = (int16_t)nx;
                    agent.y = (int16_t)ny;
                    agent.totalDistanceTraveled++;
                }
            }
            agent.energy -= 0.8f;
        }
        break;
    }

    default: // Stay
        if (traits.regeneration > 0.2f)
            agent.health = fminf(agent.maxHealth, agent.health + traits.regeneration * 0.5f);
        break;
    }

    // Post-action processing
    if (agent.venomStack > 0.0f)
    {
        agent.health -= agent.venomStack * 0.5f;
        agent.venomStack = fmaxf(0.0f, agent.venomStack - 0.2f);
    }
    if (traits.regeneration > 0.2f && action != Stay)
        agent.health = fminf(agent.maxHealth, agent.health + traits.regeneration * 0.3f);
    if (action <= MoveWest)
        agent.totalDistanceTraveled++;
    if (agent.communicationCooldown > 0)
        agent.communicationCooldown--;

    // Morale
    agent.morale = fmaxf(0.0f, fminf(1.0f,
                                     0.5f + (1.0f - agent.psychology.hunger) * 0.15f + (1.0f - agent.psychology.thirst) * 0.15f + (1.0f - agent.psychology.fear) * 0.1f + agent.psychology.satisfaction * 0.1f - agent.psychology.loneliness * 0.1f + (agent.health / agent.maxHealth) * 0.1f));
}

// --- Temperature Stress ---
inline void applyTemperatureStress(Agent &agent, const Tile &tile)
{
    float tolerance = agent.traits.heatTolerance;
    float preferred = 15.0f + tolerance * 20.0f;
    float diff = fabsf(tile.temperature - preferred);
    if (diff > 15.0f)
    {
        float stress = (diff - 15.0f) / 30.0f;
        agent.health -= stress * 0.5f;
        agent.energy -= stress * 0.3f;
    }
}
