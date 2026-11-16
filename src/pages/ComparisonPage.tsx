import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import type { AlgorithmId, SimulationResult } from '../types/swapsched';

interface ComparisonPageProps {
  benchmarks: Record<AlgorithmId, SimulationResult>;
  selectedAlgorithm: AlgorithmId;
  onSelectAlgorithm: (alg: AlgorithmId) => void;
}

const ALGO_ORDER: AlgorithmId[] = ['AUPA', 'FCFS', 'SJF', 'EDF', 'MILP'];

export const ComparisonPage: React.FC<ComparisonPageProps> = ({
  benchmarks,
  selectedAlgorithm,
  onSelectAlgorithm,
}) => {
  const rows = useMemo(() => ALGO_ORDER.map((id) => benchmarks[id].metrics), [benchmarks]);

  const barData = rows.map((m) => ({
    algorithm: m.algorithm,
    'Useful Energy %': m.usefulEnergyUtilizationPct,
    'Deadline Success %': m.deadlineSuccessRatePct,
    'Port Utilization %': m.portTimeUtilizationPct,
    'Readiness %': m.batteryReadinessPct,
  }));

  // Normalize metrics onto 0-100 radar axes (where higher = better; invert wait time relative to max wait)
  const maxWait = Math.max(1, ...rows.map((r) => r.averageWaitingTimeMinutes));
  const radarAxes = [
    {
      metric: 'Useful Energy %',
      AUPA: benchmarks.AUPA.metrics.usefulEnergyUtilizationPct,
      FCFS: benchmarks.FCFS.metrics.usefulEnergyUtilizationPct,
      SJF: benchmarks.SJF.metrics.usefulEnergyUtilizationPct,
      EDF: benchmarks.EDF.metrics.usefulEnergyUtilizationPct,
      MILP: benchmarks.MILP.metrics.usefulEnergyUtilizationPct,
    },
    {
      metric: 'Deadline Hit %',
      AUPA: benchmarks.AUPA.metrics.deadlineSuccessRatePct,
      FCFS: benchmarks.FCFS.metrics.deadlineSuccessRatePct,
      SJF: benchmarks.SJF.metrics.deadlineSuccessRatePct,
      EDF: benchmarks.EDF.metrics.deadlineSuccessRatePct,
      MILP: benchmarks.MILP.metrics.deadlineSuccessRatePct,
    },
    {
      metric: 'Port Util %',
      AUPA: benchmarks.AUPA.metrics.portTimeUtilizationPct,
      FCFS: benchmarks.FCFS.metrics.portTimeUtilizationPct,
      SJF: benchmarks.SJF.metrics.portTimeUtilizationPct,
      EDF: benchmarks.EDF.metrics.portTimeUtilizationPct,
      MILP: benchmarks.MILP.metrics.portTimeUtilizationPct,
    },
    {
      metric: 'Readiness %',
      AUPA: benchmarks.AUPA.metrics.batteryReadinessPct,
      FCFS: benchmarks.FCFS.metrics.batteryReadinessPct,
      SJF: benchmarks.SJF.metrics.batteryReadinessPct,
      EDF: benchmarks.EDF.metrics.batteryReadinessPct,
      MILP: benchmarks.MILP.metrics.batteryReadinessPct,
    },
    {
      metric: 'Low Wait Score',
      AUPA: Math.round((1 - benchmarks.AUPA.metrics.averageWaitingTimeMinutes / (maxWait * 1.15)) * 100),
      FCFS: Math.round((1 - benchmarks.FCFS.metrics.averageWaitingTimeMinutes / (maxWait * 1.15)) * 100),
      SJF: Math.round((1 - benchmarks.SJF.metrics.averageWaitingTimeMinutes / (maxWait * 1.15)) * 100),
      EDF: Math.round((1 - benchmarks.EDF.metrics.averageWaitingTimeMinutes / (maxWait * 1.15)) * 100),
      MILP: Math.round((1 - benchmarks.MILP.metrics.averageWaitingTimeMinutes / (maxWait * 1.15)) * 100),
    },
  ];

  // Dynamically identify best performers per metric without hardcoding winners
  const bestDeadline = [...rows].sort((a, b) => b.deadlineSuccessRatePct - a.deadlineSuccessRatePct)[0];
  const lowestWait = [...rows].sort((a, b) => a.averageWaitingTimeMinutes - b.averageWaitingTimeMinutes)[0];
  const highestEnergy = [...rows].sort((a, b) => b.totalEnergyDeliveredKwh - a.totalEnergyDeliveredKwh)[0];
  const lowestCost = [...rows].sort((a, b) => a.electricityCostInr - b.electricityCostInr)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            05 · Identical-Constraint Multi-Solver Evaluation
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Algorithm Comparison
          </h1>
        </div>
        <div className="font-mono-tech text-xs text-[#4A4B45]">
          All 5 solvers evaluated on identical pack deficits, port caps, and kW limits
        </div>
      </div>

      {/* Honest Trade-Off Callouts computed from live simulation */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-l border-[#141513]">
        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Top Deadline Success</div>
          <div className="mt-1 font-display text-2xl font-bold">
            {bestDeadline.algorithm}{' '}
            <span className="font-mono-tech text-base text-[#5340C4]">
              ({bestDeadline.deadlineSuccessRatePct}%)
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6C6D65]">
            Prioritizes imminent readiness targets under tight port contention.
          </p>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Lowest Avg Wait Time</div>
          <div className="mt-1 font-display text-2xl font-bold">
            {lowestWait.algorithm}{' '}
            <span className="font-mono-tech text-base text-[#5340C4]">
              ({lowestWait.averageWaitingTimeMinutes} min)
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6C6D65]">
            Shorter packs finish faster, freeing bays quickly but risking heavy-pack starvation.
          </p>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Highest Energy Delivered</div>
          <div className="mt-1 font-display text-2xl font-bold">
            {highestEnergy.algorithm}{' '}
            <span className="font-mono-tech text-base text-[#5340C4]">
              ({highestEnergy.totalEnergyDeliveredKwh} kWh)
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6C6D65]">
            Maximizes grid-to-pack kWh throughput over the horizon.
          </p>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Lowest Energy Cost</div>
          <div className="mt-1 font-display text-2xl font-bold">
            {lowestCost.algorithm}{' '}
            <span className="font-mono-tech text-base text-[#5340C4]">
              (₹{lowestCost.electricityCostInr.toFixed(0)})
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6C6D65]">
            Lower cost can reflect either efficiency or fewer kWh delivered before cut-off.
          </p>
        </div>
      </section>

      {/* Complete Benchmark Metrics Matrix */}
      <section className="bg-white border border-[#141513]">
        <div className="px-5 py-4 border-b border-[#141513] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">
              Calculated Benchmark Metrics Matrix
            </h2>
            <p className="text-xs text-[#4A4B45]">
              Click any algorithm row to set it as the active dispatcher across the platform
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#EBE8DF] border-b border-[#141513] font-mono-tech text-left">
                <th className="p-3">Algorithm</th>
                <th className="p-3">Solver Method</th>
                <th className="p-3 text-right">Useful Energy</th>
                <th className="p-3 text-right">Port Util.</th>
                <th className="p-3 text-right">Deadline Hit</th>
                <th className="p-3 text-right">Energy Deliv.</th>
                <th className="p-3 text-right">Avg Wait</th>
                <th className="p-3 text-right">Cost (INR)</th>
                <th className="p-3 text-right">Peak kW</th>
                <th className="p-3 text-right">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isSel = m.algorithm === selectedAlgorithm;
                return (
                  <tr
                    key={m.algorithm}
                    onClick={() => onSelectAlgorithm(m.algorithm)}
                    className={`border-b border-[#DCDAD0] cursor-pointer transition-colors ${
                      isSel ? 'bg-[#B8FF2E] font-medium' : 'hover:bg-[#F4F2EC]'
                    }`}
                  >
                    <td className="p-3 font-mono-tech font-bold">
                      {m.algorithm} {isSel ? '(Active)' : ''}
                    </td>
                    <td className="p-3 font-mono-tech text-[11px]">{m.solverMode}</td>
                    <td className="p-3 font-mono-tech text-right">
                      {m.usefulEnergyUtilizationPct}%
                    </td>
                    <td className="p-3 font-mono-tech text-right">{m.portTimeUtilizationPct}%</td>
                    <td className="p-3 font-mono-tech text-right font-semibold">
                      {m.deadlineSuccessRatePct}%
                    </td>
                    <td className="p-3 font-mono-tech text-right">
                      {m.totalEnergyDeliveredKwh} kWh
                    </td>
                    <td className="p-3 font-mono-tech text-right">
                      {m.averageWaitingTimeMinutes} min
                    </td>
                    <td className="p-3 font-mono-tech text-right">
                      ₹{m.electricityCostInr.toFixed(2)}
                    </td>
                    <td className="p-3 font-mono-tech text-right">{m.peakPowerUsageKw} kW</td>
                    <td className="p-3 font-mono-tech text-right font-semibold">
                      {m.batteryReadinessPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">Utilization &amp; Readiness Rates (%)</h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Direct comparison of percentage KPIs calculated from the discrete simulation trace
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="algorithm" tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} unit="%" />
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
                <Bar dataKey="Useful Energy %" fill="#141513" />
                <Bar dataKey="Deadline Success %" fill="#B8FF2E" />
                <Bar dataKey="Port Utilization %" fill="#7B68EE" />
                <Bar dataKey="Readiness %" fill="#8D8E85" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">Multi-Objective Trade-Off Radar</h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            AUPA vs FCFS vs MILP balance across efficiency, deadlines, and wait latency
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarAxes}>
                <PolarGrid stroke="#DCDAD0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="AUPA" dataKey="AUPA" stroke="#141513" fill="#B8FF2E" fillOpacity={0.45} strokeWidth={2} />
                <Radar name="MILP" dataKey="MILP" stroke="#5340C4" fill="#7B68EE" fillOpacity={0.25} strokeWidth={2} />
                <Radar name="FCFS" dataKey="FCFS" stroke="#9A3412" fill="none" strokeDasharray="4 4" strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Explicit Engineering Trade-off Summary */}
      <section className="bg-[#EBE8DF] border border-[#141513] p-5 space-y-2">
        <h2 className="font-display text-base font-bold">Algorithmic Trade-Off Notes</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#4A4B45] leading-relaxed">
          <li className="p-3 bg-white border border-[#141513]">
            <strong className="text-[#141513] font-mono-tech">AUPA vs EDF:</strong> Pure EDF
            maximizes single-deadline urgency but ignores trip energy demand and battery health.
            AUPA blends urgency, predicted kWh demand, and anti-starvation wait boost (W).
          </li>
          <li className="p-3 bg-white border border-[#141513]">
            <strong className="text-[#141513] font-mono-tech">SJF Starvation Risk:</strong> SJF
            often wins on average waiting time by clearing small LFP-48V-2.6 scooter packs first,
            which can delay large 7.5 kWh e-LCV packs past their departure target.
          </li>
          <li className="p-3 bg-white border border-[#141513]">
            <strong className="text-[#141513] font-mono-tech">MILP Optimizer Scope:</strong> Exact
            Branch-and-Bound optimizes per-interval port selection for immediate utility/kW,
            whereas AUPA explicitly preserves fairness via the stateful waiting-time term W(i).
          </li>
          <li className="p-3 bg-white border border-[#141513]">
            <strong className="text-[#141513] font-mono-tech">FCFS Baseline:</strong> Fair by
            swap arrival timestamp, yet blind to SoC deficits and upcoming trip length, lowering
            deadline compliance under peak port saturation.
          </li>
        </ul>
      </section>
    </div>
  );
};
