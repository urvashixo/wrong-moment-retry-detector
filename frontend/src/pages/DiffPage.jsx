import React from 'react';
import DiffView from '../DiffView.jsx';

export default function DiffPage(){
  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8">
      <h1 className="text-sm tracking-widest">DIFF — OVERRIDES, SIDE BY SIDE</h1>
      <p className="mt-2 text-xs leading-5 max-w-[72ch]" style={{color:'var(--text-dim)'}}>
        <span style={{color:'var(--text-primary)'}}>Purpose:</span> trust artifact that argues for itself. Each row: <span style={{color:'var(--text-primary)'}}>algorithm recommended</span> → <span style={{color:'var(--heat-2)'}}>human chose</span> → <span className="bracket">[ reason ]</span> → <span className="bracket">[ outcome ]</span>. Aggregates show override rate and human-chosen success rate. Honest limitation: only the human-chosen time’s outcome is observable; the algorithm’s counterfactual would require simulation and is not fudged.
      </p>
      <div className="mt-6">
        <DiffView refreshKey={0} />
      </div>
      <div className="mt-4 text-[11px]" style={{color:'var(--text-dim)'}}>
        URL: <span className="bracket">[ /diff ]</span> — bookmarkable. Overrides are inserted via <span className="bracket">[ Override ]</span> on any pending decision in <span className="bracket">[ /feed ]</span>.
      </div>
    </div>
  );
}
