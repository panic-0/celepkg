import { describe, expect, it } from "vitest";
import { notifyError, notifyWarning } from "./notify";

describe("notify helpers", () => {
  it("normalizes unknown errors before sending error notifications", () => {
    const messages: string[] = [];

    notifyError({ showError: (message) => messages.push(message) }, new Error("失败"));
    notifyError({ showError: (message) => messages.push(message) }, {});

    expect(messages).toEqual(["失败", "操作失败。"]);
  });

  it("normalizes warning messages", () => {
    const warnings: string[] = [];

    notifyWarning({ showWarning: (message) => warnings.push(message) }, "警告");

    expect(warnings).toEqual(["警告"]);
  });
});
