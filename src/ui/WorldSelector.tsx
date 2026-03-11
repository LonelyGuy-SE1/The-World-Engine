import React, { useState } from "react";
import { Simulation, SimulationInstance } from "../engine/Simulation";
import { DEFAULT_WORLD_CONFIG, WorldConfig } from "../engine/types";

interface WorldSelectorProps {
  simulation: Simulation;
  instances: SimulationInstance[];
  activeId: string | null;
  onSelectInstance: (id: string) => void;
  onCreateWorld: (name: string, config: Partial<WorldConfig>) => void;
  onRemoveWorld: (id: string) => void;
}

export const WorldSelector: React.FC<WorldSelectorProps> = ({
  simulation,
  instances,
  activeId,
  onSelectInstance,
  onCreateWorld,
  onRemoveWorld,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("New World");
  const [newWidth, setNewWidth] = useState(DEFAULT_WORLD_CONFIG.width);
  const [newHeight, setNewHeight] = useState(DEFAULT_WORLD_CONFIG.height);
  const [newAgents, setNewAgents] = useState(
    DEFAULT_WORLD_CONFIG.initialAgents,
  );
  const [newSpecies, setNewSpecies] = useState(
    DEFAULT_WORLD_CONFIG.initialSpecies,
  );
  const [newTemp, setNewTemp] = useState(DEFAULT_WORLD_CONFIG.baseTemperature);

  const handleCreate = () => {
    onCreateWorld(newName, {
      width: newWidth,
      height: newHeight,
      initialAgents: newAgents,
      initialSpecies: newSpecies,
      baseTemperature: newTemp,
      seed: Date.now(),
    });
    setShowCreate(false);
    setNewName("New World");
  };

  return (
    <div className="panel world-selector">
      <h3>Worlds</h3>

      <div className="world-list">
        {instances.map((inst) => (
          <div
            key={inst.id}
            className={`world-item ${inst.id === activeId ? "active" : ""}`}
            onClick={() => onSelectInstance(inst.id)}
          >
            <div className="world-item-header">
              <span className="world-name">{inst.name}</span>
              <button
                className="btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveWorld(inst.id);
                }}
                title="Remove world"
              >
                ✕
              </button>
            </div>
            <div className="world-item-stats">
              <span>Tick: {inst.tick}</span>
              <span>Agents: {inst.stats.totalAgents}</span>
              <span>Species: {inst.stats.totalSpecies}</span>
            </div>
          </div>
        ))}
      </div>

      {showCreate ? (
        <div className="create-world-form">
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Width</label>
              <input
                type="number"
                value={newWidth}
                onChange={(e) => setNewWidth(parseInt(e.target.value))}
                min={32}
                max={512}
              />
            </div>
            <div className="field">
              <label>Height</label>
              <input
                type="number"
                value={newHeight}
                onChange={(e) => setNewHeight(parseInt(e.target.value))}
                min={32}
                max={512}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Agents</label>
              <input
                type="number"
                value={newAgents}
                onChange={(e) => setNewAgents(parseInt(e.target.value))}
                min={10}
                max={5000}
              />
            </div>
            <div className="field">
              <label>Species</label>
              <input
                type="number"
                value={newSpecies}
                onChange={(e) => setNewSpecies(parseInt(e.target.value))}
                min={1}
                max={20}
              />
            </div>
          </div>
          <div className="field">
            <label>Base Temperature (°C)</label>
            <input
              type="number"
              value={newTemp}
              onChange={(e) => setNewTemp(parseInt(e.target.value))}
              min={-30}
              max={50}
            />
          </div>
          <div className="control-row">
            <button className="btn btn-primary" onClick={handleCreate}>
              Create
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-primary full-width"
          onClick={() => setShowCreate(true)}
        >
          + New World
        </button>
      )}
    </div>
  );
};
