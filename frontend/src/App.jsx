import React, { useState, useRef } from 'react';
import Dashboard from './Dashboard.jsx';
import CustomerDetail from './CustomerDetail.jsx';
import SimulationControls from './SimulationControls.jsx';

// --- tiny hero histogram strip ---
function HeroHistogram() {
  const [bars] = useState(() => {
    // generate 31 bars mimicking distribution with one peak
    const base = Array.from({length: 31}, (_,i) => {
      const dist = Math.exp(-Math.pow(i-10,2)/18) * 40 + Math.random()*8 + 4;
      return Math.round(dist);
    });
    return base;
  });
  const [flashIdx] = useState(10);
  const [animated, setAnimated] = useState(false);
  React.useEffect(() => {
    const t = setTimeout(()=>setAnimated(true), 200);
    return ()=>clearTimeout(t);
  }, []);

  return (
    <div className="mt-8 border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-end gap-[2px] h-[88px] overflow-hidden">
        {bars.map((h,i) => {
          const isPeak = i===flashIdx;
          const height = animated ? h : 4;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full transition-all duration-700 ease-out"
                style={{
                  height: `${height}px`,
                  background: isPeak ? 'var(--heat-1)' : i===flashIdx+1 || i===flashIdx-1 ? 'var(--heat-2)' : `color-mix(in srgb, var(--heat-4) ${20 + (h/45)*30}%, var(--line))`,
                  boxShadow: isPeak && animated ? '0 0 12px var(--heat-1)' : 'none',
                  transitionDelay: `${i*18}ms`
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] tracking-widest mt-2" style={{color:'var(--text-dim)'}}>
        <span>01</span><span>08</span><span>15</span><span>22</span><span>31</span>
      </div>
      {animated && (
        <div className="mt-3 flex items-center gap-2 text-xs animate-pulse">
          <span className="h-2 w-2 rounded-full" style={{background:'var(--heat-1)'}} />
          <span className="bracket heat-1">[ retry scheduled ]</span>
          <span style={{color:'var(--text-dim)'}}>day 11 — 10:15 IST</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const liveRef = useRef(null);

  const triggerRefresh = () => setRefreshKey(k => k + 1);
  const scrollToLive = () => liveRef.current?.scrollIntoView({behavior:'smooth', block:'start'});

  return (
    <div className="min-h-screen" style={{background:'var(--bg)', color:'var(--text-primary)'}}>
      {/* top hairline bar */}
      <header className="sticky top-0 z-40 backdrop-blur" style={{background:'rgba(10,10,10,0.9)', borderBottom:'1px solid var(--line)'}}>
        <div className="max-w-[1160px] mx-auto px-6 h-[48px] flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs tracking-widest" style={{color:'var(--text-dim)'}}>
            <span className="bracket" style={{color:'var(--text-primary)', borderColor:'var(--line)'}}>[ WRONG MOMENT ]</span>
            <span className="hidden sm:inline">liquidity window detector</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-[11px]" style={{color:'var(--text-dim)'}}>deterministic decides · LLM explains</span>
            <span className="text-[10px] px-2 py-1" style={{background:'var(--panel)', border:'1px solid var(--line)', color:'var(--text-dim)'}}>● live</span>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-[1160px] mx-auto px-6 pt-10 pb-8">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-start">
          <div>
            <h1 className="text-[32px] md:text-[40px] leading-[0.95] font-medium tracking-tight" style={{fontFamily:'JetBrains Mono'}}>
              Your retries fail<br/>
              at the wrong time.<br/>
              Not for the wrong<br/>
              <span style={{color:'var(--text-dim)'}}>reason.</span>
            </h1>
            <p className="mt-5 max-w-[44ch] text-[13px] leading-6" style={{color:'var(--text-dim)'}}>
              Most retry logic asks again in 3 days. We ask again the moment your customer's money actually shows up — learned from their own payment history.
            </p>
            <button onClick={scrollToLive} className="mt-6 text-sm inline-flex items-center gap-2 hover:opacity-80 transition" style={{color:'var(--text-primary)'}}>
              <span>▸</span> see it find a pattern
            </button>
            <div className="mt-8 flex items-center gap-6 text-[11px]" style={{color:'var(--text-dim)'}}>
              <span>no discounting</span>
              <span>timing only</span>
              <span>audit before execution</span>
            </div>
          </div>
          <div>
            <HeroHistogram />
            <div className="mt-3 text-[11px] flex gap-4" style={{color:'var(--text-dim)'}}>
              <span>31-day axis</span>
              <span style={{color:'var(--heat-1)'}}>■ predicted window</span>
              <span>bar = success density</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-[1160px] mx-auto px-6">
        <div className="grid md:grid-cols-3" style={{border:'1px solid var(--line)'}}>
          {[
            {n:'01', h:'detect', p:'A payment fails. We log why — insufficient funds, timeout, decline — and how many retries remain on the rail.'},
            {n:'02', h:'learn', p:'We look at this customer’s own past successes — not everyone else’s. Histogram across day-of-month, day-of-week, hour-of-day, recency-weighted.'},
            {n:'03', h:'retry', p:'We ask again at their predicted best window, not a generic fixed delay. Honest confidence, fallback when data is thin.'},
          ].map(s => (
            <div key={s.n} className="p-6" style={{borderRight:'1px solid var(--line)', background:'var(--panel)'}}>
              <div className="display-num text-2xl" style={{color:'var(--text-dim)'}}>{s.n}</div>
              <div className="mt-2 text-sm tracking-widest" style={{color:'var(--text-primary)'}}>{s.h}</div>
              <p className="mt-3 text-xs leading-5" style={{color:'var(--text-dim)'}}>{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE SECTION */}
      <section ref={liveRef} id="live" className="max-w-[1160px] mx-auto px-6 pt-12">
        <div className="flex items-end justify-between border-b pb-3" style={{borderColor:'var(--line)'}}>
          <h2 className="text-sm tracking-widest">LIVE — inject a failure, watch it decide</h2>
          <span className="text-[11px]" style={{color:'var(--text-dim)'}}>timestamps UTC internally, IST displayed</span>
        </div>
        <div className="mt-6">
          <SimulationControls onUpdate={triggerRefresh} />
        </div>
      </section>

      {/* DASHBOARD GRID */}
      <section className="max-w-[1160px] mx-auto px-6 mt-8 grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <Dashboard refreshKey={refreshKey} onSelectCustomer={setSelectedCustomer} />
        <div className="lg:sticky lg:top-[60px]">
          {selectedCustomer ? (
            <CustomerDetail customerId={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
          ) : (
            <div className="panel p-6 text-xs leading-5" style={{color:'var(--text-dim)'}}>
              Select a decision log entry to see its histogram and <span className="bracket" style={{color:'var(--text-dim)'}}>[ generated ]</span> explanation.<br/><br/>
              Click any row in the feed — it expands inline, no modal. The number is computed; the sentence is explained.
              <div className="mt-4 pt-4" style={{borderTop:'1px solid var(--line)', color:'var(--text-dim)'}}>
                Confidence scale: <span className="heat-1">[ high ]</span> <span className="heat-2">→</span> <span className="heat-4">[ fallback ]</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* failure-handling feature */}
      <section className="max-w-[1160px] mx-auto px-6 mt-12">
        <div className="panel p-6 grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
          <div>
            <div className="text-xs tracking-widest" style={{color:'var(--text-dim)'}}>WHAT HAPPENS WHEN IT DOESN’T KNOW</div>
            <p className="mt-3 text-sm leading-6" style={{color:'var(--text-primary)'}}>
              Not enough history yet. We fall back to a safe default instead of guessing.
            </p>
            <p className="mt-2 text-xs leading-5" style={{color:'var(--text-dim)'}}>
              A cold-start customer with 1 data point — most “AI recovery” pitches never admit uncertainty. This is the trust signal.
            </p>
          </div>
          <div className="panel p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[11px]" style={{color:'var(--text-dim)'}}>customer with 1 success</div>
              <div className="mt-2 h-2" style={{background:'var(--line)'}}>
                <div className="h-2" style={{width:'31%', background:'var(--heat-4)'}} />
              </div>
              <div className="mt-2 flex gap-2">
                <span className="bracket heat-4">[ 31% ]</span>
                <span className="bracket" style={{color:'var(--text-dim)'}}>[ fallback ]</span>
              </div>
            </div>
            <div className="text-[11px] leading-4" style={{color:'var(--text-dim)'}}>
              fallback_default<br/>retry +3 days 10:15 IST
            </div>
          </div>
        </div>
      </section>

      <footer className="max-w-[1160px] mx-auto px-6 mt-12 py-8" style={{borderTop:'1px solid var(--line)', color:'var(--text-dim)'}}>
        <div className="flex flex-col md:flex-row justify-between gap-4 text-xs">
          <div>
            <div style={{color:'var(--text-primary)'}}>wrong moment retry detector — Track 03 AI Revenue Recovery</div>
            <div className="mt-1 max-w-[60ch]">Learns each customer’s personal liquidity window and retries there. Deterministic model decides WHEN; Groq only explains.</div>
          </div>
          <div className="text-[11px] space-y-1">
            <div>built for hackathon · deterministic · auditable</div>
            <div>timestamps stored UTC, displayed IST · <a href="https://github.com/anomalyco/opencode" className="underline">opencode</a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
