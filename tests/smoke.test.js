import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('jsdom works', () => {
    document.body.innerHTML = '<div id="x">hi</div>';
    expect(document.getElementById('x').textContent).toBe('hi');
  });
});
