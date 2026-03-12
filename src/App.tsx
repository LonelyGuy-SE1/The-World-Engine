import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Simulation, SimulationInstance } from "./engine/Simulation";
import { WasmSimulation, isWasmAvailable } from "./engine/WasmSimulation";
import { Agent, SimulationState, WorldConfig } from "./engine/types";
import { RenderConfig, DEFAULT_RENDER_CONFIG } from "./renderer/CanvasRenderer";
import { spriteManager } from "./renderer/SpriteManager";
import { WorldViewer } from "./ui/WorldViewer";
import { ControlPanel } from "./ui/ControlPanel";
import { InspectorPanel } from "./ui/InspectorPanel";
import { ExperimentPanel } from "./ui/ExperimentPanel";
import { DashboardPanel } from "./ui/DashboardPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { WorldSelector } from "./ui/WorldSelector";
import {
  GearIcon,
  SearchIcon,
  FlaskIcon,
  ChartIcon,
  GlobeIcon,
  ScrollIcon,
} from "./ui/Icons";
import { MultiWorldViewer } from "./ui/MultiWorldViewer";
import "./App.css";

type SideTab =
  | "control"
  | "inspector"
  | "experiment"
  | "dashboard"
  | "events"
  | "worlds";
type EngineBackend = "ts" | "wasm";

export const App: React.FC = () => {
  const tsSimRef = useRef(new Simulation());
  const wasmSimRef = useRef<WasmSimulation | null>(null);
  const [engineBackend, setEngineBackend] = useState<EngineBackend>("ts");
  const [wasmAvailable, setWasmAvailable] = useState(false);
  const [wasmLoading, setWasmLoading] = useState(false);

  // The active simulation — either TS or WASM
  const simulation =
    engineBackend === "wasm" && wasmSimRef.current
      ? wasmSimRef.current
      : tsSimRef.current;

  // Force re-render on stats updates
  const [, forceUpdate] = useState(0);
  const [activeTab, setActiveTab] = useState<SideTab>("control");
  const [speed, setSpeed] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTile, setSelectedTile] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [renderConfig, setRenderConfig] = useState<RenderConfig>(
    DEFAULT_RENDER_CONFIG,
  );
  const [instances, setInstances] = useState<SimulationInstance[]>([]);
  const [placementTool, setPlacementTool] = useState("none");
  const [placementRadius, setPlacementRadius] = useState(5);
  const [placementIntensity, setPlacementIntensity] = useState(0.5);
  const [viewMode, setViewMode] = useState<"single" | "multi">("single");

  // Probe for WASM availability on mount
  useEffect(() => {
    isWasmAvailable().then(setWasmAvailable);
  }, []);

  // Switch engine backend
  const handleSwitchEngine = useCallback(async (backend: EngineBackend) => {
    if (backend === "wasm") {
      if (!wasmSimRef.current) {
        setWasmLoading(true);
        try {
          const wsim = new WasmSimulation();
          await wsim.init();
          wasmSimRef.current = wsim;
          wsim.createInstance("Genesis", {
            width: 200,
            height: 200,
            initialAgents: 250,
            initialSpecies: 6,
          });
          // Start running immediately
          const inst = wsim.getActive();
          if (inst) inst.state = SimulationState.Running;
        } catch (err) {
          console.error("Failed to load WASM engine:", err);
          setWasmLoading(false);
          return;
        }
        setWasmLoading(false);
      }
    }
    setEngineBackend(backend);
    setInstances(
      Array.from(
        (backend === "wasm" && wasmSimRef.current
          ? wasmSimRef.current
          : tsSimRef.current
        ).instances.values(),
      ),
    );
    forceUpdate((n) => n + 1);
  }, []);

  // Initialize with a default TS world
  useEffect(() => {
    spriteManager.loadAll();

    const inst = tsSimRef.current.createInstance("Genesis", {
      width: 200,
      height: 200,
      initialAgents: 250,
      initialSpecies: 6,
    });
    inst.state = SimulationState.Paused;
    setInstances(Array.from(tsSimRef.current.instances.values()));

    // Update UI periodically
    const statsInterval = setInterval(() => {
      forceUpdate((n) => n + 1);
      const sim =
        wasmSimRef.current && engineBackend === "wasm"
          ? wasmSimRef.current
          : tsSimRef.current;
      setInstances(Array.from(sim.instances.values()));
    }, 250);

    return () => clearInterval(statsInterval);
  }, [engineBackend]);

  // Simulation loop — runs regardless of view mode (single or multi)
  useEffect(() => {
    let frame = 0;
    const sim =
      engineBackend === "wasm" && wasmSimRef.current
        ? wasmSimRef.current
        : tsSimRef.current;
    const loop = () => {
      sim.step();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engineBackend]);

  const activeInstance = simulation.getActive();

  const handleTogglePlay = useCallback(() => {
    const inst = simulation.getActive();
    if (!inst) return;
    inst.state =
      inst.state === SimulationState.Running
        ? SimulationState.Paused
        : SimulationState.Running;
    forceUpdate((n) => n + 1);
  }, [simulation]);

  const handleStep = useCallback(() => {
    const inst = simulation.getActive();
    if (!inst || inst.state === SimulationState.Running) return;
    inst.state = SimulationState.Running;
    simulation.tick(inst);
    inst.state = SimulationState.Paused;
    forceUpdate((n) => n + 1);
  }, [simulation]);

  const handleSetSpeed = useCallback(
    (s: number) => {
      setSpeed(s);
      simulation.speed = s;
    },
    [simulation],
  );

  const handleSelectAgent = useCallback(
    (agent: Agent | null) => {
      setSelectedAgent(agent);
      if (agent && placementTool === "none") setActiveTab("inspector");
    },
    [placementTool],
  );

  const handleSelectTile = useCallback(
    (x: number, y: number) => {
      setSelectedTile({ x, y });

      if (placementTool !== "none" && activeInstance) {
        const world = activeInstance.world;
        const r = placementRadius;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!world.isValid(nx, ny)) continue;
            const tile = world.tileAt(nx, ny);
            if (placementTool === "resource") {
              tile.foodResource = Math.min(
                100,
                tile.foodResource + placementIntensity * 50,
              );
            } else if (placementTool === "hazard") {
              tile.hazard = Math.min(1, tile.hazard + placementIntensity);
            } else if (placementTool === "erase") {
              tile.hazard = Math.max(0, tile.hazard - placementIntensity);
              tile.foodResource = Math.max(
                0,
                tile.foodResource - placementIntensity * 50,
              );
            }
          }
        }
      }
    },
    [placementTool, placementRadius, placementIntensity, activeInstance],
  );

  const handleUpdateRenderConfig = useCallback(
    (update: Partial<RenderConfig>) => {
      setRenderConfig((prev) => ({ ...prev, ...update }));
    },
    [],
  );

  const handleCreateWorld = useCallback(
    (name: string, config: Partial<WorldConfig>) => {
      simulation.createInstance(name, config);
      const newInstances = Array.from(simulation.instances.values());
      setInstances(newInstances);
      if (newInstances.length > 1) setViewMode("multi");
    },
    [simulation],
  );

  const handleRemoveWorld = useCallback(
    (id: string) => {
      simulation.removeInstance(id);
      setInstances(Array.from(simulation.instances.values()));
      forceUpdate((n) => n + 1);
    },
    [simulation],
  );

  const handleSelectInstance = useCallback(
    (id: string) => {
      simulation.activeInstanceId = id;
      setSelectedAgent(null);
      setSelectedTile(null);
      forceUpdate((n) => n + 1);
    },
    [simulation],
  );

  const handleExpandInstance = useCallback(
    (id: string) => {
      simulation.activeInstanceId = id;
      setSelectedAgent(null);
      setSelectedTile(null);
      setViewMode("single");
      forceUpdate((n) => n + 1);
    },
    [simulation],
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-title">
          <h1>The World Engine</h1>
          <span className="app-subtitle">
            Artificial Life Research Platform
          </span>
        </div>
        <div className="header-stats">
          {wasmAvailable && (
            <button
              className={`btn btn-sm ${engineBackend === "wasm" ? "btn-primary" : ""}`}
              onClick={() =>
                handleSwitchEngine(engineBackend === "wasm" ? "ts" : "wasm")
              }
              disabled={wasmLoading}
              title={
                engineBackend === "wasm"
                  ? "Running on C++/WASM engine"
                  : "Running on TypeScript engine"
              }
            >
              {wasmLoading
                ? "Loading..."
                : engineBackend === "wasm"
                  ? "WASM"
                  : "TS"}
            </button>
          )}
          {instances.length > 1 && (
            <button
              className={`btn btn-sm ${viewMode === "multi" ? "btn-primary" : ""}`}
              onClick={() =>
                setViewMode(viewMode === "single" ? "multi" : "single")
              }
            >
              {viewMode === "multi" ? "Single View" : "Grid View"}
            </button>
          )}
          {activeInstance && (
            <>
              <span className="header-stat">
                World: <strong>{activeInstance.name}</strong>
              </span>
              <span className="header-stat">
                Year:{" "}
                <strong>
                  {Math.floor(
                    activeInstance.tick /
                      activeInstance.world.config.ticksPerYear,
                  )}
                </strong>
              </span>
              <span className="header-stat">
                Pop: <strong>{activeInstance.stats.totalAgents}</strong>
              </span>
              <span className="header-stat">
                Species: <strong>{activeInstance.stats.totalSpecies}</strong>
              </span>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="app-body">
        {/* Side panel */}
        <aside className="side-panel">
          <nav className="side-tabs">
            <button
              className={`tab ${activeTab === "control" ? "active" : ""}`}
              onClick={() => setActiveTab("control")}
              title="Controls"
            >
              <GearIcon size={16} />
            </button>
            <button
              className={`tab ${activeTab === "inspector" ? "active" : ""}`}
              onClick={() => setActiveTab("inspector")}
              title="Inspector"
            >
              <SearchIcon size={16} />
            </button>
            <button
              className={`tab ${activeTab === "experiment" ? "active" : ""}`}
              onClick={() => setActiveTab("experiment")}
              title="Experiments"
            >
              <FlaskIcon size={16} />
            </button>
            <button
              className={`tab ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
              title="Dashboard"
            >
              <ChartIcon size={16} />
            </button>
            <button
              className={`tab ${activeTab === "events" ? "active" : ""}`}
              onClick={() => setActiveTab("events")}
              title="World Chronicle"
            >
              <ScrollIcon size={16} />
            </button>
            <button
              className={`tab ${activeTab === "worlds" ? "active" : ""}`}
              onClick={() => setActiveTab("worlds")}
              title="Worlds"
            >
              <GlobeIcon size={16} />
            </button>
          </nav>

          <div className="side-content">
            {activeTab === "control" && (
              <ControlPanel
                instance={activeInstance}
                speed={speed}
                onSetSpeed={handleSetSpeed}
                onTogglePlay={handleTogglePlay}
                onStep={handleStep}
                renderConfig={renderConfig}
                onUpdateRenderConfig={handleUpdateRenderConfig}
                placementTool={placementTool}
                onSetPlacementTool={setPlacementTool}
                placementRadius={placementRadius}
                onSetPlacementRadius={setPlacementRadius}
                placementIntensity={placementIntensity}
                onSetPlacementIntensity={setPlacementIntensity}
              />
            )}
            {activeTab === "inspector" && (
              <InspectorPanel
                selectedAgent={selectedAgent}
                selectedTile={selectedTile}
                world={activeInstance?.world ?? null}
                speciesRegistry={activeInstance?.speciesRegistry ?? null}
              />
            )}
            {activeTab === "experiment" && (
              <ExperimentPanel
                simulation={simulation as any}
                instance={activeInstance}
              />
            )}
            {activeTab === "dashboard" && (
              <DashboardPanel instance={activeInstance} />
            )}
            {activeTab === "events" && (
              <EventLogPanel instance={activeInstance} />
            )}
            {activeTab === "worlds" && (
              <WorldSelector
                simulation={simulation as any}
                instances={instances}
                activeId={simulation.activeInstanceId}
                onSelectInstance={handleSelectInstance}
                onCreateWorld={handleCreateWorld}
                onRemoveWorld={handleRemoveWorld}
              />
            )}
          </div>
        </aside>

        {/* World viewer */}
        <main className="world-viewport">
          {viewMode === "multi" && instances.length > 1 ? (
            <MultiWorldViewer
              instances={instances}
              activeId={simulation.activeInstanceId}
              onSelectInstance={handleSelectInstance}
              onExpandInstance={handleExpandInstance}
            />
          ) : (
            <WorldViewer
              simulation={simulation as any}
              instance={activeInstance}
              onSelectAgent={handleSelectAgent}
              onSelectTile={handleSelectTile}
              renderConfig={renderConfig}
              placementTool={placementTool}
            />
          )}
        </main>
      </div>
    </div>
  );
};
