import JSZip from 'jszip';
import type {
  BatteryCatalogSpec,
  BatteryRegistryEntry,
  BatteryTelemetryRecord,
  CsvTableName,
  DataQualityWarning,
  DatasetBundle,
  RawCsvTables,
  StationData,
  SwapEvent,
  TripRecord,
  VehicleProfile,
} from '../types/swapsched';
import { OPTISWAP_DEMO_CSVS } from './optiswapSeed';

const REQUIRED_COLUMNS: Record<CsvTableName, string[]> = {
  vehicle_profiles: ['vehicle_id', 'vehicle_type', 'home_station_id', 'compatible_battery_type'],
  trip_history: ['trip_id', 'vehicle_id', 'distance_km', 'energy_consumed_kwh'],
  battery_catalog: ['battery_type', 'nominal_capacity_kwh', 'max_charge_power_kw', 'charging_efficiency'],
  battery_registry: ['battery_id', 'battery_type', 'station_id'],
  battery_telemetry: ['battery_id', 'timestamp', 'soc_pct', 'soh_pct', 'temperature_c'],
  swap_events: ['swap_id', 'station_id', 'vehicle_id', 'returned_battery_id', 'swap_timestamp'],
  station_data: ['station_id', 'station_name', 'charging_ports', 'power_capacity_kw'],
};

const COLUMN_ALIASES: Record<string, string> = {
  soc: 'soc_pct',
  state_of_charge: 'soc_pct',
  soh: 'soh_pct',
  state_of_health: 'soh_pct',
  temp_c: 'temperature_c',
  temp: 'temperature_c',
  energy_kwh: 'energy_consumed_kwh',
  energy_used_kwh: 'energy_consumed_kwh',
  name: 'station_name',
  capacity_kwh: 'nominal_capacity_kwh',
  max_power_kw: 'max_charge_power_kw',
  efficiency: 'charging_efficiency',
  ports: 'charging_ports',
  available_ports: 'charging_ports',
  power_cap_kw: 'power_capacity_kw',
};

function parseCsvLines(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const rawHeaders = splitRow(lines[0]).map((h) => {
    const clean = h.toLowerCase().replace(/\s+/g, '_');
    return COLUMN_ALIASES[clean] || clean;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    if (values.every((v) => v === '')) continue;
    const obj: Record<string, string> = {};
    rawHeaders.forEach((header, idx) => {
      obj[header] = values[idx] ?? '';
    });
    rows.push(obj);
  }

  return { headers: rawHeaders, rows };
}

function parseOptionalNumber(val: string | undefined): number | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function parseDatasetBundle(
  rawCsvs: RawCsvTables,
  sourceLabel: string,
  isSyntheticDemo: boolean
): DatasetBundle {
  const warnings: DataQualityWarning[] = [];

  const checkSchema = (table: CsvTableName, headers: string[]) => {
    for (const req of REQUIRED_COLUMNS[table]) {
      if (!headers.includes(req)) {
        warnings.push({
          id: `schema-${table}-${req}`,
          table,
          severity: 'error',
          rowIdentifier: 'HEADER',
          message: `Missing required column "${req}" in ${table}.csv`,
        });
      }
    }
  };

  // 1. station_data
  const stParsed = parseCsvLines(rawCsvs.station_data);
  checkSchema('station_data', stParsed.headers);
  const station_data: StationData[] = stParsed.rows.map((r, idx) => {
    const ports = parseOptionalNumber(r.charging_ports);
    const cap = parseOptionalNumber(r.power_capacity_kw);
    if (ports === null || cap === null) {
      warnings.push({
        id: `stn-${idx}`,
        table: 'station_data',
        severity: 'error',
        rowIdentifier: r.station_id || `Row ${idx + 2}`,
        message: 'Missing charging_ports or power_capacity_kw value; record cannot participate in power limits reliably.',
      });
    }
    return {
      station_id: r.station_id || `STN-${idx + 1}`,
      station_name: r.station_name || r.station_id || `Station ${idx + 1}`,
      city: r.city || 'Delhi',
      total_bays: parseOptionalNumber(r.total_bays) ?? ports ?? 0,
      charging_ports: ports ?? 0,
      power_capacity_kw: cap ?? 0,
      grid_status: r.grid_status || 'Unknown',
      base_tariff_inr_kwh: parseOptionalNumber(r.base_tariff_inr_kwh) ?? 8.5,
      peak_tariff_inr_kwh: parseOptionalNumber(r.peak_tariff_inr_kwh) ?? 11.2,
      offpeak_tariff_inr_kwh: parseOptionalNumber(r.offpeak_tariff_inr_kwh) ?? 6.8,
      peak_hours: r.peak_hours || '17:00-22:00',
    };
  });

  // 2. battery_catalog
  const catParsed = parseCsvLines(rawCsvs.battery_catalog);
  checkSchema('battery_catalog', catParsed.headers);
  const battery_catalog: BatteryCatalogSpec[] = catParsed.rows.map((r, idx) => ({
    battery_type: r.battery_type || `TYPE-${idx + 1}`,
    chemistry: r.chemistry || 'LFP',
    nominal_capacity_kwh: parseOptionalNumber(r.nominal_capacity_kwh) ?? 0,
    nominal_voltage_v: parseOptionalNumber(r.nominal_voltage_v) ?? 48,
    max_charge_power_kw: parseOptionalNumber(r.max_charge_power_kw) ?? 0,
    charging_efficiency: parseOptionalNumber(r.charging_efficiency) ?? 0.92,
    compatible_vehicle_types: r.compatible_vehicle_types || '',
    rated_cycle_life: parseOptionalNumber(r.rated_cycle_life) ?? 2000,
  }));

  // 3. vehicle_profiles
  const vehParsed = parseCsvLines(rawCsvs.vehicle_profiles);
  checkSchema('vehicle_profiles', vehParsed.headers);
  const vehicle_profiles: VehicleProfile[] = vehParsed.rows.map((r, idx) => ({
    vehicle_id: r.vehicle_id || `VEH-${idx + 1}`,
    vehicle_type: r.vehicle_type || 'EV',
    fleet_operator: r.fleet_operator || 'Unassigned Fleet',
    home_station_id: r.home_station_id || '',
    compatible_battery_type: r.compatible_battery_type || '',
    avg_daily_km: parseOptionalNumber(r.avg_daily_km) ?? 0,
    registration_city: r.registration_city || 'Delhi',
  }));

  // 4. trip_history
  const trpParsed = parseCsvLines(rawCsvs.trip_history);
  checkSchema('trip_history', trpParsed.headers);
  const trip_history: TripRecord[] = [];
  trpParsed.rows.forEach((r, idx) => {
    const dist = parseOptionalNumber(r.distance_km);
    const energy = parseOptionalNumber(r.energy_consumed_kwh);
    if (dist === null || energy === null || dist <= 0) {
      warnings.push({
        id: `trp-${idx}`,
        table: 'trip_history',
        severity: 'warning',
        rowIdentifier: r.trip_id || `Row ${idx + 2}`,
        message: 'Invalid or missing distance_km / energy_consumed_kwh; excluded from kWh/km regression.',
      });
      return;
    }
    trip_history.push({
      trip_id: r.trip_id || `TRP-${idx + 1}`,
      vehicle_id: r.vehicle_id || '',
      trip_date: r.trip_date || '',
      start_time: r.start_time || '',
      end_time: r.end_time || '',
      distance_km: dist,
      energy_consumed_kwh: energy,
      avg_speed_kmh: parseOptionalNumber(r.avg_speed_kmh) ?? 0,
      payload_kg: parseOptionalNumber(r.payload_kg) ?? 0,
      ambient_temp_c: parseOptionalNumber(r.ambient_temp_c) ?? 28,
    });
  });

  // 5. battery_registry
  const regParsed = parseCsvLines(rawCsvs.battery_registry);
  checkSchema('battery_registry', regParsed.headers);
  const battery_registry: BatteryRegistryEntry[] = regParsed.rows.map((r, idx) => ({
    battery_id: r.battery_id || `BAT-${idx + 1}`,
    battery_type: r.battery_type || '',
    station_id: r.station_id || '',
    commission_date: r.commission_date || '',
    manufacturer_batch: r.manufacturer_batch || '',
    bay_slot: r.bay_slot || '',
  }));

  // 6. battery_telemetry (preserve invalid records transparently & log warnings!)
  const telParsed = parseCsvLines(rawCsvs.battery_telemetry);
  checkSchema('battery_telemetry', telParsed.headers);
  const battery_telemetry: BatteryTelemetryRecord[] = telParsed.rows.map((r, idx) => {
    const soc = parseOptionalNumber(r.soc_pct);
    const soh = parseOptionalNumber(r.soh_pct);
    const temp = parseOptionalNumber(r.temperature_c);
    const volt = parseOptionalNumber(r.voltage_v);
    const curr = parseOptionalNumber(r.current_a);
    const cycles = parseOptionalNumber(r.cycle_count);
    const tsValid = !Number.isNaN(Date.parse(r.timestamp || ''));

    let isValid = true;
    let validationIssue: string | undefined;

    if (!tsValid) {
      isValid = false;
      validationIssue = 'Unparseable timestamp';
    } else if (soc === null || soc < 0 || soc > 100) {
      isValid = false;
      validationIssue = 'Missing or out-of-bounds SoC% (dropped in favor of latest valid packet)';
    } else if (soh === null || soh <= 0 || soh > 100) {
      isValid = false;
      validationIssue = 'Missing or invalid SoH%';
    } else if (temp === null) {
      isValid = false;
      validationIssue = 'Missing temperature reading';
    }

    if (!isValid) {
      warnings.push({
        id: `tel-invalid-${idx}`,
        table: 'battery_telemetry',
        severity: 'warning',
        rowIdentifier: `${r.telemetry_id || `Row ${idx + 2}`} (${r.battery_id})`,
        message: validationIssue || 'Malformed telemetry frame',
      });
    } else if (r.fault_code && r.fault_code.toUpperCase() !== 'NONE' && r.fault_code.trim() !== '') {
      warnings.push({
        id: `tel-fault-${idx}`,
        table: 'battery_telemetry',
        severity: 'error',
        rowIdentifier: `${r.battery_id} @ ${r.timestamp}`,
        message: `Active fault code reported: ${r.fault_code}. Pack quarantined from automatic allocation.`,
      });
    } else if (temp !== null && temp >= 46) {
      warnings.push({
        id: `tel-temp-${idx}`,
        table: 'battery_telemetry',
        severity: 'error',
        rowIdentifier: `${r.battery_id} @ ${r.timestamp}`,
        message: `Unsafe cell temperature (${temp.toFixed(1)}°C >= 46.0°C threshold). Pack excluded pending thermal cooldown.`,
      });
    }

    return {
      telemetry_id: r.telemetry_id || `TEL-${idx + 1}`,
      battery_id: r.battery_id || '',
      timestamp: r.timestamp || '',
      soc_pct: soc,
      soh_pct: soh,
      temperature_c: temp,
      voltage_v: volt,
      current_a: curr,
      cycle_count: cycles,
      fault_code: r.fault_code || 'NONE',
      isValid,
      validationIssue,
    };
  });

  // 7. swap_events
  const swpParsed = parseCsvLines(rawCsvs.swap_events);
  checkSchema('swap_events', swpParsed.headers);
  const swap_events: SwapEvent[] = swpParsed.rows.map((r, idx) => ({
    swap_id: r.swap_id || `SWP-${idx + 1}`,
    station_id: r.station_id || '',
    vehicle_id: r.vehicle_id || '',
    returned_battery_id: r.returned_battery_id || '',
    issued_battery_id: r.issued_battery_id || '',
    swap_timestamp: r.swap_timestamp || '',
    returned_soc_pct: parseOptionalNumber(r.returned_soc_pct) ?? 0,
    swap_duration_sec: parseOptionalNumber(r.swap_duration_sec) ?? 0,
    tariff_band: r.tariff_band || 'Standard',
  }));

  // Referential integrity checks across joins
  const stationIds = new Set(station_data.map((s) => s.station_id));
  const catalogTypes = new Set(battery_catalog.map((c) => c.battery_type));
  const batteryIds = new Set(battery_registry.map((b) => b.battery_id));

  battery_registry.forEach((b) => {
    if (!stationIds.has(b.station_id)) {
      warnings.push({
        id: `fk-bat-stn-${b.battery_id}`,
        table: 'battery_registry',
        severity: 'warning',
        rowIdentifier: b.battery_id,
        message: `station_id "${b.station_id}" not found in station_data.csv`,
      });
    }
    if (!catalogTypes.has(b.battery_type)) {
      warnings.push({
        id: `fk-bat-cat-${b.battery_id}`,
        table: 'battery_registry',
        severity: 'error',
        rowIdentifier: b.battery_id,
        message: `battery_type "${b.battery_type}" missing from battery_catalog.csv`,
      });
    }
  });

  swap_events.forEach((sw) => {
    if (sw.returned_battery_id && !batteryIds.has(sw.returned_battery_id)) {
      warnings.push({
        id: `fk-swp-bat-${sw.swap_id}`,
        table: 'swap_events',
        severity: 'info',
        rowIdentifier: sw.swap_id,
        message: `returned_battery_id "${sw.returned_battery_id}" is not registered in current station inventory.`,
      });
    }
  });

  return {
    sourceLabel,
    isSyntheticDemo,
    loadedAt: new Date().toISOString(),
    vehicle_profiles,
    trip_history,
    battery_catalog,
    battery_registry,
    battery_telemetry,
    swap_events,
    station_data,
    warnings,
    rawCsvs,
  };
}

export function loadDefaultDemoDataset(): DatasetBundle {
  return parseDatasetBundle(
    OPTISWAP_DEMO_CSVS,
    'Built-in Synthetic Demonstration Dataset (OptiSwap-compatible schema)',
    true
  );
}

export async function importOptiSwapZip(file: File): Promise<DatasetBundle> {
  const zip = await JSZip.loadAsync(file);
  const nextCsvs: RawCsvTables = { ...OPTISWAP_DEMO_CSVS };
  const tableNames: CsvTableName[] = [
    'vehicle_profiles',
    'trip_history',
    'battery_catalog',
    'battery_registry',
    'battery_telemetry',
    'swap_events',
    'station_data',
  ];

  let matchedCount = 0;
  const entries = Object.keys(zip.files);

  for (const table of tableNames) {
    const matchPath = entries.find((path) => {
      const base = path.split('/').pop()?.toLowerCase() ?? '';
      return base === `${table}.csv`;
    });
    if (matchPath) {
      const text = await zip.files[matchPath].async('string');
      nextCsvs[table] = text;
      matchedCount++;
    }
  }

  if (matchedCount === 0) {
    throw new Error('No recognized OptiSwap CSV tables found inside ZIP archive.');
  }

  return parseDatasetBundle(
    nextCsvs,
    `Uploaded Archive: ${file.name} (${matchedCount}/7 CSV tables matched)`,
    false
  );
}

export async function importSingleCsvFile(
  currentRaw: RawCsvTables,
  table: CsvTableName,
  file: File
): Promise<DatasetBundle> {
  const text = await file.text();
  const updated: RawCsvTables = {
    ...currentRaw,
    [table]: text,
  };
  return parseDatasetBundle(updated, `Custom CSV Override (${table}.csv from ${file.name})`, false);
}
