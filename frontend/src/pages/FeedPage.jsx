import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Dashboard from '../Dashboard.jsx';
import CustomerDetail from '../CustomerDetail.jsx';
import ProfilePage from '../ProfilePage.jsx';
import SimulationControls from '../SimulationControls.jsx';

export default function FeedPage(){
  const [refreshKey,setRefreshKey]=useState(0);
  const [selectedCustomer,setSelectedCustomer]=useState(null);
  const [profileId,setProfileId]=useState(null);
  const navigate = useNavigate();
  const triggerRefresh=()=>setRefreshKey(k=>k+1);

  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-sm tracking-widest">FEED — LIVE DECISIONS</h1>
        <p className="mt-2 text-xs leading-5 max-w-[72ch]" style={{color:'var(--text-dim)'}}>
          Every retry decision is logged <span style={{color:'var(--text-primary)'}}>before</span> execution — audit-first, not post-hoc. Heat color is confidence: <span className="heat-1">[ high ]</span> red → <span className="heat-4">[ fallback ]</span> yellow. Click a row to <span className="bracket">[ Explain this ]</span> (live Groq call, prompt payload shown) or <span className="bracket" style={{color:'var(--heat-2)'}}>[ Override ]</span> (human in loop, requires reason ≥10 chars). A/B group <span className="bracket">[ A ]</span> naive vs <span className="bracket heat-1">[ B ]</span> smart is assigned deterministically via <span style={{color:'var(--text-dim)'}}>hash(customer_id:failure_id)</span>.
        </p>
      </div>

      <SimulationControls onUpdate={triggerRefresh} />

      <div className="mt-6 grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <Dashboard refreshKey={refreshKey} onSelectCustomer={setSelectedCustomer} onRefresh={triggerRefresh} />
        <div className="lg:sticky lg:top-[60px] space-y-6">
          {profileId ? (
            <ProfilePage customerId={profileId} onClose={()=>setProfileId(null)} />
          ) : selectedCustomer ? (
            <div className="space-y-3">
              <CustomerDetail customerId={selectedCustomer} onClose={()=>setSelectedCustomer(null)} />
              <button onClick={()=>navigate(`/customers/${selectedCustomer}`)} className="w-full text-xs py-2" style={{background:'var(--heat-1)', color:'white', border:'1px solid var(--heat-1)'}}>open profile page → /customers/{selectedCustomer.slice(0,12)}</button>
            </div>
          ) : (
            <div className="panel p-6 text-xs leading-5" style={{color:'var(--text-dim)'}}>
              Select a decision row — it expands inline (no modal). The number is computed; the sentence is <span className="bracket">[ generated ]</span>.
              <div className="mt-3 text-[11px]">Click <span className="bracket heat-1">[ open profile page ]</span> below or click any <span className="bracket">[ cust_* ]</span> ID to land on <span style={{color:'var(--text-primary)'}}>/customers/{'{id}'}</span></div>
            </div>
          )}
          <div className="panel p-4">
            <div className="text-[11px] tracking-widest" style={{color:'var(--text-dim)'}}>OPEN PROFILE BY URL</div>
            <div className="mt-2 flex gap-2">
              <input id="profileInput" placeholder="cust_..." className="flex-1 text-xs px-2 py-1" style={{background:'var(--bg)', border:'1px solid var(--line)', color:'var(--text-primary)'}} />
              <button onClick={()=>{
                const v=document.getElementById('profileInput').value.trim();
                if(v) navigate(`/customers/${v}`);
              }} className="text-xs px-3 py-1" style={{border:'1px solid var(--line)'}}>go</button>
            </div>
            <div className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>URL-synced: <span style={{color:'var(--text-primary)'}}>/customers/{'{id}'}</span> — shareable, back-button works. Also <span style={{color:'var(--text-primary)'}}>/profile/:id</span> alias.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
