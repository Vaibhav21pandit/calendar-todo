export function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setHours(0, 0, 0, 0);
  date.setDate(diff);
  return date;
}
export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function formatMonthYear(d) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
export function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
export function parseISO(s) { const [y, m, da] = s.split('-').map(Number); return new Date(y, m - 1, da); }
export function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
export function isToday(d) { return isSameDay(d, new Date()); }
export function getWeekDays(start) { return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
export function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function minutesToTime(min) { const h = Math.floor(min / 60).toString().padStart(2, '0'); const m = (min % 60).toString().padStart(2, '0'); return `${h}:${m}`; }
export function formatHour(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}
export function uid() { return Math.random().toString(36).slice(2, 9); }
export function labelForPrio(p) {
  if (p === 'super') return 'Super Urgent';
  if (p === 'kinda') return 'Kinda Urgent';
  if (p === 'blocked') return 'Blocked';
  if (p === 'wontdo') return "Won't Do";
  return 'Chill';
}
export function formatTime12(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}
export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function getHeaderLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const sameYear = weekStart.getFullYear() === end.getFullYear();
  if (sameMonth) return formatMonthYear(weekStart);
  if (sameYear) return `${weekStart.toLocaleDateString('en-US', { month: 'long' })} – ${end.toLocaleDateString('en-US', { month: 'long' })} ${end.getFullYear()}`;
  return `${formatMonthYear(weekStart)} – ${formatMonthYear(end)}`;
}

export function getMiniCalendarCells(miniDate, weekStart, todos = []) {
  const year = miniDate.getFullYear();
  const month = miniDate.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDay + 1;
    let cellDate, other = false;
    if (dayNum < 1) { cellDate = new Date(year, month - 1, daysInPrev + dayNum); other = true; }
    else if (dayNum > daysInMonth) { cellDate = new Date(year, month + 1, dayNum - daysInMonth); other = true; }
    else { cellDate = new Date(year, month, dayNum); }
    const iso = formatDateISO(cellDate);
    const hasTodo = todos.some(t => t.date === iso);
    const inWeek = getWeekDays(weekStart).some(d => isSameDay(d, cellDate));
    const isTodayFlag = isToday(cellDate);
    cells.push({
      date: cellDate,
      iso,
      dayNum: cellDate.getDate(),
      other,
      hasTodo,
      inWeek,
      today: isTodayFlag,
    });
    if (i >= 35 && dayNum > daysInMonth && i % 7 === 6) break;
  }
  return cells;
}

/**
 * Layout overlapping events for a single day.
 * Returns map id -> { left, width, colIdx, totalCols }
 */
export function layoutDayTodos(dayTodos) {
  // dayTodos sorted by start time
  const sorted = [...dayTodos].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  let columns = [];
  const todoColMap = new Map();
  sorted.forEach(todo => {
    const start = timeToMinutes(todo.time);
    const end = start + todo.duration;
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      if (start >= columns[c]) {
        columns[c] = end;
        todoColMap.set(todo.id, c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      todoColMap.set(todo.id, columns.length);
      columns.push(end);
    }
  });

  const result = new Map();
  sorted.forEach(todo => {
    const start = timeToMinutes(todo.time);
    const end = start + todo.duration;
    const overlapping = sorted.filter(other => {
      const os = timeToMinutes(other.time);
      const oe = os + other.duration;
      return !(end <= os || start >= oe);
    });
    const colsUsed = new Set(overlapping.map(o => todoColMap.get(o.id)));
    const totalCols = colsUsed.size || 1;
    const colIdx = todoColMap.get(todo.id);
    const sortedCols = [...colsUsed].sort((a, b) => a - b);
    const posIdx = sortedCols.indexOf(colIdx);
    let left = (posIdx / totalCols) * 100;
    let width = 100 / totalCols;
    if (left + width > 100.1) {
      left = (colIdx % totalCols) / totalCols * 100;
      width = 100 / totalCols;
    }
    result.set(todo.id, { left, width, colIdx, totalCols });
  });
  return result;
}
