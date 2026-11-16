export type PageId =
  | 'overview'
  | 'control-room'
  | 'batteries'
  | 'scheduler'
  | 'comparison'
  | 'analytics'
  | 'stations'
  | 'data-explorer';

export type StationFilter = 'ALL' | string;

export type AlgorithmId = 'AUPA' | 'FCFS' | 'SJF' | 'EDF' | 'MILP';

export type CsvTableName =
  | 'vehicle_profiles'
  | 'trip_history'
  | 'battery_catalog'
  | 'battery_registry'
  | 'battery_telemetry'
  | 'swap_events'
  | 'station_data';

export interface VehicleProfile {
  vehicle_id: string;
  vehicle_type: string;
  fleet_operator: string;
  home_station_id: string;
  compatible_battery_type: string;
  avg_daily_km: number;
  registration_city: string;
}

export interface TripRecord {
  trip_id: string;
  vehicle_id: string;
  trip_date: string;
  start_time: string;
  end_time: string;
  distance_km: number;
  energy_consumed_kwh: number;
  avg_speed_kmh: number;
  payload_kg: number;
  ambient_temp_c: number;
}

export interface BatteryCatalogSpec {
  battery_type: string;
  chemistry: string;
  nominal_capacity_kwh: number;
  nominal_voltage_v: number;
  max_charge_power_kw: number;
  charging_efficiency: number;
  compatible_vehicle_types: string;
  rated_cycle_life: number;
}

export interface BatteryRegistryEntry {
  battery_id: string;
  battery_type: string;
  station_id: string;
  commission_date: string;
  manufacturer_batch: string;
  bay_slot: string;
}

export interface BatteryTelemetryRecord {
  telemetry_id: string;
  battery_id: string;
  timestamp: string;
  soc_pct: number | null;
  soh_pct: number | null;
  temperature_c: number | null;
  voltage_v: number | null;
  current_a: number | null;
  cycle_count: number | null;
  fault_code: string;
  isValid: boolean;
  validationIssue?: string;
}

export interface SwapEvent {
  swap_id: string;
  station_id: string;
  vehicle_id: string;
  returned_battery_id: string;
  issued_battery_id: string;
  swap_timestamp: string;
  returned_soc_pct: number;
  swap_duration_sec: number;
  tariff_band: 'Off-Peak' | 'Standard' | 'Peak' | string;
}

export interface StationData {
  station_id: string;
  station_name: string;
  city: string;
  total_bays: number;
  charging_ports: number;
  power_capacity_kw: number;
  grid_status: string;
  base_tariff_inr_kwh: number;
  peak_tariff_inr_kwh: number;
  offpeak_tariff_inr_kwh: number;
  peak_hours: string;
}

export interface DataQualityWarning {
  id: string;
  table: CsvTableName;
  severity: 'error' | 'warning' | 'info';
  rowIdentifier: string;
  message: string;
}

export interface RawCsvTables {
  vehicle_profiles: string;
  trip_history: string;
  battery_catalog: string;
  battery_registry: string;
  battery_telemetry: string;
  swap_events: string;
  station_data: string;
}

export interface DatasetBundle {
  sourceLabel: string;
  isSyntheticDemo: boolean;
  loadedAt: string;
  vehicle_profiles: VehicleProfile[];
  trip_history: TripRecord[];
  battery_catalog: BatteryCatalogSpec[];
  battery_registry: BatteryRegistryEntry[];
  battery_telemetry: BatteryTelemetryRecord[];
  swap_events: SwapEvent[];
  station_data: StationData[];
  warnings: DataQualityWarning[];
  rawCsvs: RawCsvTables;
}

export interface AupaWeights {
  wU: number;
  wD: number;
  wT: number;
  wH: number;
  waitBoostPerInterval: number;
}

export interface SimulationConfig {
  intervalMinutes: number; // default 15
  horizonIntervals: number; // e.g., 16 intervals = 4 hours
  reserveFraction: number; // default 0.15 (15% effective capacity reserve)
  unsafeTempThresholdC: number; // default 46 C
  startHour: number; // simulated start hour (0-23), e.g., 10
  stationOverrides: Record<string, { power_capacity_kw: number; charging_ports: number }>;
  simulatedDeadlinesMinutes: Record<string, number>; // battery_id -> minutes from t=0 (configurable assumption)
  aupaWeights: AupaWeights;
}

export type BatteryOperationalState =
  | 'Ready'
  | 'Charging'
  | 'Queued'
  | 'Fault Excluded'
  | 'Over-Temp Excluded'
  | 'Missing Telemetry';

export interface JoinedBatteryModel {
  battery_id: string;
  battery_type: string;
  station_id: string;
  station_name: string;
  bay_slot: string;
  commission_date: string;
  manufacturer_batch: string;
  catalog: BatteryCatalogSpec | null;
  latestTelemetry: BatteryTelemetryRecord | null;
  telemetryHistory: BatteryTelemetryRecord[];
  lastSwapEvent: SwapEvent | null;
  linkedVehicle: VehicleProfile | null;
  vehicleTrips: TripRecord[];

  // Energy prediction outputs
  nominalCapacityKwh: number;
  effectiveCapacityKwh: number;
  currentStoredKwh: number;
  historicalKwhPerKm: number | null;
  tripSampleCount: number;
  expectedNextTripKm: number;
  predictedTripEnergyKwh: number;
  reserveEnergyKwh: number;
  requiredEnergyKwh: number;
  energyDeficitKwh: number;
  maxChargePowerKw: number;
  chargingEfficiency: number;
  expectedChargeTimeMinutes: number;

  // Health & Safety constraint flags
  hasFault: boolean;
  isOverTemp: boolean;
  isTelemetryMissing: boolean;
  isEligibleForCharging: boolean;
  exclusionReason: string | null;
  operationalState: BatteryOperationalState;
  simulatedDeadlineMinutes: number;
}

export interface AupaBreakdown {
  U: number;
  D: number;
  T: number;
  H: number;
  W: number;
  weightedScore: number;
  explanation: string;
}

export interface BatteryScheduleSlot {
  battery_id: string;
  station_id: string;
  station_name: string;
  battery_type: string;
  socPct: number;
  sohPct: number;
  deficitKwh: number;
  predictedDemandKwh: number;
  deadlineMinutes: number;
  priorityScore: number;
  rank: number | null;
  breakdown: AupaBreakdown;
  allocatedPort: number | null;
  allocatedPowerKw: number;
  estimatedCompletionMinutes: number | null;
  status: BatteryOperationalState;
  exclusionReason: string | null;
}

export interface IntervalAllocation {
  intervalIndex: number;
  startMinutes: number;
  endMinutes: number;
  clockLabel: string;
  tariffBand: 'Off-Peak' | 'Standard' | 'Peak';
  tariffInrPerKwh: number;
  totalPowerKw: number;
  activePorts: number;
  energyDeliveredKwh: number;
  costInr: number;
  allocations: Array<{
    battery_id: string;
    station_id: string;
    portNumber: number;
    powerKw: number;
    energyAddedKwh: number;
    socAfterPct: number;
  }>;
}

export interface SimulationMetrics {
  algorithm: AlgorithmId;
  solverMode: string; // Discloses exact Branch-and-Bound vs Heuristic Fallback for MILP
  usefulEnergyUtilizationPct: number;
  portTimeUtilizationPct: number;
  deadlineSuccessRatePct: number;
  totalEnergyDeliveredKwh: number;
  averageWaitingTimeMinutes: number;
  electricityCostInr: number;
  peakPowerUsageKw: number;
  batteryReadinessPct: number;
  readyCount: number;
  eligibleCount: number;
  excludedCount: number;
}

export interface SimulationResult {
  algorithm: AlgorithmId;
  metrics: SimulationMetrics;
  initialRanking: BatteryScheduleSlot[];
  intervals: IntervalAllocation[];
  finalBatteryStates: Array<{
    battery_id: string;
    station_id: string;
    initialSocPct: number;
    finalSocPct: number;
    initialDeficitKwh: number;
    remainingDeficitKwh: number;
    energyDeliveredKwh: number;
    waitTimeMinutes: number;
    readyAtMinutes: number | null;
    deadlineMinutes: number;
    metDeadline: boolean;
    excluded: boolean;
  }>;
}
