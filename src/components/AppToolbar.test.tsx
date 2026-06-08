import { describe, expect, it } from "vitest";
import { gameStatusText } from "../utils/gameStatusText";

describe("game status toolbar text", () => {
  it("maps startup phases to user-facing labels", () => {
    expect(gameStatusText("steamStarting", "", true)).toBe("Steam 正在启动 Celeste");
    expect(gameStatusText("processStarting", "", true)).toBe("Celeste 正在启动");
    expect(gameStatusText("everestPreparing", "Everest 正在加载 Mod 12/87", true)).toBe("Everest 正在加载 Mod 12/87");
    expect(gameStatusText("running", "", true)).toBe("Celeste 正在运行");
    expect(gameStatusText("idle", "", true)).toBe("已连接 Celeste");
    expect(gameStatusText("idle", "", false)).toBe("等待目录");
  });
});
