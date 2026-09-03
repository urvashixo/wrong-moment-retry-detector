import React, { useEffect, useState } from 'react';

function HeatMini({ dom, dow, hod, basis }) {
  const renderBar = (data, label) => {
    const entries = Object.entries(data||{}).sort((a,b)=>Number(a[0])-Number(b[0]));
    const max = Math.max(...Object.values(data||{}),1);
    const heat = (v) => {
      const r=v/max;
      if(r>0.7) return 'var(--heat-1)';
      if(r>0.45) return 'var(--heat-2)';
      if(r>0.2) return 'var(--heat-3)';
      return 'var(--heat-4)';
    };
    const activeBasis = (label.includes('MONTH') && basis?.includes('day_of_month')) ||
                        (label.includes('WEEK') && basis?.includes('day_of_week')) ||
                        (label.includes('HOUR') && basis?.includes('hour_of_day'));
    return (
      <div>
        <div className="text-[11px] tracking-widest flex gap-2" style={{color: activeBasis?'var(--heat-1)':'var(--text-dim)'}}>
          {label} {activeBasis && <span className="bracket heat-1">[ used ]</span>}
        </div>
        <div className="mt-2 flex items-end gap-[2px] h-[56px]" style={{borderLeft:'1px solid var(--line)', borderBottom:'1px solid var(--line)', paddingLeft:'4px'}}>
          {entries.length ? entries.map(([k,v])=>(
            <div key={k} className="flex-1" style={{height:`${Math.max(4,(v/max)*52)}px`, background: heat(v)}} />
          )) : <span className="text-[11px]" style={{color:'var(--text-dim)'}}>no data</span>}
        </div>
      </div>
    );
  };
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {renderBar(dom, 'DAY OF MONTH — 1..31')}
      {renderBar(dow, 'DAY OF WEEK — 0 MON ..6')}
      {renderBar(hod, 'HOUR OF DAY — 0..23 IST')}
    </div>
  );
}

export default function ProfilePage({ customerId, onClose, onSelectDecision }) {
  const [data, setData] = useState(null);
  const [loading, setLoading]=useState(true);
  useEffect(()=>{
    if(!customerId) return;
    setLoading(true);
    fetch(`/api/customers/${customerId}/profile`).then(r=>r.json()).then(d=>{setData(d); setLoading(false)}).catch(()=>setLoading(false));
  }, [customerId]);

  if(!customerId) return null;
  if(loading) return <div className="panel p-6 text-xs" style={{color:'var(--text-dim)'}}>loading profile…</div>;
  if(!data) return <div className="panel p-6 text-xs" style={{color:'var(--text-dim)'}}>not found</div>;

  const latest = data.latest_decision;
  const timeline = data.timeline||[];

  return (
    <div className="panel p-5">
      <div className="flex justify-between gap-4">
        <div>
          <div className="text-xs tracking-widest">CUSTOMER PROFILE — WHY IT BELIEVES</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="bracket">[ {customerId.slice(0,14)} ]</span>
            <span style={{color:'var(--text-dim)'}}>mandate {data.mandate_id.slice(0,16)}</span>
            <span className="bracket" style={{color: data.status==='active'?'var(--success)': data.status==='cold-start'?'var(--heat-4)':'var(--heat-1)'}}>[ {data.status} ]</span>
            <span className="bracket" style={{color:'var(--text-dim)'}}>[ {data.success_count}/{data.total_history} success ]</span>
          </div>
        </div>
        <button onClick={onClose} className="h-7 w-7 grid place-items-center text-xs" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>✕</button>
      </div>

      {/* timeline */}
      <div className="mt-6">
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>TIMELINE — EVERY payment_events ROW (success dim, failed heat-1)</div>
        <div className="mt-3 relative" style={{borderLeft:'1px solid var(--line)', paddingLeft:'12px'}}>
          <div className="max-h-[180px] overflow-auto pr-2 space-y-1">
            {timeline.map(ev=>{
              const isFail = ev.status==='failed';
              const ts = ev.attempted_at ? new Date(ev.attempted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '-';
              return (
                <div key={ev.id} className="flex items-center gap-2 text-[11px]">
                  <span className="h-[6px] w-[6px] rounded-full" style={{background: isFail?'var(--heat-1)':'var(--line)'}}/>
                  <span style={{color: isFail?'var(--heat-1)':'var(--text-primary)'}}>{ev.status}</span>
                  <span style={{color:'var(--text-dim)'}}>{ts}</span>
                  <span className="bracket" style={{color:'var(--text-dim)'}}>[ {ev.payment_method} ]</span>
                  <span style={{color:'var(--text-dim)'}}>₹{ev.amount}</span>
                  {isFail && <span className="bracket heat-1">[ {ev.failure_reason} ]</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* histogram used */}
      <div className="mt-6 panel p-4" style={{background:'rgba(255,255,255,0.015)'}}>
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>HISTOGRAM ACTUALLY USED — model_basis <span style={{color:'var(--text-primary)'}}>{data.histogram_basis||'—'}</span></div>
        <div className="mt-4">
          <HeatMini dom={data.histogram.dom_histogram} dow={data.histogram.dow_histogram} hod={data.histogram.hod_histogram} basis={data.histogram_basis} />
        </div>
        <div className="mt-3 text-[11px]" style={{color:'var(--text-dim)'}}>Server-precomputed buckets, not recalculated in frontend — same chart as dashboard Screen 2.</div>
      </div>

      {/* current recommendation */}
      {latest && (
        <div className="mt-6 panel p-4">
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>CURRENT RECOMMENDATION — LIVE FROM retry_decisions</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>retry {new Date(latest.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</span>
            <span className="bracket" style={{color: latest.confidence>0.7?'var(--heat-1)': latest.confidence>0.4?'var(--heat-2)':'var(--heat-4)', borderColor: latest.confidence>0.7?'var(--heat-1)':''}}>[ {Math.round((latest.confidence||0)*100)}% ]</span>
            <span className="bracket">[ {latest.model_basis} ]</span>
            {latest.fallback_used && <span className="bracket" style={{color:'var(--text-dim)'}}>[ fallback ]</span>}
            {latest.status==='needs_human_review' && <span className="bracket heat-1">[ needs review ]</span>}
            {latest.status==='overridden' && <span className="bracket heat-2">[ overridden ]</span>}
            <span className="bracket" style={{color:'var(--text-dim)'}}>[ {latest.experiment_group||'B'} ]</span>
          </div>
          <div className="mt-2 text-xs p-2" style={{background:'var(--bg)', border:'1px solid var(--line)', color:'var(--text-dim)'}}>
            effective: {latest.effective_retry_at ? new Date(latest.effective_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : new Date(latest.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}
            {latest.status==='overridden' && ' — human override active'}
            {latest.status==='needs_human_review' && ' — system declined to auto-schedule'}
          </div>
          <div className="mt-2 text-xs" style={{color:'var(--text-primary)'}}>{latest.llm_explanation}</div>
        </div>
      )}

      {/* decision history */}
      <div className="mt-6">
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>DECISION HISTORY — confidence over time</div>
        <div className="mt-2 max-h-[160px] overflow-auto space-y-1">
          {(data.decision_history||[]).slice(0,8).map(d=>(
            <div key={d.decision_id} className="flex items-center gap-2 text-[11px] px-2 py-1 cursor-pointer hover:opacity-80" style={{border:'1px solid var(--line)'}} onClick={()=>onSelectDecision && onSelectDecision(d.decision_id)}>
              <span>{new Date(d.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short'})}</span>
              <span className="bracket" style={{color: d.confidence>0.7?'var(--heat-1)':'var(--heat-4)'}}>[ {Math.round((d.confidence||0)*100)}% ]</span>
              <span style={{color:'var(--text-dim)'}}>{d.model_basis}</span>
              <span className="ml-auto" style={{color: d.actual_retry_outcome==='success'?'var(--success)': d.actual_retry_outcome==='failed'?'var(--heat-1)':'var(--text-dim)'}}>{d.actual_retry_outcome}</span>
            </div>
          ))}
        </div>
      </div>

      {/* override history inline */}
      {data.override_history && data.override_history.length>0 && (
        <div className="mt-6">
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>OVERRIDE HISTORY — INLINE</div>
          <div className="mt-2 space-y-2">
            {data.override_history.map(o=>(
              <div key={o.override_id} className="p-2 text-xs" style={{border:'1px solid var(--heat-2)', background:'rgba(240,124,46,0.08)'}}>
                <div>overrode {new Date(o.original_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} → {new Date(o.overridden_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</div>
                <div className="mt-1" style={{color:'var(--text-dim)'}}>"{o.reason}" — {new Date(o.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
