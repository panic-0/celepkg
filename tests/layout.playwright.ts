import { expect, test, type Page } from "@playwright/test";

const LONG_STATUS_TEXT = "正在检查 一个名字非常非常非常非常非常非常非常长的 Mod 的依赖...";

async function openMock(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 720 });
  await page.goto("/mock");
  await expect(page.locator(".app-toolbar")).toBeVisible();
  await expect(page.locator(".record-panel")).toBeVisible();
}

async function forceLongToolbarStatus(page: Page) {
  return page.locator(".brand-block span").evaluate((status, text) => {
    const toolbar = document.querySelector(".app-toolbar");
    const beforeHeight = toolbar?.getBoundingClientRect().height ?? 0;
    status.textContent = text;
    status.setAttribute("title", text);
    status.setAttribute("aria-label", text);
    const style = getComputedStyle(status);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const rect = status.getBoundingClientRect();
    const afterHeight = toolbar?.getBoundingClientRect().height ?? 0;

    return {
      afterHeight,
      beforeHeight,
      clientWidth: status.clientWidth,
      height: rect.height,
      lineHeight,
      overflow: style.overflow,
      scrollWidth: status.scrollWidth,
      textOverflow: style.textOverflow,
      title: status.getAttribute("title"),
      ariaLabel: status.getAttribute("aria-label"),
      whiteSpace: style.whiteSpace
    };
  }, LONG_STATUS_TEXT);
}

test("toolbar status stays on one line and keeps full text metadata", async ({ page }) => {
  await openMock(page);

  const connectedStatus = await page.locator(".brand-block span").evaluate((status) => {
    const style = getComputedStyle(status);
    const rect = status.getBoundingClientRect();
    return {
      height: rect.height,
      lineHeight: Number.parseFloat(style.lineHeight),
      text: status.textContent?.trim(),
      title: status.getAttribute("title"),
      ariaLabel: status.getAttribute("aria-label"),
      whiteSpace: style.whiteSpace
    };
  });

  expect(connectedStatus.text).toBe("已连接 Celeste");
  expect(connectedStatus.title).toBe("已连接 Celeste");
  expect(connectedStatus.ariaLabel).toBe("已连接 Celeste");
  expect(connectedStatus.whiteSpace).toBe("nowrap");
  expect(connectedStatus.height).toBeLessThanOrEqual(connectedStatus.lineHeight + 2);

  const longStatus = await forceLongToolbarStatus(page);
  expect(longStatus.title).toBe(LONG_STATUS_TEXT);
  expect(longStatus.ariaLabel).toBe(LONG_STATUS_TEXT);
  expect(longStatus.whiteSpace).toBe("nowrap");
  expect(longStatus.overflow).toBe("hidden");
  expect(longStatus.textOverflow).toBe("ellipsis");
  expect(longStatus.height).toBeLessThanOrEqual(longStatus.lineHeight + 2);
  expect(longStatus.scrollWidth).toBeGreaterThan(longStatus.clientWidth);
  expect(longStatus.afterHeight).toBeLessThanOrEqual(longStatus.beforeHeight + 1);
});

test("record table columns remain ordered without cell overlap", async ({ page }) => {
  await openMock(page);

  const tableLayout = await page.locator(".record-table").evaluate((table) => {
    const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.getBoundingClientRect());
    const firstRowCells = Array.from(table.querySelectorAll("tbody tr:first-child td")).map((cell) => cell.getBoundingClientRect());
    const scroll = document.querySelector(".record-table-scroll");

    function hasOverlap(rects: DOMRect[]) {
      return rects.some((rect, index) => index > 0 && rect.left < rects[index - 1].right - 1);
    }

    return {
      headerCount: headers.length,
      rowCellCount: firstRowCells.length,
      headerOverlap: hasOverlap(headers),
      rowOverlap: hasOverlap(firstRowCells),
      scrollClientWidth: scroll?.clientWidth ?? 0,
      scrollWidth: scroll?.scrollWidth ?? 0,
      tableWidth: table.getBoundingClientRect().width
    };
  });

  expect(tableLayout.headerCount).toBeGreaterThanOrEqual(7);
  expect(tableLayout.rowCellCount).toBeGreaterThanOrEqual(7);
  expect(tableLayout.headerOverlap).toBe(false);
  expect(tableLayout.rowOverlap).toBe(false);
  expect(tableLayout.scrollWidth).toBeGreaterThanOrEqual(tableLayout.scrollClientWidth);
  expect(tableLayout.tableWidth).toBeGreaterThan(0);
});

test("detail dependency panel shows dependency and reverse dependency areas", async ({ page }) => {
  await openMock(page);
  await page.locator("tbody tr", { hasText: "Galactica" }).click();
  await page.getByRole("tab", { name: "依赖/文件" }).click();

  await expect(page.locator(".detail-tab-panel")).toContainText("依赖");
  await expect(page.locator(".detail-tab-panel")).toContainText("被依赖");
  await expect(page.locator(".detail-tab-panel")).toContainText("被可选依赖");
  await expect(page.locator(".dependency-list").first()).toBeVisible();

  const dependencyLayout = await page.locator(".detail-tab-panel").evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    const dependencyLists = Array.from(panel.querySelectorAll(".dependency-list")).map((list) => list.getBoundingClientRect());
    const chips = Array.from(panel.querySelectorAll(".dependency-list .ui-chip")).map((chip) => chip.getBoundingClientRect());
    return {
      chipCount: chips.length,
      listCount: dependencyLists.length,
      listsWithinPanel: dependencyLists.every((rect) => rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1),
      visibleChips: chips.every((rect) => rect.width > 0 && rect.height > 0)
    };
  });

  expect(dependencyLayout.listCount).toBeGreaterThan(0);
  expect(dependencyLayout.chipCount).toBeGreaterThan(0);
  expect(dependencyLayout.listsWithinPanel).toBe(true);
  expect(dependencyLayout.visibleChips).toBe(true);
});

for (const width of [1180, 760]) {
  test(`responsive layout avoids page overflow at ${width}px`, async ({ page }) => {
    await openMock(page, width);

    const beforeStatus = await page.locator(".app-toolbar").evaluate((toolbar) => toolbar.getBoundingClientRect().height);
    const longStatus = await forceLongToolbarStatus(page);
    const pageLayout = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      toolbarWidth: document.querySelector(".app-toolbar")?.getBoundingClientRect().width ?? 0,
      workspaceWidth: document.querySelector(".workspace")?.getBoundingClientRect().width ?? 0
    }));

    expect(longStatus.afterHeight).toBeLessThanOrEqual(beforeStatus + 1);
    expect(longStatus.height).toBeLessThanOrEqual(longStatus.lineHeight + 2);
    expect(pageLayout.documentScrollWidth).toBeLessThanOrEqual(pageLayout.viewportWidth + 1);
    expect(pageLayout.bodyScrollWidth).toBeLessThanOrEqual(pageLayout.viewportWidth + 1);
    expect(pageLayout.toolbarWidth).toBeLessThanOrEqual(pageLayout.viewportWidth + 1);
    expect(pageLayout.workspaceWidth).toBeLessThanOrEqual(pageLayout.viewportWidth + 1);
  });
}
