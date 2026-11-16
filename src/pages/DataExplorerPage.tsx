import React, { useMemo, useState } from 'react';
import {
  Search,
  Upload,
  RotateCcw,
  Download,
  AlertTriangle,
  ArrowUpDown,
  GitBranch,
} from 'lucide-react';
import type { CsvTableName, DatasetBundle } from '../types/swapsched';

interface DataExplorerPageProps {
  dataset: DatasetBundle;
  onImportZip: (file: File) => Promise<void>;
  onImportCsv: (table: CsvTableName, file: File) => Promise<void>;
  onResetToDemo: () => void;
}

const TABLE_LIST: Array<{ id: CsvTableName; filename: string; desc: string }> = [
  { id: 'vehicle_profiles', filename: 'vehicle_profiles.csv', desc: 'Fleet EV specs & home hub' },
  { id: 'trip_history', filename: 'trip_history.csv', desc: 'Observed distance & kWh logs' },
  { id: 'battery_catalog', filename: 'battery_catalog.csv', desc: 'Chemistry & charge limits' },
  { id: 'battery_registry', filename: 'battery_registry.csv', desc: 'Physical pack inventory' },
  { id: 'battery_telemetry', filename: 'battery_telemetry.csv', desc: 'Timestamped BMS packets' },
  { id: 'swap_events', filename: 'swap_events.csv', desc: 'Station swap transactions' },
  { id: 'station_data', filename: 'station_data.csv', desc: 'Delhi hub capacities & tariffs' },
];

export const DataExplorerPage: React.FC<DataExplorerPageProps> = ({
  dataset,
  onImportZip,
  onImportCsv,
  onResetToDemo,
}) => {
  const [activeTable, setActiveTable] = useState<CsvTableName>('battery_telemetry');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const tableRows = useMemo(() => {
    return dataset[activeTable] as unknown as Array<Record<string, unknown>>;
  }, [dataset, activeTable]);

  const columns = useMemo(() => {
    if (tableRows.length === 0) return [];
    return Object.keys(tableRows[0]);
  }, [tableRows]);

  const filteredAndSortedRows = useMemo(() => {
    let rows = [...tableRows];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      rows.sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortDir === 'asc' ? va - vb : vb - va;
        }
        return sortDir === 'asc'
          ? String(va ?? '').localeCompare(String(vb ?? ''))
          : String(vb ?? '').localeCompare(String(va ?? ''));
      });
    }
    return rows;
  }, [tableRows, search, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await onImportZip(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse ZIP archive.');
    }
    e.target.value = '';
  };

  const handleSingleCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await onImportCsv(activeTable, file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse CSV file.');
    }
    e.target.value = '';
  };

  const handleDownloadCsv = () => {
    const raw = dataset.rawCsvs[activeTable];
    const blob = new Blob([raw], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTable}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#141513] pb-4">
        <div>
          <div className="font-mono-tech text-xs text-[#5340C4] font-semibold">
            08 · 7-Table OptiSwap Schema, Quality Diagnostics &amp; Import
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1">Data Explorer</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#B8FF2E] border border-[#141513] text-xs font-mono-tech font-semibold cursor-pointer hover:bg-[#A6EE1C]">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload OptiSwap ZIP</span>
            <input type="file" accept=".zip" onChange={handleZipChange} className="hidden" />
          </label>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#141513] text-xs font-mono-tech font-medium cursor-pointer hover:bg-[#EBE8DF]">
            <Upload className="w-3.5 h-3.5" />
            <span>Replace {activeTable}.csv</span>
            <input type="file" accept=".csv" onChange={handleSingleCsvChange} className="hidden" />
          </label>

          {!dataset.isSyntheticDemo && (
            <button
              type="button"
              onClick={onResetToDemo}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#141513] text-[#F4F2EC] text-xs font-mono-tech cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Demo Data</span>
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="p-3 bg-[#FEE2E2] border border-[#991B1B] text-xs text-[#991B1B] font-mono-tech">
          Import Error: {uploadError}
        </div>
      )}

      {/* Source Label & Relational Joins Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white border border-[#141513] p-4 space-y-2">
          <div className="font-mono-tech text-xs text-[#4A4B45]">Active Dataset Provenance</div>
          <div className="font-display font-bold text-base">{dataset.sourceLabel}</div>
          <p className="text-xs text-[#4A4B45]">
            {dataset.isSyntheticDemo
              ? 'Synthetic demonstration dataset (all records are illustrative). Upload your OptiSwap ZIP or individual CSV files above to inspect and simulate real schemas.'
              : 'Custom user-imported dataset active across all prediction and scheduling engines.'}
          </p>
        </div>

        <div className="lg:col-span-7 bg-[#EBE8DF] border border-[#141513] p-4 space-y-2">
          <div className="flex items-center gap-2 font-display font-bold text-sm">
            <GitBranch className="w-4 h-4 text-[#5340C4]" />
            <span>Active Relational Joins (6 Foreign-Key Paths)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono-tech text-[11px] text-[#141513]">
            <div>• vehicle_profiles.vehicle_id = trip_history.vehicle_id</div>
            <div>• vehicle_profiles.vehicle_id = swap_events.vehicle_id</div>
            <div>• battery_registry.battery_type = battery_catalog.battery_type</div>
            <div>• battery_registry.battery_id = battery_telemetry.battery_id</div>
            <div>• battery_registry.battery_id = swap_events.returned_battery_id</div>
            <div>• swap_events.station_id = station_data.station_id</div>
          </div>
        </div>
      </div>

      {/* 7 CSV Table Switcher */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 border-t border-l border-[#141513]">
        {TABLE_LIST.map((t) => {
          const count = (dataset[t.id] as unknown[]).length;
          const active = activeTable === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTable(t.id);
                setSortCol(null);
              }}
              className={`p-3 text-left border-r border-b border-[#141513] cursor-pointer transition-colors ${
                active ? 'bg-[#141513] text-[#B8FF2E]' : 'bg-white hover:bg-[#EBE8DF]'
              }`}
            >
              <div className="font-mono-tech text-[11px] font-bold truncate">{t.filename}</div>
              <div
                className={`mt-1 font-mono-tech text-xs ${
                  active ? 'text-[#F4F2EC]' : 'text-[#4A4B45]'
                }`}
              >
                {count} rows
              </div>
            </button>
          );
        })}
      </div>

      {/* Data Quality Warnings Panel */}
      <section className="bg-white border border-[#141513] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-[#9A3412]" />
            <span>Schema &amp; Data-Quality Warnings ({dataset.warnings.length})</span>
          </div>
          <span className="font-mono-tech text-xs text-[#6C6D65]">
            Missing fields are flagged transparently, never silently invented
          </span>
        </div>
        {dataset.warnings.length === 0 ? (
          <div className="text-xs text-[#166534] font-mono-tech">
            All 7 CSV schemas validated cleanly with zero missing fields or fault alerts.
          </div>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {dataset.warnings.map((w) => (
              <div
                key={w.id}
                className={`px-3 py-1.5 text-xs font-mono-tech border ${
                  w.severity === 'error'
                    ? 'bg-[#FEE2E2] border-[#991B1B] text-[#991B1B]'
                    : w.severity === 'warning'
                    ? 'bg-[#FFEDD5] border-[#9A3412] text-[#9A3412]'
                    : 'bg-[#F4F2EC] border-[#DCDAD0] text-[#4A4B45]'
                }`}
              >
                <strong>[{w.table}.csv · {w.rowIdentifier}]</strong> {w.message}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Table Search + Export Bar */}
      <div className="bg-white border border-[#141513]">
        <div className="p-4 border-b border-[#141513] flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6C6D65]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search rows in ${activeTable}.csv...`}
              className="w-full pl-9 pr-3 py-2 bg-[#F4F2EC] border border-[#141513] text-xs font-mono-tech"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono-tech text-xs text-[#4A4B45]">
              Showing {filteredAndSortedRows.length} of {tableRows.length} rows
            </span>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#EBE8DF] border border-[#141513] text-xs font-mono-tech font-medium hover:bg-[#B8FF2E] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-xs font-mono-tech border-collapse">
            <thead className="sticky top-0 bg-[#EBE8DF] border-b border-[#141513]">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="p-2.5 text-left whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#5340C4] cursor-pointer"
                    >
                      <span>{col}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedRows.map((row, idx) => (
                <tr key={idx} className="border-b border-[#DCDAD0] hover:bg-[#F4F2EC]">
                  {columns.map((col) => {
                    const val = row[col];
                    return (
                      <td key={col} className="p-2.5 whitespace-nowrap">
                        {val === null || val === undefined || val === '' ? (
                          <span className="text-[#B91C1C] font-semibold">NULL</span>
                        ) : typeof val === 'boolean' ? (
                          val ? 'true' : 'false'
                        ) : (
                          String(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
