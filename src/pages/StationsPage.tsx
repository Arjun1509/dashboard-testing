import React from 'react';
import type {
  DatasetBundle,
  JoinedBatteryModel,
  SimulationConfig,
  SimulationResult,
} from '../types/swapsched';
import { resolveTariffForHour } from '../engine/simulator';

interface StationsPageProps {
  dataset: DatasetBundle;
  batteryModels: JoinedBatteryModel[];
  simulation: SimulationResult;
  currentIntervalIndex: number;
  config: SimulationConfig;
  onConfigChange: (next: SimulationConfig) => void;
}

export const StationsPage: React.FC<StationsPageProps> = ({
  dataset,
  batteryModels,
  simulation,
  currentIntervalIndex,
  config,
  onConfigChange,
}) => {
  const currentInterval = simulation.intervals[currentIntervalIndex] ?? simulation.intervals[0];

  const updateStation = (
    stationId: string,
    field: 'power_capacity_kw' | 'charging_ports',
    value: number
  ) => {
    const stn = dataset.station_data.find((s) => s.station_id === stationId);
    const cur = config.stationOverrides[stationId] ?? {
      power_capacity_kw: stn?.power_capacity_kw ?? 36,
      charging_ports: stn?.charging_ports ?? 6,
    };
    onConfigChange({
      ...config,
      stationOverrides: {
        ...config.stationOverrides,
        [stationId]: {
          ...cur,
          [field]: value,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            07 · Delhi NCR Hub Infrastructure &amp; INR Tariff Bands
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Station Management
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono-tech">
          <label htmlFor="sim-start-hour" className="text-[#4A4B45]">
            Dispatch Start Hour:
          </label>
          <select
            id="sim-start-hour"
            value={config.startHour}
            onChange={(e) => onConfigChange({ ...config, startHour: Number(e.target.value) })}
            className="px-3 py-1.5 bg-white border border-[#141513] cursor-pointer"
          >
            <option value={4}>04:00 (Off-Peak Morning)</option>
            <option value={10}>10:00 (Standard Day)</option>
            <option value={17}>17:00 (Peak Evening Tariff)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {dataset.station_data.map((stn) => {
          const ov = config.stationOverrides[stn.station_id];
          const powerCap = ov ? ov.power_capacity_kw : stn.power_capacity_kw;
          const portsCap = ov ? ov.charging_ports : stn.charging_ports;

          const packsHere = batteryModels.filter((b) => b.station_id === stn.station_id);
          const allocsNow = (currentInterval?.allocations ?? []).filter(
            (a) => a.station_id === stn.station_id
          );
          const activeKw = allocsNow.reduce((s, a) => s + a.powerKw, 0);
          const utilPct = powerCap > 0 ? Math.round((activeKw / powerCap) * 100) : 0;

          // Calculate station-specific horizon INR cost
          let stnHorizonCostInr = 0;
          let stnHorizonEnergyKwh = 0;
          simulation.intervals.forEach((iv) => {
            const ivHour = config.startHour + iv.startMinutes / 60;
            const tariff = resolveTariffForHour(stn, ivHour);
            const stnAllocs = iv.allocations.filter((a) => a.station_id === stn.station_id);
            stnAllocs.forEach((a) => {
              stnHorizonEnergyKwh += a.energyAddedKwh;
              stnHorizonCostInr += a.powerKw * (config.intervalMinutes / 60) * tariff.rateInr;
            });
          });

          const currentTariff = resolveTariffForHour(
            stn,
            config.startHour + (currentInterval?.startMinutes ?? 0) / 60
          );

          return (
            <section key={stn.station_id} className="bg-white border border-[#141513] p-6 space-y-5">
              <div className="flex items-start justify-between border-b border-[#141513] pb-4">
                <div>
                  <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
                    {stn.station_id} · {stn.city}
                  </div>
                  <h2 className="font-display text-2xl font-bold mt-0.5">{stn.station_name}</h2>
                </div>
                <div className="px-2.5 py-1 bg-[#DCFCE7] border border-[#141513] font-mono-tech text-xs font-semibold text-[#166534]">
                  ■ Grid {stn.grid_status}
                </div>
              </div>

              {/* Infrastructure Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tech text-xs">
                <div className="p-3 bg-[#F4F2EC] border border-[#DCDAD0]">
                  <div className="text-[10px] text-[#6C6D65]">Charging Bays</div>
                  <div className="mt-1 text-lg font-bold">{stn.total_bays}</div>
                </div>
                <div className="p-3 bg-[#F4F2EC] border border-[#DCDAD0]">
                  <div className="text-[10px] text-[#6C6D65]">Active Chargers</div>
                  <div className="mt-1 text-lg font-bold">
                    {allocsNow.length} / {portsCap}
                  </div>
                </div>
                <div className="p-3 bg-[#F4F2EC] border border-[#DCDAD0]">
                  <div className="text-[10px] text-[#6C6D65]">Power Utilization</div>
                  <div className="mt-1 text-lg font-bold">{utilPct}%</div>
                </div>
                <div className="p-3 bg-[#B8FF2E] border border-[#141513]">
                  <div className="text-[10px] text-[#141513]">Est. Horizon Cost</div>
                  <div className="mt-1 text-lg font-bold">₹{stnHorizonCostInr.toFixed(0)}</div>
                </div>
              </div>

              {/* Interactive Capacity & Port Override Controls */}
              <div className="p-4 bg-[#F4F2EC] border border-[#141513] space-y-3 text-xs font-mono-tech">
                <div className="font-semibold text-[#141513]">
                  Live Hub Constraint Controls (Recomputes Scheduler Immediately)
                </div>
                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-5 text-[#4A4B45]">Power Capacity (kW)</label>
                  <input
                    type="range"
                    min={12}
                    max={80}
                    step={2}
                    value={powerCap}
                    onChange={(e) =>
                      updateStation(stn.station_id, 'power_capacity_kw', Number(e.target.value))
                    }
                    className="col-span-5 accent-[#141513] cursor-pointer"
                  />
                  <span className="col-span-2 text-right font-bold">{powerCap} kW</span>
                </div>
                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-5 text-[#4A4B45]">Charging Ports</label>
                  <input
                    type="range"
                    min={2}
                    max={14}
                    step={1}
                    value={portsCap}
                    onChange={(e) =>
                      updateStation(stn.station_id, 'charging_ports', Number(e.target.value))
                    }
                    className="col-span-5 accent-[#141513] cursor-pointer"
                  />
                  <span className="col-span-2 text-right font-bold">{portsCap} ports</span>
                </div>
              </div>

              {/* Electricity Tariff Bands (INR / kWh) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-bold">Electricity Tariff Bands (INR/kWh)</span>
                  <span className="font-mono-tech text-[#5340C4]">
                    Active Slot: {currentTariff.band} (₹{currentTariff.rateInr.toFixed(2)}/kWh)
                  </span>
                </div>
                <div className="grid grid-cols-3 border-t border-l border-[#141513] font-mono-tech text-xs">
                  <div className="p-3 bg-white border-r border-b border-[#141513]">
                    <div className="text-[10px] text-[#6C6D65]">Off-Peak (23:00–06:00)</div>
                    <div className="mt-1 font-bold text-[#166534]">
                      ₹{stn.offpeak_tariff_inr_kwh.toFixed(2)}/kWh
                    </div>
                  </div>
                  <div className="p-3 bg-white border-r border-b border-[#141513]">
                    <div className="text-[10px] text-[#6C6D65]">Standard Day</div>
                    <div className="mt-1 font-bold">
                      ₹{stn.base_tariff_inr_kwh.toFixed(2)}/kWh
                    </div>
                  </div>
                  <div className="p-3 bg-white border-r border-b border-[#141513]">
                    <div className="text-[10px] text-[#6C6D65]">Peak ({stn.peak_hours})</div>
                    <div className="mt-1 font-bold text-[#B91C1C]">
                      ₹{stn.peak_tariff_inr_kwh.toFixed(2)}/kWh
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-[#4A4B45] font-mono-tech flex justify-between pt-1">
                <span>Assigned Packs: {packsHere.length}</span>
                <span>Horizon Delivered: {stnHorizonEnergyKwh.toFixed(2)} kWh</span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
