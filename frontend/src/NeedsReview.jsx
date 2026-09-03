import React, { useEffect, useState } from 'react';

export default function NeedsReview({ refreshKey, onOpen }) {
  const [list,setList]=useState([]);
  const fetchList=()=>fetch('/api/decisions/needs-review').then(r=>r.json()).then(d=>setList(d.decisions||[])).catch(()=>{});
  useEffect(()=>fetchList(),[refreshKey]);
  useEffect(()=>{ const id=setInterval(fetchList,4000); return ()=>clearInterval(id); },[]);
  return (
    <div className="panel">
      <div className="px-4 py-3 flex items-center justify-between" style={{borderBottom:'1px solid var(--line)'}}>
        <h3 className="text-xs tracking-widest">NEEDS REVIEW — SYSTEM DECLINED (Feature 4)</h3>
        <span className="bracket heat-1">[ {list.length} ]</span>
      </div>
      <div className="px-4 py-2 text-[11px] leading-5" style={{color:'var(--text-dim)', borderBottom:'1px solid var(--line)'}}>
        Rule: last retry attempt + confidence &lt; 50% → do NOT auto-schedule. These are explicitly the cases the algorithm declined to resolve on its own — distinct from <span className="bracket heat-2">[ overridden ]</span> where a human overrode a willing decision.
      </div>
      <div className="max-h-[340px] overflow-auto">
        {list.length===0 ? <div className="p-6 text-xs" style={{color:'var(--text-dim)'}}>No escalations — system is confident on all pending last retries.</div> :
          list.map(d=>(
            <div key={d.decision_id} className="px-4 py-3 flex flex-wrap items-center gap-2 text-xs" style={{borderBottom:'1px solid var(--line)', background:'rgba(232,67,44,0.06)'}}>
              <span className="bracket">[ {String(d.customer_id).slice(0,12)} ]</span>
              <span>confidence <span className="bracket heat-4">[ {Math.round((d.confidence||0)*100)}% ]</span></span>
              <span style={{color:'var(--text-dim)'}}>{d.model_basis}</span>
              <span className="bracket heat-1">[ needs review ]</span>
              <span className="ml-auto text-[11px]" style={{color:'var(--text-dim)'}}>{new Date(d.created_at).toLocaleString('en-IN')}</span>
              <button onClick={()=>onOpen && onOpen(d.customer_id)} className="text-[11px] px-2 py-1" style={{border:'1px solid var(--line)', color:'var(--text-primary)'}}>open profile</button>
            </div>
          ))}
      </div>
    </div>
  );
}
