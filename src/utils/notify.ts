import type { AppNotifier } from "../types";
import { readError } from "./format";

export function notifyError(notifier: Pick<AppNotifier, "showError">, error: unknown) {
  notifier.showError(readError(error));
}

export function notifyWarning(notifier: Pick<AppNotifier, "showWarning">, error: unknown) {
  notifier.showWarning(readError(error));
}
