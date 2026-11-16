# SwapSched — Intelligent EV Charging & Battery Swap Management Platform

SwapSched is a responsive, interactive EV fleet energy-management and battery-swapping platform built with **React, TypeScript, Tailwind CSS, Recharts, Lucide Icons, and JSZip**.

---

## 1. Synthetic Dataset Disclosure & OptiSwap Schema

- **Built-in Demonstration Data**: All preloaded records across the 7 CSV tables represent **synthetic demonstration data** modeling Delhi NCR operations at **Dwarka Sector 12** (`STN-DEL-DWK12`) and **Janakpuri District Centre** (`STN-DEL-JKP01`). They are **not** real OEM telemetry or live vehicle logs.
- **Custom CSV / ZIP Import**: In **Page 08 (Data Explorer)**, operators can upload an OptiSwap `.zip` archive or individual `.csv` files (`vehicle_profiles.csv`, `trip_history.csv`, `battery_catalog.csv`, `battery_registry.csv`, `battery_telemetry.csv`, `swap_events.csv`, `station_data.csv`). Schema validation flags missing columns, null fields, and active faults transparently without silently substituting synthetic defaults.

### Implemented Relational Joins

1. `vehicle_profiles.vehicle_id = trip_history.vehicle_id`
2. `vehicle_profiles.vehicle_id = swap_events.vehicle_id`
3. `battery_registry.battery_type = battery_catalog.battery_type`
4. `battery_registry.battery_id = battery_telemetry.battery_id` (sorted by `timestamp` descending to isolate the latest valid packet per physical pack)
5. `battery_registry.battery_id = swap_events.returned_battery_id`
6. `swap_events.station_id = station_data.station_id`

---

## 2. Energy Prediction Equations

- **Effective Battery Capacity**: `Nominal Capacity × (SoH / 100)`
- **Historical Consumption Rate**: Mean `energy_consumed_kwh / distance_km` from joined `trip_history` records (accounting for small sample sizes per vehicle)
- **Required Energy**: `Predicted Trip Energy + Reserve Energy` (default 15% of effective capacity)
- **Energy Deficit**: `max(0, Required Energy − Current Stored Energy)`
- **Expected Charging Time**: `Energy Deficit / (Charging Power × Charging Efficiency)`

Battery specifications (`max_charge_power_kw`, `charging_efficiency`, `rated_cycle_life`) are illustrative simulation parameters.

---

## 3. Scheduling Algorithms & Constraints

All 5 algorithms run on the identical discrete-time simulation engine (default **15-minute intervals** across a 4-hour horizon) enforcing:
- Total station power ≤ `power_capacity_kw`
- Active charging ports ≤ `charging_ports`
- Per-pack power ≤ `max_charge_power_kw` and remaining deficit ceiling
- Vehicle/pack compatibility checks
- Automatic quarantine of packs with non-`NONE` BMS fault codes or unsafe temperature readings (`≥ 46°C`)

### Primary Algorithm: AUPA (Adaptive Urgency & Predictive Allocation)

```
Priority(i) = w_U·U(i) + w_D·D(i) + w_T·T(i) + w_H·H(i) + W(i)
Default: w_U = 0.30, w_D = 0.25, w_T = 0.35, w_H = 0.10
```

- `U(i)`: Normalized energy deficit urgency
- `D(i)`: Normalized predicted trip energy demand
- `T(i)`: Normalized deadline urgency against **configurable simulated readiness targets** (labeled explicitly as operator assumptions because the source dataset omits future departure timestamps)
- `H(i)`: Normalized historical cycle utilization
- `W(i)`: Additive anti-starvation waiting-time boost per deferred slot

### Benchmark Algorithms

1. **AUPA** — Multi-factor adaptive priority with anti-starvation boost
2. **FCFS** — First Come, First Served ordered by `swap_events.swap_timestamp`
3. **SJF** — Shortest Job First ordered by remaining charging duration
4. **EDF** — Earliest Deadline First ordered by simulated readiness target
5. **MILP** — Exact in-browser **Branch-and-Bound Integer Port & Power Optimizer** per station per interval (automatically discloses and switches to an **LP-Relaxation Greedy Heuristic Fallback** if a custom upload exceeds 14 active eligible packs at a single station)

---

## 4. Local Setup

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```
