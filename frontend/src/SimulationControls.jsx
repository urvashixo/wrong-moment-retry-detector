import React, { useEffect, useState } from 'react';

export default function SimulationControls({ onUpdate }) {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  const [groqFail, setGroqFail] = useState(false);
  const [batchSize, setBatchSize] = useState(50);

  const loadCustomers = () => {
    fetch('/api/customers').then(r=>r.json()).then(d=> {
      setCustomers(d.customers||[]);
      if (d.customers?.length && !selected) setSelected(d.customers[0].customer_id);
    }).catch(()=>{});
  };
  useEffect(()=>{ loadCustomers(); }, []);

  const post = async (url, body) => {
    setStatus('...');
    try {
      const r = await fetch(url, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const j = await r.json();
      setStatus(JSON.stringify(j).slice(0, 200));
      onUpdate();
      loadCustomers();
      return j;
    } catch(e){ setStatus(e.message); }
  };

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-slate-800">Simulation Controls — Live Demo</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <button
          onClick={() => post('/api/synthetic/generate', { n_customers: 20, cold_start_ratio: 0.25, seed: 42 })}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 text-sm"
        >
          1. Generate Synthetic Data
        </button>

        <div className="flex gap-2">
          <select value={selected} onChange={e=>setSelected(e.target.value)} className="flex-1 border rounded px-2 py-2 text-sm">
            {customers.map(c=> <option key={c.customer_id} value={c.customer_id}>{c.customer_id.slice(0,16)} ({c.hidden_profile_tag})</option>)}
            {customers.length===0 && <option>No customers yet</option>}
          </select>
          <button
            onClick={() => post('/api/retry/inject-failure', { customer_id: selected })}
            className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 text-sm whitespace-nowrap"
          >
            2. Inject Failure
          </button>
        </div>

        <div className="flex gap-2">
          <input type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))} className="w-20 border rounded px-2 py-2 text-sm" min={5} max={200} />
          <button
            onClick={() => post('/api/retry/simulate-batch', { n_sim: batchSize })}
            className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 text-sm"
          >
            3. Run Naive vs Smart Batch
          </button>
        </div>

        <button
          onClick={async () => {
            const newVal = !groqFail;
            setGroqFail(newVal);
            await post('/api/demo/fail-groq', { enable: newVal });
          }}
          className={`px-4 py-2 rounded text-sm border ${groqFail ? 'bg-red-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
          title="Simulates Groq API timing out — shows fallback template kicking in live"
        >
          {groqFail ? '🔴 Groq FAIL ON (fallback active)' : 'Inject Groq Failure'}
        </button>
      </div>

      <div className="flex gap-2 text-xs">
        <button onClick={() => fetch('/webhooks/razorpay', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ event:'payment.failed', customer_id: selected, amount: 999, failure_reason:'insufficient_funds', retry_attempt_number:0, max_retries_allowed:4 })}).then(r=>r.json()).then(j=>{ setStatus('webhook: '+JSON.stringify(j).slice(0,180)); onUpdate(); })} className="border rounded px-3 py-1 hover:bg-slate-50">
          Test Razorpay Webhook
        </button>
        <a href="/api/retry/decisions" target="_blank" rel="noreferrer" className="border rounded px-3 py-1 hover:bg-slate-50">View raw decisions JSON</a>
        <a href="/api/webhook/logs" target="_blank" rel="noreferrer" className="border rounded px-3 py-1 hover:bg-slate-50">Webhook logs</a>
      </div>

      {status && <div className="text-xs font-mono bg-slate-900 text-green-300 rounded p-2 overflow-auto max-h-20">{status}</div>}
    </div>
  );
}
