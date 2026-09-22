/** Sends the current React document height to the Bitrix24 placement shell. */
export function sendResizeToBitrix() {
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );
  const width = Math.max(
    document.documentElement.scrollWidth,
    document.body?.scrollWidth ?? 0
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
