/** Sends the current React document height to the Bitrix24 placement shell. */
export function sendResizeToBitrix() {
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );
  // Never derive iframe width from content overflow: it would create a
  // feedback loop where each resize makes the next document wider.
  const width = Math.max(
    1,
    Math.floor(document.documentElement.clientWidth || window.innerWidth || 1)
  );

  if (window.BX24 && typeof window.BX24.resizeWindow === 'function') {
    window.BX24.resizeWindow(width, height);
    return;
  }

  if (window.parent !== window) {
    window.parent.postMessage(
      {
        type: 'tariffcalc:resize',
        height
      },
      '*'
    );
  }
}
