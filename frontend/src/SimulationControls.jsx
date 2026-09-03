import React, { useEffect, useState } from 'react';

export default function SimulationControls({ onUpdate }) {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  const [groqFail, setGroqFail] = useState(false);
  const [batchSize, setBatchSize] = useState(50);

  const loadCustomers = () => {
    fetch('/api/customers').then(r=>r.json()).then(d=>{
      const list=d.customers||[];
      setCustomers(list);
      if(list.length && !selected) setSelected(list[0].customer_id);
    }).catch(()=>{});
  };
  useEffect(()=>{ loadCustomers(); }, []);
  // refresh customers when onUpdate tick?
  useEffect(()=>{ if(status) loadCustomers(); }, [status]);

  const post = async (url, body) => {
    setStatus('…');
    try {
      const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const j = await r.json();
      setStatus(JSON.stringify(j).slice(0, 220));
      onUpdate();
      loadCustomers();
      return j;
    } catch(e){ setStatus(e.message); }
  };

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs tracking-widest">CONTROLS — LIVE DEMO</div>
        <div className="text-[11px] hidden sm:block" style={{color:'var(--text-dim)'}}>inject → decide → log before execution → schedule</div>
      </div>

      <div className="mt-4 grid lg:grid-cols-4 gap-3">
        <button onClick={()=>post('/api/synthetic/generate', {n_customers:20, cold_start_ratio:0.25, seed:42})}
          className="text-left px-3 py-3 text-xs hover:opacity-90"
          style={{background:'var(--bg)', border:'1px solid var(--line)', color:'var(--text-primary)'}}>
          <div className="tracking-widest">01 generate</div>
          <div style={{color:'var(--text-dim)'}} className="mt-1">synthetic customers + history</div>
        </button>

        <div className="panel p-0 flex flex-col overflow-hidden min-w-0" style={{background:'var(--bg)'}}>
          <label className="text-[11px] tracking-widest px-3 pt-2 shrink-0" style={{color:'var(--text-dim)'}}>02 inject</label>
          <div className="flex gap-2 p-2 min-w-0">
            <select value={selected} onChange={e=>setSelected(e.target.value)}
              className="flex-1 min-w-0 w-full text-xs px-2 py-2 truncate"
              style={{background:'var(--panel)', border:'1px solid var(--line)', color:'var(--text-primary)'}}>
              {customers.map(c=> <option key={c.customer_id} value={c.customer_id}>{c.customer_id.slice(0,10)} · {(c.hidden_profile_tag||'').slice(0,12)}</option>)}
              {customers.length===0 && <option>no customers — generate first</option>}
            </select>
          </div>
          <div className="px-2 pb-2">
            <button onClick={()=>post('/api/retry/inject-failure', {customer_id:selected})}
              className="w-full text-xs py-2 truncate"
              style={{background:'var(--heat-1)', color:'white', border:'1px solid var(--heat-1)'}}>
              inject failure
            </button>
          </div>
        </div>

        <div className="panel p-3 flex flex-col justify-between" style={{background:'var(--bg)'}}>
          <div>
            <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>03 batch</div>
            <div className="mt-2 flex items-center gap-2">
              <input type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))}
                className="w-16 text-xs px-2 py-1 text-center"
                style={{background:'var(--panel)', border:'1px solid var(--line)', color:'var(--text-primary)'}} min={5} max={200}/>
              <span className="text-[11px]" style={{color:'var(--text-dim)'}}>failures</span>
            </div>
          </div>
          <button onClick={()=>post('/api/retry/simulate-batch', {n_sim: batchSize})}
            className="mt-3 text-xs py-2"
            style={{background:'var(--panel)', border:'1px solid var(--line)', color:'var(--text-primary)'}}>
            run naive vs smart
          </button>
        </div>

        <button onClick={async()=>{
            const nv=!groqFail; setGroqFail(nv);
            await post('/api/demo/fail-groq', {enable:nv});
          }}
          className="text-left px-3 py-3 text-xs"
          style={{background: groqFail ? 'var(--heat-4)' : 'var(--bg)', border:'1px solid var(--line)', color: groqFail ? '#0A0A0A' : 'var(--text-primary)'}}>
          <div className="tracking-widest">{groqFail ? '● GROQ FAIL ON' : '04 groq'}</div>
          <div className="mt-1" style={{color: groqFail ? '#0A0A0A' : 'var(--text-dim)'}}>{groqFail ? 'fallback template active' : 'inject groq failure → fallback'}</div>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <button onClick={()=>fetch('/webhooks/razorpay', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({event:'payment.failed', customer_id:selected, amount:999})}).then(r=>r.json()).then(j=>{ setStatus('webhook '+JSON.stringify(j).slice(0,200)); onUpdate(); loadCustomers(); })}
          className="px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>
          test razorpay webhook
        </button>
        <a href="/api/retry/decisions" target="_blank" rel="noreferrer" className="px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>raw decisions JSON</a>
        <a href="/api/webhook/logs" target="_blank" rel="noreferrer" className="px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>webhook logs</a>
      </div>

      {status && <div className="mt-3 text-[11px] font-mono p-2 overflow-auto max-h-[72px]" style={{background:'#0A0A0A', border:'1px solid var(--line)', color:'var(--success)'}}>{status}</div>}
    </div>
  );
}
