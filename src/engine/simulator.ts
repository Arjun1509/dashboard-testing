import type {
  AlgorithmId,
  BatteryScheduleSlot,
  DatasetBundle,
  IntervalAllocation,
  JoinedBatteryModel,
  SimulationConfig,
  SimulationResult,
  StationData,
  StationFilter,
} from '../types/swapsched';
import { dispatchStationInterval, scorePacksForInterval, type ActivePackState } from './scheduler';

export function resolveTariffForHour(
  station: StationData,
  hour24: number
): { band: 'Off-Peak' | 'Standard' | 'Peak'; rateInr: number } {
  const h = ((hour24 % 24) + 24) % 24;
  // Peak band: 17:00 - 22:00 (or parsed peak_hours)
  if (h >= 17 && h < 22) {
    return { band: 'Peak', rateInr: station.peak_tariff_inr_kwh };
  }
  // Off-Peak band: 23:00 - 06:00
  if (h >= 23 || h < 6) {
    return { band: 'Off-Peak', rateInr: station.offpeak_tariff_inr_kwh };
  }
  return { band: 'Standard', rateInr: station.base_tariff_inr_kwh };
}

function formatClock(startHour: number, offsetMinutes: number): string {
  const totalMins = startHour * 60 + offsetMinutes;
  const hh = Math.floor((totalMins / 60) % 24);
  const mm = Math.floor(totalMins % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function runSimulation(
  dataset: DatasetBundle,
  batteryModels: JoinedBatteryModel[],
  algorithm: AlgorithmId,
  stationFilter: StationFilter,
  config: SimulationConfig
): SimulationResult {
  const activeStations =
    stationFilter === 'ALL'
      ? dataset.station_data
      : dataset.station_data.filter((s) => s.station_id === stationFilter);

  const stationMap = new Map<string, StationData>();
  activeStations.forEach((s) => stationMap.set(s.station_id, s));

  const filteredModels =
    stationFilter === 'ALL'
      ? batteryModels
      : batteryModels.filter((m) => m.station_id === stationFilter);

  const packStates: ActivePackState[] = filteredModels.map((m) => {
    const swapTs = m.lastSwapEvent ? Date.parse(m.lastSwapEvent.swap_timestamp) : NaN;
    const telTs = m.latestTelemetry ? Date.parse(m.latestTelemetry.timestamp) : NaN;
    const arrivalOrderMs = !Number.isNaN(swapTs)
      ? swapTs
      : !Number.isNaN(telTs)
      ? telTs
      : 1700000000000;

    return {
      model: m,
      remainingDeficitKwh: m.energyDeficitKwh,
      currentSocPct: m.latestTelemetry?.soc_pct ?? 0,
      intervalsWaited: 0,
      waitMinutes: 0,
      arrivalOrderMs,
      readyAtMinutes: m.isEligibleForCharging ? null : m.energyDeficitKwh <= 0.01 && m.exclusionReason === null ? 0 : null,
    };
  });

  const initialDeficitById = new Map<string, number>();
  const initialSocById = new Map<string, number>();
  const deliveredById = new Map<string, number>();
  packStates.forEach((p) => {
    initialDeficitById.set(p.model.battery_id, p.remainingDeficitKwh);
    initialSocById.set(p.model.battery_id, p.currentSocPct);
    deliveredById.set(p.model.battery_id, 0);
  });

  const intervals: IntervalAllocation[] = [];
  let solverModesSeen = new Set<string>();
  let totalEnergyDeliveredKwh = 0;
  let totalElectricityCostInr = 0;
  let peakPowerUsageKw = 0;
  let totalPortSlotsAvailable = 0;
  let totalPortSlotsUsed = 0;
  let totalGridEnergyDrawnKwh = 0;

  let initialRanking: BatteryScheduleSlot[] = [];

  for (let step = 0; step < config.horizonIntervals; step++) {
    const startMinutes = step * config.intervalMinutes;
    const endMinutes = startMinutes + config.intervalMinutes;
    const currentHour = config.startHour + startMinutes / 60;
    const dtHours = config.intervalMinutes / 60;

    const stepAllocations: IntervalAllocation['allocations'] = [];
    let stepPowerKw = 0;
    let stepEnergyKwh = 0;
    let stepCostInr = 0;
    let stepPortsCap = 0;

    const stepRankById = new Map<string, { rank: number; breakdown: any; score: number }>();

    for (const stn of activeStations) {
      const override = config.stationOverrides[stn.station_id];
      const powerCap = override ? override.power_capacity_kw : stn.power_capacity_kw;
      const portsCap = override ? override.charging_ports : stn.charging_ports;
      stepPortsCap += portsCap;

      const stnPacks = packStates.filter((p) => p.model.station_id === stn.station_id);
      const decision = dispatchStationInterval(
        stn.station_id,
        stnPacks,
        algorithm,
        portsCap,
        powerCap,
        startMinutes,
        config
      );

      solverModesSeen.add(decision.solverMode);

      decision.scoredPacks.forEach((sp, rIdx) => {
        stepRankById.set(sp.pack.model.battery_id, {
          rank: rIdx + 1,
          breakdown: sp.breakdown,
          score: sp.priorityScore,
        });
      });

      const tariff = resolveTariffForHour(stn, currentHour);
      const allocatedIds = new Set(decision.allocations.map((a) => a.battery_id));

      // Apply energy & update waiting counters
      for (const alloc of decision.allocations) {
        const pack = packStates.find((p) => p.model.battery_id === alloc.battery_id);
        if (pack) {
          pack.remainingDeficitKwh = Math.max(0, pack.remainingDeficitKwh - alloc.energyAddedKwh);
          pack.currentSocPct = alloc.socAfterPct;
          pack.intervalsWaited = 0;
          if (pack.remainingDeficitKwh <= 0.01 && pack.readyAtMinutes === null) {
            pack.readyAtMinutes = endMinutes;
          }
          deliveredById.set(
            alloc.battery_id,
            (deliveredById.get(alloc.battery_id) ?? 0) + alloc.energyAddedKwh
          );
          // Grid energy drawn accounts for charging efficiency
          const gridKwh = alloc.powerKw * dtHours;
          totalGridEnergyDrawnKwh += gridKwh;
          stepCostInr += gridKwh * tariff.rateInr;
        }
        stepAllocations.push(alloc);
        stepPowerKw += alloc.powerKw;
        stepEnergyKwh += alloc.energyAddedKwh;
      }

      // Increment waiting time for eligible packs at this station that did not get a port
      for (const p of stnPacks) {
        if (
          p.model.isEligibleForCharging &&
          p.remainingDeficitKwh > 0.01 &&
          !allocatedIds.has(p.model.battery_id)
        ) {
          p.intervalsWaited += 1;
          p.waitMinutes += config.intervalMinutes;
        }
      }
    }

    // Snapshot interval 0 for the Scheduler Priority Table & Control Room live view
    if (step === 0) {
      const allGlobalScored = scorePacksForInterval(packStates, algorithm, 0, config);
      const globalRankMap = new Map<string, { rank: number; score: number; breakdown: any }>();
      allGlobalScored.forEach((s, idx) => {
        globalRankMap.set(s.pack.model.battery_id, {
          rank: idx + 1,
          score: s.priorityScore,
          breakdown: s.breakdown,
        });
      });

      const allocLookup = new Map(stepAllocations.map((a) => [a.battery_id, a]));

      initialRanking = filteredModels.map((m) => {
        const gRank = globalRankMap.get(m.battery_id);
        const alloc = allocLookup.get(m.battery_id);
        const status = m.exclusionReason
          ? m.operationalState
          : alloc
          ? 'Charging'
          : m.energyDeficitKwh <= 0.01
          ? 'Ready'
          : 'Queued';

        const estMinutes =
          alloc && alloc.powerKw > 0
            ? Math.round((m.energyDeficitKwh / (alloc.powerKw * m.chargingEfficiency)) * 60)
            : m.energyDeficitKwh > 0.01
            ? Math.round(m.expectedChargeTimeMinutes)
            : 0;

        return {
          battery_id: m.battery_id,
          station_id: m.station_id,
          station_name: m.station_name,
          battery_type: m.battery_type,
          socPct: m.latestTelemetry?.soc_pct ?? 0,
          sohPct: m.latestTelemetry?.soh_pct ?? 0,
          deficitKwh: Number(m.energyDeficitKwh.toFixed(2)),
          predictedDemandKwh: Number(m.predictedTripEnergyKwh.toFixed(2)),
          deadlineMinutes: m.simulatedDeadlineMinutes,
          priorityScore: gRank ? Number(gRank.score.toFixed(3)) : 0,
          rank: gRank ? gRank.rank : null,
          breakdown: gRank
            ? gRank.breakdown
            : {
                U: 0,
                D: 0,
                T: 0,
                H: 0,
                W: 0,
                weightedScore: 0,
                explanation: m.exclusionReason ?? 'Already meets required trip + reserve energy.',
              },
          allocatedPort: alloc ? alloc.portNumber : null,
          allocatedPowerKw: alloc ? alloc.powerKw : 0,
          estimatedCompletionMinutes: m.exclusionReason ? null : estMinutes,
          status,
          exclusionReason: m.exclusionReason,
        };
      });

      // Sort initialRanking: Ranked eligible packs first, then Ready, then Excluded
      initialRanking.sort((a, b) => {
        if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
        if (a.rank !== null) return -1;
        if (b.rank !== null) return 1;
        if (a.status === 'Ready' && b.status !== 'Ready') return -1;
        if (b.status === 'Ready' && a.status !== 'Ready') return 1;
        return a.battery_id.localeCompare(b.battery_id);
      });
    }

    const repStation = activeStations[0];
    const tariffInfo = repStation
      ? resolveTariffForHour(repStation, currentHour)
      : { band: 'Standard' as const, rateInr: 8.5 };

    intervals.push({
      intervalIndex: step,
      startMinutes,
      endMinutes,
      clockLabel: formatClock(config.startHour, startMinutes),
      tariffBand: tariffInfo.band,
      tariffInrPerKwh: tariffInfo.rateInr,
      totalPowerKw: Number(stepPowerKw.toFixed(2)),
      activePorts: stepAllocations.length,
      energyDeliveredKwh: Number(stepEnergyKwh.toFixed(3)),
      costInr: Number(stepCostInr.toFixed(2)),
      allocations: stepAllocations,
    });

    totalEnergyDeliveredKwh += stepEnergyKwh;
    totalElectricityCostInr += stepCostInr;
    peakPowerUsageKw = Math.max(peakPowerUsageKw, stepPowerKw);
    totalPortSlotsAvailable += stepPortsCap;
    totalPortSlotsUsed += stepAllocations.length;
  }

  // Final metrics computation directly from simulation trace
  const eligibleInitial = packStates.filter((p) => p.model.isEligibleForCharging);
  const excludedCount = packStates.filter((p) => p.model.exclusionReason !== null).length;
  const totalInitialDeficit = eligibleInitial.reduce(
    (s, p) => s + (initialDeficitById.get(p.model.battery_id) ?? 0),
    0
  );

  const deadlineMetCount = eligibleInitial.filter(
    (p) => p.readyAtMinutes !== null && p.readyAtMinutes <= p.model.simulatedDeadlineMinutes
  ).length;

  const readyCount = packStates.filter(
    (p) => p.model.exclusionReason === null && p.remainingDeficitKwh <= 0.05
  ).length;
  const healthyTotal = packStates.filter((p) => p.model.exclusionReason === null).length;

  const avgWaitMinutes =
    eligibleInitial.length > 0
      ? eligibleInitial.reduce((s, p) => s + p.waitMinutes, 0) / eligibleInitial.length
      : 0;

  // Useful energy utilization = delivered / total grid energy drawn (accounts for efficiency & useful fulfillment)
  const usefulEnergyUtilizationPct =
    totalInitialDeficit > 0
      ? Math.min(100, (totalEnergyDeliveredKwh / totalInitialDeficit) * 100)
      : 100;

  const portTimeUtilizationPct =
    totalPortSlotsAvailable > 0 ? (totalPortSlotsUsed / totalPortSlotsAvailable) * 100 : 0;

  const deadlineSuccessRatePct =
    eligibleInitial.length > 0 ? (deadlineMetCount / eligibleInitial.length) * 100 : 100;

  const batteryReadinessPct = healthyTotal > 0 ? (readyCount / healthyTotal) * 100 : 0;

  const solverModeLabel = Array.from(solverModesSeen).join(' / ');

  const finalBatteryStates = packStates.map((p) => {
    const initDef = initialDeficitById.get(p.model.battery_id) ?? 0;
    const delivered = deliveredById.get(p.model.battery_id) ?? 0;
    const metDeadline =
      p.model.exclusionReason === null &&
      ((initDef <= 0.01) || (p.readyAtMinutes !== null && p.readyAtMinutes <= p.model.simulatedDeadlineMinutes));

    return {
      battery_id: p.model.battery_id,
      station_id: p.model.station_id,
      initialSocPct: initialSocById.get(p.model.battery_id) ?? 0,
      finalSocPct: Number(p.currentSocPct.toFixed(1)),
      initialDeficitKwh: Number(initDef.toFixed(2)),
      remainingDeficitKwh: Number(p.remainingDeficitKwh.toFixed(2)),
      energyDeliveredKwh: Number(delivered.toFixed(2)),
      waitTimeMinutes: p.waitMinutes,
      readyAtMinutes: p.readyAtMinutes,
      deadlineMinutes: p.model.simulatedDeadlineMinutes,
      metDeadline,
      excluded: p.model.exclusionReason !== null,
    };
  });

  return {
    algorithm,
    metrics: {
      algorithm,
      solverMode: solverModeLabel,
      usefulEnergyUtilizationPct: Number(usefulEnergyUtilizationPct.toFixed(1)),
      portTimeUtilizationPct: Number(portTimeUtilizationPct.toFixed(1)),
      deadlineSuccessRatePct: Number(deadlineSuccessRatePct.toFixed(1)),
      totalEnergyDeliveredKwh: Number(totalEnergyDeliveredKwh.toFixed(2)),
      averageWaitingTimeMinutes: Number(avgWaitMinutes.toFixed(1)),
      electricityCostInr: Number(totalElectricityCostInr.toFixed(2)),
      peakPowerUsageKw: Number(peakPowerUsageKw.toFixed(2)),
      batteryReadinessPct: Number(batteryReadinessPct.toFixed(1)),
      readyCount,
      eligibleCount: eligibleInitial.length,
      excludedCount,
    },
    initialRanking,
    intervals,
    finalBatteryStates,
  };
}

export function runBenchmarkComparison(
  dataset: DatasetBundle,
  batteryModels: JoinedBatteryModel[],
  stationFilter: StationFilter,
  config: SimulationConfig
): Record<AlgorithmId, SimulationResult> {
  const algos: AlgorithmId[] = ['AUPA', 'FCFS', 'SJF', 'EDF', 'MILP'];
  const out = {} as Record<AlgorithmId, SimulationResult>;
  algos.forEach((alg) => {
    out[alg] = runSimulation(dataset, batteryModels, alg, stationFilter, config);
  });
  return out;
}
