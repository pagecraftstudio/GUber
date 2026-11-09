// jsdom has no <dialog>.showModal(): minimal stand-in so open/close and the cancel event can be tested.
export function polyfillDialog() {
  const P = window.HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  P.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  P.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
}
