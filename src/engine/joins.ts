import type {
  BatteryCatalogSpec,
  BatteryTelemetryRecord,
  DatasetBundle,
  StationData,
  SwapEvent,
  TripRecord,
  VehicleProfile,
} from '../types/swapsched';

export interface RelationalJoinIndex {
  stationsById: Map<string, StationData>;
  catalogByType: Map<string, BatteryCatalogSpec>;
  vehiclesById: Map<string, VehicleProfile>;
  tripsByVehicleId: Map<string, TripRecord[]>;
  swapsByVehicleId: Map<string, SwapEvent[]>;
  swapsByReturnedBatteryId: Map<string, SwapEvent[]>;
  swapsByStationId: Map<string, SwapEvent[]>;
  telemetryHistoryByBatteryId: Map<string, BatteryTelemetryRecord[]>;
  latestValidTelemetryByBatteryId: Map<string, BatteryTelemetryRecord>;
}

/**
 * Builds the 6 relational joins specified for OptiSwap:
 * 1. vehicle_profiles.vehicle_id = trip_history.vehicle_id
 * 2. vehicle_profiles.vehicle_id = swap_events.vehicle_id
 * 3. battery_registry.battery_type = battery_catalog.battery_type
 * 4. battery_registry.battery_id = battery_telemetry.battery_id
 * 5. battery_registry.battery_id = swap_events.returned_battery_id
 * 6. swap_events.station_id = station_data.station_id
 */
export function buildRelationalJoins(dataset: DatasetBundle): RelationalJoinIndex {
  const stationsById = new Map<string, StationData>();
  dataset.station_data.forEach((s) => stationsById.set(s.station_id, s));

  const catalogByType = new Map<string, BatteryCatalogSpec>();
  dataset.battery_catalog.forEach((c) => catalogByType.set(c.battery_type, c));

  const vehiclesById = new Map<string, VehicleProfile>();
  dataset.vehicle_profiles.forEach((v) => vehiclesById.set(v.vehicle_id, v));

  // Join 1: vehicle_profiles.vehicle_id = trip_history.vehicle_id
  const tripsByVehicleId = new Map<string, TripRecord[]>();
  dataset.trip_history.forEach((t) => {
    const arr = tripsByVehicleId.get(t.vehicle_id) ?? [];
    arr.push(t);
    tripsByVehicleId.set(t.vehicle_id, arr);
  });

  // Join 2 & 5 & 6: swap_events indexed by vehicle_id, returned_battery_id, and station_id
  const swapsByVehicleId = new Map<string, SwapEvent[]>();
  const swapsByReturnedBatteryId = new Map<string, SwapEvent[]>();
  const swapsByStationId = new Map<string, SwapEvent[]>();

  const sortedSwaps = [...dataset.swap_events].sort(
    (a, b) => Date.parse(b.swap_timestamp) - Date.parse(a.swap_timestamp)
  );

  sortedSwaps.forEach((sw) => {
    if (sw.vehicle_id) {
      const vArr = swapsByVehicleId.get(sw.vehicle_id) ?? [];
      vArr.push(sw);
      swapsByVehicleId.set(sw.vehicle_id, vArr);
    }
    if (sw.returned_battery_id) {
      const bArr = swapsByReturnedBatteryId.get(sw.returned_battery_id) ?? [];
      bArr.push(sw);
      swapsByReturnedBatteryId.set(sw.returned_battery_id, bArr);
    }
    if (sw.station_id) {
      const sArr = swapsByStationId.get(sw.station_id) ?? [];
      sArr.push(sw);
      swapsByStationId.set(sw.station_id, sArr);
    }
  });

  // Join 4: battery_registry.battery_id = battery_telemetry.battery_id
  // Sort by timestamp descending to identify latest valid telemetry state per pack
  const telemetryHistoryByBatteryId = new Map<string, BatteryTelemetryRecord[]>();
  const latestValidTelemetryByBatteryId = new Map<string, BatteryTelemetryRecord>();

  const sortedTelemetry = [...dataset.battery_telemetry].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
  );

  sortedTelemetry.forEach((rec) => {
    const arr = telemetryHistoryByBatteryId.get(rec.battery_id) ?? [];
    arr.push(rec);
    telemetryHistoryByBatteryId.set(rec.battery_id, arr);

    if (rec.isValid && !latestValidTelemetryByBatteryId.has(rec.battery_id)) {
      latestValidTelemetryByBatteryId.set(rec.battery_id, rec);
    }
  });

  return {
    stationsById,
    catalogByType,
    vehiclesById,
    tripsByVehicleId,
    swapsByVehicleId,
    swapsByReturnedBatteryId,
    swapsByStationId,
    telemetryHistoryByBatteryId,
    latestValidTelemetryByBatteryId,
  };
}
