import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import './index.css';
import { getUser, logout } from './api.js';
import Login from './pages/Login.jsx';
import Today from './pages/Today.jsx';
import Pipeline from './pages/Pipeline.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import NewLead from './pages/NewLead.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Invoices from './pages/Invoices.jsx';

function Shell() {
  const user = getUser();
  const nav = useNavigate();
  if (!user) return <Navigate to="/login" replace />;
  const link = ({ isActive }) => `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`;
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
          <span className="mr-4 text-lg font-bold text-blue-800">ClientDeck</span>
          <NavLink to="/today" className={link}>Today</NavLink>
          <NavLink to="/pipeline" className={link}>Pipeline</NavLink>
          <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
          <NavLink to="/invoices" className={link}>Invoices</NavLink>
          <span className="ml-auto text-sm text-slate-500">{user.name} ({user.role})</span>
          <button className="text-sm text-slate-500 underline" onClick={() => { logout(); nav('/login'); }}>Log out</button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Shell />}>
          <Route path="/today" element={<Today />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/leads/new" element={<NewLead />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
