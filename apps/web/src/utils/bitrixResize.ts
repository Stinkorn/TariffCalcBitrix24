/** Sends the current React document height to the Bitrix24 placement shell. */
export function sendResizeToBitrix() {
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  );

  window.parent?.postMessage(
    {
      type: 'tariffcalc:resize',
      height
    },
    '*'
  );
}
