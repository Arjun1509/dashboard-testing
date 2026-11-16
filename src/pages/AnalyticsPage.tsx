import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  LineChart,
  Line,
} from 'recharts';
import type {
  DatasetBundle,
  JoinedBatteryModel,
  SimulationResult,
  StationFilter,
} from '../types/swapsched';

interface AnalyticsPageProps {
  dataset: DatasetBundle;
  batteryModels: JoinedBatteryModel[];
  simulation: SimulationResult;
  stationFilter: StationFilter;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  dataset,
  batteryModels,
  simulation,
  stationFilter,
}) => {
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('ALL');

  const scopedVehicles = useMemo(() => {
    return dataset.vehicle_profiles.filter((v) => {
      if (stationFilter !== 'ALL' && v.home_station_id !== stationFilter) return false;
      if (vehicleTypeFilter !== 'ALL' && v.vehicle_type !== vehicleTypeFilter) return false;
      return true;
    });
  }, [dataset.vehicle_profiles, stationFilter, vehicleTypeFilter]);

  const vehicleTypes = useMemo(
    () => Array.from(new Set(dataset.vehicle_profiles.map((v) => v.vehicle_type))),
    [dataset.vehicle_profiles]
  );

  // 1. Observed Historical Energy vs Forecasted Next-Trip Energy per Vehicle
  const vehicleEnergyData = useMemo(() => {
    return scopedVehicles.map((v) => {
      const trips = dataset.trip_history.filter((t) => t.vehicle_id === v.vehicle_id);
      const totalKwh = trips.reduce((s, t) => s + t.energy_consumed_kwh, 0);
      const totalKm = trips.reduce((s, t) => s + t.distance_km, 0);
      const avgTripKwh = trips.length > 0 ? totalKwh / trips.length : 0;
      const kwhPerKm = totalKm > 0 ? totalKwh / totalKm : 0;
      // Forecasted next-trip demand: historical rate * avg trip distance * 1.15 reserve factor
      const predictedWithReserve = avgTripKwh * 1.15;

      return {
        vehicle_id: v.vehicle_id,
        vehicle_type: v.vehicle_type,
        observedAvgKwh: Number(avgTripKwh.toFixed(2)),
        forecastRequiredKwh: Number(predictedWithReserve.toFixed(2)),
        kwhPerKm: Number(kwhPerKm.toFixed(3)),
        samples: trips.length,
      };
    });
  }, [scopedVehicles, dataset.trip_history]);

  // 2. Time-of-Day Demand Profile (Observed Swap Events vs Simulated Horizon Load)
  const hourlyDemandData = useMemo(() => {
    const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 to 21:00
    return hours.map((hr) => {
      const obsSwaps = dataset.swap_events.filter((sw) => {
        if (stationFilter !== 'ALL' && sw.station_id !== stationFilter) return false;
        const d = new Date(sw.swap_timestamp);
        return !Number.isNaN(d.getTime()) && d.getUTCHours() === hr;
      });
      const observedReturns = obsSwaps.length;

      // Forecasted charging kWh in this hour from active simulation intervals
      const simEnergy = simulation.intervals
        .filter((iv) => {
          const ivHr = Number(iv.clockLabel.split(':')[0]);
          return ivHr === hr;
        })
        .reduce((s, iv) => s + iv.energyDeliveredKwh, 0);

      return {
        hourLabel: `${String(hr).padStart(2, '0')}:00`,
        observedSwapEvents: observedReturns,
        forecastChargingKwh: Number(simEnergy.toFixed(2)),
      };
    });
  }, [dataset.swap_events, stationFilter, simulation.intervals]);

  // 3. Station-wise Demand Comparison
  const stationDemandData = useMemo(() => {
    return dataset.station_data.map((stn) => {
      const packs = batteryModels.filter((b) => b.station_id === stn.station_id);
      const observedSwapCount = dataset.swap_events.filter(
        (sw) => sw.station_id === stn.station_id
      ).length;
      const forecastTripDemand = packs.reduce((s, p) => s + p.predictedTripEnergyKwh, 0);
      const currentDeficit = packs.reduce((s, p) => s + p.energyDeficitKwh, 0);

      return {
        station: stn.station_name,
        observedSwaps: observedSwapCount,
        forecastTripKwh: Number(forecastTripDemand.toFixed(2)),
        currentDeficitKwh: Number(currentDeficit.toFixed(2)),
      };
    });
  }, [dataset.station_data, dataset.swap_events, batteryModels]);

  // 4. Battery Degradation Indicators (SoH% vs Cycle Count from actual telemetry)
  const degradationData = useMemo(() => {
    return batteryModels
      .filter((b) => (stationFilter === 'ALL' || b.station_id === stationFilter) && b.latestTelemetry)
      .map((b) => ({
        battery_id: b.battery_id,
        chemistry: b.catalog?.chemistry ?? 'LFP',
        cycles: b.latestTelemetry?.cycle_count ?? 0,
        sohPct: b.latestTelemetry?.soh_pct ?? 100,
        tempC: b.latestTelemetry?.temperature_c ?? 30,
      }));
  }, [batteryModels, stationFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            06 · Historical Trip Telemetry vs Modeled Forecasts
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
            Predictive Analytics
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="analytics-vtype" className="font-mono-tech text-xs text-[#4A4B45]">
            Vehicle Class
          </label>
          <select
            id="analytics-vtype"
            value={vehicleTypeFilter}
            onChange={(e) => setVehicleTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-[#141513] text-xs font-mono-tech"
          >
            <option value="ALL">All Vehicle Classes</option>
            {vehicleTypes.map((vt) => (
              <option key={vt} value={vt}>
                {vt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Observation vs Forecast Legend Banner */}
      <div className="p-4 bg-[#EBE8DF] border border-[#141513] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <strong>Data Provenance Distinction:</strong> Solid charcoal bars denote{' '}
          <span className="font-mono-tech font-semibold">OBSERVED HISTORICAL RECORDS</span> from{' '}
          <code>trip_history.csv</code> &amp; <code>battery_telemetry.csv</code>. Acid-lime &amp;
          purple dashed series denote{' '}
          <span className="font-mono-tech font-semibold text-[#5340C4]">
            MODELED FUTURE PREDICTIONS
          </span>{' '}
          accounting for small-sample trip averages.
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Historical vs Predicted Demand by Vehicle */}
        <section className="lg:col-span-7 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">
            Observed Trip Energy vs Forecasted Required Energy by Vehicle
          </h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Mean observed trip kWh compared against forecasted next-trip + 15% reserve requirement
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vehicleEnergyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="vehicle_id" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} unit=" kWh" />
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
                <Bar dataKey="observedAvgKwh" name="Observed Mean Trip (kWh)" fill="#141513" />
                <Bar
                  dataKey="forecastRequiredKwh"
                  name="Forecasted Required + Reserve (kWh)"
                  fill="#B8FF2E"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Station-wise Demand */}
        <section className="lg:col-span-5 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">Station-Wise Energy Demand</h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Forecasted next-trip pool demand vs active remaining deficit per Delhi hub
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stationDemandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="station" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} unit=" kWh" />
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
                <Bar dataKey="forecastTripKwh" name="Forecasted Trip Demand (kWh)" fill="#7B68EE" />
                <Bar dataKey="currentDeficitKwh" name="Current Energy Deficit (kWh)" fill="#141513" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Charging Demand by Time of Day */}
        <section className="lg:col-span-6 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">
            Time-of-Day Swap Arrivals vs Forecast Charging Load
          </h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Observed swap arrival counts alongside forecasted hourly charging dispatch (kWh)
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyDemandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
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
                <Line
                  type="monotone"
                  dataKey="observedSwapEvents"
                  name="Observed Swap Events (count)"
                  stroke="#141513"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="forecastChargingKwh"
                  name="Forecast Charging Load (kWh)"
                  stroke="#5340C4"
                  strokeDasharray="5 5"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Battery Degradation Indicators */}
        <section className="lg:col-span-6 bg-white border border-[#141513] p-5">
          <h2 className="font-display text-lg font-bold">
            Battery Degradation Indicators (SoH% vs Cycle Count)
          </h2>
          <p className="text-xs text-[#4A4B45] mb-4">
            Observed telemetry correlation between cumulative charge cycles and State of Health
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDAD0" />
                <XAxis
                  type="number"
                  dataKey="cycles"
                  name="Cycle Count"
                  tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                />
                <YAxis
                  type="number"
                  dataKey="sohPct"
                  name="SoH %"
                  domain={[82, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                />
                <ZAxis type="number" dataKey="tempC" range={[60, 220]} name="Temp °C" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: '#141513',
                    color: '#F4F2EC',
                    border: '1px solid #141513',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 11,
                  }}
                />
                <Scatter name="Battery Packs" data={degradationData} fill="#7B68EE" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};
