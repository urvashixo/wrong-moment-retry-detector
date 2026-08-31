import React, { useState } from 'react';
import Dashboard from './Dashboard.jsx';
import CustomerDetail from './CustomerDetail.jsx';
import SimulationControls from './SimulationControls.jsx';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const triggerRefresh = () => setRefreshKey(k => k + 1);

  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Wrong Moment Retry Detector</h1>
          <p className="text-slate-400 text-sm">AI Revenue Recovery — Track 03 • Retry at the right moment, not the fixed schedule</p>
        </div>
        <span className="text-xs bg-emerald-600 px-3 py-1 rounded-full">Deterministic model decides WHEN • LLM only explains</span>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <SimulationControls onUpdate={triggerRefresh} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Dashboard refreshKey={refreshKey} onSelectCustomer={setSelectedCustomer} />
          </div>
          <div>
            {selectedCustomer ? (
              <CustomerDetail customerId={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
            ) : (
              <div className="bg-white border rounded-lg p-6 text-center text-slate-500">
                Select a customer from the audit trail to see their histogram &amp; explainability.
                <p className="text-xs mt-2">Click any decision row → histogram visualization (Extra #4)</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-slate-400 py-6">
        Timestamps stored UTC, displayed IST • All decisions logged BEFORE execution (audit trail)
      </footer>
    </div>
  );
}
