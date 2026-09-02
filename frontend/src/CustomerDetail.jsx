import React, { useEffect, useState } from 'react';

function HeatBarChart({ data, title, xLabels, marker }) {
  const entries = Object.entries(data).sort((a,b)=>Number(a[0])-Number(b[0]));
  const max = Math.max(...Object.values(data), 1);
  const getHeat = (v) => {
    const r = v/max;
    if (r > 0.7) return 'var(--heat-1)';
    if (r > 0.45) return 'var(--heat-2)';
    if (r > 0.2) return 'var(--heat-3)';
    return 'var(--heat-4)';
  };
  return (
    <div>
      <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>{title}</div>
      <div className="mt-3 flex items-end gap-[2px] h-[72px] relative" style={{borderLeft:'1px solid var(--line)', borderBottom:'1px solid var(--line)', paddingLeft:'4px'}}>
        {entries.length===0 ? <div className="text-[11px]" style={{color:'var(--text-dim)'}}>no data</div> :
          entries.map(([k,v])=>{
            const isMarker = marker!==undefined && String(marker)===String(k);
            return (
              <div key={k} className="flex-1 flex flex-col items-center">
                <div className="w-full relative" style={{height:`${Math.max(4,(v/max)*68)}px`, background:getHeat(v), opacity: isMarker?1:0.95, boxShadow: isMarker?`0 0 0 1px ${getHeat(v)}, 0 0 10px ${getHeat(v)}`:'none'}} >
                  {isMarker && <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-[2px] h-[76px]" style={{background:'var(--text-primary)', opacity:0.9}} />}
                </div>
              </div>
            )
          })}
      </div>
      <div className="flex justify-between mt-1 text-[10px]" style={{color:'var(--text-dim)'}}>
        {(xLabels||entries.map(([k])=>k).slice(0,5)).map(v=> <span key={v}>{v}</span>)}
      </div>
    </div>
  );
}

export default function CustomerDetail({ customerId, onClose }) {
  const [data, setData] = useState(null);
  const [hist, setHist] = useState(null);
  const [decisions, setDecisions] = useState([]);

  useEffect(()=>{
    if(!customerId) return;
    fetch(`/api/customers/${customerId}`).then(r=>r.json()).then(d=>{ setData(d); setDecisions(d.decisions||[])}).catch(()=>{});
    fetch(`/api/customers/${customerId}/histogram`).then(r=>r.json()).then(setHist).catch(()=>{});
  }, [customerId]);

  if(!customerId) return null;
  if(!data) return <div className="panel p-6 text-xs" style={{color:'var(--text-dim)'}}>loading {customerId}…</div>;

  // find latest decision's basis to mark predicted window
  const latest = decisions[0];
  let marker = undefined;
  let markerLabel = '';
  if (latest){
    const b = latest.model_basis || latest.basis || '';
    if (b.includes('day_of_month')) markerLabel = 'dom';
    else if (b.includes('day_of_week')) markerLabel = 'dow';
    else if (b.includes('hour_of_day')) markerLabel = 'hod';
  }

  return (
    <div className="panel p-4">
      <div className="flex justify-between gap-4">
        <div>
          <div className="text-xs tracking-widest">CUSTOMER HISTOGRAM — EVIDENCE, NOT CLAIM</div>
          <div className="mt-1 text-xs"><span className="bracket">[ {customerId.slice(0,14)} ]</span> <span style={{color:'var(--text-dim)'}}>{data.success_count} successes · {data.events.length} events</span></div>
          {data.customer?.hidden_profile_tag && (
            <div className="mt-2 text-[11px]"><span className="bracket" style={{color:'var(--heat-2)', borderColor:'var(--heat-2)'}}>[ hidden: {data.customer.hidden_profile_tag} ]</span> <span style={{color:'var(--text-dim)'}}>synthetic only — proves detector finds it</span></div>
          )}
        </div>
        <button onClick={onClose} className="h-7 w-7 grid place-items-center" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>✕</button>
      </div>

      <div className="mt-4 panel p-3" style={{background:'rgba(255,255,255,0.015)'}}>
        <div className="text-[11px]" style={{color:'var(--text-dim)'}}>Why this time? — the histogram is the decision. The sentence beside it is <span className="bracket">[ generated ]</span>.</div>
      </div>

      {hist ? (
        <div className="mt-5 space-y-6">
          <HeatBarChart data={hist.dom_histogram||{}} title="DAY OF MONTH — 1..31" xLabels={['01','08','15','22','31']} marker={markerLabel==='dom' ? (latest ? new Date(latest.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit'}) : undefined) : undefined } />
          <HeatBarChart data={hist.dow_histogram||{}} title="DAY OF WEEK — 0=MON .. 6=SUN" xLabels={['0','1','2','3','4','5','6']} />
          <HeatBarChart data={hist.hod_histogram||{}} title="HOUR OF DAY — 0..23 IST" xLabels={['0','6','12','18','23']} />
          <div className="text-[11px]" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'8px'}}>
            Bars = success density, color = recency-weighted confidence (red high → yellow fallback). Vertical marker = predicted retry window.
          </div>
        </div>
      ) : <div className="text-xs mt-4" style={{color:'var(--text-dim)'}}>loading histogram…</div>}

      {decisions.length>0 && (
        <div className="mt-6" style={{borderTop:'1px solid var(--line)', paddingTop:'12px'}}>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>RECENT DECISIONS — HEAT IS CONFIDENCE</div>
          <div className="mt-3 space-y-2 max-h-[220px] overflow-auto">
            {decisions.slice(0,4).map(d=>{
              const conf = Math.round((d.confidence||0)*100);
              const c = conf>70?'var(--heat-1)':conf>45?'var(--heat-2)':conf>30?'var(--heat-3)':'var(--heat-4)';
              return (
                <div key={d.decision_id} className="p-2" style={{border:'1px solid var(--line)', background: d.fallback_used ? 'rgba(248,225,74,0.06)' : 'transparent'}}>
                  <div className="text-xs flex gap-2 items-center">
                    <span className="bracket" style={{color:c, borderColor:c}}>[ {conf}% ]</span>
                    <span>{new Date(d.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</span>
                    <span style={{color:'var(--text-dim)'}}>{d.model_basis}</span>
                    {d.fallback_used && <span className="bracket" style={{color:'var(--text-dim)'}}>[ fallback ]</span>}
                  </div>
                  <div className="text-[11px] mt-1" style={{color:'var(--text-dim)'}}>{d.llm_explanation?.slice(0,140)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );
}
