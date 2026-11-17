// Lead qualification: a BANT-style score out of 100 (Budget, Authority, Need,
// Timeline) plus fit, so reps know who to call first and why.
export function qualify(lead) {
  const reasons = [];
  let need = Math.min((lead.pain_points?.length || 0) * 10, 30);
  if (need) reasons.push(`${lead.pain_points.length} pain point(s) named (+${need})`);

  const budget = lead.budget_confirmed ? 20 : 0;
  if (budget) reasons.push('Budget confirmed (+20)');

  const authority = lead.is_decision_maker ? 20 : 0;
  if (authority) reasons.push('Talking to the decision maker (+20)');

  const t = lead.timeline_months;
  const timeline = t == null ? 0 : t <= 1 ? 20 : t <= 3 ? 12 : t <= 6 ? 6 : 0;
  if (timeline) reasons.push(`Plans to switch within ${t} month(s) (+${timeline})`);

  const size = lead.team_size || 0;
  let fit = size >= 5 && size <= 200 ? 6 : size > 0 ? 3 : 0;
  if (['Spreadsheets', 'Email and Excel', 'None'].includes(lead.current_tool)) fit += 4; // easiest switch
  if (fit) reasons.push(`Fit: ${size || '?'} recruiters, using ${lead.current_tool || 'unknown tool'} (+${fit})`);

  const score = need + budget + authority + timeline + fit;
  const tier = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold';
  return { score, tier, reasons, breakdown: { need, budget, authority, timeline, fit } };
}
