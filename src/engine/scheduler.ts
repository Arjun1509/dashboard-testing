import type {
  AlgorithmId,
  AupaBreakdown,
  JoinedBatteryModel,
  SimulationConfig,
} from '../types/swapsched';

export interface ActivePackState {
  model: JoinedBatteryModel;
  remainingDeficitKwh: number;
  currentSocPct: number;
  intervalsWaited: number;
  waitMinutes: number;
  arrivalOrderMs: number;
  readyAtMinutes: number | null;
}

export interface ScoredPack {
  pack: ActivePackState;
  priorityScore: number;
  breakdown: AupaBreakdown;
}

export interface PortDispatchDecision {
  allocations: Array<{
    battery_id: string;
    station_id: string;
    portNumber: number;
    powerKw: number;
    energyAddedKwh: number;
    socAfterPct: number;
  }>;
  solverMode: string;
  scoredPacks: ScoredPack[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function scorePacksForInterval(
  packs: ActivePackState[],
  algorithm: AlgorithmId,
  elapsedMinutes: number,
  config: SimulationConfig
): ScoredPack[] {
  const eligible = packs.filter(
    (p) => p.model.isEligibleForCharging && p.remainingDeficitKwh > 0.005
  );

  const horizonTotal = config.horizonIntervals * config.intervalMinutes;

  // Compute raw component vectors for normalization across eligible pool
  const rawU = eligible.map((p) =>
    p.model.requiredEnergyKwh > 0
      ? clamp01(p.remainingDeficitKwh / p.model.requiredEnergyKwh)
      : 0
  );
  const rawD = eligible.map((p) => p.model.predictedTripEnergyKwh);
  const rawT = eligible.map((p) => {
    const remDeadline = Math.max(0, p.model.simulatedDeadlineMinutes - elapsedMinutes);
    return clamp01(1 - remDeadline / Math.max(60, horizonTotal));
  });
  const rawH = eligible.map((p) => {
    const cycles = p.model.latestTelemetry?.cycle_count ?? 0;
    const rated = p.model.catalog?.rated_cycle_life ?? 2000;
    return rated > 0 ? cycles / rated : 0;
  });

  const maxU = Math.max(0.0001, ...rawU);
  const maxD = Math.max(0.0001, ...rawD);
  const maxT = Math.max(0.0001, ...rawT);
  const maxH = Math.max(0.0001, ...rawH);

  const { wU, wD, wT, wH, waitBoostPerInterval } = config.aupaWeights;

  const scored: ScoredPack[] = eligible.map((p, idx) => {
    const U = Number((rawU[idx] / maxU).toFixed(3));
    const D = Number((rawD[idx] / maxD).toFixed(3));
    const T = Number((rawT[idx] / maxT).toFixed(3));
    const H = Number((rawH[idx] / maxH).toFixed(3));
    const W = Number((p.intervalsWaited * waitBoostPerInterval).toFixed(3));

    const aupaScore = Number((wU * U + wD * D + wT * T + wH * H + W).toFixed(3));

    // Build human-readable explanation of priority components
    const drivers: Array<{ label: string; contribution: number }> = [
      { label: `energy urgency (${Math.round(U * 100)}%)`, contribution: wU * U },
      { label: `trip demand (${p.model.predictedTripEnergyKwh.toFixed(2)} kWh)`, contribution: wD * D },
      {
        label: `deadline target (${Math.max(0, p.model.simulatedDeadlineMinutes - elapsedMinutes)}m left)`,
        contribution: wT * T,
      },
      { label: `cycle wear (${p.model.latestTelemetry?.cycle_count ?? 0} cycles)`, contribution: wH * H },
    ];
    drivers.sort((a, b) => b.contribution - a.contribution);
    const waitNote = W > 0 ? ` + ${W.toFixed(2)} wait-boost (${p.intervalsWaited} slots waited)` : '';
    const explanation = `Driven by ${drivers[0].label} and ${drivers[1].label}${waitNote}.`;

    const breakdown: AupaBreakdown = {
      U,
      D,
      T,
      H,
      W,
      weightedScore: aupaScore,
      explanation,
    };

    let priorityScore = aupaScore;
    if (algorithm === 'FCFS') {
      // Earlier arrival timestamp -> higher priority score
      priorityScore = 1 / Math.max(1, (p.arrivalOrderMs - 1700000000000) / 1000);
    } else if (algorithm === 'SJF') {
      const rate = Math.max(0.1, p.model.maxChargePowerKw * p.model.chargingEfficiency);
      const remMins = (p.remainingDeficitKwh / rate) * 60;
      priorityScore = 1000 / Math.max(1, remMins);
    } else if (algorithm === 'EDF') {
      const remDeadline = Math.max(1, p.model.simulatedDeadlineMinutes - elapsedMinutes);
      priorityScore = 1000 / remDeadline;
    }

    return {
      pack: p,
      priorityScore,
      breakdown,
    };
  });

  // Sort descending by selected algorithm score
  if (algorithm === 'FCFS') {
    scored.sort((a, b) => a.pack.arrivalOrderMs - b.pack.arrivalOrderMs);
  } else if (algorithm === 'SJF') {
    scored.sort((a, b) => {
      const tA = a.pack.remainingDeficitKwh / Math.max(0.1, a.pack.model.maxChargePowerKw * a.pack.model.chargingEfficiency);
      const tB = b.pack.remainingDeficitKwh / Math.max(0.1, b.pack.model.maxChargePowerKw * b.pack.model.chargingEfficiency);
      return tA - tB;
    });
  } else if (algorithm === 'EDF') {
    scored.sort((a, b) => a.pack.model.simulatedDeadlineMinutes - b.pack.model.simulatedDeadlineMinutes);
  } else {
    scored.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  return scored;
}

/**
 * Exact Branch-and-Bound integer port + power allocator for MILP mode at a single station.
 * Falls back transparently to LP-Relaxation Greedy Heuristic if active pack count > 14.
 */
function solveStationMilp(
  candidates: ScoredPack[],
  portsAvailable: number,
  powerCapKw: number,
  dtHours: number,
  elapsedMinutes: number
): { selectedIds: Set<string>; powerById: Map<string, number>; solverMode: string } {
  const n = candidates.length;
  if (n === 0 || portsAvailable <= 0 || powerCapKw <= 0) {
    return {
      selectedIds: new Set(),
      powerById: new Map(),
      solverMode: 'Exact Branch-and-Bound MIP (trivial empty)',
    };
  }

  // Compute each candidate's maximum feasible draw in this interval and its utility per kWh
  const items = candidates.map((c) => {
    const eff = c.pack.model.chargingEfficiency;
    const maxEnergyInSlot = c.pack.model.maxChargePowerKw * eff * dtHours;
    const neededRawKw =
      c.pack.remainingDeficitKwh / Math.max(0.01, eff * dtHours);
    const maxDrawKw = Math.min(c.pack.model.maxChargePowerKw, neededRawKw);
    const remDeadline = Math.max(15, c.pack.model.simulatedDeadlineMinutes - elapsedMinutes);
    // Utility favors deadline feasibility + energy urgency + completing packs cleanly
    const completionBonus = c.pack.remainingDeficitKwh <= maxEnergyInSlot ? 1.35 : 1.0;
    const utilityPerKwh =
      ((120 / remDeadline) + c.breakdown.U * 0.8 + c.breakdown.D * 0.4) * completionBonus;

    return {
      id: c.pack.model.battery_id,
      maxDrawKw,
      eff,
      utilityPerKw: utilityPerKwh * eff * dtHours,
    };
  });

  // Sort items descending by utility per kW for fast branch-and-bound pruning
  items.sort((a, b) => b.utilityPerKw - a.utilityPerKw);

  const allocatePowerGivenMask = (selectedIndices: number[]) => {
    let remCap = powerCapKw;
    let totalUtil = 0;
    const powers = new Map<string, number>();

    for (const idx of selectedIndices) {
      if (remCap <= 0.001) break;
      const item = items[idx];
      const allocKw = Math.min(item.maxDrawKw, remCap);
      if (allocKw > 0.01) {
        powers.set(item.id, allocKw);
        totalUtil += allocKw * item.utilityPerKw;
        remCap -= allocKw;
      }
    }
    return { totalUtil, powers };
  };

  if (n > 14) {
    // Disclosed fallback when combinatorial pool exceeds fast exact B&B budget
    const chosen: number[] = [];
    for (let i = 0; i < Math.min(n, portsAvailable); i++) {
      chosen.push(i);
    }
    const res = allocatePowerGivenMask(chosen);
    return {
      selectedIds: new Set(res.powers.keys()),
      powerById: res.powers,
      solverMode: `LP-Relaxation Heuristic Fallback (${n} active packs > 14 exact B&B cap)`,
    };
  }

  let bestUtil = -1;
  let bestPowers = new Map<string, number>();
  const currentMask: number[] = [];

  const upperBound = (startIdx: number, portsLeft: number, currentUtil: number) => {
    let ub = currentUtil;
    let remPorts = portsLeft;
    let remPower = powerCapKw;
    for (const idx of currentMask) {
      remPower -= Math.min(items[idx].maxDrawKw, remPower);
    }
    for (let i = startIdx; i < n && remPorts > 0 && remPower > 0.001; i++) {
      const p = Math.min(items[i].maxDrawKw, remPower);
      ub += p * items[i].utilityPerKw;
      remPower -= p;
      remPorts--;
    }
    return ub;
  };

  const dfs = (idx: number) => {
    if (currentMask.length === portsAvailable || idx === n) {
      const { totalUtil, powers } = allocatePowerGivenMask(currentMask);
      if (totalUtil > bestUtil) {
        bestUtil = totalUtil;
        bestPowers = powers;
      }
      return;
    }

    // Current evaluation
    const curEval = allocatePowerGivenMask(currentMask);
    if (curEval.totalUtil > bestUtil) {
      bestUtil = curEval.totalUtil;
      bestPowers = curEval.powers;
    }

    if (upperBound(idx, portsAvailable - currentMask.length, curEval.totalUtil) <= bestUtil + 1e-6) {
      return;
    }

    // Branch 1: Include idx
    currentMask.push(idx);
    dfs(idx + 1);
    currentMask.pop();

    // Branch 2: Exclude idx (if remaining items could still be considered)
    if (n - (idx + 1) >= 1) {
      dfs(idx + 1);
    }
  };

  dfs(0);

  return {
    selectedIds: new Set(bestPowers.keys()),
    powerById: bestPowers,
    solverMode: 'Exact Branch-and-Bound MIP',
  };
}

export function dispatchStationInterval(
  stationId: string,
  stationPacks: ActivePackState[],
  algorithm: AlgorithmId,
  portsAvailable: number,
  powerCapKw: number,
  elapsedMinutes: number,
  config: SimulationConfig
): PortDispatchDecision {
  const dtHours = config.intervalMinutes / 60;
  const scoredPacks = scorePacksForInterval(stationPacks, algorithm, elapsedMinutes, config);

  const allocations: PortDispatchDecision['allocations'] = [];
  let solverMode = algorithm === 'MILP' ? 'Exact Branch-and-Bound MIP' : `${algorithm} Priority Queue`;

  if (algorithm === 'MILP') {
    const milpRes = solveStationMilp(
      scoredPacks,
      portsAvailable,
      powerCapKw,
      dtHours,
      elapsedMinutes
    );
    solverMode = milpRes.solverMode;

    let portNum = 1;
    // Preserve rank display order for allocated packs
    for (const s of scoredPacks) {
      const pKw = milpRes.powerById.get(s.pack.model.battery_id);
      if (pKw && pKw > 0.01 && portNum <= portsAvailable) {
        const eff = s.pack.model.chargingEfficiency;
        const maxAddable = s.pack.remainingDeficitKwh;
        const energyAddedKwh = Math.min(maxAddable, pKw * eff * dtHours);
        const effCap = Math.max(0.1, s.pack.model.effectiveCapacityKwh);
        const socAfterPct = Math.min(100, s.pack.currentSocPct + (energyAddedKwh / effCap) * 100);

        allocations.push({
          battery_id: s.pack.model.battery_id,
          station_id: stationId,
          portNumber: portNum++,
          powerKw: Number(pKw.toFixed(2)),
          energyAddedKwh: Number(energyAddedKwh.toFixed(3)),
          socAfterPct: Number(socAfterPct.toFixed(1)),
        });
      }
    }
    return { allocations, solverMode, scoredPacks };
  }

  // Greedy constrained dispatch for AUPA, FCFS, SJF, EDF enforcing identical physical constraints
  let remainingPowerKw = powerCapKw;
  let portNum = 1;

  for (const s of scoredPacks) {
    if (portNum > portsAvailable || remainingPowerKw <= 0.05) break;

    const eff = s.pack.model.chargingEfficiency;
    const maxUsefulKw = s.pack.remainingDeficitKwh / Math.max(0.01, eff * dtHours);
    const drawKw = Math.min(s.pack.model.maxChargePowerKw, maxUsefulKw, remainingPowerKw);

    if (drawKw > 0.05) {
      const energyAddedKwh = Math.min(s.pack.remainingDeficitKwh, drawKw * eff * dtHours);
      const effCap = Math.max(0.1, s.pack.model.effectiveCapacityKwh);
      const socAfterPct = Math.min(100, s.pack.currentSocPct + (energyAddedKwh / effCap) * 100);

      allocations.push({
        battery_id: s.pack.model.battery_id,
        station_id: stationId,
        portNumber: portNum++,
        powerKw: Number(drawKw.toFixed(2)),
        energyAddedKwh: Number(energyAddedKwh.toFixed(3)),
        socAfterPct: Number(socAfterPct.toFixed(1)),
      });
      remainingPowerKw -= drawKw;
    }
  }

  return { allocations, solverMode, scoredPacks };
}
