import type {
  BatteryOperationalState,
  DatasetBundle,
  JoinedBatteryModel,
  SimulationConfig,
} from '../types/swapsched';
import { buildRelationalJoins } from './joins';

/**
 * Generates deterministic simulated readiness deadline assumptions (in minutes from t=0)
 * because the OptiSwap dataset does not contain future vehicle departure timestamps.
 */
export function buildDefaultDeadlines(dataset: DatasetBundle): Record<string, number> {
  const deadlines: Record<string, number> = {};
  const swapsByBattery = new Map<string, number>();

  dataset.swap_events.forEach((sw) => {
    const ts = Date.parse(sw.swap_timestamp);
    if (!Number.isNaN(ts)) {
      const prev = swapsByBattery.get(sw.returned_battery_id) ?? 0;
      if (ts > prev) swapsByBattery.set(sw.returned_battery_id, ts);
    }
  });

  // Deterministic spread across 60..210 minutes based on battery index and returned time
  dataset.battery_registry.forEach((bat, index) => {
    const base = [75, 90, 120, 135, 60, 105, 150, 90, 75, 165, 90, 105, 135, 180, 60, 120, 105, 150];
    deadlines[bat.battery_id] = base[index % base.length];
  });

  return deadlines;
}

export function computeBatteryEnergyModels(
  dataset: DatasetBundle,
  config: SimulationConfig
): JoinedBatteryModel[] {
  const joins = buildRelationalJoins(dataset);

  // Precompute type-level average kWh/km from actual trip_history joined through vehicle_profiles
  const typeConsumptionTotals = new Map<string, { energy: number; dist: number; trips: number }>();
  const typeAvgTripKm = new Map<string, { dist: number; count: number }>();

  dataset.vehicle_profiles.forEach((v) => {
    const trips = joins.tripsByVehicleId.get(v.vehicle_id) ?? [];
    trips.forEach((t) => {
      if (t.distance_km > 0) {
        const cur = typeConsumptionTotals.get(v.compatible_battery_type) ?? {
          energy: 0,
          dist: 0,
          trips: 0,
        };
        cur.energy += t.energy_consumed_kwh;
        cur.dist += t.distance_km;
        cur.trips += 1;
        typeConsumptionTotals.set(v.compatible_battery_type, cur);

        const dCur = typeAvgTripKm.get(v.compatible_battery_type) ?? { dist: 0, count: 0 };
        dCur.dist += t.distance_km;
        dCur.count += 1;
        typeAvgTripKm.set(v.compatible_battery_type, dCur);
      }
    });
  });

  return dataset.battery_registry.map((bat) => {
    const catalog = joins.catalogByType.get(bat.battery_type) ?? null;
    const station = joins.stationsById.get(bat.station_id);
    const latestTelemetry = joins.latestValidTelemetryByBatteryId.get(bat.battery_id) ?? null;
    const telemetryHistory = joins.telemetryHistoryByBatteryId.get(bat.battery_id) ?? [];
    const swapList = joins.swapsByReturnedBatteryId.get(bat.battery_id) ?? [];
    const lastSwapEvent = swapList[0] ?? null;
    const linkedVehicle = lastSwapEvent
      ? joins.vehiclesById.get(lastSwapEvent.vehicle_id) ?? null
      : null;
    const vehicleTrips = linkedVehicle
      ? joins.tripsByVehicleId.get(linkedVehicle.vehicle_id) ?? []
      : [];

    const nominalCapacityKwh = catalog?.nominal_capacity_kwh ?? 0;
    const maxChargePowerKw = catalog?.max_charge_power_kw ?? 0;
    const chargingEfficiency = catalog?.charging_efficiency ?? 0.92;

    const isTelemetryMissing =
      latestTelemetry === null ||
      latestTelemetry.soc_pct === null ||
      latestTelemetry.soh_pct === null ||
      latestTelemetry.temperature_c === null;

    const sohPct = latestTelemetry?.soh_pct ?? 0;
    const socPct = latestTelemetry?.soc_pct ?? 0;
    const tempC = latestTelemetry?.temperature_c ?? 0;
    const faultCode = latestTelemetry?.fault_code ?? 'MISSING';

    // Exact Equations from Section 6:
    // Effective battery capacity = Nominal capacity × SoH
    const effectiveCapacityKwh = nominalCapacityKwh * (sohPct / 100);
    const currentStoredKwh = effectiveCapacityKwh * (socPct / 100);

    // Historical energy consumption per km (prefer linked vehicle trips; fall back to same battery_type trips)
    let historicalKwhPerKm: number | null = null;
    let tripSampleCount = 0;
    let expectedNextTripKm = 0;

    if (vehicleTrips.length > 0) {
      const sumEnergy = vehicleTrips.reduce((s, t) => s + t.energy_consumed_kwh, 0);
      const sumDist = vehicleTrips.reduce((s, t) => s + t.distance_km, 0);
      historicalKwhPerKm = sumDist > 0 ? sumEnergy / sumDist : null;
      tripSampleCount = vehicleTrips.length;
      expectedNextTripKm = sumDist / vehicleTrips.length;
    } else {
      const typeStat = typeConsumptionTotals.get(bat.battery_type);
      const distStat = typeAvgTripKm.get(bat.battery_type);
      if (typeStat && typeStat.dist > 0) {
        historicalKwhPerKm = typeStat.energy / typeStat.dist;
        tripSampleCount = typeStat.trips;
        expectedNextTripKm = distStat && distStat.count > 0 ? distStat.dist / distStat.count : 24;
      }
    }

    // Predicted trip energy = expected next trip km * historical kWh/km (capped realistically at effective capacity if unlinked)
    const rawPredictedTrip =
      historicalKwhPerKm !== null ? expectedNextTripKm * historicalKwhPerKm : effectiveCapacityKwh * 0.72;
    const predictedTripEnergyKwh = Math.min(effectiveCapacityKwh * 0.85, Math.max(0, rawPredictedTrip));

    // Required energy = Predicted trip energy + reserve energy (bounded by effective capacity)
    const reserveEnergyKwh = effectiveCapacityKwh * config.reserveFraction;
    const requiredEnergyKwh = Math.min(
      effectiveCapacityKwh,
      predictedTripEnergyKwh + reserveEnergyKwh
    );

    // Energy deficit = Maximum of zero and (required energy − current stored energy)
    const energyDeficitKwh = isTelemetryMissing
      ? 0
      : Math.max(0, requiredEnergyKwh - currentStoredKwh);

    // Charging time = Energy deficit / (Charging power × Charging efficiency)
    const effectivePowerRate = maxChargePowerKw * chargingEfficiency;
    const expectedChargeTimeMinutes =
      effectivePowerRate > 0 ? (energyDeficitKwh / effectivePowerRate) * 60 : 0;

    // Health, Compatibility & Safety Exclusions (Section 7)
    const hasFault =
      !isTelemetryMissing &&
      faultCode.trim() !== '' &&
      faultCode.trim().toUpperCase() !== 'NONE';
    const isOverTemp = !isTelemetryMissing && tempC >= config.unsafeTempThresholdC;

    // Compatibility check if linked vehicle exists
    const isIncompatible =
      catalog !== null &&
      linkedVehicle !== null &&
      linkedVehicle.compatible_battery_type !== '' &&
      linkedVehicle.compatible_battery_type !== bat.battery_type;

    let exclusionReason: string | null = null;
    if (isTelemetryMissing) {
      exclusionReason = 'Missing or invalid telemetry packet; excluded from automated dispatch.';
    } else if (hasFault) {
      exclusionReason = `Active BMS fault (${faultCode}); quarantined pending technician inspection.`;
    } else if (isOverTemp) {
      exclusionReason = `Cell temperature ${tempC.toFixed(1)}°C exceeds ${config.unsafeTempThresholdC}°C safety ceiling.`;
    } else if (isIncompatible) {
      exclusionReason = `Vehicle ${linkedVehicle?.vehicle_id} compatibility mismatch (${linkedVehicle?.compatible_battery_type} required).`;
    } else if (!catalog) {
      exclusionReason = `Battery type ${bat.battery_type} absent from battery_catalog.csv.`;
    }

    const isEligibleForCharging = exclusionReason === null && energyDeficitKwh > 0.01;

    let operationalState: BatteryOperationalState = 'Ready';
    if (isTelemetryMissing) operationalState = 'Missing Telemetry';
    else if (hasFault) operationalState = 'Fault Excluded';
    else if (isOverTemp) operationalState = 'Over-Temp Excluded';
    else if (energyDeficitKwh > 0.01) operationalState = 'Queued';
    else operationalState = 'Ready';

    const simulatedDeadlineMinutes = config.simulatedDeadlinesMinutes[bat.battery_id] ?? 120;

    return {
      battery_id: bat.battery_id,
      battery_type: bat.battery_type,
      station_id: bat.station_id,
      station_name: station?.station_name ?? bat.station_id,
      bay_slot: bat.bay_slot,
      commission_date: bat.commission_date,
      manufacturer_batch: bat.manufacturer_batch,
      catalog,
      latestTelemetry,
      telemetryHistory,
      lastSwapEvent,
      linkedVehicle,
      vehicleTrips,
      nominalCapacityKwh,
      effectiveCapacityKwh,
      currentStoredKwh,
      historicalKwhPerKm,
      tripSampleCount,
      expectedNextTripKm,
      predictedTripEnergyKwh,
      reserveEnergyKwh,
      requiredEnergyKwh,
      energyDeficitKwh,
      maxChargePowerKw,
      chargingEfficiency,
      expectedChargeTimeMinutes,
      hasFault,
      isOverTemp,
      isTelemetryMissing,
      isEligibleForCharging,
      exclusionReason,
      operationalState,
      simulatedDeadlineMinutes,
    };
  });
}
