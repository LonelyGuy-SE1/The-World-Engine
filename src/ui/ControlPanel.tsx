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
  placementTool: string;
  onSetPlacementTool: (tool: string) => void;
  placementRadius: number;
  onSetPlacementRadius: (r: number) => void;
  placementIntensity: number;
  onSetPlacementIntensity: (i: number) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  instance,
  speed,
  onSetSpeed,
  onTogglePlay,
  onStep,
  renderConfig,
  onUpdateRenderConfig,
  placementTool,
  onSetPlacementTool,
  placementRadius,
  onSetPlacementRadius,
  placementIntensity,
  onSetPlacementIntensity,
}) => {
  if (!instance) return null;

  const isRunning = instance.state === SimulationState.Running;
  const year = Math.floor(instance.tick / instance.world.config.ticksPerYear);
  const day = instance.tick % instance.world.config.ticksPerYear;

  return (
    <div className="panel control-panel">
      <h3>Simulation Control</h3>

      <div className="mode-toggle-row">
        <button
          className={`mode-btn ${!renderConfig.detailedMode ? "active" : ""}`}
          onClick={() => onUpdateRenderConfig({ detailedMode: false })}
        >
          Standard
        </button>
        <button
          className={`mode-btn ${renderConfig.detailedMode ? "active" : ""}`}
          onClick={() => onUpdateRenderConfig({ detailedMode: true })}
        >
          Detailed
        </button>
      </div>

      <div className="control-row">
        <button
          className={`btn ${isRunning ? "btn-warning" : "btn-primary"}`}
          onClick={onTogglePlay}
        >
          {isRunning ? (
            <>
              <PauseIcon size={12} /> Pause
            </>
          ) : (
            <>
              <PlayIcon size={12} /> Play
            </>
          )}
        </button>
        <button
          className="btn btn-secondary"
          onClick={onStep}
          disabled={isRunning}
        >
          <StepIcon size={12} /> Step
        </button>
      </div>

      <div className="control-row speed-controls">
        <label>Speed: {speed}x ({(speed * 2)} ticks/s)</label>
        <div className="speed-presets">
          {[1, 2, 5, 10, 25, 50, 100].map(s => (
            <button
              key={s}
              className={`btn btn-xs ${speed === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onSetSpeed(s)}
            >{s}x</button>
          ))}
        </div>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
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

      {renderConfig.showTemperature && (
        <div className="control-row">
          <label>
            Temp Opacity: {Math.round(renderConfig.temperatureOpacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(renderConfig.temperatureOpacity * 100)}
            onChange={(e) =>
              onUpdateRenderConfig({
                temperatureOpacity: parseInt(e.target.value) / 100,
              })
            }
          />
        </div>
      )}
      {renderConfig.showResources && (
        <div className="control-row">
          <label>
            Resource Opacity: {Math.round(renderConfig.resourceOpacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(renderConfig.resourceOpacity * 100)}
            onChange={(e) =>
              onUpdateRenderConfig({
                resourceOpacity: parseInt(e.target.value) / 100,
              })
            }
          />
        </div>
      )}
      {renderConfig.showHazards && (
        <div className="control-row">
          <label>
            Hazard Opacity: {Math.round(renderConfig.hazardOpacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(renderConfig.hazardOpacity * 100)}
            onChange={(e) =>
              onUpdateRenderConfig({
                hazardOpacity: parseInt(e.target.value) / 100,
              })
            }
          />
        </div>
      )}

      <h4>Placement Tools</h4>
      <div className="control-row">
        <button
          className={`btn btn-sm ${placementTool === "none" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onSetPlacementTool("none")}
        >
          Select
        </button>
        <button
          className={`btn btn-sm ${placementTool === "resource" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onSetPlacementTool("resource")}
        >
          + Resource
        </button>
        <button
          className={`btn btn-sm ${placementTool === "hazard" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onSetPlacementTool("hazard")}
        >
          + Hazard
        </button>
        <button
          className={`btn btn-sm ${placementTool === "erase" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onSetPlacementTool("erase")}
        >
          Erase
        </button>
      </div>
      {placementTool !== "none" && (
        <>
          <div className="control-row">
            <label>Radius: {placementRadius}</label>
            <input
              type="range"
              min="1"
              max="20"
              value={placementRadius}
              onChange={(e) => onSetPlacementRadius(parseInt(e.target.value))}
            />
          </div>
          <div className="control-row">
            <label>Intensity: {Math.round(placementIntensity * 100)}%</label>
            <input
              type="range"
              min="1"
              max="100"
              value={Math.round(placementIntensity * 100)}
              onChange={(e) =>
                onSetPlacementIntensity(parseInt(e.target.value) / 100)
              }
            />
          </div>
        </>
      )}
    </div>
  );
};
