export function queenslandDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function weekday(key) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(key+'T00:00:00Z');
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==key) return null;
  return date.getUTCDay();
}
export function requestError(date, time, now = new Date()) {
  const day=weekday(date);
  if(day===null || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Please choose a valid date and time.';
  if(new Date(`${date}T${time}:00+10:00`)<=now) return 'Please choose a future date and time in Queensland.';
  if(day>=2 && day<=5 && time<'17:00') return 'Tuesday to Friday appointments can be requested from 5 pm. Please choose an evening time.';
  return '';
}
