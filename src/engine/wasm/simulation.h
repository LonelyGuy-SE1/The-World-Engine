#pragma once
#include "types.h"
#include "world.h"
#include "agent.h"
#include "spatial_grid.h"
#include "neural_net.h"
#include <cstring>
#include <cstdlib>
#include <cmath>

struct PendingChild
{
    int parentIdx;
    int spawnX, spawnY;
    int species;
    Traits traits;
    float brainWeights[TOTAL_BRAIN_WEIGHTS];
    int generation;
    int parentId;
};

struct SimulationStats
{
    int tick;
    int year;
    int totalAgents;
    int totalSpecies;
    float averageEnergy;
    float averageAge;
    int totalBirths;
    int totalDeaths;
    float averageTemperature;
    float totalFood;
    int extinctions;
    int speciesPopulations[64]; // indexed by speciesId-1
};

// Intervention types matching TS
enum InterventionType
{
    IT_TemperatureShift = 0,
    IT_ResourceMultiplier,
    IT_IntroducePredator,
    IT_RemoveSpecies,
    IT_MutationRateChange,
    IT_AddHazard,
    IT_SpawnCustomAgent,
    IT_ClimateEvent
};

struct Intervention
{
    int type;
    float amount;
    float multiplier;
    int speciesId;
    int count;
    int x, y, radius;
    float intensity;
    int eventType; // 0=ice_age, 1=heat_wave, 2=flood
};

class SimulationEngine
{
public:
    static constexpr int MAX_AGENTS = 50000;
    static constexpr int MAX_PENDING_CHILDREN = 2000;
    static constexpr int STATS_RING_SIZE = 4000;

    World world;
    Agent agents[MAX_AGENTS];
    int agentCount;
    SpatialGrid grid;
    SpeciesRegistry speciesRegistry;
    int currentTick;

    PendingChild pendingChildren[MAX_PENDING_CHILDREN];
    int pendingChildCount;

    // Nearby agents buffer (reused per-agent)
    static constexpr int MAX_NEARBY = 16;
    const Agent *nearbyBuf[MAX_NEARBY];
    int nearbyCount;

    // Offsets for adaptive batch processing
    int processOffset;
    int extendedOffset;

    SimulationStats stats;
    SimulationStats statsHistory[STATS_RING_SIZE];
    int statsHistoryIdx;
    int statsHistoryCount;

    int totalDeaths;

    SimulationEngine(int width, int height, int initialAgents, int initialSpecies, uint32_t seed)
        : world(width, height, seed),
          agentCount(0),
          grid(width, height, MAX_AGENTS),
          currentTick(0),
          pendingChildCount(0),
          nearbyCount(0),
          processOffset(0),
          extendedOffset(0),
          statsHistoryIdx(0),
          statsHistoryCount(0),
          totalDeaths(0)
    {
        memset(&stats, 0, sizeof(stats));
        resetAgentIds();
        initializePopulation(initialAgents, initialSpecies);
    }

    void initializePopulation(int totalAgents, int numSpecies)
    {
        int perSpecies = totalAgents / numSpecies;

        for (int s = 0; s < numSpecies; s++)
        {
            Traits traits;
            randomTraits(traits, world.rng);

            if (s == 0)
            {
                traits.perceptionRadius = 6.0f;
                traits.socialBias = 0.8f;
                traits.aggressionBias = 0.3f;
                traits.speed = 1.2f;
                traits.size = 1.0f;
                traits.metabolism = 0.8f;
                traits.foodEfficiency = 1.3f;
            }
            else if (s == numSpecies - 1)
            {
                traits.aggressionBias = 0.85f;
                traits.speed = 2.0f;
                traits.size = 1.6f;
                traits.perceptionRadius = 5.0f;
            }

            int speciesId = speciesRegistry.registerSpecies(traits, 0);

            for (int a = 0; a < perSpecies && agentCount < MAX_AGENTS; a++)
            {
                createRandomAgent(agents[agentCount], world, speciesId, traits, 0, world.rng);
                speciesRegistry.updatePopulation(speciesId, 1);
                agentCount++;
            }
        }

        grid.rebuild(agents, agentCount, world.width);
    }

    void gatherNearby(const Agent &agent)
    {
        nearbyCount = 0;
        int pr = (int)fminf(5.0f, ceilf(agent.traits.perceptionRadius));
        int prSq = pr * pr;

        for (int dy = -pr; dy <= pr && nearbyCount < MAX_NEARBY; dy++)
        {
            int ny = agent.y + dy;
            if (ny < 0 || ny >= world.height)
                continue;
            for (int dx = -pr; dx <= pr && nearbyCount < MAX_NEARBY; dx++)
            {
                if (dx * dx + dy * dy > prSq)
                    continue;
                int nx = agent.x + dx;
                if (nx < 0 || nx >= world.width)
                    continue;
                int gIdx = grid.firstAt(nx, ny);
                while (gIdx >= 0 && nearbyCount < MAX_NEARBY)
                {
                    const Agent &a = agents[gIdx];
                    if (a.alive && a.id != agent.id)
                    {
                        nearbyBuf[nearbyCount++] = &a;
                    }
                    gIdx = grid.next(gIdx);
                }
            }
        }
    }

    void tick()
    {
        currentTick++;

        if (currentTick % 5 == 0)
        {
            world.updateEnvironment(currentTick);
        }

        grid.rebuild(agents, agentCount, world.width);

        // Adaptive batch sizing
        int batchSize;
        if (agentCount <= 1000)
            batchSize = agentCount;
        else if (agentCount <= 5000)
            batchSize = agentCount * 40 / 100;
        else if (agentCount <= 15000)
            batchSize = agentCount * 15 / 100;
        else
            batchSize = agentCount * 5 / 100;
        if (batchSize < 400)
            batchSize = 400;
        if (batchSize > agentCount)
            batchSize = agentCount;

        int start = (agentCount > 0) ? (processOffset % agentCount) : 0;
        pendingChildCount = 0;

        for (int b = 0; b < batchSize; b++)
        {
            int aIdx = (start + b) % agentCount;
            Agent &agent = agents[aIdx];
            if (!agent.alive)
                continue;

            gatherNearby(agent);
            uint8_t action = decideAction(agent, world, nearbyBuf, nearbyCount);
            agent.pendingChildIdx = -1;
            executeAction(agent, action, world, agents, agentCount, grid);

            // Check if reproduce happened
            if (agent.pendingChildIdx >= 0 && pendingChildCount < MAX_PENDING_CHILDREN)
            {
                PendingChild &pc = pendingChildren[pendingChildCount++];
                pc.parentIdx = aIdx;
                pc.species = agent.species;
                pc.generation = agent.generation + 1;
                pc.parentId = agent.id;

                // Find spawn location
                int sx, sy;
                if (findEmptyAdjacent(agent.x, agent.y, world, sx, sy))
                {
                    pc.spawnX = sx;
                    pc.spawnY = sy;
                }
                else
                {
                    pc.spawnX = agent.x;
                    pc.spawnY = agent.y;
                }

                // Generate child genome — the parent's crossover logic in executeAction
                // stored partial data. We re-derive here using the parent's brain weights as base.
                NeuralNet::mutate(agent.brainWeights, pc.brainWeights, TOTAL_BRAIN_WEIGHTS,
                                  agent.traits.mutationRate, 0.3f, world.rng);
                mutateTraits(agent.traits, pc.traits, agent.traits.mutationRate, world.rng);
            }
        }

        processOffset = (agentCount > 0) ? ((start + batchSize) % agentCount) : 0;

        // Lifecycle: age, metabolism, death
        int writeIdx = 0;
        for (int i = 0; i < agentCount; i++)
        {
            Agent &a = agents[i];
            a.age++;
            if (a.gestationCooldown > 0)
                a.gestationCooldown--;

            const Traits &t = a.traits;
            a.energy -= 0.12f * t.metabolism * (0.4f + t.size * 0.4f + t.speed * 0.2f);
            if (a.age > (int)(a.maxAge * 0.8f))
            {
                float aging = (float)(a.age - (int)(a.maxAge * 0.8f)) / (float)(a.maxAge * 0.2f) * 0.4f;
                a.health -= aging;
            }
            if (a.energy <= 0.0f)
            {
                a.health -= 3.0f;
                a.energy = 0.0f;
            }
            if (a.psychology.thirst > 0.9f)
            {
                a.health -= (a.psychology.thirst - 0.9f) * 5.0f;
            }

            if (a.health <= 0.0f || a.age >= a.maxAge || !a.alive)
            {
                a.alive = 0;
                speciesRegistry.updatePopulation(a.species, -1);
                Tile &tile = world.tileAt(a.x, a.y);
                tile.foodResource = fminf(100.0f, tile.foodResource + a.energy * 0.5f);
                totalDeaths++;
                continue;
            }

            if (writeIdx != i)
                agents[writeIdx] = a;
            writeIdx++;
        }
        agentCount = writeIdx;

        // Spawn children
        for (int c = 0; c < pendingChildCount && agentCount < MAX_AGENTS; c++)
        {
            PendingChild &pc = pendingChildren[c];
            initAgent(agents[agentCount], pc.spawnX, pc.spawnY, pc.species, pc.traits,
                      pc.brainWeights, currentTick, pc.generation, pc.parentId);
            speciesRegistry.updatePopulation(pc.species, 1);
            agentCount++;
        }

        // Extended processing every 5 ticks
        if (currentTick % 5 == 0)
        {
            int extBatch = agentCount / 5;
            if (extBatch < 5000)
                extBatch = 5000;
            if (extBatch > agentCount)
                extBatch = agentCount;
            int extStart = (agentCount > 0) ? (extendedOffset % agentCount) : 0;

            for (int i = 0; i < extBatch; i++)
            {
                int idx = (extStart + i) % agentCount;
                Agent &a = agents[idx];

                a.psychology.hunger = fminf(1.0f, a.psychology.hunger + 0.025f);
                a.psychology.thirst = fminf(1.0f, a.psychology.thirst + 0.012f);
                a.psychology.fatigue = fminf(1.0f, a.psychology.fatigue + 0.015f);
                a.psychology.fear = fmaxf(0.0f, a.psychology.fear - 0.05f);
                a.psychology.aggression *= 0.975f;
                a.psychology.curiosity = fminf(1.0f, a.psychology.curiosity + 0.01f);

                const Tile &tile = world.tileAt(a.x, a.y);
                applyTemperatureStress(a, tile);

                if (tile.hazard > 0.0f)
                {
                    a.health -= tile.hazard * 25.0f;
                    a.psychology.fear = fminf(1.0f, a.psychology.fear + tile.hazard * 0.5f);
                }

                world.recordAgentPresence(a.x, a.y);
                world.claimTerritory(a.x, a.y, a.species);

                // Trim memory if somehow over
                if (a.memoryCount > 30)
                    a.memoryCount = 15;

                int tIdx = a.y * world.width + a.x;
                int owner = world.territoryOwner[tIdx];
                if (owner > 0 && owner != a.species && world.territoryStrength[tIdx] > 0.3f)
                {
                    a.psychology.fear = fminf(1.0f, a.psychology.fear + 0.1f);
                    a.psychology.aggression = fminf(1.0f, a.psychology.aggression + 0.05f);
                }
            }
            extendedOffset = (agentCount > 0) ? ((extStart + extBatch) % agentCount) : 0;
        }

        // Extinction check
        for (int s = 0; s < speciesRegistry.count; s++)
        {
            SpeciesInfo &sp = speciesRegistry.species[s];
            if (sp.population <= 0 && !sp.extinct)
            {
                speciesRegistry.markExtinct(sp.id, currentTick);
            }
        }

        // Stats every 5 ticks
        if (currentTick % 5 == 0)
        {
            computeStats();
            if (currentTick % 25 == 0)
            {
                if (statsHistoryCount < STATS_RING_SIZE)
                {
                    statsHistory[statsHistoryCount++] = stats;
                }
                else
                {
                    statsHistory[statsHistoryIdx % STATS_RING_SIZE] = stats;
                }
                statsHistoryIdx++;
            }
        }
    }

    void computeStats()
    {
        memset(&stats, 0, sizeof(stats));
        stats.tick = currentTick;
        stats.year = currentTick / world.config.ticksPerYear;

        float totalEnergy = 0, totalAge = 0;
        int totalBirths = 0;
        memset(stats.speciesPopulations, 0, sizeof(stats.speciesPopulations));

        for (int i = 0; i < agentCount; i++)
        {
            const Agent &a = agents[i];
            if (!a.alive)
                continue;
            stats.totalAgents++;
            totalEnergy += a.energy;
            totalAge += (float)a.age;
            totalBirths += a.offspring;
            if (a.species >= 1 && a.species <= 64)
                stats.speciesPopulations[a.species - 1]++;
        }

        stats.averageEnergy = stats.totalAgents > 0 ? totalEnergy / stats.totalAgents : 0.0f;
        stats.averageAge = stats.totalAgents > 0 ? totalAge / stats.totalAgents : 0.0f;
        stats.totalBirths = totalBirths;
        stats.totalDeaths = totalDeaths;

        float totalFood = 0, totalTemp = 0;
        int tileCount = world.width * world.height;
        for (int i = 0; i < tileCount; i++)
        {
            totalFood += world.tiles[i].foodResource;
            totalTemp += world.tiles[i].temperature;
        }
        stats.averageTemperature = totalTemp / tileCount;
        stats.totalFood = totalFood;

        int aliveSpecies = 0, extinctions = 0;
        for (int s = 0; s < speciesRegistry.count; s++)
        {
            if (speciesRegistry.species[s].population > 0)
                aliveSpecies++;
            if (speciesRegistry.species[s].extinct)
                extinctions++;
        }
        stats.totalSpecies = aliveSpecies;
        stats.extinctions = extinctions;
    }

    // --- Intervention processing ---
    void applyIntervention(const Intervention &interv)
    {
        switch (interv.type)
        {
        case IT_TemperatureShift:
            world.globalTemperatureOffset += interv.amount;
            break;
        case IT_ResourceMultiplier:
        {
            int total = world.width * world.height;
            for (int i = 0; i < total; i++)
            {
                world.tiles[i].foodResource *= interv.multiplier;
                world.tiles[i].fertility *= interv.multiplier;
            }
            break;
        }
        case IT_IntroducePredator:
        {
            Traits traits;
            randomTraits(traits, world.rng);
            traits.aggressionBias = 0.95f;
            traits.speed = 2.5f;
            traits.size = 1.8f;
            traits.perceptionRadius = 6.0f;
            int sid = speciesRegistry.registerSpecies(traits, currentTick);
            for (int i = 0; i < interv.count && agentCount < MAX_AGENTS; i++)
            {
                createRandomAgent(agents[agentCount], world, sid, traits, currentTick, world.rng);
                speciesRegistry.updatePopulation(sid, 1);
                agentCount++;
            }
            break;
        }
        case IT_RemoveSpecies:
            for (int i = 0; i < agentCount; i++)
            {
                if (agents[i].species == interv.speciesId && agents[i].alive)
                    agents[i].alive = 0;
            }
            break;
        case IT_MutationRateChange:
            for (int i = 0; i < agentCount; i++)
            {
                agents[i].traits.mutationRate *= interv.multiplier;
                if (agents[i].traits.mutationRate > 0.5f)
                    agents[i].traits.mutationRate = 0.5f;
            }
            break;
        case IT_AddHazard:
        {
            int r = interv.radius;
            for (int dy = -r; dy <= r; dy++)
            {
                for (int dx = -r; dx <= r; dx++)
                {
                    int nx = interv.x + dx, ny = interv.y + dy;
                    if (world.isValid(nx, ny) && dx * dx + dy * dy <= r * r)
                    {
                        Tile &t = world.tileAt(nx, ny);
                        t.hazard = fminf(1.0f, t.hazard + interv.intensity);
                    }
                }
            }
            break;
        }
        case IT_SpawnCustomAgent:
        {
            Traits traits;
            randomTraits(traits, world.rng);
            // Custom traits can be passed through amount/multiplier fields or we just use defaults
            int sid = speciesRegistry.registerSpecies(traits, currentTick);
            for (int i = 0; i < interv.count && agentCount < MAX_AGENTS; i++)
            {
                createRandomAgent(agents[agentCount], world, sid, traits, currentTick, world.rng);
                speciesRegistry.updatePopulation(sid, 1);
                agentCount++;
            }
            break;
        }
        case IT_ClimateEvent:
            if (interv.eventType == 0)
                world.globalTemperatureOffset -= 15.0f;
            else if (interv.eventType == 1)
                world.globalTemperatureOffset += 20.0f;
            else if (interv.eventType == 2)
            {
                int total = world.width * world.height;
                for (int i = 0; i < total; i++)
                {
                    if (world.tiles[i].elevation < 0.4f && world.tiles[i].terrain != DeepWater)
                    {
                        world.tiles[i].terrain = ShallowWater;
                        world.tiles[i].waterResource = 100.0f;
                    }
                }
            }
            break;
        }
    }

    // --- Data accessors for JS ---
    int getAgentCount() const { return agentCount; }
    int getTick() const { return currentTick; }

    // Pack agent data into flat arrays for efficient transfer to JS renderer
    // Returns: [x, y, species, energy, health, alive, lastAction] per agent
    void getAgentDataPacked(float *out, int maxAgents) const
    {
        int n = agentCount < maxAgents ? agentCount : maxAgents;
        for (int i = 0; i < n; i++)
        {
            const Agent &a = agents[i];
            int base = i * 7;
            out[base + 0] = (float)a.x;
            out[base + 1] = (float)a.y;
            out[base + 2] = (float)a.species;
            out[base + 3] = a.energy;
            out[base + 4] = a.health;
            out[base + 5] = a.alive ? 1.0f : 0.0f;
            out[base + 6] = (float)a.lastAction;
        }
    }

    void getTileDataPacked(float *out) const
    {
        int total = world.width * world.height;
        for (int i = 0; i < total; i++)
        {
            const Tile &t = world.tiles[i];
            int base = i * 5;
            out[base + 0] = (float)t.terrain;
            out[base + 1] = t.foodResource;
            out[base + 2] = t.waterResource;
            out[base + 3] = t.temperature;
            out[base + 4] = t.hazard;
        }
    }

    // Get single agent detail for inspector
    bool getAgentDetail(int agentId, float *out) const
    {
        for (int i = 0; i < agentCount; i++)
        {
            const Agent &a = agents[i];
            if (a.id == agentId)
            {
                int idx = 0;
                out[idx++] = (float)a.id;
                out[idx++] = (float)a.x;
                out[idx++] = (float)a.y;
                out[idx++] = (float)a.species;
                out[idx++] = a.energy;
                out[idx++] = a.health;
                out[idx++] = a.maxHealth;
                out[idx++] = (float)a.age;
                out[idx++] = (float)a.maxAge;
                out[idx++] = (float)a.generation;
                out[idx++] = (float)a.kills;
                out[idx++] = (float)a.offspring;
                out[idx++] = (float)a.foodEaten;
                out[idx++] = (float)a.lastAction;
                out[idx++] = a.morale;
                out[idx++] = (float)a.allianceCount;
                out[idx++] = a.totalDistanceTraveled;
                // Traits (24)
                out[idx++] = a.traits.speed;
                out[idx++] = a.traits.size;
                out[idx++] = a.traits.perceptionRadius;
                out[idx++] = a.traits.metabolism;
                out[idx++] = a.traits.reproductionThreshold;
                out[idx++] = a.traits.mutationRate;
                out[idx++] = a.traits.aggressionBias;
                out[idx++] = a.traits.socialBias;
                out[idx++] = a.traits.heatTolerance;
                out[idx++] = a.traits.foodEfficiency;
                out[idx++] = a.traits.nocturnal;
                out[idx++] = a.traits.camouflage;
                out[idx++] = a.traits.packHunting;
                out[idx++] = a.traits.toolUse;
                out[idx++] = a.traits.singing;
                out[idx++] = a.traits.burrowing;
                out[idx++] = a.traits.venom;
                out[idx++] = a.traits.regeneration;
                out[idx++] = a.traits.flight;
                out[idx++] = a.traits.aquatic;
                out[idx++] = a.traits.migrationDrive;
                out[idx++] = a.traits.longevity;
                out[idx++] = a.traits.immuneStrength;
                out[idx++] = a.traits.learningRate;
                // Psychology (9)
                out[idx++] = a.psychology.hunger;
                out[idx++] = a.psychology.thirst;
                out[idx++] = a.psychology.fatigue;
                out[idx++] = a.psychology.fear;
                out[idx++] = a.psychology.aggression;
                out[idx++] = a.psychology.curiosity;
                out[idx++] = a.psychology.socialBonding;
                out[idx++] = a.psychology.loneliness;
                out[idx++] = a.psychology.satisfaction;
                return true;
            }
        }
        return false;
    }
};
