import React, { useEffect, useState } from 'react';

const API = '';

export default function Dashboard({ refreshKey, onSelectCustomer }) {
  const [decisions, setDecisions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        fetch(`${API}/api/retry/decisions`).then(r => r.json()),
        fetch(`${API}/api/metrics`).then(r => r.json()),
      ]);
      setDecisions(dRes.decisions || []);
      setMetrics(mRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [refreshKey]);
  useEffect(() => { const id = setInterval(fetchAll, 5000); return () => clearInterval(id); }, []);

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  const batch = metrics?.latest_batch;

  return (
    <div className="space-y-4">
      {/* Aggregate metrics */}
      {batch && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold text-slate-800 mb-3">Naive vs Smart — Measured Money Recovered (Spec 6.2)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-slate-50 rounded p-3">
              <div className="text-2xl font-bold text-emerald-600">{batch.recovered_count}</div>
              <div className="text-xs text-slate-500">Smart recovered (count)</div>
              <div className="text-xs font-mono">₹{batch.recovered_amount_total?.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded p-3">
              <div className="text-2xl font-bold text-slate-700">{batch.baseline_fixed_schedule_recovered_count}</div>
              <div className="text-xs text-slate-500">Baseline fixed +3d</div>
              <div className="text-xs font-mono">₹{batch.baseline_fixed_schedule_recovered_amount?.toLocaleString()}</div>
            </div>
            <div className="bg-emerald-50 rounded p-3 border border-emerald-200">
              <div className="text-2xl font-bold text-emerald-700">+{batch.improvement_pct}%</div>
              <div className="text-xs text-slate-500">Improvement</div>
            </div>
            <div className="bg-amber-50 rounded p-3">
              <div className="text-2xl font-bold text-amber-700">{batch.cold_start_fallback_count}</div>
              <div className="text-xs text-slate-500">Cold-start fallbacks</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Batch {batch.batch_id} • {batch.total_failed_payments} failed payments • This comparison on the SAME synthetic batch is your demo artifact.</p>
        </div>
      )}

      {/* Metrics overview */}
      {metrics && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white border rounded p-3">
            <div className="text-lg font-bold">{metrics.total_customers}</div>
            <div className="text-xs text-slate-500">Customers</div>
          </div>
          <div className="bg-white border rounded p-3">
            <div className="text-lg font-bold">{metrics.total_decisions}</div>
            <div className="text-xs text-slate-500">Decisions logged</div>
          </div>
          <div className="bg-white border rounded p-3">
            <div className="text-lg font-bold">{metrics.avg_confidence}</div>
            <div className="text-xs text-slate-500">Avg confidence</div>
          </div>
        </div>
      )}

      {/* Audit trail */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b flex justify-between items-center">
          <h3 className="font-semibold">Retry Decisions — Audit Trail (Spec 6.1)</h3>
          <span className="text-xs text-slate-500">{decisions.length} decisions • logged BEFORE execution</span>
        </div>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-slate-600">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Retry At (IST)</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Basis</th>
                <th className="px-3 py-2">Fallback</th>
                <th className="px-3 py-2">LLM</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {decisions.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">No decisions yet — generate synthetic data and inject a failure above.</td></tr>
              ) : decisions.map(d => {
                const ist = d.recommended_retry_at ? new Date(d.recommended_retry_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
                const confColor = d.confidence > 0.7 ? 'text-emerald-600' : d.confidence > 0.4 ? 'text-amber-600' : 'text-red-600';
                return (
                  <tr key={d.decision_id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => onSelectCustomer(d.customer_id)}>
                    <td className="px-3 py-2 text-xs text-slate-500">{d.created_at ? new Date(d.created_at).toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.customer_id?.slice(0, 14)}</td>
                    <td className="px-3 py-2 text-xs">{ist}</td>
                    <td className={`px-3 py-2 font-bold ${confColor}`}>{d.confidence}</td>
                    <td className="px-3 py-2 text-xs">{d.model_basis || d.basis}</td>
                    <td className="px-3 py-2 text-xs">{d.fallback_used ? '⚠️ yes' : '—'}</td>
                    <td className="px-3 py-2 text-xs" title={d.llm_explanation}>{d.llm_call_succeeded ? '✅' : '📝 template'} </td>
                    <td className="px-3 py-2"><span className={`text-xs px-2 py-1 rounded-full ${d.actual_retry_outcome==='success'?'bg-emerald-100 text-emerald-700': d.actual_retry_outcome==='failed'?'bg-red-100 text-red-700':'bg-slate-100 text-slate-600'}`}>{d.actual_retry_outcome}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {decisions.length > 0 && decisions[0].llm_explanation && (
          <div className="px-4 py-3 bg-amber-50 border-t text-sm">
            <span className="font-semibold">Latest LLM explanation:</span> {decisions[0].llm_explanation}
          </div>
        )}
      </div>
    </div>
  );
}
