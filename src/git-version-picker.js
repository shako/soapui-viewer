// Searchable Git version picker. The hidden value is always an explicit choice;
// typing filters suggestions without changing the version used for comparison.
export function setupVersionPicker(side, onChange) {
  const $ = id => document.getElementById(id + '-' + side);
  const root = $('git-version'), input = $('git-query'), value = $('git'), list = $('git-options');
  let refs = [{ value: 'file', label: 'XML file' }], choices = [], opened = false, query = '', active = -1;
  let showMerged = false, baseRef = '', currentRef = '';
  const selected = () => refs.find(ref => ref.value === value.value);
  const available = ref => showMerged || !ref.merged || [baseRef, currentRef, value.value].includes(ref.value);
  const matching = () => refs.filter(ref => available(ref) && ref.label.toLowerCase().includes(query.trim().toLowerCase()));
  function summarize(matches = matching()) {
    const branchCount = matches.filter(ref => ref.value.startsWith('refs/')).length;
    const hiddenCount = refs.filter(ref => !available(ref)).length;
    $('git-matches').textContent = `Branches / tags: ${branchCount}${query ? ' matching' : ''}${hiddenCount ? ` · ${hiddenCount} merged hidden` : ''} · newest commit first · local time${query && !matches.some(ref => ref.value === value.value) ? '. Selected version unchanged.' : ''}`;
  }
  function close() {
    opened = false; list.hidden = true; query = '';
    input.value = selected()?.label || 'XML file';
    input.title = input.value;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    summarize();
  }
  function highlight() {
    for (const [i, node] of [...list.children].entries()) node.classList.toggle('active', i === active);
    if (choices[active]) {
      input.setAttribute('aria-activedescendant', `git-option-${side}-${active}`);
      list.children[active].scrollIntoView?.({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function choose(ref) {
    value.value = ref.value; close(); onChange();
  }
  function render() {
    choices = matching();
    list.replaceChildren();
    for (const [i, ref] of choices.entries()) {
      const row = document.createElement('div');
      row.id = `git-option-${side}-${i}`;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(ref.value === value.value));
      const name = document.createElement('span'); name.textContent = ref.label; row.append(name);
      if (ref.committedAt) {
        const date = new Date(ref.committedAt), info = document.createElement('small');
        info.textContent = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} · latest commit${ref.merged ? ' · merged' : ''}`;
        row.append(info);
      }
      row.addEventListener('mousedown', event => event.preventDefault());
      row.addEventListener('click', () => choose(ref));
      list.append(row);
    }
    if (!choices.length) { const empty = document.createElement('p'); empty.textContent = 'No matching versions'; list.append(empty); }
    summarize(choices);
    active = query ? (choices.length ? 0 : -1) : choices.findIndex(ref => ref.value === value.value);
    if (!opened) return;
    const rect = input.parentElement.getBoundingClientRect();
    const below = document.documentElement.clientHeight - rect.bottom - 8, above = rect.top - 8;
    const height = Math.min(280, Math.max(below, above));
    list.style.left = `${rect.left}px`; list.style.width = `${rect.width}px`; list.style.maxHeight = `${height}px`;
    list.style.top = below >= Math.min(280, above) ? `${rect.bottom + 2}px` : 'auto';
    list.style.bottom = list.style.top === 'auto' ? `${document.documentElement.clientHeight - rect.top + 2}px` : 'auto';
    list.hidden = false; highlight();
  }
  function open() {
    if (input.disabled || opened) return;
    opened = true; query = ''; input.setAttribute('aria-expanded', 'true'); render(); input.select();
  }
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', () => { opened = true; query = input.value; input.setAttribute('aria-expanded', 'true'); render(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); open();
      if (choices.length) active = (active + (event.key === 'ArrowDown' ? 1 : choices.length - 1) + choices.length) % choices.length;
      highlight();
    } else if (event.key === 'Enter' && opened) {
      event.preventDefault(); if (choices[active]) choose(choices[active]);
    }
  });
  $('git-toggle').addEventListener('mousedown', event => event.preventDefault());
  $('git-toggle').addEventListener('click', () => { if (opened) close(); else { input.focus(); open(); } });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
  document.addEventListener('focusin', event => { if (!root.contains(event.target)) close(); });
  document.addEventListener('scroll', event => { if (opened && !list.contains(event.target)) close(); }, true);
  document.defaultView.addEventListener('resize', close);
  return {
    update(context, includeMerged) {
      refs = context?.repository && side === 'before'
        ? context.refs.filter(ref => ref.value !== 'WORKTREE')
        : [{ value: 'file', label: 'XML file' }, ...context?.refs || []];
      showMerged = includeMerged; baseRef = context?.baseRef || ''; currentRef = `refs/heads/${context?.branch}`;
      close(); render();
    },
    setValue(next) { value.value = next; close(); render(); },
  };
}
