/**
 * Dev-only state switcher: keys + a small collapsible strip.
 * Tooling, not product — styled plainly so nobody mistakes it for game UI.
 */
export interface DevState { key: string; id: string; label: string }

export function devbar(states: DevState[], onPick: (id: string) => void, opts: { collapsed?: boolean } = {}) {
  const bar = document.createElement('div');
  bar.style.cssText = `position:fixed;left:0;right:0;top:0;z-index:100;display:flex;flex-wrap:wrap;gap:2px;padding:2px;
    font:11px ui-monospace,monospace;background:#0e0a1acc;color:#a69cc9;`;
  const toggle = document.createElement('button');
  toggle.textContent = 'DEV';
  const btnCss = 'font:inherit;color:#f4ecd6;background:#2e2350;border:1px solid #463a6e;padding:3px 5px;cursor:pointer;';
  toggle.style.cssText = btnCss + 'background:#5a1f33;';
  bar.appendChild(toggle);
  const buttons = new Map<string, HTMLButtonElement>();
  for (const s of states) {
    const b = document.createElement('button');
    b.textContent = `${s.key} ${s.label}`;
    b.style.cssText = btnCss;
    b.onclick = (e) => { e.stopPropagation(); onPick(s.id); };
    bar.appendChild(b);
    buttons.set(s.id, b);
  }
  let collapsed = opts.collapsed ?? false;
  const apply = () => {
    for (const b of buttons.values()) b.style.display = collapsed ? 'none' : '';
    bar.style.right = collapsed ? 'auto' : '0';
  };
  toggle.onclick = (e) => { e.stopPropagation(); collapsed = !collapsed; apply(); };
  apply();
  document.body.appendChild(bar);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === '`') { collapsed = !collapsed; apply(); return; }
    const s = states.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (s) onPick(s.id);
  });
  return {
    mark(id: string) {
      for (const [k, b] of buttons) b.style.background = k === id ? '#c4304f' : '#2e2350';
    },
  };
}
