import React from 'react';
import NeedsReview from '../NeedsReview.jsx';
import { useNavigate } from 'react-router-dom';

export default function ReviewPage(){
  const nav = useNavigate();
  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8">
      <h1 className="text-sm tracking-widest">NEEDS REVIEW — SYSTEM DECLINED</h1>
      <p className="mt-2 text-xs leading-5 max-w-[72ch]" style={{color:'var(--text-dim)'}}>
        <span style={{color:'var(--text-primary)'}}>Purpose:</span> this is not a backlog — it’s the system’s own gating. Rule: <span className="bracket">[ last retry + confidence &lt; 50% ]</span> → <span className="bracket heat-1">[ needs review ]</span>, do <em>not</em> auto-schedule. Distinct from <span className="bracket" style={{color:'var(--heat-2)'}}>[ overridden ]</span> where a human overrode a willing decision. Find these for manual judgment, then override or execute from the feed.
      </p>
      <div className="mt-6">
        <NeedsReview refreshKey={0} onOpen={(cid)=>nav(`/profile/${cid}`)} />
      </div>
      <div className="mt-4 text-[11px]" style={{color:'var(--text-dim)'}}>
        URL: <span className="bracket">[ /review ]</span> — shareable. Navigate via navbar; back button restores feed.
      </div>
    </div>
  );
}
