import React, { useEffect, useState } from 'react';

export default function DiffView({ refreshKey }) {
  const [data,setData]=useState(null);
  useEffect(()=>{ fetch('/api/overrides/diff').then(r=>r.json()).then(setData).catch(()=>{}); }, [refreshKey]);
  useEffect(()=>{ const id=setInterval(()=>fetch('/api/overrides/diff').then(r=>r.json()).then(setData),5000); return ()=>clearInterval(id); },[]);
  if(!data) return <div className="panel p-6 text-xs" style={{color:'var(--text-dim)'}}>loading diff…</div>;
  const agg=data.aggregates||{};
  return (
    <div className="panel p-5">
      <h3 className="text-xs tracking-widest">DIFF VIEW — EVERY OVERRIDE SIDE BY SIDE (Feature 5)</h3>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <div className="display-num text-xl">{agg.total_overrides||0}</div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>OVERRIDES</div>
          <div className="text-[11px] mt-1" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'6px'}}>of {agg.total_decisions||0} decisions → {agg.override_rate_pct||0}% override rate</div>
        </div>
        <div>
          <div className="display-num text-xl">{agg.resolved_overrides||0}</div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>RESOLVED</div>
          <div className="text-[11px] mt-1" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'6px'}}>{agg.human_success||0} success at human-chosen time</div>
        </div>
        <div>
          <div className="display-num text-xl">{agg.human_success_rate_pct!=null?`${agg.human_success_rate_pct}%`:'—'}</div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>HUMAN SUCCESS RATE</div>
          <div className="text-[11px] mt-1" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'6px'}}>{agg.note?.slice(0,60)}</div>
        </div>
      </div>

      <div className="mt-6 overflow-auto max-h-[420px]">
        <div className="grid text-[11px] tracking-widest" style={{color:'var(--text-dim)', borderBottom:'1px solid var(--line)', paddingBottom:'8px', gridTemplateColumns:'120px 1.1fr 1.1fr 1fr 80px'}}>
          <span>customer</span><span>algorithm</span><span>human chose</span><span>reason</span><span>outcome</span>
        </div>
        {(data.rows||[]).length===0 ? <div className="py-8 text-xs text-center" style={{color:'var(--text-dim)'}}>No overrides yet — use Override on any pending decision.</div> :
          data.rows.map(r=>(
            <div key={r.decision_id} className="grid text-xs py-3 items-center gap-2" style={{gridTemplateColumns:'120px 1.1fr 1.1fr 1fr 80px', borderBottom:'1px solid var(--line)'}}>
              <span className="bracket">[ {String(r.customer_id).slice(0,10)} ]</span>
              <span><span style={{color:'var(--text-dim)'}}>{r.algorithm_basis}</span> {new Date(r.algorithm_recommended).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})} <span className="bracket" style={{color:'var(--heat-3)'}}>[ {Math.round((r.algorithm_confidence||0)*100)}% ]</span></span>
              <span style={{color:'var(--heat-2)'}}>{new Date(r.human_chose).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</span>
              <span style={{color:'var(--text-dim)'}}>"{r.reason.slice(0,40)}"</span>
              <span className="bracket" style={{color: r.outcome==='success'?'var(--success)': r.outcome==='failed'?'var(--heat-1)':'var(--text-dim)'}}>[ {r.outcome} ]</span>
            </div>
          ))}
      </div>
      <div className="mt-3 text-[11px]" style={{color:'var(--text-dim)'}}>Note: honesty about limitation — only actual outcome of human-chosen time is observable; algorithm counterfactual requires simulation and is not fudged.</div>
    </div>
  );
}
