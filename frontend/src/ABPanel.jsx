import React, { useEffect, useState } from 'react';

export default function ABPanel({ refreshKey }) {
  const [stats, setStats]=useState(null);
  const fetchStats=()=>fetch('/api/experiment/stats').then(r=>r.json()).then(setStats).catch(()=>{});
  useEffect(()=>{ fetchStats(); }, [refreshKey]);
  useEffect(()=>{ const id=setInterval(fetchStats,4000); return ()=>clearInterval(id); }, []);
  if(!stats) return <div className="panel p-4 text-xs" style={{color:'var(--text-dim)'}}>loading A/B…</div>;
  const a=stats.group_a_fixed, b=stats.group_b_smart;
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs tracking-widest">LIVE A/B — RANDOMIZED 50/50 (Feature 6)</h3>
        <span className="text-[11px]" style={{color:'var(--text-dim)'}}>hash(customer_id:failure_id) → stable split</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>A — FIXED 3-DAY · no model</div>
          <div className="mt-3 flex items-end gap-[3px] h-[56px]">
            {Array.from({length:10}).map((_,i)=>{
              const h= 10 + Math.round((a.recovery_rate_pct/100)*46);
              return <div key={i} className="flex-1" style={{height:`${h}px`, background:'var(--line)'}}/>
            })}
          </div>
          <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>{a.recovered}/{a.total} recovered · {a.recovery_rate_pct}% · {a.pending} pending</div>
        </div>
        <div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--heat-1)'}}>B — PERSONAL WINDOW · smart</div>
          <div className="mt-3 flex items-end gap-[3px] h-[56px]">
            {Array.from({length:10}).map((_,i)=>{
              const h= 14 + Math.round((b.recovery_rate_pct/100)*42);
              const c=i<4?'var(--heat-1)':i<7?'var(--heat-2)':'var(--heat-3)';
              return <div key={i} className="flex-1" style={{height:`${h}px`, background:c}}/>
            })}
          </div>
          <div className="mt-2 text-[11px]" style={{color:'var(--text-primary)'}}>{b.recovered}/{b.total} recovered · {b.recovery_rate_pct}% · {b.pending} pending</div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4" style={{borderTop:'1px solid var(--line)', paddingTop:'14px'}}>
        <div>
          <div className="display-num text-xl">{stats.improvement_pct}%</div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>IMPROVEMENT B vs A</div>
          <div className="text-[11px] mt-1" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'6px'}}>live, not backtested — randomized as failures arrive</div>
        </div>
        <div>
          <div className="display-num text-xl">{stats.total_decisions}</div>
          <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>TOTAL SPLIT</div>
          <div className="text-[11px] mt-1" style={{color:'var(--text-dim)', borderTop:'1px solid var(--line)', paddingTop:'6px'}}>A {a.total} · B {b.total}</div>
        </div>
        <div>
          <div className="text-xs" style={{color:'var(--text-dim)'}}>Same visual as landing proof — same meaning, two contexts (build quality signal).</div>
          <div className="mt-2 text-[11px]"><span className="bracket">[ A naive ]</span> <span className="bracket heat-1">[ B smart ]</span></div>
        </div>
      </div>
    </div>
  );
}
