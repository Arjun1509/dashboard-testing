import React from 'react';
import { X, BookOpen, AlertTriangle, Database, Cpu } from 'lucide-react';

interface DocsModalProps {
  open: boolean;
  onClose: () => void;
  solverMode: string;
}

export const DocsModal: React.FC<DocsModalProps> = ({ open, onClose, solverMode }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="docs-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto bg-[#F4F2EC] border border-[#141513] hard-shadow-md">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#141513] text-[#F4F2EC] border-b border-[#141513]">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-[#B8FF2E]" />
            <h2 id="docs-modal-title" className="font-display text-lg font-semibold">
              SwapSched Engineering Specification &amp; Methodology
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-[#2A2C27] text-[#F4F2EC] hover:bg-[#B8FF2E] hover:text-[#141513] transition-colors"
            aria-label="Close methodology dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-[#141513] leading-relaxed">
          <section className="p-4 bg-[#FFEDD5] border border-[#141513]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#9A3412] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-semibold text-base text-[#141513]">
                  Synthetic Demonstration Data &amp; Specification Disclosure
                </h3>
                <p className="mt-1 text-[#4A4B45]">
                  All preloaded records follow the 7-table OptiSwap schema for Dwarka Sector 12 and
                  Janakpuri District Centre (Delhi) and are synthetic demonstration records—not live
                  OEM telemetry or certified charger limits. Future vehicle departure deadlines are
                  simulated readiness assumptions configurable by the operator.
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#141513] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#5340C4]" />
              <h3 className="font-display text-base font-semibold">
                1. AUPA — Adaptive Urgency &amp; Predictive Allocation
              </h3>
            </div>
            <div className="p-3 bg-[#EBE8DF] border border-[#141513] font-mono-tech text-xs overflow-x-auto">
              Priority(i) = w_U·U(i) + w_D·D(i) + w_T·T(i) + w_H·H(i) + W(i)
              <br />
              Default Weights: w_U = 0.30 · w_D = 0.25 · w_T = 0.35 · w_H = 0.10
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#4A4B45]">
              <li className="p-3 bg-[#F4F2EC] border border-[#141513]">
                <strong className="text-[#141513] font-mono-tech">U(i) Energy Urgency:</strong>{' '}
                Normalized ratio of remaining energy deficit to required trip + reserve energy.
              </li>
              <li className="p-3 bg-[#F4F2EC] border border-[#141513]">
                <strong className="text-[#141513] font-mono-tech">D(i) Predicted Demand:</strong>{' '}
                Normalized next-trip kWh demand derived from joined vehicle trip history.
              </li>
              <li className="p-3 bg-[#F4F2EC] border border-[#141513]">
                <strong className="text-[#141513] font-mono-tech">T(i) Deadline Urgency:</strong>{' '}
                Proximity to the configurable simulated readiness target within the horizon.
              </li>
              <li className="p-3 bg-[#F4F2EC] border border-[#141513]">
                <strong className="text-[#141513] font-mono-tech">H(i) + W(i) Wear &amp; Anti-Starvation:</strong>{' '}
                Normalized cycle-life utilization plus additive waiting-time boost per deferred slot.
              </li>
            </ul>
          </section>

          <section className="bg-white border border-[#141513] p-5 space-y-3">
            <h3 className="font-display text-base font-semibold">
              2. Energy Prediction &amp; Physical Constraints
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono-tech text-xs">
              <div className="p-3 bg-[#F4F2EC] border border-[#141513]">
                Effective Capacity = Nominal Capacity × (SoH / 100)
              </div>
              <div className="p-3 bg-[#F4F2EC] border border-[#141513]">
                Required Energy = Predicted Trip Energy + Reserve Energy
              </div>
              <div className="p-3 bg-[#F4F2EC] border border-[#141513]">
                Energy Deficit = max(0, Required Energy − Stored Energy)
              </div>
              <div className="p-3 bg-[#F4F2EC] border border-[#141513]">
                Charge Time = Deficit / (Charging Power × Efficiency)
              </div>
            </div>
            <p className="text-xs text-[#4A4B45]">
              Hard constraints enforced identically across all 5 algorithms: station kW power cap,
              charging port count, per-pack maximum charge rate, compatibility check, remaining
              deficit ceiling, and automatic quarantine of any pack with BMS fault codes or cell
              temperature &ge; threshold.
            </p>
          </section>

          <section className="bg-white border border-[#141513] p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#5340C4]" />
              <h3 className="font-display text-base font-semibold">
                3. Benchmark Solvers &amp; MILP Transparency
              </h3>
            </div>
            <p className="text-xs text-[#4A4B45]">
              All 5 strategies (AUPA, FCFS, SJF, EDF, MILP) run over the exact same multi-interval
              discrete simulator. For MILP, SwapSched executes an in-browser{' '}
              <strong className="text-[#141513]">Exact Branch-and-Bound Integer Optimizer</strong>{' '}
              for stations with &le; 14 active packs and automatically discloses if larger custom
              uploads trigger the LP-Relaxation Greedy Heuristic Fallback. Active solver state:{' '}
              <span className="font-mono-tech text-[#141513]">{solverMode}</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
