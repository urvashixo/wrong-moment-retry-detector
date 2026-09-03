import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function HeroHistogram() {
  const [bars] = useState(() => Array.from({length:31}, (_,i)=> Math.round(Math.exp(-Math.pow(i-10,2)/18)*40 + Math.random()*8 + 4)));
  const [flashIdx]=useState(10);
  const [animated,setAnimated]=useState(false);
  React.useEffect(()=>{ const t=setTimeout(()=>setAnimated(true),200); return ()=>clearTimeout(t);},[]);
  return (
    <div className="mt-8 border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-end gap-[2px] h-[88px] overflow-hidden">
        {bars.map((h,i)=>{
          const isPeak=i===flashIdx;
          const height=animated?h:4;
          return <div key={i} className="flex-1 flex flex-col items-center gap-1"><div className="w-full transition-all duration-700 ease-out" style={{height:`${height}px`, background:isPeak?'var(--heat-1)':i===flashIdx+1||i===flashIdx-1?'var(--heat-2)':`color-mix(in srgb, var(--heat-4) ${20+(h/45)*30}%, var(--line))`, boxShadow:isPeak&&animated?'0 0 12px var(--heat-1)':'none', transitionDelay:`${i*18}ms`}}/></div>
        })}
      </div>
      <div className="flex justify-between text-[10px] tracking-widest mt-2" style={{color:'var(--text-dim)'}}><span>01</span><span>08</span><span>15</span><span>22</span><span>31</span></div>
      {animated && <div className="mt-3 flex items-center gap-2 text-xs animate-pulse"><span className="h-2 w-2 rounded-full" style={{background:'var(--heat-1)'}}/><span className="bracket heat-1">[ retry scheduled ]</span><span style={{color:'var(--text-dim)'}}>day 11 — 10:15 IST</span></div>}
    </div>
  );
}

export default function LandingPage(){
  const nav = useNavigate();
  return (
    <>
      <section className="max-w-[1160px] mx-auto px-6 pt-10 pb-8">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-start">
          <div>
            <h1 className="text-[32px] md:text-[40px] leading-[0.95] font-medium tracking-tight" style={{fontFamily:'JetBrains Mono'}}>
              Your retries fail<br/>at the wrong time.<br/>Not for the wrong<br/><span style={{color:'var(--text-dim)'}}>reason.</span>
            </h1>
            <p className="mt-5 max-w-[44ch] text-[13px] leading-6" style={{color:'var(--text-dim)'}}>Most retry logic asks again in 3 days. We ask again the moment your customer's money actually shows up — learned from their own payment history.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={()=>nav('/feed')} className="text-sm inline-flex items-center gap-2 px-4 py-2" style={{background:'var(--text-primary)', color:'var(--bg)'}}>▸ open live feed</button>
              <button onClick={()=>nav('/ab')} className="text-sm inline-flex items-center gap-2 px-4 py-2" style={{border:'1px solid var(--line)', color:'var(--text-primary)'}}>see A/B proof</button>
            </div>
            <div className="mt-8 flex items-center gap-6 text-[11px]" style={{color:'var(--text-dim)'}}><span>no discounting</span><span>timing only</span><span>audit before execution</span></div>
          </div>
          <div>
            <HeroHistogram />
            <div className="mt-3 text-[11px] flex gap-4" style={{color:'var(--text-dim)'}}><span>31-day axis</span><span style={{color:'var(--heat-1)'}}>■ predicted window</span><span>bar = success density</span></div>
          </div>
        </div>
      </section>

      <section className="max-w-[1160px] mx-auto px-6">
        <div className="grid md:grid-cols-3" style={{border:'1px solid var(--line)'}}>
          {[{n:'01',h:'detect',p:'A payment fails. We log why — insufficient funds, timeout, decline — and how many retries remain on the rail.'},{n:'02',h:'learn',p:'We look at this customer’s own past successes — not everyone else’s. Histogram across day-of-month, day-of-week, hour-of-day, recency-weighted.'},{n:'03',h:'retry',p:'We ask again at their predicted best window, not a generic fixed delay. Honest confidence, fallback when data is thin.'}].map(s=>(
            <div key={s.n} className="p-6" style={{borderRight:'1px solid var(--line)', background:'var(--panel)'}}>
              <div className="display-num text-2xl" style={{color:'var(--text-dim)'}}>{s.n}</div>
              <div className="mt-2 text-sm tracking-widest" style={{color:'var(--text-primary)'}}>{s.h}</div>
              <p className="mt-3 text-xs leading-5" style={{color:'var(--text-dim)'}}>{s.p}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <button onClick={()=>nav('/feed')} className="text-xs tracking-widest px-6 py-3" style={{border:'1px solid var(--line)', color:'var(--text-primary)'}}>enter dashboard →</button>
        </div>
      </section>

      <section className="max-w-[1160px] mx-auto px-6 mt-12">
        <div className="panel p-6 grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
          <div>
            <div className="text-xs tracking-widest" style={{color:'var(--text-dim)'}}>WHAT HAPPENS WHEN IT DOESN’T KNOW</div>
            <p className="mt-3 text-sm leading-6" style={{color:'var(--text-primary)'}}>Not enough history yet. We fall back to a safe default instead of guessing.</p>
            <p className="mt-2 text-xs leading-5" style={{color:'var(--text-dim)'}}>A cold-start customer with 1 data point — most “AI recovery” pitches never admit uncertainty.</p>
          </div>
          <div className="panel p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px]" style={{color:'var(--text-dim)'}}>customer with 1 success</div>
              <div className="mt-2 h-2" style={{background:'var(--line)'}}><div className="h-2" style={{width:'31%', background:'var(--heat-4)'}} /></div>
              <div className="mt-2 flex gap-2"><span className="bracket heat-4">[ 31% ]</span><span className="bracket" style={{color:'var(--text-dim)'}}>[ fallback ]</span></div>
            </div>
            <div className="text-[11px] leading-4" style={{color:'var(--text-dim)'}}>fallback_default<br/>retry +3 days 10:15 IST</div>
          </div>
        </div>
      </section>
    </>
  );
}
