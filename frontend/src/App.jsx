import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import FeedPage from './pages/FeedPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import DiffPage from './pages/DiffPage.jsx';
import ABPage from './pages/ABPage.jsx';
import ProfileRoute from './pages/ProfileRoute.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

function Navbar(){
  const linkStyle = ({isActive}) => ({
    border: '1px solid var(--line)',
    background: isActive ? 'var(--panel)' : 'transparent',
    color: isActive ? 'var(--text-primary)' : 'var(--text-dim)',
    padding: '4px 10px',
    fontSize: '11px',
  });
  return (
    <header className="sticky top-0 z-40 backdrop-blur" style={{background:'rgba(10,10,10,0.9)', borderBottom:'1px solid var(--line)'}}>
      <div className="max-w-[1160px] mx-auto px-6 h-[48px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs tracking-widest" style={{color:'var(--text-dim)'}}>
          <NavLink to="/" className="bracket" style={{color:'var(--text-primary)', borderColor:'var(--line)', textDecoration:'none'}}>[ WRONG MOMENT ]</NavLink>
          <span className="hidden sm:inline">liquidity window detector</span>
        </div>
        <nav className="flex items-center gap-2">
          <NavLink to="/feed" style={linkStyle}>[ feed ]</NavLink>
          <NavLink to="/review" style={linkStyle}>[ needs review ]</NavLink>
          <NavLink to="/diff" style={linkStyle}>[ diff ]</NavLink>
          <NavLink to="/ab" style={linkStyle}>[ A/B ]</NavLink>
          <span className="hidden lg:inline text-[11px] ml-2" style={{color:'var(--text-dim)'}}>deterministic decides · LLM explains</span>
        </nav>
      </div>
    </header>
  );
}

function Footer(){
  return (
    <footer className="max-w-[1160px] mx-auto px-6 mt-12 py-8" style={{borderTop:'1px solid var(--line)', color:'var(--text-dim)'}}>
      <div className="flex flex-col md:flex-row justify-between gap-4 text-xs">
        <div>
          <div style={{color:'var(--text-primary)'}}>wrong moment retry detector — Track 03 AI Revenue Recovery</div>
          <div className="mt-1 max-w-[60ch]">Learns each customer’s personal liquidity window and retries there. Deterministic model decides WHEN; Groq only explains.</div>
        </div>
        <div className="text-[11px] space-y-1">
          <div>built for hackathon · deterministic · auditable</div>
          <div>timestamps stored UTC, displayed IST</div>
        </div>
      </div>
    </footer>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div className="min-h-screen" style={{background:'var(--bg)', color:'var(--text-primary)'}}>
          <Navbar />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/diff" element={<DiffPage />} />
            <Route path="/ab" element={<ABPage />} />
            <Route path="/profile/:customerId" element={<ProfileRoute />} />
            <Route path="/customers/:customerId" element={<ProfileRoute />} />
            <Route path="*" element={<LandingPage />} />
          </Routes>
          <Footer />
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
