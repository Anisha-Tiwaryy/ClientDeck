export const TIER_STYLE = { Hot: 'bg-red-100 text-red-700', Warm: 'bg-amber-100 text-amber-700', Cold: 'bg-slate-200 text-slate-600' };
export const STAGES = ['New', 'Contacted', 'Qualified', 'Demo Scheduled', 'Demo Done', 'Proposal', 'Won', 'Lost'];

export function Tier({ tier }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[tier]}`}>{tier}</span>;
}
export function Card({ title, children, right }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {title && <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-800">{title}</h2>{right}</div>}
      {children}
    </section>
  );
}
export function Btn({ children, kind = 'primary', ...p }) {
  const k = kind === 'primary' ? 'bg-blue-700 text-white hover:bg-blue-800' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  return <button {...p} className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${k} ${p.className || ''}`}>{children}</button>;
}
export function ErrorLine({ error }) { return error ? <p className="text-sm text-red-600">{error}</p> : null; }
export const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const baseInput = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';
export const inputCls = `w-full ${baseInput}`;
