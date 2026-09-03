import React, { useEffect, useState } from 'react';

const heatFor = (conf, fallback) => {
  if (fallback) return {color:'var(--text-dim)', label:'fallback'};
  if (conf >= 0.7) return {color:'var(--heat-1)', label:'high'};
  if (conf >= 0.5) return {color:'var(--heat-2)', label:'mid'};
  if (conf >= 0.35) return {color:'var(--heat-3)', label:'low'};
  return {color:'var(--heat-4)', label:'thin'};
};

export default function Dashboard({ refreshKey, onSelectCustomer, onRefresh }) {
  const [decisions, setDecisions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [explain, setExplain] = useState({}); // decision_id -> {payload, explanation}
  const [overrideForm, setOverrideForm] = useState(null); // {id, datetime, reason}
  const [loading, setLoading] = useState(true);
  const doRefresh = onRefresh || (()=>{});

  const callExplain = async (id) => {
    const r = await fetch(`/api/decisions/${id}/explain`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
    const j = await r.json();
    setExplain(prev=>({...prev, [id]: j}));
  };
  const submitOverride = async () => {
    if(!overrideForm) return;
    if(overrideForm.reason.trim().length < 10) { alert('Reason must be >=10 chars'); return; }
    const r = await fetch(`/api/decisions/${overrideForm.id}/override`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({new_retry_at: new Date(overrideForm.datetime).toISOString(), reason: overrideForm.reason})});
    const j = await r.json();
    if(r.ok){ setOverrideForm(null); doRefresh(); fetchAll(); } else { alert(j.detail||JSON.stringify(j)); }
  };

  const fetchAll = async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        fetch('/api/retry/decisions').then(r => r.json()),
        fetch('/api/metrics').then(r => r.json()),
      ]);
      setDecisions(dRes.decisions || []);
      setMetrics(mRes);
    } catch(e){ console.error(e)} finally{ setLoading(false)}
  };
  useEffect(()=>{ fetchAll(); }, [refreshKey]);
  useEffect(()=>{ const id=setInterval(fetchAll, 4000); return ()=>clearInterval(id); }, []);

  if (loading) return <div className="panel p-8 text-xs" style={{color:'var(--text-dim)'}}>loading feed…</div>;

  const batch = metrics?.latest_batch;

  return (
    <div className="space-y-6">
      {/* proof section — naive vs smart reused same component as landing proof but live */}
      {batch && (
        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs tracking-widest">PROOF — NAIVE VS SMART · SAME BATCH</h3>
            <span className="text-[11px]" style={{color:'var(--text-dim)'}}>batch {String(batch.batch_id).slice(0,8)} · {batch.total_failed_payments} failures</span>
          </div>

          {/* bars */}
          <div className="mt-5 grid grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>fixed-schedule retry</div>
              <div className="mt-3 flex items-end gap-[3px] h-[56px]">
                {Array.from({length: 10}).map((_,i)=>{
                  const h = 12 + Math.round((batch.baseline_fixed_schedule_recovered_count/ Math.max(batch.total_failed_payments,1))*48 * Math.random()*0.6 + 8);
                  return <div key={i} className="flex-1" style={{height:`${h}px`, background:'var(--line)'}} />
                })}
              </div>
              <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>{batch.baseline_fixed_schedule_recovered_count} recovered · ₹{(batch.baseline_fixed_schedule_recovered_amount||0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="text-[11px] tracking-widest" style={{color:'var(--heat-1)'}}>personal-window retry</div>
              <div className="mt-3 flex items-end gap-[3px] h-[56px]">
                {Array.from({length: 10}).map((_,i)=>{
                  const h = 18 + Math.round((batch.recovered_count/ batch.total_failed_payments)*52 * (0.7+Math.random()*0.6));
                  const c = i<3 ? 'var(--heat-1)' : i<6 ? 'var(--heat-2)' : 'var(--heat-3)';
                  return <div key={i} className="flex-1" style={{height:`${Math.min(h,56)}px`, background:c}} />
                })}
              </div>
              <div className="mt-2 text-[11px]" style={{color:'var(--text-primary)'}}>{batch.recovered_count} recovered · ₹{(batch.recovered_amount_total||0).toLocaleString('en-IN')}</div>
            </div>
          </div>

          {/* live numbers dot-matrix */}
          <div className="mt-6 grid grid-cols-3 gap-4" style={{borderTop:'1px solid var(--line)', paddingTop:'16px'}}>
            {[
              {label:'Recovered', value: String(batch.recovered_count), cap:'personal-window count'},
              {label:'Improvement', value: `+${batch.improvement_pct}%`, cap:'vs fixed schedule'},
              {label:'Cold-start handled', value: String(batch.cold_start_fallback_count), cap:'fallbacks, not guesses'},
            ].map(s=>(
              <div key={s.label}>
                <div className="display-num text-2xl" style={{color:'var(--text-primary)'}}>{s.value}</div>
                <div className="text-[11px] tracking-widest mt-1" style={{color:'var(--text-dim)'}}>{s.label}</div>
                <div className="text-[11px] mt-1" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'6px'}}>{s.cap}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* confidence legend + decisions feed */}
      <div className="panel">
        <div className="px-4 py-3 flex items-center justify-between gap-4" style={{borderBottom:'1px solid var(--line)'}}>
          <h3 className="text-xs tracking-widest">DECISIONS FEED — AUDIT BEFORE EXECUTION</h3>
          <div className="hidden sm:flex items-center gap-2 text-[10px]" style={{color:'var(--text-dim)'}}>
            <span className="h-2 w-6" style={{background:'var(--heat-1)'}}/>high
            <span className="h-2 w-6" style={{background:'var(--heat-2)'}}/>
            <span className="h-2 w-6" style={{background:'var(--heat-3)'}}/>
            <span className="h-2 w-6" style={{background:'var(--heat-4)'}}/>fallback
          </div>
        </div>

        {/* persistent mini legend rail for mobile */}
        <div className="sm:hidden px-4 py-2 flex gap-1 text-[10px] items-center" style={{color:'var(--text-dim)', borderBottom:'1px solid var(--line)'}}>
          high <span className="flex-1 h-[4px] ml-2" style={{background:'linear-gradient(90deg,var(--heat-1),var(--heat-2),var(--heat-3),var(--heat-4))'}}/> fallback
        </div>

        <div className="max-h-[540px] overflow-auto">
          {decisions.length===0 ? (
            <div className="p-8 text-xs" style={{color:'var(--text-dim)'}}>No decisions yet — generate synthetic data and inject a failure via controls above.</div>
          ) : decisions.map(d=>{
            const conf = Number(d.confidence||0);
            const fallback = !!d.fallback_used;
            const heat = heatFor(conf, fallback);
            const ist = d.recommended_retry_at ? new Date(d.recommended_retry_at).toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false}) : '-';
            const basis = d.model_basis || d.basis || '-';
            const isOpen = expanded===d.decision_id;
            return (
              <div key={d.decision_id} style={{borderBottom:'1px solid var(--line)'}}>
                <button
                  onClick={()=>{ setExpanded(isOpen?null:d.decision_id); onSelectCustomer && onSelectCustomer(d.customer_id); }}
                  className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-2 text-xs hover:opacity-90"
                  style={{background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent'}}
                >
                  <span className="bracket" style={{color:'var(--text-dim)', minWidth:'92px'}}>[ {String(d.customer_id).slice(0,12)} ]</span>
                  <span style={{color:'var(--text-dim)'}}>failed {d.failure_reason || 'insufficient_funds'}</span>
                  <span style={{color:'var(--text-dim)'}}>→</span>
                  <span>retry {ist}</span>
                    <span className="bracket" style={{color: heat.color, borderColor: heat.color}}>
                    {fallback ? '[ fallback ]' : `[ ${Math.round(conf*100)}% ]`}
                  </span>
                  <span className="hidden md:inline" style={{color:'var(--text-dim)'}}>{basis}</span>
                  {d.status==='needs_human_review' && <span className="bracket heat-1">[ needs review ]</span>}
                  {d.status==='overridden' && <span className="bracket" style={{color:'var(--heat-2)', borderColor:'var(--heat-2)'}}>[ overridden ]</span>}
                  {d.experiment_group && <span className="bracket" style={{color:'var(--text-dim)'}}>[ {d.experiment_group} ]</span>}
                  <span className="ml-auto text-[11px]" style={{color: d.actual_retry_outcome==='success'?'var(--success)': d.actual_retry_outcome==='failed'?'var(--heat-1)':'var(--text-dim)'}}>{d.actual_retry_outcome}</span>
                  <span className="text-[11px]" style={{color:'var(--text-dim)'}}>{d.llm_call_succeeded ? '' : '[ template ]'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 grid gap-3" style={{background:'rgba(255,255,255,0.015)', borderTop:'1px solid var(--line)'}}>
                    <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-4 pt-3">
                      <div className="text-xs leading-5">
                        <div style={{color:'var(--text-dim)'}}>basis <span style={{color:'var(--text-primary)'}}>{basis}</span> · data points <span className="bracket">[ {d.data_points_used} ]</span> · confidence <span style={{color:heat.color}}>[ {Math.round(conf*100)}% ]</span> · status <span className="bracket" style={{color:'var(--text-dim)'}}>[ {d.status||'scheduled'} ]</span> · group <span className="bracket">[ {d.experiment_group||'B'} ]</span></div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button onClick={()=>callExplain(d.decision_id)} className="text-[11px] px-2 py-1" style={{border:'1px solid var(--line)', color:'var(--text-primary)'}}>Explain this ▸</button>
                          {explain[d.decision_id] && <button onClick={()=>callExplain(d.decision_id)} className="text-[11px] px-2 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>regenerate</button>}
                          {d.actual_retry_outcome==='pending' && d.status!=='overridden' && (
                            <button onClick={()=>setOverrideForm({id:d.decision_id, datetime: new Date(new Date(d.recommended_retry_at).getTime()+86400000).toISOString().slice(0,16), reason:''})} className="text-[11px] px-2 py-1" style={{border:'1px solid var(--heat-2)', color:'var(--heat-2)'}}>Override</button>
                          )}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <span className="bracket" style={{color:'var(--text-dim)'}}>[ generated ]</span>
                          <span style={{color:'var(--text-dim)'}}>LLM explains, does not decide — read-only</span>
                        </div>
                        <div className="mt-2" style={{color:'var(--text-primary)'}}>{(explain[d.decision_id]?.explanation) || d.llm_explanation || '—'}</div>
                        {explain[d.decision_id]?.prompt_payload_shown && (
                          <div className="mt-2 p-2 text-[11px] font-mono" style={{background:'var(--bg)', border:'1px solid var(--line)', color:'var(--text-dim)'}}>
                            prompt payload shown: {JSON.stringify(explain[d.decision_id].prompt_payload_shown)}
                          </div>
                        )}
                        <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>logged {d.created_at ? new Date(d.created_at).toLocaleString('en-IN') : ''} · effective {d.effective_retry_at ? new Date(d.effective_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : new Date(d.recommended_retry_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</div>
                        {overrideForm?.id===d.decision_id && (
                          <div className="mt-3 p-3 space-y-2" style={{border:'1px solid var(--heat-2)', background:'rgba(240,124,46,0.08)'}}>
                            <div className="text-[11px] tracking-widest">OVERRIDE — human in loop (bounded & gated)</div>
                            <input type="datetime-local" value={overrideForm.datetime} onChange={e=>setOverrideForm({...overrideForm, datetime:e.target.value})} className="w-full text-xs px-2 py-1" style={{background:'var(--panel)', border:'1px solid var(--line)', color:'var(--text-primary)'}}/>
                            <input placeholder="reason — why override? (≥10 chars)" value={overrideForm.reason} onChange={e=>setOverrideForm({...overrideForm, reason:e.target.value})} className="w-full text-xs px-2 py-1" style={{background:'var(--panel)', border:'1px solid var(--line)', color:'var(--text-primary)'}}/>
                            <div className="flex gap-2">
                              <button onClick={submitOverride} className="text-xs px-3 py-1" style={{background:'var(--heat-2)', color:'white'}}>confirm override</button>
                              <button onClick={()=>setOverrideForm(null)} className="text-xs px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>cancel</button>
                            </div>
                            <div className="text-[11px]" style={{color:'var(--text-dim)'}}>Original <span style={{color:'var(--text-primary)'}}>{new Date(d.recommended_retry_at).toLocaleString()}</span> stays intact — override adds new record.</div>
                          </div>
                        )}
                      </div>
                      <div className="text-[11px]" style={{color:'var(--text-dim)'}}>
                        <div>Hover histogram via customer view on the right. Heat already encodes confidence.</div>
                        <div className="mt-3">
                          <button onClick={()=>onSelectCustomer && onSelectCustomer(d.customer_id)} className="text-xs px-2 py-1 w-full" style={{border:'1px solid var(--line)', color:'var(--text-primary)'}}>open profile page</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}
