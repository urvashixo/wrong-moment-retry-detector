import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProfilePage from '../ProfilePage.jsx';

export default function ProfileRoute(){
  const { customerId } = useParams();
  const nav = useNavigate();
  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={()=>nav(-1)} className="text-xs px-3 py-1" style={{border:'1px solid var(--line)', color:'var(--text-dim)'}}>← back</button>
        <h1 className="text-sm tracking-widest">PROFILE — PER-CUSTOMER EVIDENCE</h1>
        <span className="text-[11px]" style={{color:'var(--text-dim)'}}>URL: <span className="bracket">[ /profile/{customerId?.slice(0,12)} ]</span> — shareable</span>
      </div>
      <p className="text-xs leading-5 max-w-[72ch] mb-6" style={{color:'var(--text-dim)'}}>
        <span style={{color:'var(--text-primary)'}}>Purpose:</span> one screen that answers “why does the system believe this about this person” — full timeline (success dim vs failed <span className="heat-1">heat-1</span>), histogram the model actually used (<span className="bracket heat-1">[ used ]</span> tag), current pending recommendation + effective retry, decision history (confidence over time), and inline override history. Reuses exact histogram component from dashboard — same chart, same meaning.
      </p>
      <ProfilePage customerId={customerId} onClose={()=>nav('/feed')} />
    </div>
  );
}
