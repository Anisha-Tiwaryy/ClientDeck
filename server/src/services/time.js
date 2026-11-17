// Time zone helpers built on Intl, so daylight saving is handled correctly.
export const IST = 'Asia/Kolkata';
export const CALL_START_HOUR = 10;
export const CALL_END_HOUR = 17;

function parts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, weekday: p.weekday };
}

// Minutes the zone is ahead of UTC at a given instant.
export function offsetMinutes(date, timeZone) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

// The UTC instant for a wall-clock time in a zone.
export function zonedTime(y, m, d, h, min, timeZone) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const off = offsetMinutes(guess, timeZone);
  const t = new Date(guess.getTime() - off * 60000);
  const off2 = offsetMinutes(t, timeZone);
  return off2 === off ? t : new Date(guess.getTime() - off2 * 60000);
}

export function formatIn(date, timeZone) {
  const p = parts(date, timeZone);
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}

export function isWeekend(date, timeZone) {
  return ['Sat', 'Sun'].includes(parts(date, timeZone).weekday);
}

// Is it inside the lead's 10:00-17:00 local calling window (weekdays) right now?
export function inCallWindow(date, timeZone) {
  const p = parts(date, timeZone);
  return !isWeekend(date, timeZone) && p.h >= CALL_START_HOUR && p.h < CALL_END_HOUR;
}

// The lead's calling window on a given local date, shown in their time and in IST.
export function callWindow(date, timeZone) {
  const p = parts(date, timeZone);
  const start = zonedTime(p.y, p.m, p.d, CALL_START_HOUR, 0, timeZone);
  const end = zonedTime(p.y, p.m, p.d, CALL_END_HOUR, 0, timeZone);
  return { start, end, local: `${CALL_START_HOUR}:00-${CALL_END_HOUR}:00`, ist: `${formatIn(start, IST)}-${formatIn(end, IST)} IST` };
}

// First weekday slot at `hour` local time that is on or after `from` + `days` days.
export function nextLocalSlot(from, days, timeZone, hour = CALL_START_HOUR) {
  const earliest = new Date(from.getTime() + days * 86400000);
  let t = earliest;
  for (let i = 0; i < 10; i++) {
    const p = parts(t, timeZone);
    const slot = zonedTime(p.y, p.m, p.d, hour, 0, timeZone);
    if (slot >= earliest && !isWeekend(slot, timeZone)) return slot;
    t = new Date(t.getTime() + 86400000);
  }
  throw new Error('no slot found');
}
