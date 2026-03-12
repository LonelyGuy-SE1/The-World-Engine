import React, { useRef, useEffect, useMemo } from "react";
import { WorldStats } from "../engine/types";
import { SimulationInstance } from "../engine/Simulation";
import { SpeciesRegistry } from "../engine/Agent";
import { WorldEvent } from "../engine/EventLog";
import { CivilizationSystem, TECH_TREE } from "../engine/Civilization";
import {
  SkullIcon,
  LightbulbIcon,
  CastleIcon,
  SwordsIcon,
  ClimateIcon,
  WarningIcon,
  SeedlingIcon,
  CycleIcon,
  TrendUpIcon,
  StarvationIcon,
} from "./Icons";

interface DashboardPanelProps {
  instance: SimulationInstance | null;
}

const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];
const SEASON_COLORS = ["#4CAF50", "#FFC107", "#FF9800", "#90CAF9"];

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ instance }) => {
  if (!instance) return null;

  const { stats, statsHistory, speciesRegistry } = instance;
  const tpy = instance.world.config.ticksPerYear;
  const season = Math.floor((instance.tick % tpy) / (tpy / 4));
  const recentEvents = instance.eventLog.getRecent(30);

  return (
    <div className="panel dashboard-panel">
      <h3>Dashboard</h3>

      <div className="season-bar">
        <CycleIcon size={14} color={SEASON_COLORS[season]} />
        <span className="season-name">{SEASON_NAMES[season]}</span>
        <span className="season-year">
          Year {Math.floor(instance.tick / tpy)}, Day {instance.tick % tpy}
        </span>
      </div>

      <div className="chart-grid">
        <MiniChart
          title="Population"
          data={statsHistory.map((s) => s.totalAgents)}
          color="#4CAF50"
          format={(v) => v.toFixed(0)}
          current={stats.totalAgents}
        />
        <MiniChart
          title="Species"
          data={statsHistory.map((s) => s.totalSpecies)}
          color="#2196F3"
          format={(v) => v.toFixed(0)}
          current={stats.totalSpecies}
        />
        <MiniChart
          title="Avg Energy"
          data={statsHistory.map((s) => s.averageEnergy)}
          color="#FF9800"
          format={(v) => v.toFixed(1)}
          current={stats.averageEnergy}
        />
        <MiniChart
          title="Avg Temperature"
          data={statsHistory.map((s) => s.averageTemperature)}
          color="#F44336"
          format={(v) => `${v.toFixed(1)}\u00B0C`}
          current={stats.averageTemperature}
        />
        <MiniChart
          title="Total Food"
          data={statsHistory.map((s) => s.totalFood)}
          color="#8BC34A"
          format={(v) => v.toFixed(0)}
          current={stats.totalFood}
        />
        <MiniChart
          title="Extinctions"
          data={statsHistory.map((s) => s.extinctions)}
          color="#9C27B0"
          format={(v) => v.toFixed(0)}
          current={stats.extinctions}
        />
      </div>

      <h4>Species Population Over Time</h4>
      <SpeciesChart
        statsHistory={statsHistory}
        speciesRegistry={speciesRegistry}
      />
      <SpeciesLegend speciesRegistry={speciesRegistry} stats={stats} />

      <h4>Civilizations</h4>
      <CivilizationInfo
        civilization={instance.civilization}
        speciesRegistry={speciesRegistry}
      />

      <h4>World Events</h4>
      <EventLogView events={recentEvents} ticksPerYear={tpy} />
    </div>
  );
};

// --- Mini Chart Component ---

interface MiniChartProps {
  title: string;
  data: number[];
  color: string;
  format: (v: number) => string;
  current: number;
}

const MiniChart: React.FC<MiniChartProps> = ({
  title,
  data,
  color,
  format,
  current,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Draw area fill
    ctx.fillStyle = color + "20";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - min) / range) * h * 0.9 - h * 0.05;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - min) / range) * h * 0.9 - h * 0.05;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, color]);

  return (
    <div className="mini-chart">
      <div className="mini-chart-header">
        <span className="mini-chart-title">{title}</span>
        <span className="mini-chart-value" style={{ color }}>
          {format(current)}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={180}
        height={60}
        style={{ width: "100%", height: "60px" }}
      />
    </div>
  );
};

// --- Species Chart Component ---

interface SpeciesChartProps {
  statsHistory: WorldStats[];
  speciesRegistry: SpeciesRegistry;
}

const SpeciesChart: React.FC<SpeciesChartProps> = ({
  statsHistory,
  speciesRegistry,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || statsHistory.length < 2) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const allSpeciesIds = new Set<number>();
    let globalMax = 1;
    for (const snap of statsHistory) {
      for (const [id, pop] of snap.speciesPopulations) {
        allSpeciesIds.add(id);
        if (pop > globalMax) globalMax = pop;
      }
    }

    for (const spId of allSpeciesIds) {
      const sp = speciesRegistry.species.get(spId);
      if (!sp) continue;

      const populations = statsHistory.map(
        (s) => s.speciesPopulations.get(spId) || 0,
      );

      ctx.strokeStyle = sp.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < populations.length; i++) {
        const x = (i / (populations.length - 1)) * w;
        const y = h - (populations[i] / globalMax) * h * 0.85 - h * 0.05;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = "#555";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(String(globalMax), 2, 12);
    ctx.fillText("0", 2, h - 2);

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.stroke();
  }, [statsHistory.length, speciesRegistry]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={120}
      style={{
        width: "100%",
        height: "120px",
        borderRadius: "4px",
        background: "#111",
      }}
    />
  );
};

// --- Species Legend ---

const SpeciesLegend: React.FC<{
  speciesRegistry: SpeciesRegistry;
  stats: WorldStats;
}> = ({ speciesRegistry, stats }) => {
  const alive = speciesRegistry.getAliveSpecies();
  return (
    <div className="species-legend">
      {alive.map((sp) => (
        <div key={sp.id} className="species-legend-item">
          <span className="species-dot" style={{ backgroundColor: sp.color }} />
          <span className="species-legend-name">{sp.name}</span>
          <span className="species-legend-pop">
            {stats.speciesPopulations.get(sp.id) || 0}
          </span>
        </div>
      ))}
    </div>
  );
};

// --- Civilization Info ---

const CivilizationInfo: React.FC<{
  civilization: CivilizationSystem;
  speciesRegistry: SpeciesRegistry;
}> = ({ civilization, speciesRegistry }) => {
  const civEntries = Array.from(civilization.speciesCivs.entries())
    .filter(([id]) => {
      const sp = speciesRegistry.species.get(id);
      return sp && !sp.extinct;
    })
    .sort((a, b) => b[1].techLevel - a[1].techLevel);

  if (civEntries.length === 0) {
    return (
      <p className="muted">
        No civilizations yet. Species need population &gt; 15 and avg age &gt;
        40.
      </p>
    );
  }

  return (
    <div className="civ-list">
      {civEntries.map(([spId, civ]) => {
        const sp = speciesRegistry.species.get(spId);
        if (!sp) return null;
        return (
          <div key={spId} className="civ-item">
            <div className="civ-header">
              <span
                className="species-dot"
                style={{ backgroundColor: sp.color }}
              />
              <span className="civ-name">{civ.kingdomName}</span>
              <span className="civ-tech-level">Lv.{civ.techLevel}</span>
            </div>
            {civ.technologies.size > 0 && (
              <div className="civ-techs">
                {Array.from(civ.technologies).map((techId) => {
                  const tech = TECH_TREE.find((t) => t.id === techId);
                  return tech ? (
                    <span
                      key={techId}
                      className="tech-badge"
                      title={tech.description}
                    >
                      {tech.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {civ.atWar.size > 0 && (
              <div className="civ-wars">
                At war with:{" "}
                {Array.from(civ.atWar)
                  .map((eid) => speciesRegistry.species.get(eid)?.name || eid)
                  .join(", ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// --- Event Log View ---

const EVENT_ICON_COMPONENTS: Record<
  string,
  React.FC<{ size?: number; color?: string }>
> = {
  extinction: SkullIcon,
  tech_discovery: LightbulbIcon,
  kingdom_formed: CastleIcon,
  war: SwordsIcon,
  population_milestone: TrendUpIcon,
  climate: ClimateIcon,
  resource_crisis: WarningIcon,
  new_species: SeedlingIcon,
  mass_starvation: StarvationIcon,
  season_change: CycleIcon,
};

const EventLogView: React.FC<{
  events: WorldEvent[];
  ticksPerYear: number;
}> = ({ events, ticksPerYear }) => {
  if (events.length === 0) {
    return <p className="muted">No events yet. Start the simulation!</p>;
  }

  // Show most recent first, skip season changes if too many
  const filtered = events.filter(
    (e) => e.type !== "season_change" || events.indexOf(e) > events.length - 10,
  );
  const recent = filtered.slice(-20).reverse();

  return (
    <div className="event-log">
      {recent.map((event, i) => (
        <div key={i} className={`event-row event-${event.type}`}>
          <span className="event-icon">
            {EVENT_ICON_COMPONENTS[event.type]
              ? React.createElement(EVENT_ICON_COMPONENTS[event.type], {
                  size: 12,
                })
              : "\u2022"}
          </span>
          <span className="event-time">
            Y{Math.floor(event.tick / ticksPerYear)}
          </span>
          <span className="event-msg">{event.message}</span>
        </div>
      ))}
    </div>
  );
};
