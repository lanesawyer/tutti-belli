export interface ConfirmableSubmitEvent {
  target: EventTarget | null;
  submitter?: EventTarget | null;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

export type ConfirmFn = (message: string) => boolean;

function confirmAttribute(el: EventTarget | null | undefined): string | null {
  if (!el || typeof (el as Element).getAttribute !== "function") return null;
  return (el as Element).getAttribute("data-confirm");
}

export function confirmMessageFor(event: ConfirmableSubmitEvent): string | null {
  return confirmAttribute(event.submitter) ?? confirmAttribute(event.target);
}

export function guardSubmit(event: ConfirmableSubmitEvent, confirmFn: ConfirmFn): boolean {
  const message = confirmMessageFor(event);
  if (message === null || confirmFn(message)) return true;
  event.preventDefault();
  event.stopImmediatePropagation();
  return false;
}

// Capture phase so a cancelled confirm wins over ClientRouter's own submit listener on document.
export function installConfirmHandler(
  doc: Pick<Document, "addEventListener">,
  confirmFn: ConfirmFn,
): void {
  doc.addEventListener("submit", (event) => guardSubmit(event as SubmitEvent, confirmFn), true);
}
