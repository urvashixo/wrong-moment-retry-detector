import React from 'react';
export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false, err:null};}
  static getDerivedStateFromError(err){ return {hasError:true, err};}
  componentDidCatch(err, info){ console.error('ErrorBoundary', err, info); }
  render(){
    if(this.state.hasError){
      return <div className="p-8" style={{background:'var(--bg)', color:'var(--heat-1)', border:'1px solid var(--line)'}}>
        <h2 className="text-sm tracking-widest">RENDER ERROR</h2>
        <pre className="mt-4 text-xs whitespace-pre-wrap" style={{color:'var(--text-dim)'}}>{String(this.state.err?.message||this.state.err)}</pre>
        <pre className="mt-2 text-[11px]" style={{color:'var(--text-dim)'}}>{String(this.state.err?.stack||'').slice(0,600)}</pre>
        <div className="mt-4 text-xs" style={{color:'var(--text-dim)'}}>Check console (F12) and restart dev server.</div>
      </div>
    }
    return this.props.children;
  }
}
