import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { SlidersHorizontal, RotateCcw, AlertCircle } from 'lucide-react';
import type {
  AlgorithmId,
  DatasetBundle,
  SimulationConfig,
  SimulationResult,
  StationFilter,
} from '../types/swapsched';

interface SchedulerPageProps {
  dataset: DatasetBundle;
  algorithm: AlgorithmId;
  onAlgorithmChange: (alg: AlgorithmId) => void;
  simulation: SimulationResult;
  currentIntervalIndex: number;
  onSelectInterval: (idx: number) => void;
  config: SimulationConfig;
  onConfigChange: (next: SimulationConfig) => void;
  onResetDefaults: () => void;
  stationFilter: StationFilter;
}

const ALGORITHMS: Array<{ id: AlgorithmId; name: string; desc: string }> = [
  { id: 'AUPA', name: 'AUPA (Proposed)', desc: 'Adaptive Urgency + Predictive Demand + Wait Boost' },
  { id: 'FCFS', name: 'FCFS', desc: 'First Come, First Served by swap return time' },
  { id: 'SJF', name: 'SJF', desc: 'Shortest Job First by remaining charge duration' },
  { id: 'EDF', name: 'EDF', desc: 'Earliest Simulated Readiness Deadline First' },
  { id: 'MILP', name: 'MILP', desc: 'Integer port + continuous power optimization' },
];

export const SchedulerPage: React.FC<SchedulerPageProps> = ({
  dataset,
  algorithm,
  onAlgorithmChange,
  simulation,
  currentIntervalIndex,
  onSelectInterval,
  config,
  onConfigChange,
  onResetDefaults,
  stationFilter,
}) => {
  const [showConfigDrawer, setShowConfigDrawer] = useState(true);

  const activeStations =
    stationFilter === 'ALL'
      ? dataset.station_data
      : dataset.station_data.filter((s) => s.station_id === stationFilter);

  const updateWeight = (key: keyof SimulationConfig['aupaWeights'], val: number) => {
    onConfigChange({
      ...config,
      aupaWeights: {
        ...config.aupaWeights,
        [key]: val,
      },
    });
  };

  const updateStationOverride = (
    stationId: string,
    field: 'power_capacity_kw' | 'charging_ports',
    val: number
  ) => {
    const base = dataset.station_data.find((s) => s.station_id === stationId);
    const cur = config.stationOverrides[stationId] ?? {
      power_capacity_kw: base?.power_capacity_kw ?? 36,
      charging_ports: base?.charging_ports ?? 6,
    };
    onConfigChange({
      ...config,
      stationOverrides: {
        ...config.stationOverrides,
        [stationId]: {
          ...cur,
          [field]: val,
        },
      },
    });
  };

  const updateDeadline = (batteryId: string, minutes: number) => {
    onConfigChange({
      ...config,
      simulatedDeadlinesMinutes: {
        ...config.simulatedDeadlinesMinutes,
        [batteryId]: minutes,
      },
    });
  };

  // Build stacked timeline chart data per interval
  const timelineChartData = simulation.intervals.map((iv) => ({
    clock: iv.clockLabel,
    powerKw: iv.totalPowerKw,
    energyKwh: iv.energyDeliveredKwh,
    ports: iv.activePorts,
  }));

  // Distinct battery IDs participating across the simulation for Gantt-style matrix
  const batteryIdsInHorizon = simulation.initialRanking
    .filter((r) => !r.exclusionReason && (r.deficitKwh > 0.01 || r.allocatedPowerKw > 0))
    .map((r) => r.battery_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            04 · Priority Scoring, Constraints &amp; Dispatch Timeline
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Intelligent Scheduler
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#141513] text-xs font-mono-tech font-medium hover:bg-[#EBE8DF] cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showConfigDrawer ? 'Hide Parameters' : 'Tune Parameters'}</span>
          </button>
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#141513] text-xs font-mono-tech font-medium hover:bg-[#B8FF2E] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Algorithm Selector Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border-t border-l border-[#141513]">
        {ALGORITHMS.map((alg) => {
          const active = algorithm === alg.id;
          return (
            <button
              key={alg.id}
              type="button"
              onClick={() => onAlgorithmChange(alg.id)}
              className={`p-4 text-left border-r border-b border-[#141513] transition-colors cursor-pointer ${
                active ? 'bg-[#B8FF2E] text-[#141513]' : 'bg-white hover:bg-[#EBE8DF]'
              }`}
            >
              <div className="font-mono-tech text-xs font-bold">{alg.name}</div>
              <div className="mt-1 text-xs text-[#4A4B45] leading-snug">{alg.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Solver Disclosure Notice (especially for MILP) */}
      <div className="px-4 py-2.5 bg-[#E9E5FB] border border-[#141513] flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tech">
        <span>
          Active Solver Execution: <strong>{simulation.metrics.solverMode}</strong>
        </span>
        <span>
          Horizon: {config.horizonIntervals} × {config.intervalMinutes} min (
          {(config.horizonIntervals * config.intervalMinutes) / 60}h) · Deadline Success:{' '}
          <strong>{simulation.metrics.deadlineSuccessRatePct}%</strong>
        </span>
      </div>

      {/* Configurable Weights, Hub Constraints & Simulated Readiness Assumptions */}
      {showConfigDrawer && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white border border-[#141513] p-5">
          {/* AUPA Weights */}
          <div className="lg:col-span-5 space-y-3 border-b lg:border-b-0 lg:border-r border-[#DCDAD0] pb-4 lg:pb-0 lg:pr-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">AUPA Priority Weights</h2>
              <span className="font-mono-tech text-xs text-[#5340C4]">
                Σ ={' '}
                {(
                  config.aupaWeights.wU +
                  config.aupaWeights.wD +
                  config.aupaWeights.wT +
                  config.aupaWeights.wH
                ).toFixed(2)}
              </span>
            </div>
            <div className="space-y-2.5 text-xs font-mono-tech">
              {[
                { key: 'wU' as const, label: 'U(i) Energy Urgency', max: 1 },
                { key: 'wD' as const, label: 'D(i) Predicted Trip Demand', max: 1 },
                { key: 'wT' as const, label: 'T(i) Deadline Urgency', max: 1 },
                { key: 'wH' as const, label: 'H(i) Historical Cycle Wear', max: 1 },
                { key: 'waitBoostPerInterval' as const, label: 'W(i) Wait Boost / Slot', max: 0.2 },
              ].map((row) => (
                <div key={row.key} className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-6 text-[#4A4B45]">{row.label}</label>
                  <input
                    type="range"
                    min={0}
                    max={row.max}
                    step={0.01}
                    value={config.aupaWeights[row.key]}
                    onChange={(e) => updateWeight(row.key, Number(e.target.value))}
                    className="col-span-4 accent-[#5340C4] cursor-pointer"
                  />
                  <span className="col-span-2 text-right font-semibold">
                    {config.aupaWeights[row.key].toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Station Power & Port Constraints */}
          <div className="lg:col-span-4 space-y-3 border-b lg:border-b-0 lg:border-r border-[#DCDAD0] pb-4 lg:pb-0 lg:pr-5">
            <h2 className="font-display text-base font-bold">Hub Capacity &amp; Interval</h2>
            <div className="flex items-center justify-between text-xs font-mono-tech">
              <span className="text-[#4A4B45]">Simulation Interval</span>
              <select
                value={config.intervalMinutes}
                onChange={(e) =>
                  onConfigChange({ ...config, intervalMinutes: Number(e.target.value) })
                }
                className="px-2 py-1 border border-[#141513] bg-[#F4F2EC]"
              >
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes (Default)</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>
            {activeStations.map((s) => {
              const ov = config.stationOverrides[s.station_id] ?? {
                power_capacity_kw: s.power_capacity_kw,
                charging_ports: s.charging_ports,
              };
              return (
                <div key={s.station_id} className="p-2.5 bg-[#F4F2EC] border border-[#DCDAD0] space-y-2 text-xs font-mono-tech">
                  <div className="font-semibold text-[#141513]">{s.station_name}</div>
                  <div className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-5 text-[#4A4B45]">Cap (kW)</span>
                    <input
                      type="range"
                      min={12}
                      max={80}
                      step={2}
                      value={ov.power_capacity_kw}
                      onChange={(e) =>
                        updateStationOverride(s.station_id, 'power_capacity_kw', Number(e.target.value))
                      }
                      className="col-span-5 accent-[#141513] cursor-pointer"
                    />
                    <span className="col-span-2 text-right font-bold">{ov.power_capacity_kw}</span>
                  </div>
                  <div className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-5 text-[#4A4B45]">Ports</span>
                    <input
                      type="range"
                      min={2}
                      max={14}
                      step={1}
                      value={ov.charging_ports}
                      onChange={(e) =>
                        updateStationOverride(s.station_id, 'charging_ports', Number(e.target.value))
                      }
                      className="col-span-5 accent-[#141513] cursor-pointer"
                    />
                    <span className="col-span-2 text-right font-bold">{ov.charging_ports}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assumption Notice */}
          <div className="lg:col-span-3 flex flex-col justify-between space-y-3">
            <div className="p-3 bg-[#FFEDD5] border border-[#141513] text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[#9A3412]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Simulated Deadlines (Assumptions)</span>
              </div>
              <p className="text-[#4A4B45] leading-snug">
                The source dataset lacks future vehicle dispatch timestamps. Readiness targets below
                are configurable operator assumptions (default 60–180 min) and can be edited
                per-pack directly in the ranking table.
              </p>
            </div>
            <div className="p-3 bg-[#F4F2EC] border border-[#141513] font-mono-tech text-xs">
              Formula:
              <br />
              <strong className="text-[#141513]">
                P(i) = {config.aupaWeights.wU.toFixed(2)}U + {config.aupaWeights.wD.toFixed(2)}D +{' '}
                {config.aupaWeights.wT.toFixed(2)}T + {config.aupaWeights.wH.toFixed(2)}H + W
              </strong>
            </div>
          </div>
        </section>
      )}

      {/* Priority Ranking & Score Breakdown Table */}
      <section className="bg-white border border-[#141513]">
        <div className="px-5 py-4 border-b border-[#141513] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">
              Battery Priority Ranking &amp; Score Explanation (t = 0)
            </h2>
            <p className="text-xs text-[#4A4B45]">
              Normalized AUPA components U, D, T, H, W are computed for every eligible pack alongside
              the selected solver&apos;s port dispatch.
            </p>
          </div>
          <div className="font-mono-tech text-xs text-[#5340C4]">
            Edit &ldquo;Target (min)&rdquo; to test deadline shifts
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#EBE8DF] border-b border-[#141513] font-mono-tech text-left">
                <th className="p-3">Rank</th>
                <th className="p-3">Battery ID</th>
                <th className="p-3">Status / Port</th>
                <th className="p-3 text-right">Power</th>
                <th className="p-3 text-right">Deficit</th>
                <th className="p-3 text-right">Trip Dem.</th>
                <th className="p-3 text-right">Target (Assump.)</th>
                <th className="p-3 text-right">Score</th>
                <th className="p-3">U · D · T · H · W</th>
                <th className="p-3">Priority Rationale</th>
              </tr>
            </thead>
            <tbody>
              {simulation.initialRanking.map((row) => {
                const isExcluded = row.exclusionReason !== null;
                return (
                  <tr
                    key={row.battery_id}
                    className={`border-b border-[#DCDAD0] ${
                      isExcluded
                        ? 'bg-[#FFF5F5] text-[#991B1B]'
                        : row.allocatedPort
                        ? 'bg-[#FCFFF5]'
                        : 'bg-white'
                    }`}
                  >
                    <td className="p-3 font-mono-tech font-bold">
                      {row.rank !== null ? `#${row.rank}` : '—'}
                    </td>
                    <td className="p-3">
                      <div className="font-mono-tech font-bold text-[#141513]">{row.battery_id}</div>
                      <div className="text-[11px] text-[#4A4B45]">{row.station_name}</div>
                    </td>
                    <td className="p-3 font-mono-tech whitespace-nowrap">
                      {row.allocatedPort ? (
                        <span className="px-2 py-0.5 bg-[#B8FF2E] border border-[#141513] font-semibold text-[#141513]">
                          Port {row.allocatedPort}
                        </span>
                      ) : (
                        <span>{row.status}</span>
                      )}
                    </td>
                    <td className="p-3 font-mono-tech text-right font-semibold">
                      {row.allocatedPowerKw > 0 ? `${row.allocatedPowerKw} kW` : '0.0 kW'}
                    </td>
                    <td className="p-3 font-mono-tech text-right">{row.deficitKwh.toFixed(2)} kWh</td>
                    <td className="p-3 font-mono-tech text-right">
                      {row.predictedDemandKwh.toFixed(2)} kWh
                    </td>
                    <td className="p-3 font-mono-tech text-right">
                      <input
                        type="number"
                        min={30}
                        max={240}
                        step={15}
                        value={row.deadlineMinutes}
                        onChange={(e) =>
                          updateDeadline(row.battery_id, Math.max(30, Number(e.target.value)))
                        }
                        className="w-16 px-1.5 py-1 bg-[#F4F2EC] border border-[#141513] text-right font-mono-tech text-xs"
                        aria-label={`Simulated readiness deadline for ${row.battery_id}`}
                      />
                    </td>
                    <td className="p-3 font-mono-tech text-right font-bold text-[#5340C4]">
                      {row.priorityScore.toFixed(3)}
                    </td>
                    <td className="p-3 font-mono-tech whitespace-nowrap text-[11px]">
                      {row.rank !== null ? (
                        <span>
                          {row.breakdown.U.toFixed(2)} · {row.breakdown.D.toFixed(2)} ·{' '}
                          {row.breakdown.T.toFixed(2)} · {row.breakdown.H.toFixed(2)} ·{' '}
                          {row.breakdown.W.toFixed(2)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-xs max-w-xs">{row.breakdown.explanation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Multi-Interval Charging Schedule Timeline (Matrix + Bar Chart) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#141513] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">
                Interval-by-Interval Port Allocation Timeline
              </h2>
              <p className="text-xs text-[#4A4B45]">
                Click any time column header to inspect live station state at that interval
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono-tech border-collapse">
              <thead>
                <tr className="bg-[#EBE8DF] border-b border-[#141513]">
                  <th className="p-2 text-left sticky left-0 bg-[#EBE8DF] border-r border-[#141513]">
                    Pack ID
                  </th>
                  {simulation.intervals.map((iv) => (
                    <th key={iv.intervalIndex} className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => onSelectInterval(iv.intervalIndex)}
                        className={`px-1.5 py-1 w-full cursor-pointer transition-colors ${
                          iv.intervalIndex === currentIntervalIndex
                            ? 'bg-[#141513] text-[#B8FF2E]'
                            : 'hover:bg-[#DCDAD0]'
                        }`}
                      >
                        {iv.clockLabel}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batteryIdsInHorizon.map((batId) => (
                  <tr key={batId} className="border-b border-[#DCDAD0]">
                    <td className="p-2 font-semibold sticky left-0 bg-white border-r border-[#141513] whitespace-nowrap">
                      {batId}
                    </td>
                    {simulation.intervals.map((iv) => {
                      const alloc = iv.allocations.find((a) => a.battery_id === batId);
                      const isCur = iv.intervalIndex === currentIntervalIndex;
                      return (
                        <td
                          key={iv.intervalIndex}
                          className={`p-1 text-center border-r border-[#EBE8DF] ${
                            alloc
                              ? isCur
                                ? 'bg-[#7B68EE] text-white font-bold'
                                : 'bg-[#B8FF2E] text-[#141513]'
                              : isCur
                              ? 'bg-[#EBE8DF]'
                              : 'bg-white text-[#B5B4AC]'
                          }`}
                          title={
                            alloc
                              ? `${batId} @ ${iv.clockLabel}: ${alloc.powerKw} kW (SoC ${alloc.socAfterPct}%)`
                              : `${batId} @ ${iv.clockLabel}: Waiting / Complete`
                          }
                        >
                          {alloc ? alloc.powerKw.toFixed(1) : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">Power &amp; Energy per Interval</h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Dispatched kW and delivered kWh over the {config.horizonIntervals}-slot horizon
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="clock" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141513',
                    color: '#F4F2EC',
                    border: '1px solid #141513',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 11,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="powerKw" name="Total Power (kW)" fill="#7B68EE" />
                <Bar dataKey="energyKwh" name="Energy Added (kWh)" fill="#B8FF2E" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
};
