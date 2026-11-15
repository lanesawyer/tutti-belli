import { describe, it, expect, vi } from "vitest";
import {
  confirmMessageFor,
  guardSubmit,
  installConfirmHandler,
  type ConfirmableSubmitEvent,
} from "../../src/lib/confirm.ts";

function el(attrs: Record<string, string> = {}): EventTarget {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
  } as unknown as EventTarget;
}

function submitEvent(target: EventTarget | null, submitter: EventTarget | null = null) {
  return {
    target,
    submitter,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } satisfies ConfirmableSubmitEvent;
}

describe("confirmMessageFor", () => {
  it("prefers the submitter message over the form message", () => {
    const event = submitEvent(el({ "data-confirm": "form" }), el({ "data-confirm": "button" }));
    expect(confirmMessageFor(event)).toBe("button");
  });

  it("falls back to the form message", () => {
    expect(confirmMessageFor(submitEvent(el({ "data-confirm": "form" }), el()))).toBe("form");
  });

  it("returns null when nothing asks for confirmation", () => {
    expect(confirmMessageFor(submitEvent(el(), null))).toBeNull();
    expect(confirmMessageFor(submitEvent(null, null))).toBeNull();
  });
});

describe("guardSubmit", () => {
  it("passes names with quotes and markup to confirm verbatim", () => {
    const name = `O'Brien "</script><img src=x onerror=alert(1)>`;
    const message = `Delete user "${name}"? This cannot be undone.`;
    const confirmFn = vi.fn(() => true);
    const event = submitEvent(el(), el({ "data-confirm": message }));

    expect(guardSubmit(event, confirmFn)).toBe(true);
    expect(confirmFn).toHaveBeenCalledWith(message);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("blocks the submission when the confirm is cancelled", () => {
    const event = submitEvent(el(), el({ "data-confirm": "Delete?" }));

    expect(guardSubmit(event, () => false)).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
  });

  it("does not prompt for forms without data-confirm", () => {
    const confirmFn = vi.fn(() => false);
    const event = submitEvent(el(), el());

    expect(guardSubmit(event, confirmFn)).toBe(true);
    expect(confirmFn).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("installConfirmHandler", () => {
  it("listens for submit in the capture phase", () => {
    const addEventListener = vi.fn();
    installConfirmHandler({ addEventListener } as unknown as Document, () => true);

    expect(addEventListener).toHaveBeenCalledWith("submit", expect.any(Function), true);
  });
});
