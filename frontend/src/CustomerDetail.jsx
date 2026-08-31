import React, { useEffect, useState } from 'react';

function BarChart({ data, title }) {
  const max = Math.max(...Object.values(data), 1);
  const entries = Object.entries(data).sort((a,b) => Number(a[0]) - Number(b[0]));
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-600 mb-2">{title}</h4>
      <div className="space-y-1">
        {entries.map(([k,v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-8 text-right font-mono">{k}</span>
            <div className="flex-1 bg-slate-100 rounded h-4 relative overflow-hidden">
              <div className="bg-indigo-500 h-4 rounded" style={{ width: `${(v/max)*100}%` }} />
            </div>
            <span className="w-6 text-slate-600">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerDetail({ customerId, onClose }) {
  const [data, setData] = useState(null);
  const [hist, setHist] = useState(null);

  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/customers/${customerId}`).then(r=>r.json()).then(setData).catch(console.error);
    fetch(`/api/customers/${customerId}/histogram`).then(r=>r.json()).then(setHist).catch(console.error);
  }, [customerId]);

  if (!customerId) return null;
  if (!data) return <div className="bg-white border rounded p-4">Loading {customerId}...</div>;

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-sm">Customer {customerId.slice(0,16)}</h3>
          <p className="text-xs text-slate-500">{data.success_count} successful payments • {data.events.length} total events</p>
          {data.customer?.hidden_profile_tag && (
            <p className="text-xs mt-1">Hidden profile (synthetic only): <span className="font-mono bg-yellow-100 px-1 rounded">{data.customer.hidden_profile_tag}</span></p>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
      </div>

      {/* Why this time? toggle */}
      <div className="bg-indigo-50 border border-indigo-200 rounded p-3">
        <p className="text-xs font-semibold text-indigo-800">Why this time? — Explainability</p>
        <p className="text-xs text-slate-600 mt-1">Histogram below proves the decision is not an LLM hallucination. LLM only explains the deterministic peak.</p>
      </div>

      {hist && (
        <div className="space-y-4">
          <BarChart data={hist.dom_histogram || {}} title="Day of Month (1-31) — IST" />
          <BarChart data={hist.dow_histogram || {}} title="Day of Week (0=Mon … 6=Sun)" />
          <BarChart data={hist.hod_histogram || {}} title="Hour of Day (0-23 IST)" />
          <p className="text-xs text-slate-400">{hist.explainer}</p>
        </div>
      )}

      {data.decisions?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-1">Recent decisions</h4>
          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
            {data.decisions.slice(0,5).map(d => (
              <li key={d.decision_id} className="border rounded px-2 py-1">
                <div>{new Date(d.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} • conf {d.confidence} • {d.model_basis} {d.fallback_used?'⚠️fallback':''}</div>
                <div className="text-slate-500">{d.llm_explanation?.slice(0,120)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
