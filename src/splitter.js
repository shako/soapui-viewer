export function setupSplitter(workspace, splitter, navigator) {
  const storageKey = 'soapui-viewer-sidebar-width';
  let preferredWidth;
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (saved >= 280) preferredWidth = saved;
  } catch { /* Resizing still works when browser storage is unavailable. */ }
  const limits = () => ({ min: 280, max: Math.max(280, workspace.clientWidth - 290) });
  function apply(width) {
    const { min, max } = limits();
    width = Math.round(Math.max(min, Math.min(max, width)));
    workspace.style.setProperty('--sidebar-width', `${width}px`);
    splitter.setAttribute('aria-valuemin', min);
    splitter.setAttribute('aria-valuemax', max);
    splitter.setAttribute('aria-valuenow', width);
    splitter.setAttribute('aria-valuetext', `${width} pixels`);
    return width;
  }
  function save(width) {
    preferredWidth = width;
    try { localStorage.setItem(storageKey, String(width)); } catch { /* Optional preference. */ }
  }
  let pointer;
  let offset;
  splitter.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    offset = event.clientX - navigator.getBoundingClientRect().right;
    splitter.setPointerCapture(pointer);
    splitter.focus();
    document.body.classList.add('resizing');
  });
  splitter.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    apply(event.clientX - workspace.getBoundingClientRect().left - offset);
  });
  const finish = () => {
    if (pointer === undefined) return;
    pointer = undefined;
    document.body.classList.remove('resizing');
    save(navigator.getBoundingClientRect().width);
  };
  splitter.addEventListener('pointerup', finish);
  splitter.addEventListener('pointercancel', finish);
  splitter.addEventListener('lostpointercapture', finish);
  splitter.addEventListener('keydown', event => {
    const { min, max } = limits();
    let width = navigator.getBoundingClientRect().width;
    if (event.key === 'ArrowLeft') width -= event.shiftKey ? 80 : 20;
    else if (event.key === 'ArrowRight') width += event.shiftKey ? 80 : 20;
    else if (event.key === 'Home') width = min;
    else if (event.key === 'End') width = max;
    else return;
    event.preventDefault();
    save(apply(width));
  });
  new ResizeObserver(() => {
    if (matchMedia('(max-width: 760px)').matches) return;
    apply(preferredWidth ?? (workspace.clientWidth >= 1450 ? workspace.clientWidth * 0.3 : workspace.clientWidth * 0.35));
  }).observe(workspace);
}
