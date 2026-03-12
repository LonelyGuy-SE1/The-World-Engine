#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "simulation.h"

using namespace emscripten;

static SimulationEngine *g_engine = nullptr;

// Flat buffer for agent data transfer (7 floats per agent * MAX_AGENTS)
static float g_agentBuf[SimulationEngine::MAX_AGENTS * 7];
static float g_tileBuf[512 * 512 * 5]; // max world size
static float g_detailBuf[128];         // single agent detail

int createSimulation(int width, int height, int initialAgents, int initialSpecies, int seed)
{
    if (g_engine)
    {
        delete g_engine;
        g_engine = nullptr;
    }
    g_engine = new SimulationEngine(width, height, initialAgents, initialSpecies, (uint32_t)seed);
    return 1;
}

void destroySimulation()
{
    if (g_engine)
    {
        delete g_engine;
        g_engine = nullptr;
    }
}

void tickSimulation(int count)
{
    if (!g_engine)
        return;
    for (int i = 0; i < count; i++)
    {
        g_engine->tick();
    }
}

int getAgentCount()
{
    return g_engine ? g_engine->getAgentCount() : 0;
}

int getTick()
{
    return g_engine ? g_engine->getTick() : 0;
}

int getWorldWidth()
{
    return g_engine ? g_engine->world.width : 0;
}

int getWorldHeight()
{
    return g_engine ? g_engine->world.height : 0;
}

// Returns pointer to agent data buffer (JS reads via HEAPF32)
uintptr_t getAgentDataPtr()
{
    if (!g_engine)
        return 0;
    g_engine->getAgentDataPacked(g_agentBuf, SimulationEngine::MAX_AGENTS);
    return (uintptr_t)g_agentBuf;
}

// Returns pointer to tile data buffer
uintptr_t getTileDataPtr()
{
    if (!g_engine)
        return 0;
    g_engine->getTileDataPacked(g_tileBuf);
    return (uintptr_t)g_tileBuf;
}

// Get simulation stats as a JS object
val getStats()
{
    if (!g_engine)
        return val::null();
    const SimulationStats &s = g_engine->stats;
    val obj = val::object();
    obj.set("tick", s.tick);
    obj.set("year", s.year);
    obj.set("totalAgents", s.totalAgents);
    obj.set("totalSpecies", s.totalSpecies);
    obj.set("averageEnergy", s.averageEnergy);
    obj.set("averageAge", s.averageAge);
    obj.set("totalBirths", s.totalBirths);
    obj.set("totalDeaths", s.totalDeaths);
    obj.set("averageTemperature", s.averageTemperature);
    obj.set("totalFood", s.totalFood);
    obj.set("extinctions", s.extinctions);

    val pops = val::object();
    for (int i = 0; i < g_engine->speciesRegistry.count; i++)
    {
        pops.set(i + 1, s.speciesPopulations[i]);
    }
    obj.set("speciesPopulations", pops);
    return obj;
}

// Get single agent detail
val getAgentDetail(int agentId)
{
    if (!g_engine)
        return val::null();
    if (g_engine->getAgentDetail(agentId, g_detailBuf))
    {
        val arr = val::array();
        // Total: 17 base + 24 traits + 9 psychology = 50 floats
        for (int i = 0; i < 50; i++)
        {
            arr.call<void>("push", g_detailBuf[i]);
        }
        return arr;
    }
    return val::null();
}

// Species info
val getSpeciesInfo()
{
    if (!g_engine)
        return val::null();
    val arr = val::array();
    for (int i = 0; i < g_engine->speciesRegistry.count; i++)
    {
        const SpeciesInfo &sp = g_engine->speciesRegistry.species[i];
        val obj = val::object();
        obj.set("id", sp.id);
        obj.set("population", sp.population);
        obj.set("totalEverLived", sp.totalEverLived);
        obj.set("extinct", (bool)sp.extinct);
        obj.set("originTick", sp.originTick);
        obj.set("extinctTick", sp.extinctTick);
        arr.call<void>("push", obj);
    }
    return arr;
}

// Apply intervention
void applyIntervention(int type, float amount, float multiplier, int speciesId,
                       int count, int x, int y, int radius, float intensity, int eventType)
{
    if (!g_engine)
        return;
    Intervention interv;
    interv.type = type;
    interv.amount = amount;
    interv.multiplier = multiplier;
    interv.speciesId = speciesId;
    interv.count = count;
    interv.x = x;
    interv.y = y;
    interv.radius = radius;
    interv.intensity = intensity;
    interv.eventType = eventType;
    g_engine->applyIntervention(interv);
}

// Get stats history as flat array
val getStatsHistory()
{
    if (!g_engine)
        return val::null();
    val arr = val::array();
    int count = g_engine->statsHistoryCount;
    for (int i = 0; i < count; i++)
    {
        const SimulationStats &s = g_engine->statsHistory[i];
        val obj = val::object();
        obj.set("tick", s.tick);
        obj.set("totalAgents", s.totalAgents);
        obj.set("totalSpecies", s.totalSpecies);
        obj.set("averageEnergy", s.averageEnergy);
        obj.set("totalFood", s.totalFood);
        obj.set("averageTemperature", s.averageTemperature);
        arr.call<void>("push", obj);
    }
    return arr;
}

EMSCRIPTEN_BINDINGS(world_engine)
{
    function("createSimulation", &createSimulation);
    function("destroySimulation", &destroySimulation);
    function("tickSimulation", &tickSimulation);
    function("getAgentCount", &getAgentCount);
    function("getTick", &getTick);
    function("getWorldWidth", &getWorldWidth);
    function("getWorldHeight", &getWorldHeight);
    function("getAgentDataPtr", &getAgentDataPtr);
    function("getTileDataPtr", &getTileDataPtr);
    function("getStats", &getStats);
    function("getAgentDetail", &getAgentDetail);
    function("getSpeciesInfo", &getSpeciesInfo);
    function("applyIntervention", &applyIntervention);
    function("getStatsHistory", &getStatsHistory);
}
