import React from 'react';
import { ArrowRight, AlertTriangle, Zap, ShieldCheck, Cpu } from 'lucide-react';
import { PixelAsset } from '../components/PixelAsset';
import type {
  AlgorithmId,
  DatasetBundle,
  JoinedBatteryModel,
  PageId,
  SimulationConfig,
  SimulationResult,
  StationFilter,
} from '../types/swapsched';

interface OverviewPageProps {
  dataset: DatasetBundle;
  batteryModels: JoinedBatteryModel[];
  simulation: SimulationResult;
  currentIntervalIndex: number;
  stationFilter: StationFilter;
  algorithm: AlgorithmId;
  config: SimulationConfig;
  onNavigate: (page: PageId) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  dataset,
  batteryModels,
  simulation,
  currentIntervalIndex,
  stationFilter,
  algorithm,
  config,
  onNavigate,
}) => {
  const activeStations =
    stationFilter === 'ALL'
      ? dataset.station_data
      : dataset.station_data.filter((s) => s.station_id === stationFilter);

  const scopedVehicles =
    stationFilter === 'ALL'
      ? dataset.vehicle_profiles
      : dataset.vehicle_profiles.filter((v) => v.home_station_id === stationFilter);

  const scopedPacks =
    stationFilter === 'ALL'
      ? batteryModels
      : batteryModels.filter((b) => b.station_id === stationFilter);

  const totalPorts = activeStations.reduce((sum, s) => {
    const ov = config.stationOverrides[s.station_id];
    return sum + (ov ? ov.charging_ports : s.charging_ports);
  }, 0);

  const totalPowerCap = activeStations.reduce((sum, s) => {
    const ov = config.stationOverrides[s.station_id];
    return sum + (ov ? ov.power_capacity_kw : s.power_capacity_kw);
  }, 0);

  const currentInterval = simulation.intervals[currentIntervalIndex] ?? simulation.intervals[0];
  const freePortsNow = Math.max(0, totalPorts - (currentInterval?.activePorts ?? 0));
  const excludedCount = scopedPacks.filter((p) => p.exclusionReason !== null).length;

  return (
    <div className="space-y-8">
      {/* Synthetic Demonstration Disclosure */}
      <div className="p-4 bg-[#EBE8DF] border border-[#141513] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#9A3412] shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-[#141513]">
            <strong className="font-semibold">Demonstration Dataset Notice:</strong>{' '}
            {dataset.isSyntheticDemo
              ? 'All preloaded OptiSwap records (vehicles, trips, batteries, telemetry, and Delhi station logs) are synthetic demonstration data—not live OEM or production telemetry.'
              : `Active source: ${dataset.sourceLabel}.`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('data-explorer')}
          className="px-3 py-1.5 bg-white border border-[#141513] text-xs font-mono-tech font-medium hover:bg-[#B8FF2E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Inspect or Upload CSVs
        </button>
      </div>

      {/* Asymmetric Editorial Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 border border-[#141513] bg-white items-stretch">
        <div className="lg:col-span-6 p-6 lg:p-10 flex flex-col justify-between pixel-grid-bg border-b lg:border-b-0 lg:border-r border-[#141513]">
          <div className="space-y-5">
            <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
              01 · EV Fleet Energy &amp; Battery Swap Orchestration
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#141513] leading-[1.05] text-balance">
              Predict energy deficits. Dispatch every watt with precision.
            </h1>
            <p className="text-base text-[#4A4B45] max-w-xl leading-relaxed">
              SwapSched joins fleet trip history, physical battery telemetry, and Delhi hub tariff
              constraints to run{' '}
              <strong className="text-[#141513]">
                AUPA (Adaptive Urgency &amp; Predictive Allocation)
              </strong>{' '}
              and benchmark it side-by-side against FCFS, SJF, EDF, and exact MILP optimization.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-[#141513] flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('scheduler')}
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#B8FF2E] border border-[#141513] hard-shadow-sm text-sm font-semibold text-[#141513] hover:bg-[#A6EE1C] transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Open Intelligent Scheduler</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('control-room')}
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#141513] text-[#F4F2EC] border border-[#141513] text-sm font-medium hover:bg-[#2A2C27] transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Launch Control Room</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col bg-[#F4F2EC]">
          <PixelAsset
            src="/src/assets/images/pixel_swap_station_hero_1794850803458.jpg"
            alt="Isometric pixel-art illustration of a SwapSched EV battery swapping hub"
            aspectClass="aspect-[4/3] lg:h-full"
            label="Delhi Automated Battery Swap Hub"
          />
          <div className="px-4 py-2.5 bg-[#141513] text-[#F4F2EC] flex items-center justify-between gap-4 font-mono-tech text-xs border-t border-[#141513]">
            <span>Hub Topology · Dwarka Sec 12 &amp; Janakpuri DC</span>
            <span className="text-[#B8FF2E]">Active Solver: {algorithm}</span>
          </div>
        </div>
      </section>

      {/* Network Overview Metric Strip */}
      <section aria-label="Network overview summary">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-t border-l border-[#141513]">
          <div className="p-5 bg-white border-r border-b border-[#141513]">
            <div className="font-mono-tech text-xs text-[#4A4B45]">Total Stations</div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">
              {activeStations.length}
            </div>
            <div className="mt-1 text-xs text-[#6C6D65]">Delhi NCR Hubs</div>
          </div>

          <div className="p-5 bg-white border-r border-b border-[#141513]">
            <div className="font-mono-tech text-xs text-[#4A4B45]">Registered Vehicles</div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">
              {scopedVehicles.length}
            </div>
            <div className="mt-1 text-xs text-[#6C6D65]">e-2W / e-3W / e-LCV</div>
          </div>

          <div className="p-5 bg-white border-r border-b border-[#141513]">
            <div className="font-mono-tech text-xs text-[#4A4B45]">Battery Packs</div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">
              {scopedPacks.length}
            </div>
            <div className="mt-1 text-xs text-[#6C6D65]">
              {excludedCount > 0 ? `${excludedCount} quarantined` : 'All healthy'}
            </div>
          </div>

          <div className="p-5 bg-white border-r border-b border-[#141513]">
            <div className="font-mono-tech text-xs text-[#4A4B45]">Available Ports</div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">
              {freePortsNow}
              <span className="text-base font-normal text-[#6C6D65]"> / {totalPorts}</span>
            </div>
            <div className="mt-1 text-xs text-[#6C6D65]">
              At slot {currentInterval?.clockLabel ?? '10:00'}
            </div>
          </div>

          <div className="p-5 bg-white border-r border-b border-[#141513]">
            <div className="font-mono-tech text-xs text-[#4A4B45]">Total Hub Capacity</div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">
              {totalPowerCap} <span className="text-base font-mono-tech font-normal">kW</span>
            </div>
            <div className="mt-1 text-xs text-[#6C6D65]">
              {(currentInterval?.totalPowerKw ?? 0).toFixed(1)} kW dispatched
            </div>
          </div>

          <div className="p-5 bg-[#B8FF2E] border-r border-b border-[#141513]">
            <div className="font-mono-tech text-xs text-[#141513] font-medium">
              Simulated Network
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-[#141513]">
              {excludedCount > 0 ? 'Constrained' : 'Nominal'}
            </div>
            <div className="mt-1 font-mono-tech text-xs text-[#141513] tabular-nums">
              Readiness {simulation.metrics.batteryReadinessPct}%
            </div>
          </div>
        </div>
      </section>

      {/* Three Core Engineering Pillars + Pixel EV Fleet Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 border border-[#141513] bg-white flex flex-col justify-between">
          <PixelAsset
            src="/src/assets/images/pixel_ev_fleet_transit_1794850804993.jpg"
            alt="Pixel-art EV three-wheelers and vans queuing at a Delhi solar swap canopy"
            aspectClass="aspect-[16/9]"
            label="Delhi EV Fleet Swap Queue"
          />
          <div className="p-5 border-t border-[#141513] space-y-2">
            <h2 className="font-display text-xl font-bold">
              Real Relational Joins Across 7 CSV Tables
            </h2>
            <p className="text-sm text-[#4A4B45] leading-relaxed">
              Every charge decision traces back to joined vehicle profiles, trip energy rates
              (kWh/km), battery catalog specs, and timestamp-ordered telemetry snapshots.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="inline-flex items-center gap-1.5 text-xs font-mono-tech font-semibold text-[#5340C4] hover:underline pt-1 cursor-pointer"
            >
              <span>Explore Predictive Analytics</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 border-t border-l border-[#141513]">
          <div className="p-5 bg-white border-r border-b border-[#141513] flex flex-col justify-between">
            <div className="space-y-3">
              <Cpu className="w-6 h-6 text-[#5340C4]" />
              <h3 className="font-display text-lg font-bold">AUPA Scoring</h3>
              <p className="text-xs text-[#4A4B45] leading-relaxed">
                Combines energy urgency (U), predicted demand (D), deadline urgency (T), cycle wear
                (H), and anti-starvation wait boost (W) with transparent explanations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('scheduler')}
              className="mt-5 text-left font-mono-tech text-xs font-semibold text-[#141513] hover:text-[#5340C4] cursor-pointer"
            >
              Tune Weights →
            </button>
          </div>

          <div className="p-5 bg-white border-r border-b border-[#141513] flex flex-col justify-between">
            <div className="space-y-3">
              <Zap className="w-6 h-6 text-[#141513]" />
              <h3 className="font-display text-lg font-bold">5-Solver Benchmark</h3>
              <p className="text-xs text-[#4A4B45] leading-relaxed">
                Identical hub constraints power AUPA, FCFS, SJF, EDF, and Exact Branch-and-Bound
                MILP so you inspect real trade-offs—not synthetic numbers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('comparison')}
              className="mt-5 text-left font-mono-tech text-xs font-semibold text-[#141513] hover:text-[#5340C4] cursor-pointer"
            >
              Compare Solvers →
            </button>
          </div>

          <div className="p-5 bg-white border-r border-b border-[#141513] flex flex-col justify-between">
            <div className="space-y-3">
              <ShieldCheck className="w-6 h-6 text-[#166534]" />
              <h3 className="font-display text-lg font-bold">Safety Quarantine</h3>
              <p className="text-xs text-[#4A4B45] leading-relaxed">
                Packs reporting BMS faults or cell temperatures above {config.unsafeTempThresholdC}°C
                are automatically flagged and excluded from port dispatch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('batteries')}
              className="mt-5 text-left font-mono-tech text-xs font-semibold text-[#141513] hover:text-[#5340C4] cursor-pointer"
            >
              Inspect Packs →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
