import { describe, it, expect, vi } from 'vitest';
import {
  getMonday, addDays, formatDateISO, parseISO, isSameDay, getWeekDays,
  timeToMinutes, minutesToTime, formatHour, formatTime12, labelForPrio, escapeHtml,
  layoutDayTodos
} from './utils.js';

describe('getMonday', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date(2026, 8, 9); // Sep 9 2026 is Wed
    const mon = getMonday(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(7);
  });
  it('returns Monday for a Sunday', () => {
    const sun = new Date(2026, 8, 13); // Sunday
    const mon = getMonday(sun);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(7);
  });
  it('returns same day if already Monday', () => {
    const mon = new Date(2026, 8, 7);
    const result = getMonday(mon);
    expect(result.getDate()).toBe(7);
    expect(result.getDay()).toBe(1);
  });
  it('zeros time', () => {
    const d = new Date(2026, 8, 9, 15, 30, 45);
    const mon = getMonday(d);
    expect(mon.getHours()).toBe(0);
    expect(mon.getMinutes()).toBe(0);
  });
});

describe('addDays', () => {
  it('adds days across month boundary', () => {
    const d = new Date(2026, 8, 30);
    const n = addDays(d, 2);
    expect(n.getDate()).toBe(2);
    expect(n.getMonth()).toBe(9);
  });
  it('does not mutate original', () => {
    const d = new Date(2026, 8, 10);
    const n = addDays(d, 5);
    expect(d.getDate()).toBe(10);
    expect(n.getDate()).toBe(15);
  });
});

describe('formatDateISO / parseISO', () => {
  it('roundtrips', () => {
    const d = new Date(2026, 0, 5);
    const iso = formatDateISO(d);
    expect(iso).toBe('2026-01-05');
    const parsed = parseISO(iso);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(5);
  });
});

describe('isSameDay', () => {
  it('same day different times', () => {
    const a = new Date(2026, 8, 10, 10, 0);
    const b = new Date(2026, 8, 10, 23, 59);
    expect(isSameDay(a, b)).toBe(true);
  });
  it('different days', () => {
    expect(isSameDay(new Date(2026,8,10), new Date(2026,8,11))).toBe(false);
  });
});

describe('getWeekDays', () => {
  it('returns 7 consecutive days from Monday', () => {
    const mon = new Date(2026, 8, 7);
    const days = getWeekDays(mon);
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(7);
    expect(days[6].getDate()).toBe(13);
  });
});

describe('time converters', () => {
  it('timeToMinutes', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
  it('minutesToTime', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(1439)).toBe('23:59');
  });
  it('roundtrip', () => {
    expect(minutesToTime(timeToMinutes('14:45'))).toBe('14:45');
  });
  it('formatHour', () => {
    expect(formatHour(0)).toBe('12 AM');
    expect(formatHour(9)).toBe('9 AM');
    expect(formatHour(12)).toBe('12 PM');
    expect(formatHour(15)).toBe('3 PM');
  });
  it('formatTime12', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('14:05')).toBe('2:05 PM');
    expect(formatTime12('09:30')).toBe('9:30 AM');
  });
});

describe('labelForPrio', () => {
  it('maps priorities', () => {
    expect(labelForPrio('super')).toBe('Super Urgent');
    expect(labelForPrio('kinda')).toBe('Kinda Urgent');
    expect(labelForPrio('chill')).toBe('Chill');
  });
});

describe('escapeHtml', () => {
  it('escapes special chars', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml("a & b")).toBe('a &amp; b');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });
});

describe('layoutDayTodos', () => {
  it('single event fills 100%', () => {
    const todos = [{ id: 'a', time: '10:00', duration: 60 }];
    const layout = layoutDayTodos(todos);
    expect(layout.get('a').width).toBe(100);
    expect(layout.get('a').left).toBe(0);
  });
  it('two non-overlapping events both 100% (reuses column)', () => {
    const todos = [
      { id: 'a', time: '10:00', duration: 60 },
      { id: 'b', time: '11:00', duration: 60 },
    ];
    const layout = layoutDayTodos(todos);
    expect(layout.get('a').width).toBe(100);
    expect(layout.get('b').width).toBe(100);
  });
  it('two overlapping events split 50/50', () => {
    const todos = [
      { id: 'a', time: '10:00', duration: 60 },
      { id: 'b', time: '10:30', duration: 60 },
    ];
    const layout = layoutDayTodos(todos);
    expect(layout.get('a').width).toBe(50);
    expect(layout.get('b').width).toBe(50);
    expect(layout.get('a').left).toBe(0);
    expect(layout.get('b').left).toBe(50);
  });
  it('three overlapping splits 33%', () => {
    const todos = [
      { id: 'a', time: '10:00', duration: 90 },
      { id: 'b', time: '10:15', duration: 60 },
      { id: 'c', time: '10:30', duration: 60 },
    ];
    const layout = layoutDayTodos(todos);
    expect(layout.get('a').width).toBeCloseTo(33.33, 1);
    expect(layout.get('c').totalCols).toBe(3);
  });
  it('clustered overlaps: a overlaps b, b overlaps c, but a not c – still handles', () => {
    const todos = [
      { id: 'a', time: '10:00', duration: 60 }, // 10-11
      { id: 'b', time: '10:30', duration: 60 }, // 10:30-11:30
      { id: 'c', time: '11:00', duration: 60 }, // 11-12 (overlaps b not a)
    ];
    const layout = layoutDayTodos(todos);
    // a and b overlap => 50%, b and c overlap => 50%
    // a should be 50, c should be 50 (reuses col 0)
    expect(layout.get('a').width).toBe(50);
    expect(layout.get('b').width).toBe(50);
    // c overlaps b, so also 50%
    expect(layout.get('c').width).toBe(50);
  });
});
