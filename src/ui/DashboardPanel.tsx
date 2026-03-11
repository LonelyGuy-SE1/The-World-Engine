import React, { useRef, useEffect, useMemo } from "react";
import { WorldStats } from "../engine/types";
import { SimulationInstance } from "../engine/Simulation";
import { SpeciesRegistry } from "../engine/Agent";

interface DashboardPanelProps {
  instance: SimulationInstance | null;
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ instance }) => {
  if (!instance) return null;

  const { stats, statsHistory, speciesRegistry } = instance;

  return (
    <div className="panel dashboard-panel">
      <h3>Dashboard</h3>

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
          format={(v) => `${v.toFixed(1)}°C`}
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

    // Gather all species IDs that ever appeared
    const allSpeciesIds = new Set<number>();
    for (const snap of statsHistory) {
      for (const id of snap.speciesPopulations.keys()) {
        allSpeciesIds.add(id);
      }
    }

    // Draw each species line
    for (const spId of allSpeciesIds) {
      const sp = speciesRegistry.species.get(spId);
      if (!sp) continue;

      const populations = statsHistory.map(
        (s) => s.speciesPopulations.get(spId) || 0,
      );
      const maxPop = Math.max(...populations, 1);

      ctx.strokeStyle = sp.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < populations.length; i++) {
        const x = (i / (populations.length - 1)) * w;
        const y = h - (populations[i] / maxPop) * h * 0.85 - h * 0.05;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.stroke();
  }, [statsHistory, speciesRegistry]);

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
