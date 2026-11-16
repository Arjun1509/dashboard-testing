import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import type {
  AlgorithmId,
  DatasetBundle,
  JoinedBatteryModel,
  SimulationConfig,
  SimulationResult,
  StationFilter,
} from '../types/swapsched';

interface ControlRoomPageProps {
  dataset: DatasetBundle;
  batteryModels: JoinedBatteryModel[];
  simulation: SimulationResult;
  currentIntervalIndex: number;
  stationFilter: StationFilter;
  algorithm: AlgorithmId;
  config: SimulationConfig;
}

export const ControlRoomPage: React.FC<ControlRoomPageProps> = ({
  dataset,
  batteryModels,
  simulation,
  currentIntervalIndex,
  stationFilter,
  algorithm,
  config,
}) => {
  const activeStations =
    stationFilter === 'ALL'
      ? dataset.station_data
      : dataset.station_data.filter((s) => s.station_id === stationFilter);

  const totalPowerCap = activeStations.reduce((sum, s) => {
    const ov = config.stationOverrides[s.station_id];
    return sum + (ov ? ov.power_capacity_kw : s.power_capacity_kw);
  }, 0);

  const totalPorts = activeStations.reduce((sum, s) => {
    const ov = config.stationOverrides[s.station_id];
    return sum + (ov ? ov.charging_ports : s.charging_ports);
  }, 0);

  const currentInterval = simulation.intervals[currentIntervalIndex] ?? simulation.intervals[0];
  const allocatedPower = currentInterval?.totalPowerKw ?? 0;
  const activeAssets = currentInterval?.activePorts ?? 0;
  const availablePorts = Math.max(0, totalPorts - activeAssets);
  const remainingCap = Math.max(0, totalPowerCap - allocatedPower);

  // Cumulative energy delivered & cost up through currentIntervalIndex
  const cumulativeIntervals = simulation.intervals.slice(0, currentIntervalIndex + 1);
  const cumulativeEnergy = cumulativeIntervals.reduce((s, iv) => s + iv.energyDeliveredKwh, 0);
  const cumulativeCostInr = cumulativeIntervals.reduce((s, iv) => s + iv.costInr, 0);

  const scopedPacks =
    stationFilter === 'ALL'
      ? batteryModels
      : batteryModels.filter((b) => b.station_id === stationFilter);
  const totalInitialDeficit = scopedPacks
    .filter((p) => p.isEligibleForCharging)
    .reduce((s, p) => s + p.energyDeficitKwh, 0);

  const fulfillmentPct =
    totalInitialDeficit > 0
      ? Math.min(100, (cumulativeEnergy / totalInitialDeficit) * 100)
      : 100;

  // Station-wise utilization at current interval
  const stationUtilRows = activeStations.map((stn) => {
    const ov = config.stationOverrides[stn.station_id];
    const cap = ov ? ov.power_capacity_kw : stn.power_capacity_kw;
    const ports = ov ? ov.charging_ports : stn.charging_ports;
    const stnAllocs = (currentInterval?.allocations ?? []).filter(
      (a) => a.station_id === stn.station_id
    );
    const usedKw = stnAllocs.reduce((s, a) => s + a.powerKw, 0);
    return {
      station_id: stn.station_id,
      station_name: stn.station_name,
      usedKw: Number(usedKw.toFixed(1)),
      capKw: cap,
      powerUtilPct: cap > 0 ? Math.round((usedKw / cap) * 100) : 0,
      portsUsed: stnAllocs.length,
      portsCap: ports,
      allocations: stnAllocs,
    };
  });

  const chartData = simulation.intervals.map((iv) => ({
    clock: iv.clockLabel,
    powerKw: iv.totalPowerKw,
    energyKwh: iv.energyDeliveredKwh,
    ports: iv.activePorts,
    isCurrent: iv.intervalIndex === currentIntervalIndex,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            02 · Live Hub Dispatch Telemetry
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">Control Room</h1>
        </div>
        <div className="font-mono-tech text-xs text-[#4A4B45]">
          Solver: <strong className="text-[#141513]">{algorithm}</strong> · Interval{' '}
          <strong className="text-[#141513]">
            {currentInterval?.clockLabel} ({currentInterval?.tariffBand} ₹
            {currentInterval?.tariffInrPerKwh.toFixed(2)}/kWh)
          </strong>
        </div>
      </div>

      {/* 8 Operational KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-[#141513]">
        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Active Charging Assets</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">{activeAssets}</div>
          <div className="mt-1 text-xs text-[#6C6D65]">Packs drawing power now</div>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Available Ports</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">
            {availablePorts}{' '}
            <span className="text-sm font-normal text-[#6C6D65]">/ {totalPorts}</span>
          </div>
          <div className="mt-1 text-xs text-[#6C6D65]">Idle charger bays</div>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Total Allocated Power</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">
            {allocatedPower.toFixed(1)}{' '}
            <span className="text-sm font-mono-tech font-normal">kW</span>
          </div>
          <div className="mt-1 text-xs text-[#6C6D65]">
            {totalPowerCap > 0 ? Math.round((allocatedPower / totalPowerCap) * 100) : 0}% of{' '}
            {totalPowerCap} kW cap
          </div>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Remaining Hub Capacity</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">
            {remainingCap.toFixed(1)}{' '}
            <span className="text-sm font-mono-tech font-normal">kW</span>
          </div>
          <div className="mt-1 text-xs text-[#6C6D65]">Grid headroom available</div>
        </div>

        <div className="p-4 bg-[#B8FF2E] border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#141513]">Energy Fulfillment (So Far)</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">
            {fulfillmentPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-[#141513] font-mono-tech">
            {cumulativeEnergy.toFixed(2)} / {totalInitialDeficit.toFixed(2)} kWh
          </div>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Estimated Energy Cost</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">
            ₹{cumulativeCostInr.toFixed(0)}
          </div>
          <div className="mt-1 text-xs text-[#6C6D65]">
            Horizon total: ₹{simulation.metrics.electricityCostInr.toFixed(0)}
          </div>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Battery Readiness</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums">
            {simulation.metrics.batteryReadinessPct}%
          </div>
          <div className="mt-1 text-xs text-[#6C6D65]">
            {simulation.metrics.readyCount} healthy packs ready by horizon end
          </div>
        </div>

        <div className="p-4 bg-white border-r border-b border-[#141513]">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Quarantined Packs</div>
          <div className="mt-1.5 font-display text-3xl font-bold tabular-nums text-[#B91C1C]">
            {simulation.metrics.excludedCount}
          </div>
          <div className="mt-1 text-xs text-[#6C6D65]">Fault or over-temp excluded</div>
        </div>
      </div>

      {/* Pixel-Grid Live Charging Bay Matrix */}
      <section className="bg-white border border-[#141513] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">
              Station Charging Bay Matrix · Slot {currentInterval?.clockLabel}
            </h2>
            <p className="text-xs text-[#4A4B45]">
              Live port occupancy and per-pack kW draw computed by {algorithm}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono-tech">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#B8FF2E] border border-[#141513]" /> Charging
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#EBE8DF] border border-[#141513]" /> Idle Port
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {stationUtilRows.map((stn) => (
            <div key={stn.station_id} className="border border-[#141513] bg-[#F4F2EC] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#141513] pb-2">
                <div>
                  <div className="font-display font-bold text-base">{stn.station_name}</div>
                  <div className="font-mono-tech text-xs text-[#4A4B45]">{stn.station_id}</div>
                </div>
                <div className="text-right font-mono-tech text-xs">
                  <div className="font-semibold">
                    {stn.usedKw} / {stn.capKw} kW ({stn.powerUtilPct}%)
                  </div>
                  <div className="text-[#4A4B45]">
                    {stn.portsUsed} / {stn.portsCap} ports active
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: stn.portsCap }).map((_, pIdx) => {
                  const portNum = pIdx + 1;
                  const alloc = stn.allocations.find((a) => a.portNumber === portNum);
                  return (
                    <div
                      key={portNum}
                      className={`p-2.5 border border-[#141513] transition-colors ${
                        alloc ? 'bg-[#B8FF2E]' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono-tech text-[11px]">
                        <span>PORT {String(portNum).padStart(2, '0')}</span>
                        <span className="font-semibold">
                          {alloc ? `${alloc.powerKw} kW` : 'IDLE'}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono-tech text-xs font-bold truncate">
                        {alloc ? alloc.battery_id : '—'}
                      </div>
                      <div className="text-[11px] font-mono-tech text-[#4A4B45]">
                        {alloc ? `SoC → ${alloc.socAfterPct}%` : 'Awaiting queue'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white border border-[#141513] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-bold">
                Hub Power Dispatch Profile vs Capacity Ceiling
              </h2>
              <p className="text-xs text-[#4A4B45]">
                Total allocated kW per {config.intervalMinutes}-min interval across selected stations
              </p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="clock" tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  domain={[0, Math.max(totalPowerCap + 5, 10)]}
                  unit=" kW"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141513',
                    color: '#F4F2EC',
                    border: '1px solid #141513',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={totalPowerCap}
                  stroke="#B91C1C"
                  strokeDasharray="4 4"
                  label={{
                    value: `Cap ${totalPowerCap} kW`,
                    position: 'insideTopRight',
                    fill: '#B91C1C',
                    fontSize: 11,
                  }}
                />
                {currentInterval && (
                  <ReferenceLine
                    x={currentInterval.clockLabel}
                    stroke="#5340C4"
                    strokeWidth={2}
                  />
                )}
                <Area
                  type="stepAfter"
                  dataKey="powerKw"
                  name="Dispatched Power (kW)"
                  stroke="#141513"
                  strokeWidth={2}
                  fill="#B8FF2E"
                  fillOpacity={0.75}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">Station Power Utilization</h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Active kW load vs physical ceiling at {currentInterval?.clockLabel}
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stationUtilRows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="station_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} unit=" kW" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141513',
                    color: '#F4F2EC',
                    border: '1px solid #141513',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="usedKw" name="Active Load (kW)" fill="#7B68EE" />
                <Bar dataKey="capKw" name="Station Cap (kW)" fill="#141513" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};
