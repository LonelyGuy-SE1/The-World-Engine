import React, { useState } from "react";
import { InterventionType, Intervention } from "../engine/types";
import { Simulation, SimulationInstance } from "../engine/Simulation";
import { SpeciesRegistry } from "../engine/Agent";

interface ExperimentPanelProps {
  simulation: Simulation;
  instance: SimulationInstance | null;
}

const INTERVENTION_LABELS: Record<InterventionType, string> = {
  [InterventionType.TemperatureShift]: "Temperature Shift",
  [InterventionType.ResourceMultiplier]: "Resource Multiplier",
  [InterventionType.IntroducePredator]: "Introduce Predator",
  [InterventionType.RemoveSpecies]: "Remove Species",
  [InterventionType.MutationRateChange]: "Mutation Rate Change",
  [InterventionType.AddHazard]: "Add Hazard Zone",
  [InterventionType.SpawnCustomAgent]: "Spawn Custom Agent",
  [InterventionType.ClimateEvent]: "Climate Event",
};

export const ExperimentPanel: React.FC<ExperimentPanelProps> = ({
  simulation,
  instance,
}) => {
  const [selectedType, setSelectedType] = useState<InterventionType>(
    InterventionType.TemperatureShift,
  );
  const [params, setParams] = useState<Record<string, number | string>>({});

  if (!instance) return null;

  const handleApply = () => {
    const intervention: Intervention = {
      type: selectedType,
      worldId: instance.id,
      tick: instance.tick,
      params: params as Record<string, number | string | boolean>,
    };
    simulation.applyIntervention(instance.id, intervention);
    setParams({});
  };

  const handleCloneWorld = () => {
    simulation.cloneInstance(instance.id, `${instance.name} (clone)`);
  };

  const species = instance.speciesRegistry.getAliveSpecies();

  return (
    <div className="panel experiment-panel">
      <h3>Experiments</h3>

      <div className="control-row">
        <button className="btn btn-secondary" onClick={handleCloneWorld}>
          Clone World
        </button>
      </div>

      <h4>Intervention</h4>
      <select
        value={selectedType}
        onChange={(e) => {
          setSelectedType(e.target.value as InterventionType);
          setParams({});
        }}
        className="select"
      >
        {Object.values(InterventionType).map((type) => (
          <option key={type} value={type}>
            {INTERVENTION_LABELS[type]}
          </option>
        ))}
      </select>

      <div className="param-fields">
        {selectedType === InterventionType.TemperatureShift && (
          <div className="field">
            <label>Temperature Change (°C)</label>
            <input
              type="number"
              value={params.amount || 0}
              onChange={(e) =>
                setParams({ amount: parseFloat(e.target.value) })
              }
              step="1"
            />
          </div>
        )}

        {selectedType === InterventionType.ResourceMultiplier && (
          <div className="field">
            <label>Multiplier</label>
            <input
              type="number"
              value={params.multiplier || 1}
              onChange={(e) =>
                setParams({ multiplier: parseFloat(e.target.value) })
              }
              step="0.1"
              min="0"
              max="10"
            />
          </div>
        )}

        {selectedType === InterventionType.IntroducePredator && (
          <div className="field">
            <label>Count</label>
            <input
              type="number"
              value={params.count || 10}
              onChange={(e) => setParams({ count: parseInt(e.target.value) })}
              min="1"
              max="100"
            />
          </div>
        )}

        {selectedType === InterventionType.RemoveSpecies && (
          <div className="field">
            <label>Species</label>
            <select
              value={params.speciesId || ""}
              onChange={(e) =>
                setParams({ speciesId: parseInt(e.target.value) })
              }
              className="select"
            >
              <option value="">Select species...</option>
              {species.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name} (pop: {sp.population})
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedType === InterventionType.MutationRateChange && (
          <div className="field">
            <label>Multiplier</label>
            <input
              type="number"
              value={params.multiplier || 1}
              onChange={(e) =>
                setParams({ multiplier: parseFloat(e.target.value) })
              }
              step="0.5"
              min="0.1"
              max="10"
            />
          </div>
        )}

        {selectedType === InterventionType.AddHazard && (
          <>
            <div className="field">
              <label>Center X</label>
              <input
                type="number"
                value={params.x || Math.floor(instance.world.width / 2)}
                onChange={(e) =>
                  setParams({ ...params, x: parseInt(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Center Y</label>
              <input
                type="number"
                value={params.y || Math.floor(instance.world.height / 2)}
                onChange={(e) =>
                  setParams({ ...params, y: parseInt(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Radius</label>
              <input
                type="number"
                value={params.radius || 10}
                onChange={(e) =>
                  setParams({ ...params, radius: parseInt(e.target.value) })
                }
                min="1"
                max="50"
              />
            </div>
            <div className="field">
              <label>Intensity (0–1)</label>
              <input
                type="number"
                value={params.intensity || 0.5}
                onChange={(e) =>
                  setParams({
                    ...params,
                    intensity: parseFloat(e.target.value),
                  })
                }
                step="0.1"
                min="0"
                max="1"
              />
            </div>
          </>
        )}

        {selectedType === InterventionType.ClimateEvent && (
          <div className="field">
            <label>Event Type</label>
            <select
              value={params.eventType || "ice_age"}
              onChange={(e) => setParams({ eventType: e.target.value })}
              className="select"
            >
              <option value="ice_age">Ice Age (-15°C)</option>
              <option value="heat_wave">Heat Wave (+20°C)</option>
              <option value="flood">Great Flood</option>
            </select>
          </div>
        )}
      </div>

      <button className="btn btn-danger" onClick={handleApply}>
        Apply Intervention
      </button>

      <h4>Active Species</h4>
      <div className="species-list">
        {species.map((sp) => (
          <div key={sp.id} className="species-row">
            <span
              className="species-dot"
              style={{ backgroundColor: sp.color }}
            />
            <span className="species-name">{sp.name}</span>
            <span className="species-pop">{sp.population}</span>
          </div>
        ))}
        {species.length === 0 && <p className="muted">All species extinct.</p>}
      </div>
    </div>
  );
};
