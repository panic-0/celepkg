import { describe, expect, it } from "vitest";
import { notifyError, notifyWarning, showErrorNotice } from "./notify";

describe("notify helpers", () => {
  it("normalizes unknown errors before sending error notifications", () => {
    const messages: string[] = [];

    notifyError({ showError: (message) => messages.push(message) }, new Error("失败"));
    notifyError({ showError: (message) => messages.push(message) }, {});

    expect(messages).toEqual(["失败", "操作失败。"]);
  });

  it("normalizes warning and notice messages", () => {
    const warnings: string[] = [];
    const notices: Array<[string, string]> = [];

    notifyWarning({ showWarning: (message) => warnings.push(message) }, "警告");
    showErrorNotice((tone, message) => notices.push([tone, message]), "错误");

    expect(warnings).toEqual(["警告"]);
    expect(notices).toEqual([["error", "错误"]]);
  });
});
