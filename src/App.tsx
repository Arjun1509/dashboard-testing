import React, { useEffect, useMemo, useState } from 'react';
import { LayoutShell } from './components/LayoutShell';
import { DocsModal } from './components/DocsModal';
import {
  importOptiSwapZip,
  importSingleCsvFile,
  loadDefaultDemoDataset,
} from './data/csvLoader';
import { buildDefaultDeadlines, computeBatteryEnergyModels } from './engine/energyPrediction';
import { runBenchmarkComparison } from './engine/simulator';
import { OverviewPage } from './pages/OverviewPage';
import { ControlRoomPage } from './pages/ControlRoomPage';
import { BatteriesPage } from './pages/BatteriesPage';
import { SchedulerPage } from './pages/SchedulerPage';
import { ComparisonPage } from './pages/ComparisonPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { StationsPage } from './pages/StationsPage';
import { DataExplorerPage } from './pages/DataExplorerPage';
import type {
  AlgorithmId,
  CsvTableName,
  DatasetBundle,
  PageId,
  SimulationConfig,
  StationFilter,
} from './types/swapsched';

function createInitialConfig(dataset: DatasetBundle): SimulationConfig {
  return {
    intervalMinutes: 15,
    horizonIntervals: 16,
    reserveFraction: 0.15,
    unsafeTempThresholdC: 46,
    startHour: 10,
    stationOverrides: {},
    simulatedDeadlinesMinutes: buildDefaultDeadlines(dataset),
    aupaWeights: {
      wU: 0.30,
      wD: 0.25,
      wT: 0.35,
      wH: 0.10,
      waitBoostPerInterval: 0.04,
    },
  };
}

export function App() {
  const [dataset, setDataset] = useState<DatasetBundle>(() => loadDefaultDemoDataset());
  const [config, setConfig] = useState<SimulationConfig>(() => createInitialConfig(dataset));
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [stationFilter, setStationFilter] = useState<StationFilter>('ALL');
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('AUPA');
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 4>(1);
  const [docsOpen, setDocsOpen] = useState(false);

  // Derived prediction models & 5-algorithm simulation benchmarks
  const batteryModels = useMemo(
    () => computeBatteryEnergyModels(dataset, config),
    [dataset, config]
  );

  const benchmarks = useMemo(
    () => runBenchmarkComparison(dataset, batteryModels, stationFilter, config),
    [dataset, batteryModels, stationFilter, config]
  );

  const activeSimulation = benchmarks[algorithm];
  const totalIntervals = activeSimulation.intervals.length;

  useEffect(() => {
    if (!isPlaying) return;
    const delayMs = simSpeed === 4 ? 350 : simSpeed === 2 ? 700 : 1200;
    const timer = window.setInterval(() => {
      setCurrentIntervalIndex((prev) => (prev + 1) % Math.max(1, totalIntervals));
    }, delayMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, simSpeed, totalIntervals]);

  const handleImportZip = async (file: File) => {
    const nextDataset = await importOptiSwapZip(file);
    setDataset(nextDataset);
    setConfig((prev) => ({
      ...createInitialConfig(nextDataset),
      aupaWeights: prev.aupaWeights,
      intervalMinutes: prev.intervalMinutes,
    }));
    setStationFilter('ALL');
    setCurrentIntervalIndex(0);
    setIsPlaying(false);
  };

  const handleImportCsv = async (table: CsvTableName, file: File) => {
    const nextDataset = await importSingleCsvFile(dataset.rawCsvs, table, file);
    setDataset(nextDataset);
    setConfig((prev) => ({
      ...prev,
      simulatedDeadlinesMinutes: {
        ...buildDefaultDeadlines(nextDataset),
        ...prev.simulatedDeadlinesMinutes,
      },
    }));
    setCurrentIntervalIndex(0);
  };

  const handleResetToDemo = () => {
    const demo = loadDefaultDemoDataset();
    setDataset(demo);
    setConfig(createInitialConfig(demo));
    setStationFilter('ALL');
    setCurrentIntervalIndex(0);
    setIsPlaying(false);
  };

  const handleResetSchedulerDefaults = () => {
    setConfig(createInitialConfig(dataset));
    setCurrentIntervalIndex(0);
  };

  const currentIntervalClock =
    activeSimulation.intervals[currentIntervalIndex]?.clockLabel ?? '10:00';

  return (
    <>
      <LayoutShell
        activePage={activePage}
        onNavigate={setActivePage}
        stations={dataset.station_data}
        stationFilter={stationFilter}
        onStationFilterChange={(val) => {
          setStationFilter(val);
          setCurrentIntervalIndex(0);
        }}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStepForward={() =>
          setCurrentIntervalIndex((prev) => (prev + 1) % Math.max(1, totalIntervals))
        }
        onResetClock={() => {
          setIsPlaying(false);
          setCurrentIntervalIndex(0);
        }}
        simSpeed={simSpeed}
        onSimSpeedChange={setSimSpeed}
        currentIntervalClock={currentIntervalClock}
        currentIntervalIndex={currentIntervalIndex}
        totalIntervals={totalIntervals}
        isSyntheticDemo={dataset.isSyntheticDemo}
        onOpenDocs={() => setDocsOpen(true)}
      >
        {activePage === 'overview' && (
          <OverviewPage
            dataset={dataset}
            batteryModels={batteryModels}
            simulation={activeSimulation}
            currentIntervalIndex={currentIntervalIndex}
            stationFilter={stationFilter}
            algorithm={algorithm}
            config={config}
            onNavigate={setActivePage}
          />
        )}

        {activePage === 'control-room' && (
          <ControlRoomPage
            dataset={dataset}
            batteryModels={batteryModels}
            simulation={activeSimulation}
            currentIntervalIndex={currentIntervalIndex}
            stationFilter={stationFilter}
            algorithm={algorithm}
            config={config}
          />
        )}

        {activePage === 'batteries' && (
          <BatteriesPage
            batteryModels={batteryModels}
            simulation={activeSimulation}
            currentIntervalIndex={currentIntervalIndex}
            stationFilter={stationFilter}
          />
        )}

        {activePage === 'scheduler' && (
          <SchedulerPage
            dataset={dataset}
            algorithm={algorithm}
            onAlgorithmChange={setAlgorithm}
            simulation={activeSimulation}
            currentIntervalIndex={currentIntervalIndex}
            onSelectInterval={setCurrentIntervalIndex}
            config={config}
            onConfigChange={setConfig}
            onResetDefaults={handleResetSchedulerDefaults}
            stationFilter={stationFilter}
          />
        )}

        {activePage === 'comparison' && (
          <ComparisonPage
            benchmarks={benchmarks}
            selectedAlgorithm={algorithm}
            onSelectAlgorithm={setAlgorithm}
          />
        )}

        {activePage === 'analytics' && (
          <AnalyticsPage
            dataset={dataset}
            batteryModels={batteryModels}
            simulation={activeSimulation}
            stationFilter={stationFilter}
          />
        )}

        {activePage === 'stations' && (
          <StationsPage
            dataset={dataset}
            batteryModels={batteryModels}
            simulation={activeSimulation}
            currentIntervalIndex={currentIntervalIndex}
            config={config}
            onConfigChange={setConfig}
          />
        )}

        {activePage === 'data-explorer' && (
          <DataExplorerPage
            dataset={dataset}
            onImportZip={handleImportZip}
            onImportCsv={handleImportCsv}
            onResetToDemo={handleResetToDemo}
          />
        )}
      </LayoutShell>

      <DocsModal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        solverMode={benchmarks.MILP.metrics.solverMode}
      />
    </>
  );
}

export default App;
