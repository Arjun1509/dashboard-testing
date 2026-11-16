import React, { useMemo, useState } from 'react';
import { Search, AlertTriangle, CheckCircle2, BatteryCharging, X } from 'lucide-react';
import { PixelAsset } from '../components/PixelAsset';
import type {
  JoinedBatteryModel,
  SimulationResult,
  StationFilter,
} from '../types/swapsched';

interface BatteriesPageProps {
  batteryModels: JoinedBatteryModel[];
  simulation: SimulationResult;
  currentIntervalIndex: number;
  stationFilter: StationFilter;
}

export const BatteriesPage: React.FC<BatteriesPageProps> = ({
  batteryModels,
  simulation,
  currentIntervalIndex,
  stationFilter,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [selectedBatteryId, setSelectedBatteryId] = useState<string | null>(null);

  const currentInterval = simulation.intervals[currentIntervalIndex];
  const activeAllocMap = useMemo(() => {
    const m = new Map<string, { powerKw: number; portNumber: number; socAfterPct: number }>();
    currentInterval?.allocations.forEach((a) => {
      m.set(a.battery_id, {
        powerKw: a.powerKw,
        portNumber: a.portNumber,
        socAfterPct: a.socAfterPct,
      });
    });
    return m;
  }, [currentInterval]);

  // Compute live SoC up to currentIntervalIndex
  const liveSocMap = useMemo(() => {
    const map = new Map<string, number>();
    batteryModels.forEach((b) => map.set(b.battery_id, b.latestTelemetry?.soc_pct ?? 0));
    for (let i = 0; i <= currentIntervalIndex; i++) {
      simulation.intervals[i]?.allocations.forEach((a) => {
        map.set(a.battery_id, a.socAfterPct);
      });
    }
    return map;
  }, [batteryModels, simulation, currentIntervalIndex]);

  const scheduleSlotMap = useMemo(() => {
    const m = new Map(simulation.initialRanking.map((r) => [r.battery_id, r]));
    return m;
  }, [simulation]);

  const uniqueTypes = useMemo(
    () => Array.from(new Set(batteryModels.map((b) => b.battery_type))),
    [batteryModels]
  );

  const filteredPacks = useMemo(() => {
    return batteryModels.filter((b) => {
      if (stationFilter !== 'ALL' && b.station_id !== stationFilter) return false;
      if (typeFilter !== 'ALL' && b.battery_type !== typeFilter) return false;

      const alloc = activeAllocMap.get(b.battery_id);
      const effectiveState = b.exclusionReason
        ? 'Excluded'
        : alloc
        ? 'Charging'
        : b.energyDeficitKwh <= 0.01
        ? 'Ready'
        : 'Queued';

      if (stateFilter !== 'ALL' && effectiveState !== stateFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          b.battery_id.toLowerCase().includes(q) ||
          b.battery_type.toLowerCase().includes(q) ||
          (b.linkedVehicle?.vehicle_id.toLowerCase().includes(q) ?? false) ||
          b.station_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [batteryModels, stationFilter, typeFilter, stateFilter, search, activeAllocMap]);

  const selectedModel = batteryModels.find((b) => b.battery_id === selectedBatteryId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            03 · Physical Pack Telemetry &amp; Health Inspection
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Battery Management
          </h1>
        </div>
        <div className="font-mono-tech text-xs text-[#4A4B45]">
          Showing <strong>{filteredPacks.length}</strong> packs · Latest valid telemetry selected by
          timestamp
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 bg-white border border-[#141513] flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6C6D65]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search battery ID, vehicle ID, or station..."
            className="w-full pl-9 pr-3 py-2 bg-[#F4F2EC] border border-[#141513] text-xs font-mono-tech"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-[#F4F2EC] border border-[#141513] text-xs font-mono-tech"
          aria-label="Filter by battery type"
        >
          <option value="ALL">All Types ({uniqueTypes.length})</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div className="flex items-center border border-[#141513] bg-[#F4F2EC]">
          {['ALL', 'Charging', 'Queued', 'Ready', 'Excluded'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStateFilter(st)}
              className={`px-3 py-2 text-xs font-mono-tech transition-colors cursor-pointer whitespace-nowrap ${
                stateFilter === st
                  ? 'bg-[#141513] text-[#B8FF2E]'
                  : 'text-[#4A4B45] hover:bg-[#EBE8DF]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Battery Cards Grid */}
      {filteredPacks.length === 0 ? (
        <div className="p-10 bg-white border border-[#141513] text-center space-y-2">
          <p className="font-display text-lg font-bold">No matching battery packs</p>
          <p className="text-xs text-[#4A4B45]">
            Clear your search query or switch filters to inspect all station inventory.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredPacks.map((pack) => {
            const tel = pack.latestTelemetry;
            const liveSoc = liveSocMap.get(pack.battery_id) ?? tel?.soc_pct ?? 0;
            const alloc = activeAllocMap.get(pack.battery_id);
            const sched = scheduleSlotMap.get(pack.battery_id);
            const soh = tel?.soh_pct ?? 0;
            const temp = tel?.temperature_c ?? 0;
            const volt = tel?.voltage_v ?? 0;
            const curr = alloc
              ? Number(((alloc.powerKw * 1000) / Math.max(1, volt)).toFixed(1))
              : tel?.current_a ?? 0;

            const isExcluded = pack.exclusionReason !== null;
            const statusText = isExcluded
              ? pack.operationalState
              : alloc
              ? `Charging · Port ${alloc.portNumber}`
              : pack.energyDeficitKwh <= 0.01
              ? 'Ready'
              : 'Queued';

            return (
              <article
                key={pack.battery_id}
                className={`border border-[#141513] flex flex-col justify-between transition-colors ${
                  isExcluded ? 'bg-[#FFF5F5]' : alloc ? 'bg-[#FCFFF5]' : 'bg-white'
                }`}
              >
                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#141513] pb-3">
                    <div>
                      <h2 className="font-mono-tech text-base font-bold text-[#141513]">
                        {pack.battery_id}
                      </h2>
                      <div className="text-xs text-[#4A4B45] mt-0.5">
                        {pack.battery_type} · {pack.station_name} · Bay {pack.bay_slot}
                      </div>
                    </div>
                    <div
                      className={`px-2 py-1 border border-[#141513] font-mono-tech text-[11px] font-semibold whitespace-nowrap ${
                        isExcluded
                          ? 'bg-[#FEE2E2] text-[#991B1B]'
                          : alloc
                          ? 'bg-[#B8FF2E] text-[#141513]'
                          : pack.energyDeficitKwh <= 0.01
                          ? 'bg-[#DCFCE7] text-[#166534]'
                          : 'bg-[#EBE8DF] text-[#141513]'
                      }`}
                    >
                      {isExcluded ? '✕ ' : alloc ? '▲ ' : '■ '}
                      {statusText}
                    </div>
                  </div>

                  {/* SoC Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono-tech mb-1">
                      <span>State of Charge (SoC)</span>
                      <span className="font-bold">{liveSoc.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-3 bg-[#EBE8DF] border border-[#141513]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isExcluded
                            ? 'bg-[#B91C1C]'
                            : liveSoc >= 75
                            ? 'bg-[#B8FF2E]'
                            : 'bg-[#7B68EE]'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, liveSoc))}%` }}
                      />
                    </div>
                  </div>

                  {/* Telemetry Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono-tech text-xs">
                    <div className="p-2 bg-[#F4F2EC] border border-[#DCDAD0]">
                      <div className="text-[10px] text-[#6C6D65]">SoH</div>
                      <div className="font-semibold">{tel ? `${soh.toFixed(1)}%` : 'N/A'}</div>
                    </div>
                    <div className="p-2 bg-[#F4F2EC] border border-[#DCDAD0]">
                      <div className="text-[10px] text-[#6C6D65]">Temp</div>
                      <div
                        className={`font-semibold ${
                          pack.isOverTemp ? 'text-[#B91C1C]' : 'text-[#141513]'
                        }`}
                      >
                        {tel ? `${temp.toFixed(1)}°C` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-2 bg-[#F4F2EC] border border-[#DCDAD0]">
                      <div className="text-[10px] text-[#6C6D65]">Cycles</div>
                      <div className="font-semibold">{tel?.cycle_count ?? 'N/A'}</div>
                    </div>
                    <div className="p-2 bg-[#F4F2EC] border border-[#DCDAD0]">
                      <div className="text-[10px] text-[#6C6D65]">Voltage</div>
                      <div className="font-semibold">{tel ? `${volt.toFixed(1)} V` : 'N/A'}</div>
                    </div>
                    <div className="p-2 bg-[#F4F2EC] border border-[#DCDAD0]">
                      <div className="text-[10px] text-[#6C6D65]">Current</div>
                      <div className="font-semibold">{curr} A</div>
                    </div>
                    <div className="p-2 bg-[#F4F2EC] border border-[#DCDAD0]">
                      <div className="text-[10px] text-[#6C6D65]">Allocation</div>
                      <div className="font-semibold">
                        {alloc ? `${alloc.powerKw} kW` : '0.0 kW'}
                      </div>
                    </div>
                  </div>

                  {/* Fault or Health Warning */}
                  {pack.exclusionReason ? (
                    <div className="p-2.5 bg-[#FEE2E2] border border-[#991B1B] text-xs text-[#991B1B] flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        <strong>Fault / Quarantine:</strong> {pack.exclusionReason}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-[#4A4B45] pt-1">
                      <span>
                        Faults: <strong className="font-mono-tech text-[#166534]">NONE</strong>
                      </span>
                      <span className="font-mono-tech">
                        Est. Finish:{' '}
                        <strong>
                          {sched?.estimatedCompletionMinutes
                            ? `${sched.estimatedCompletionMinutes} min`
                            : 'Ready'}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBatteryId(pack.battery_id)}
                  className="w-full px-4 py-2.5 bg-[#EBE8DF] border-t border-[#141513] text-xs font-mono-tech font-semibold text-left flex items-center justify-between hover:bg-[#B8FF2E] transition-colors cursor-pointer"
                >
                  <span>Inspect Energy Math &amp; Telemetry Log</span>
                  <span>→</span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Inspection Modal */}
      {selectedModel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#F4F2EC] border border-[#141513] hard-shadow-md">
            <div className="flex items-center justify-between px-6 py-4 bg-[#141513] text-[#F4F2EC]">
              <div className="flex items-center gap-3">
                <BatteryCharging className="w-5 h-5 text-[#B8FF2E]" />
                <h2 className="font-mono-tech text-base font-bold">
                  {selectedModel.battery_id} · Energy Prediction &amp; Telemetry
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatteryId(null)}
                className="p-1.5 bg-[#2A2C27] hover:bg-[#B8FF2E] hover:text-[#141513]"
                aria-label="Close pack inspection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-white border border-[#141513] p-4">
                <div className="md:col-span-4">
                  <PixelAsset
                    src="/src/assets/images/pixel_battery_pack_module_1794850803429.jpg"
                    alt={`Pixel illustration of ${selectedModel.battery_id}`}
                    aspectClass="aspect-square"
                  />
                </div>
                <div className="md:col-span-8 space-y-2 text-xs font-mono-tech">
                  <div className="flex justify-between py-1 border-b border-[#DCDAD0]">
                    <span className="text-[#4A4B45]">Nominal → Effective Capacity</span>
                    <strong>
                      {selectedModel.nominalCapacityKwh.toFixed(2)} kWh →{' '}
                      {selectedModel.effectiveCapacityKwh.toFixed(2)} kWh
                    </strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#DCDAD0]">
                    <span className="text-[#4A4B45]">Current Stored Energy</span>
                    <strong>{selectedModel.currentStoredKwh.toFixed(2)} kWh</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#DCDAD0]">
                    <span className="text-[#4A4B45]">
                      Predicted Next Trip ({selectedModel.expectedNextTripKm.toFixed(1)} km, n=
                      {selectedModel.tripSampleCount} trips)
                    </span>
                    <strong>{selectedModel.predictedTripEnergyKwh.toFixed(2)} kWh</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#DCDAD0]">
                    <span className="text-[#4A4B45]">Required (Trip + 15% Reserve)</span>
                    <strong>{selectedModel.requiredEnergyKwh.toFixed(2)} kWh</strong>
                  </div>
                  <div className="flex justify-between py-1 bg-[#B8FF2E] px-2">
                    <span className="text-[#141513] font-semibold">Remaining Energy Deficit</span>
                    <strong>{selectedModel.energyDeficitKwh.toFixed(2)} kWh</strong>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#141513] p-4">
                <h3 className="font-display text-sm font-bold mb-2">
                  Raw Telemetry Packets ({selectedModel.telemetryHistory.length} frames)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono-tech border-collapse">
                    <thead>
                      <tr className="bg-[#EBE8DF] border-b border-[#141513] text-left">
                        <th className="p-2">ID</th>
                        <th className="p-2">Timestamp</th>
                        <th className="p-2 text-right">SoC%</th>
                        <th className="p-2 text-right">SoH%</th>
                        <th className="p-2 text-right">Temp</th>
                        <th className="p-2">Fault</th>
                        <th className="p-2">Validity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedModel.telemetryHistory.map((t) => (
                        <tr key={t.telemetry_id} className="border-b border-[#DCDAD0]">
                          <td className="p-2">{t.telemetry_id}</td>
                          <td className="p-2">{t.timestamp}</td>
                          <td className="p-2 text-right">{t.soc_pct ?? 'NULL'}</td>
                          <td className="p-2 text-right">{t.soh_pct ?? 'NULL'}</td>
                          <td className="p-2 text-right">{t.temperature_c ?? 'NULL'}°C</td>
                          <td className="p-2">{t.fault_code}</td>
                          <td className="p-2">
                            {t.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[#166534]">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                              </span>
                            ) : (
                              <span className="text-[#B91C1C]">{t.validationIssue}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
