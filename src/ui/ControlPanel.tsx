import React from "react";
import { SimulationState } from "../engine/types";
import { SimulationInstance } from "../engine/Simulation";
import { RenderConfig } from "../renderer/CanvasRenderer";
import { PlayIcon, PauseIcon, StepIcon } from "./Icons";

interface ControlPanelProps {
  instance: SimulationInstance | null;
  speed: number;
  onSetSpeed: (speed: number) => void;
  onTogglePlay: () => void;
  onStep: () => void;
  renderConfig: RenderConfig;
  onUpdateRenderConfig: (config: Partial<RenderConfig>) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  instance,
  speed,
  onSetSpeed,
  onTogglePlay,
  onStep,
  renderConfig,
  onUpdateRenderConfig,
}) => {
  if (!instance) return null;

  const isRunning = instance.state === SimulationState.Running;
  const year = Math.floor(instance.tick / instance.world.config.ticksPerYear);
  const day = instance.tick % instance.world.config.ticksPerYear;

  return (
    <div className="panel control-panel">
      <h3>Simulation Control</h3>

      <div className="control-row">
        <button
          className={`btn ${isRunning ? "btn-warning" : "btn-primary"}`}
          onClick={onTogglePlay}
        >
          {isRunning ? <><PauseIcon size={12} /> Pause</> : <><PlayIcon size={12} /> Play</>}
        </button>
        <button
          className="btn btn-secondary"
          onClick={onStep}
          disabled={isRunning}
        >
          <StepIcon size={12} /> Step
        </button>
      </div>

      <div className="control-row">
        <label>Speed: {speed}x</label>
        <input
          type="range"
          min="1"
          max="100"
          value={speed}
          onChange={(e) => onSetSpeed(parseInt(e.target.value))}
        />
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Year</span>
          <span className="stat-value">{year}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Day</span>
          <span className="stat-value">{day}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Agents</span>
          <span className="stat-value">{instance.stats.totalAgents}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Species</span>
          <span className="stat-value">{instance.stats.totalSpecies}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg Energy</span>
          <span className="stat-value">
            {instance.stats.averageEnergy.toFixed(1)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg Temp</span>
          <span className="stat-value">
            {instance.stats.averageTemperature.toFixed(1)}°C
          </span>
        </div>
      </div>

      <h4>Overlays</h4>
      <div className="toggle-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={renderConfig.showTemperature}
            onChange={(e) =>
              onUpdateRenderConfig({ showTemperature: e.target.checked })
            }
          />
          Temperature
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={renderConfig.showResources}
            onChange={(e) =>
              onUpdateRenderConfig({ showResources: e.target.checked })
            }
          />
          Resources
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={renderConfig.showHazards}
            onChange={(e) =>
              onUpdateRenderConfig({ showHazards: e.target.checked })
            }
          />
          Hazards
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={renderConfig.showGrid}
            onChange={(e) =>
              onUpdateRenderConfig({ showGrid: e.target.checked })
            }
          />
          Grid
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={renderConfig.showAgentVision}
            onChange={(e) =>
              onUpdateRenderConfig({ showAgentVision: e.target.checked })
            }
          />
          Agent Vision
        </label>
      </div>
    </div>
  );
};
