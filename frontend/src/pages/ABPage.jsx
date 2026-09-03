import React from 'react';
import ABPanel from '../ABPanel.jsx';

export default function ABPage(){
  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8">
      <h1 className="text-sm tracking-widest">A/B — LIVE RANDOMIZED SPLIT, NOT A BACKTEST</h1>
      <p className="mt-2 text-xs leading-5 max-w-[72ch]" style={{color:'var(--text-dim)'}}>
        <span style={{color:'var(--text-primary)'}}>Purpose:</span> proof that smart timing beats fixed schedule on live failures. On each new failure, <span className="bracket">[ hash(customer_id:failure_id) ]</span> stably assigns <span className="bracket">[ A naive 3-day ]</span> (no model, no LLM) vs <span className="bracket heat-1">[ B personal window ]</span> (histogram + recency). Both write to <span style={{color:'var(--text-primary)'}}>retry_decisions</span> with <span className="bracket">[ experiment_group ]</span>; chart reuses same visual as feed proof for build-quality signal. “B recovered X% more than A on live split” is stronger than a retroactive simulation.
      </p>
      <div className="mt-6">
        <ABPanel refreshKey={0} />
      </div>
      <div className="mt-4 text-[11px]" style={{color:'var(--text-dim)'}}>
        URL: <span className="bracket">[ /ab ]</span> — live-updates every 4s. Assign is deterministic so reprocessing the same failure lands in the same group (debuggable, honest).
      </div>
    </div>
  );
}
