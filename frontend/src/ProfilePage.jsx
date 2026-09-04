import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function heatForConfidence(c){
  if(c>=0.7) return 'var(--heat-1)';
  if(c>=0.5) return 'var(--heat-2)';
  if(c>=0.35) return 'var(--heat-3)';
  return 'var(--heat-4)';
}

function HistogramSingle({ histogram, basis, markerISO }){
  // spec: render whichever corresponds to basis, else show fallback message
  if(histogram.insufficient_data){
    return (
      <div className="panel p-6 text-center">
        <div className="text-xs" style={{color:'var(--heat-4)'}}>Not enough history to build a personal pattern ({histogram.buckets?.length? 'thin' : '0'} data points, minimum is 3).</div>
        <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>System fell back to safe default — sparseness itself is the point.</div>
      </div>
    );
  }
  const buckets = histogram.buckets || [];
  const max = Math.max(...buckets.map(b=>b.count), 1);
  // find marker bucket index
  let markerIdx = -1;
  if(markerISO && basis){
    const d = new Date(markerISO);
    const ist = new Date(d.toLocaleString('en-US', {timeZone:'Asia/Kolkata'}));
    // approximate: for dom, day; for dow, weekday; for hod, hour
    // Simpler: compute via IST date object
    const markerDate = new Date(new Date(markerISO).toLocaleString('en-US', {timeZone:'Asia/Kolkata'}));
    // alternative: just parse markerISO as UTC then convert manually via getUTC + IST offset 5:30
    // Instead, derive bucket value from markerISO by converting to IST bucket
    // For reliability, use the IST conversion via toLocale
    let val = null;
    try{
      const m = new Date(markerISO);
      const istStr = m.toLocaleString('en-US', {timeZone:'Asia/Kolkata', day:'2-digit', hour:'2-digit', weekday:'short'});
      // fallback: extract day/hour/weekday via Intl
      if(basis.includes('day_of_month')) val = parseInt(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata', day:'numeric'}).format(m),10);
      else if(basis.includes('day_of_week')) {
        const wd = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata', weekday:'short'}).format(m);
        const map={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6};
        val = map[wd] ?? new Date(markerISO).getDay();
        // Intl Mon is 0 in our bucket? spec 0=Mon
        if(val===0 && wd==='Sun') val=6; // adjust
      }
      else if(basis.includes('hour_of_day')) val = parseInt(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata', hour:'numeric', hour12:false}).format(m),10);
    }catch(e){ val=null; }
    if(val!==null){
      markerIdx = buckets.findIndex(b=>b.bucket===val);
    }
  }
  const heat = (v)=>{
    const r=v/max;
    if(r>0.7) return 'var(--heat-1)';
    if(r>0.45) return 'var(--heat-2)';
    if(r>0.2) return 'var(--heat-3)';
    return 'var(--heat-4)';
  };
  return (
    <div>
      <div className="flex items-end gap-[2px] h-[96px] relative" style={{borderLeft:'1px solid var(--line)', borderBottom:'1px solid var(--line)', paddingLeft:'4px'}}>
        {buckets.map((b,i)=>{
          const isMarker = i===markerIdx;
          return (
            <div key={b.bucket} className="flex-1 flex flex-col items-center relative">
              <div className="w-full" style={{height:`${Math.max(4,(b.count/max)*88)}px`, background: heat(b.count), opacity: isMarker?1:0.9, boxShadow: isMarker?`0 0 0 1px var(--text-primary), 0 0 10px ${heat(b.count)}`:''}}/>
              {isMarker && <div className="absolute bottom-0 w-[2px] h-[96px] pointer-events-none" style={{background:'var(--text-primary)', left:'50%', transform:'translateX(-50%)'}} />}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[10px]" style={{color:'var(--text-dim)'}}>
        <span>{buckets[0]?.bucket}</span>
        <span>{buckets[Math.floor(buckets.length/2)]?.bucket}</span>
        <span>{buckets[buckets.length-1]?.bucket}</span>
      </div>
    </div>
  );
}

export default function ProfilePage({ customerId, onClose }) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [explain,setExplain]=useState(null);
  const [showPrompt,setShowPrompt]=useState(false);
  const [overrideReason,setOverrideReason]=useState('');
  const [overrideAt,setOverrideAt]=useState('');
  const navigate = useNavigate();

  useEffect(()=>{
    if(!customerId) return;
    setLoading(true);
    fetch(`/api/customers/${customerId}/profile`).then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json()}).then(d=>{setData(d); setLoading(false)}).catch(()=>setLoading(false));
  }, [customerId]);

  const callExplain = async (did) => {
    const r=await fetch(`/api/decisions/${did}/explain`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
    const j=await r.json();
    setExplain(j);
  };

  if(!customerId) return null;
  if(loading) return <div className="panel p-6 text-xs" style={{color:'var(--text-dim)'}}>loading profile…</div>;
  if(!data) return <div className="panel p-6 text-xs" style={{color:'var(--text-dim)'}}>not found</div>;

  // derive status badge color
  const statusColor = {
    'active':'var(--success)',
    'cold_start':'var(--heat-4)',
    'cold-start':'var(--heat-4)',
    'low_confidence':'var(--heat-4)',
    'needs_review':'var(--heat-1)',
    'overridden':'var(--heat-2)',
  }[data.status] || 'var(--text-dim)';

  const stats = data.stats || {};
  const payment_history = data.payment_history || data.timeline || [];
  const histogram = data.histogram || {basis: data.histogram_basis, buckets: [], insufficient_data: true};
  const current = data.current_decision || data.latest_decision;
  const activeOverride = data.active_override || (data.override_history && data.override_history[0]) || null;
  const history = data.decision_history || [];
  const firstSeen = stats.first_seen ? new Date(stats.first_seen).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : '—';
  const lastSeen = stats.last_seen ? new Date(stats.last_seen).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : '—';

  return (
    <div className="max-w-[760px] mx-auto" style={{background:'var(--panel)', border:'1px solid var(--line)'}}>
      {/* A Header bar */}
      <div className="p-5" style={{borderBottom:'1px solid var(--line)'}}>
        <div className="flex justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bracket" style={{borderColor: statusColor, color: statusColor}}>[ {customerId} ]</span>
            <span className="text-xs" style={{color:'var(--text-dim)'}}>{data.mandate_id || `mandate_${customerId}`}</span>
            <span className="bracket" style={{color:statusColor, borderColor:statusColor}}>[ {data.status} ]</span>
          </div>
          {onClose && <button onClick={onClose} className="h-7 w-7 grid place-items-center text-xs shrink-0" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>✕</button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{color:'var(--text-dim)'}}>
          <span>{stats.total_events ?? data.total_history ?? 0} events</span>
          <span>· {stats.success_count ?? data.success_count ?? 0} success</span>
          <span>· {stats.failed_count ?? data.failed_count ?? 0} failed</span>
          <span>· first seen {firstSeen}</span>
          <span>· last seen {lastSeen}</span>
        </div>
      </div>

      {/* B Payment history timeline - horizontal */}
      <div className="p-5" style={{borderBottom:'1px solid var(--line)'}}>
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>PAYMENT HISTORY — {payment_history.length} ticks (success dim, failed heat-1 larger)</div>
        <div className="mt-4 overflow-x-auto">
          <div className="relative h-[44px] min-w-[520px]" style={{borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line)', background:'var(--bg)'}}>
            <div className="absolute inset-0 flex items-center px-2 gap-[2px]">
              {payment_history.map(ev=>{
                const isFail = ev.status==='failed';
                return (
                  <div key={ev.id} className="group relative flex-1 flex justify-center">
                    <div
                      title={`${ev.status} · ${ev.attempted_at ? new Date(ev.attempted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : ''} · ₹${ev.amount} · ${ev.payment_method}${isFail?` · ${ev.failure_reason}`:''}`}
                      className="cursor-pointer"
                      style={{
                        width: isFail ? '5px' : '3px',
                        height: isFail ? '18px' : '10px',
                        background: isFail ? 'var(--heat-1)' : 'var(--line)',
                        borderRadius: isFail ? '1px' : '0',
                      }}
                    />
                    {/* tooltip on hover - css only */}
                    <div className="hidden group-hover:block absolute bottom-[22px] left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap px-2 py-1 pointer-events-none z-10" style={{background:'var(--bg)', border:'1px solid var(--line)', color:'var(--text-primary)'}}>
                      {new Date(ev.attempted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} · ₹{ev.amount} · {ev.payment_method} {isFail && `· ${ev.failure_reason}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {data.status==='cold_start' || data.status==='cold-start' ? <div className="mt-2 text-[11px]" style={{color:'var(--heat-4)'}}>Sparse timeline is intentional — only {stats.success_count ?? 0} success, below minimum 3, so system fell back.</div> : null}
      </div>

      {/* C Histogram actually used */}
      <div className="p-5" style={{borderBottom:'1px solid var(--line)'}}>
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>
          PATTERN {current?.model_basis ? `(${current.model_basis})` : '(no decision yet)'} {current?.model_basis && <span className="bracket heat-1">[ used ]</span>}
        </div>
        <div className="mt-4">
          {(!current) ? (
            <div className="panel p-6 text-center text-xs" style={{color:'var(--text-dim)'}}>No failed payments recorded for this customer yet — no histogram needed.</div>
          ) : (
            <HistogramSingle histogram={histogram} basis={current.model_basis} markerISO={current.recommended_retry_at || current.effective_retry_at} />
          )}
        </div>
        <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>Same chart component as dashboard Screen 2 — server-computed buckets, marker at recommended retry.</div>
      </div>

      {/* D Current / most recent decision */}
      <div className="p-5" style={{borderBottom:'1px solid var(--line)'}}>
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>CURRENT DECISION</div>
        {!current ? (
          <div className="mt-3 panel p-4 text-xs" style={{color:'var(--text-dim)'}}>No failed payments recorded for this customer.</div>
        ) : current.decision_status==='needs_human_review' || current.decision_status==='needs_human_review' ? (
          <div className="mt-3 panel p-4" style={{background:'rgba(232,67,44,0.08)', border:'1px solid var(--heat-1)'}}>
            <div className="text-xs" style={{color:'var(--heat-1)'}}>Last allowed retry attempt, confidence only {Math.round((current.confidence||0)*100)}% — flagged for human review instead of auto-scheduling.</div>
            <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>System declined to act — choose override or handle manually.</div>
          </div>
        ) : (
          <div className="mt-3 panel p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>retry {current.recommended_retry_at ? new Date(current.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '—'}</span>
              <span className="bracket" style={{color: heatForConfidence(current.confidence), borderColor: heatForConfidence(current.confidence)}}>[ {Math.round((current.confidence||0)*100)}% ]</span>
              <span className="bracket">[ {current.model_basis} ]</span>
              <span style={{color:'var(--text-dim)'}}>{current.data_points_used} pts</span>
              {current.fallback_used && <span className="bracket" style={{color:'var(--text-dim)'}}>[ fallback ]</span>}
              <span className="bracket" style={{color:'var(--text-dim)'}}>[ {current.experiment_group || '—'} ]</span>
            </div>
            <div className="mt-3 text-xs leading-5" style={{color:'var(--text-primary)'}}>{current.llm_explanation || '—'}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={()=>callExplain(current.decision_id)} className="text-[11px] px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-primary)'}}>▸ explain this</button>
              {explain && <button onClick={()=>callExplain(current.decision_id)} className="text-[11px] px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>↻ regenerate</button>}
              <button onClick={()=>setShowPrompt(s=>!s)} className="text-[11px] px-3 py-1" style={{border:'1px solid var(--line)', color: showPrompt?'var(--text-primary)':'var(--text-dim)'}}>{showPrompt?'hide':'▸ show'} prompt sent</button>
            </div>
            {showPrompt && explain?.prompt_payload_shown && (
              <div className="mt-3 p-2 text-[11px] font-mono whitespace-pre-wrap" style={{background:'var(--bg)', border:'1px solid var(--line)', color:'var(--text-dim)'}}>
                {JSON.stringify(explain.prompt_payload_shown, null, 2)}
                <div className="mt-2" style={{color:'var(--success)'}}>Note: only structured decision sent, never raw history or amounts.</div>
              </div>
            )}
            {explain && (
              <div className="mt-2 text-xs" style={{color:'var(--text-primary)'}}>{explain.explanation}</div>
            )}
          </div>
        )}
      </div>

      {/* E Override if exists */}
      {activeOverride && (
        <div className="p-5" style={{borderBottom:'1px solid var(--line)', background:'rgba(240,124,46,0.06)'}}>
          <div className="text-[11px] tracking-widest" style={{color:'var(--heat-2)'}}>OVERRIDE — HUMAN STEPPED IN</div>
          <div className="mt-3 text-xs leading-5 grid gap-1">
            <div><span style={{color:'var(--text-dim)'}}>Algorithm recommended:</span> {new Date(activeOverride.algorithm_recommended_at || activeOverride.original_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} <span className="bracket">[ {current ? Math.round((current.confidence||0)*100)+'%' : ''} ]</span></div>
            <div><span style={{color:'var(--text-dim)'}}>Human chose instead:</span> <span style={{color:'var(--heat-2)'}}>{new Date(activeOverride.overridden_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</span></div>
            <div><span style={{color:'var(--text-dim)'}}>Reason:</span> "{activeOverride.override_reason || activeOverride.reason}"</div>
            <div><span style={{color:'var(--text-dim)'}}>Overridden by:</span> {activeOverride.overridden_by || activeOverride.created_by || 'merchant_ops'}</div>
          </div>
          <button onClick={()=> window.location.href='/diff?customer=' + customerId} className="mt-3 text-[11px] underline" style={{color:'var(--text-dim)'}}>see all overrides for this customer → filters diff view</button>
        </div>
      )}

      {/* F Decision history */}
      <div className="p-5" style={{borderBottom:'1px solid var(--line)'}}>
        <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>DECISION HISTORY — confidence trending</div>
        {(history||[]).length===0 ? <div className="mt-3 text-xs" style={{color:'var(--text-dim)'}}>No decisions yet.</div> :
          <div className="mt-3 space-y-1">
            {history.slice(0,12).map(d=>(
              <div key={d.decision_id} className="flex flex-wrap items-center gap-2 text-[11px] px-2 py-1.5" style={{border:'1px solid var(--line)'}}>
                <span className="bracket" style={{color:'var(--text-dim)'}}>[ {new Date(d.created_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata', month:'short', day:'2-digit'})} ]</span>
                <span>{d.recommended_retry_at ? new Date(d.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '—'}</span>
                <span className="bracket" style={{color: heatForConfidence(d.confidence), borderColor: heatForConfidence(d.confidence)}}>[ {Math.round((d.confidence||0)*100)}% ]</span>
                <span style={{color:'var(--text-dim)'}}>{d.model_basis}</span>
                {d.experiment_group && <span className="bracket" style={{color: d.experiment_group.includes('A')?'var(--text-dim)':'var(--heat-1)'}}>[ {d.experiment_group} ]</span>}
                <span className="ml-auto" style={{color: d.outcome==='success' || d.outcome==='recovered' ? 'var(--success)' : d.outcome==='failed'?'var(--heat-1)':'var(--text-dim)'}}>{d.outcome || d.status || 'pending'} {d.status==='overridden' ? '→ overridden' : ''}</span>
              </div>
            ))}
          </div>
        }
      </div>

      {/* G Experiment group tag already in history, but also note */}
      <div className="p-4 text-[11px]" style={{color:'var(--text-dim)'}}>
        Experiment group tags <span className="bracket">[ A_naive ]</span> <span className="bracket heat-1">[ B_smart ]</span> show which A/B arm contributed to aggregate numbers — not a separate concept.
        <span className="ml-2 underline cursor-pointer" onClick={()=>window.location.href='/ab'}>see A/B live →</span>
      </div>
    </div>
  );
}
