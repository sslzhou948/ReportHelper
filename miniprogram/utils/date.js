function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDate(input) {
  if (input instanceof Date) return input;
  return new Date(`${input}T00:00:00`);
}

function formatDate(input) {
  const d = toDate(input);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatCnDate(input) {
  const d = toDate(input);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function formatMonthDay(input) {
  const d = toDate(input);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  const day = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / day);
}

function relativeFromToday(input, todayInput) {
  const today = todayInput ? toDate(todayInput) : new Date();
  const diff = daysBetween(formatDate(input), formatDate(today));
  if (diff === 0) return '今天';
  if (diff > 0) return `${diff} 天前`;
  const abs = Math.abs(diff);
  if (abs <= 30) return `${abs} 天后`;
  return `${Math.round(abs / 30)} 月后`;
}

function addDays(input, days) {
  const d = toDate(input);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

module.exports = {
  formatDate,
  formatCnDate,
  formatMonthDay,
  addDays,
  daysBetween,
  relativeFromToday
};
