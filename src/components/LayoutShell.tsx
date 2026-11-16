import React, { useState } from 'react';
import {
  LayoutDashboard,
  Radio,
  BatteryCharging,
  SlidersHorizontal,
  GitCompare,
  TrendingUp,
  MapPin,
  Database,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  BookOpen,
  Menu,
  X,
} from 'lucide-react';
import type { PageId, StationData, StationFilter } from '../types/swapsched';

interface LayoutShellProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  stations: StationData[];
  stationFilter: StationFilter;
  onStationFilterChange: (val: StationFilter) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onResetClock: () => void;
  simSpeed: 1 | 2 | 4;
  onSimSpeedChange: (spd: 1 | 2 | 4) => void;
  currentIntervalClock: string;
  currentIntervalIndex: number;
  totalIntervals: number;
  isSyntheticDemo: boolean;
  onOpenDocs: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: PageId; num: string; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'overview', num: '01', label: 'Network Overview', icon: LayoutDashboard },
  { id: 'control-room', num: '02', label: 'Control Room', icon: Radio },
  { id: 'batteries', num: '03', label: 'Battery Packs', icon: BatteryCharging },
  { id: 'scheduler', num: '04', label: 'Intelligent Scheduler', icon: SlidersHorizontal },
  { id: 'comparison', num: '05', label: 'Algorithm Benchmark', icon: GitCompare },
  { id: 'analytics', num: '06', label: 'Predictive Analytics', icon: TrendingUp },
  { id: 'stations', num: '07', label: 'Station Management', icon: MapPin },
  { id: 'data-explorer', num: '08', label: 'Data Explorer', icon: Database },
];

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activePage,
  onNavigate,
  stations,
  stationFilter,
  onStationFilterChange,
  isPlaying,
  onTogglePlay,
  onStepForward,
  onResetClock,
  simSpeed,
  onSimSpeedChange,
  currentIntervalClock,
  currentIntervalIndex,
  totalIntervals,
  isSyntheticDemo,
  onOpenDocs,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelectPage = (id: PageId) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F4F2EC] text-[#141513]">
      {/* Left Structural Navigation Rail (Desktop) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[#141513] text-[#F4F2EC] border-r border-[#141513] sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-[#2D2F2A] flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleSelectPage('overview')}
            className="text-left group focus-visible:outline-[#B8FF2E]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-grid grid-cols-2 gap-0.5 p-1 bg-[#B8FF2E]"
                aria-hidden="true"
              >
                <span className="w-1.5 h-1.5 bg-[#141513]" />
                <span className="w-1.5 h-1.5 bg-[#7B68EE]" />
                <span className="w-1.5 h-1.5 bg-[#141513]" />
                <span className="w-1.5 h-1.5 bg-[#141513]" />
              </span>
              <span className="font-display text-xl font-bold tracking-tight text-[#F4F2EC]">
                SwapSched
              </span>
            </div>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" aria-label="Primary pages">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#B8FF2E] text-[#141513] font-semibold'
                    : 'text-[#D6D4CC] hover:bg-[#232520] hover:text-white'
                }`}
              >
                <span
                  className={`font-mono-tech text-[11px] shrink-0 ${
                    active ? 'text-[#141513]' : 'text-[#8D8E85]'
                  }`}
                >
                  {item.num}
                </span>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#2D2F2A] space-y-3">
          <div className="p-3 bg-[#1E201C] border border-[#353730]">
            <div className="font-mono-tech text-[11px] text-[#B8FF2E] font-medium">
              {isSyntheticDemo ? 'Synthetic Demo Dataset' : 'Custom Uploaded CSV'}
            </div>
            <p className="mt-1 text-xs text-[#B5B4AC] leading-snug">
              OptiSwap 7-table schema · Dwarka Sec 12 &amp; Janakpuri DC, Delhi
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDocs}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono-tech bg-[#252722] text-[#F4F2EC] border border-[#3C3E37] hover:border-[#B8FF2E] hover:text-[#B8FF2E] transition-colors whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Methodology &amp; Formulas</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Operator Bar */}
        <header className="sticky top-0 z-30 bg-[#F4F2EC] border-b border-[#141513] px-4 lg:px-8 py-3">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 border border-[#141513] bg-white"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
              <div className="lg:hidden font-display font-bold text-lg whitespace-nowrap">
                SwapSched
              </div>

              {/* Station Selector */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="global-station-select"
                  className="hidden sm:inline font-mono-tech text-xs text-[#4A4B45] whitespace-nowrap"
                >
                  Hub Scope
                </label>
                <select
                  id="global-station-select"
                  value={stationFilter}
                  onChange={(e) => onStationFilterChange(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#141513] text-xs font-medium text-[#141513] cursor-pointer"
                >
                  <option value="ALL">Combined Network ({stations.length} Stations)</option>
                  {stations.map((s) => (
                    <option key={s.station_id} value={s.station_id}>
                      {s.station_name}, {s.city}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Simulation Playback Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1.5 bg-white border border-[#141513] font-mono-tech text-xs whitespace-nowrap">
                <span className="text-[#6C6D65]">Slot</span>{' '}
                <strong className="text-[#141513]">
                  {currentIntervalIndex + 1}/{totalIntervals}
                </strong>{' '}
                <span className="text-[#6C6D65]">·</span>{' '}
                <span className="text-[#5340C4] font-semibold">{currentIntervalClock}</span>
              </div>

              <button
                type="button"
                onClick={onTogglePlay}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#141513] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isPlaying
                    ? 'bg-[#7B68EE] text-white'
                    : 'bg-[#B8FF2E] text-[#141513] hover:bg-[#A6EE1C]'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Simulate'}</span>
              </button>

              <button
                type="button"
                onClick={onStepForward}
                title="Advance 1 interval"
                className="p-1.5 bg-white border border-[#141513] hover:bg-[#EBE8DF] transition-colors cursor-pointer"
                aria-label="Step forward one simulation interval"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onResetClock}
                title="Reset simulation clock"
                className="p-1.5 bg-white border border-[#141513] hover:bg-[#EBE8DF] transition-colors cursor-pointer"
                aria-label="Reset simulation clock"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <div className="hidden sm:flex items-center border border-[#141513] bg-white">
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onSimSpeedChange(spd)}
                    className={`px-2.5 py-1.5 font-mono-tech text-xs transition-colors cursor-pointer ${
                      simSpeed === spd
                        ? 'bg-[#141513] text-[#B8FF2E]'
                        : 'text-[#4A4B45] hover:bg-[#EBE8DF]'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <nav
              className="lg:hidden mt-3 pt-3 border-t border-[#141513] grid grid-cols-2 gap-1.5"
              aria-label="Mobile navigation"
            >
              {NAV_ITEMS.map((item) => {
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPage(item.id)}
                    className={`px-3 py-2 text-left text-xs border border-[#141513] whitespace-nowrap truncate ${
                      active
                        ? 'bg-[#B8FF2E] text-[#141513] font-semibold'
                        : 'bg-white text-[#141513]'
                    }`}
                  >
                    {item.num}. {item.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDocs();
                }}
                className="col-span-2 px-3 py-2 text-xs font-mono-tech bg-[#141513] text-[#F4F2EC] text-center"
              >
                Methodology &amp; Formulas
              </button>
            </nav>
          )}
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-8">
          <div className="max-w-[1440px] mx-auto">{children}</div>
        </main>

        {/* Quiet Editorial Footer */}
        <footer className="border-t border-[#141513] bg-[#EBE8DF] px-4 lg:px-8 py-4">
          <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[#4A4B45]">
            <div>
              SwapSched EV Charging &amp; Battery Swap Management ·{' '}
              <span className="font-mono-tech">
                {isSyntheticDemo
                  ? 'Synthetic Demonstration Data (OptiSwap Schema)'
                  : 'User-Uploaded CSV Dataset'}
              </span>
            </div>
            <div className="font-mono-tech">
              Battery specifications &amp; departure deadlines are illustrative simulation parameters.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
