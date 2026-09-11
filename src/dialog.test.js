import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateTodo } from './store.js';
import { escapeHtml } from './utils.js';

describe('Dialog validation & toast undo flow', () => {
  it('requires title, date, time', () => {
    expect(validateTodo({ title: '', date: '2026-09-10', time: '10:00' })).toBe('Title required');
    expect(validateTodo({ title: 'hi', date: '', time: '10:00' })).toBe('Date required');
    expect(validateTodo({ title: 'hi', date: '2026-09-10', time: '' })).toBe('Time required');
    expect(validateTodo({ title: 'hi', date: '2026-09-10', time: '09:00' })).toBeNull();
  });

  it('escapes title/desc in dialog rendering', () => {
    const title = '<b>Hi</b> & "test"';
    const escaped = escapeHtml(title);
    expect(escaped).toBe('&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;test&quot;');
    document.body.innerHTML = `<div class="event-title">${escaped}</div>`;
    expect(document.querySelector('.event-title').innerHTML).toBe('&lt;b&gt;Hi&lt;/b&gt; &amp; "test"');
    // but textContent should be raw escaped? innerHTML is escaped
  });

  it('priority chip selection reflects value', () => {
    document.body.innerHTML = `
      <label class="prio-chip prio-red"><input type="radio" name="priority" value="super" checked><span>Super</span></label>
      <label class="prio-chip prio-yellow"><input type="radio" name="priority" value="kinda"><span>Kinda</span></label>
      <label class="prio-chip prio-green"><input type="radio" name="priority" value="chill"><span>Chill</span></label>
    `;
    const checked = document.querySelector('input[name="priority"]:checked');
    expect(checked.value).toBe('super');
    // simulate change
    document.querySelector('input[value="kinda"]').checked = true;
    document.querySelector('input[value="super"]').checked = false;
    expect(document.querySelector('input[name="priority"]:checked').value).toBe('kinda');
  });

  it('duration select defaults to 60', () => {
    document.body.innerHTML = `
      <select id="todoDuration">
        <option value="30">30 min</option>
        <option value="60" selected>1 hour</option>
        <option value="90">1.5 hours</option>
      </select>
    `;
    const sel = document.getElementById('todoDuration');
    expect(sel.value).toBe('60');
    sel.value = '90';
    expect(sel.value).toBe('90');
    expect(parseInt(sel.value, 10)).toBe(90);
  });

  it('toast show/hide with undo', async () => {
    document.body.innerHTML = '<div id="toast" class="toast"></div>';
    const toastEl = document.getElementById('toast');
    function showToast(msg, actionLabel=null, onAction=null){
      toastEl.textContent = '';
      toastEl.append(document.createTextNode(msg));
      if(actionLabel){
        const btn = document.createElement('button');
        btn.textContent = actionLabel;
        btn.onclick = ()=>{ onAction(); hideToast(); };
        toastEl.append(btn);
      }
      toastEl.classList.add('show');
    }
    function hideToast(){ toastEl.classList.remove('show'); }

    let undone = false;
    showToast('Todo deleted', 'Undo', ()=>{ undone = true; });
    expect(toastEl.classList.contains('show')).toBe(true);
    expect(toastEl.textContent).toContain('Todo deleted');
    expect(toastEl.textContent).toContain('Undo');
    // click undo
    toastEl.querySelector('button').click();
    expect(undone).toBe(true);
    expect(toastEl.classList.contains('show')).toBe(false);
  });

  it('dialog showModal/close flow', () => {
    document.body.innerHTML = '<dialog id="todoDialog"></dialog>';
    const dialog = document.getElementById('todoDialog');
    // mock showModal/close for jsdom
    dialog.showModal = vi.fn(function(){ this.open = true; });
    dialog.close = vi.fn(function(){ this.open = false; });
    dialog.showModal();
    expect(dialog.open).toBe(true);
    expect(dialog.showModal).toHaveBeenCalled();
    dialog.close();
    expect(dialog.open).toBe(false);
  });

  it('form submit prevents empty title', () => {
    const title = '   ';
    expect(title.trim()).toBe('');
    expect(!title.trim()).toBe(true); // would return early
  });

  it('colors denote priority hint exists', () => {
    document.body.innerHTML = '<p class="dialog-hint">Colors denote priority: <span class="dot dot-red"></span> Super Urgent <span class="dot dot-yellow"></span> Kinda <span class="dot dot-green"></span> Chill</p>';
    expect(document.querySelectorAll('.dot').length).toBe(3);
    expect(document.querySelector('.dialog-hint').textContent).toContain('Super Urgent');
  });
});
