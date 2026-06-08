import { expect, test, type Locator, type Page } from "@playwright/test";

async function openMock(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/mock");
  await expect(page.locator(".app-toolbar")).toBeVisible();
  await expect(page.locator(".record-panel")).toBeVisible();
}

async function openNav(page: Page, name: string) {
  await page.locator(".workspace-nav").getByRole("button", { name, exact: true }).click();
}

function profileColumn(page: Page, title: string) {
  return page.locator(".profile-editor").filter({ has: page.locator(".panel-title", { hasText: title }) });
}

async function createEmptyProfile(column: Locator, nameLabel: string, profileName: string) {
  await column.getByLabel(nameLabel).fill(profileName);
  await column.getByRole("button", { name: "新建空 Profile" }).click();
  await expect(column.locator(".profile-row.active")).toContainText(profileName);
}

test("profile manager creates, clones, renames, and applies mock profiles", async ({ page }) => {
  await openMock(page);
  await openNav(page, "Profile");

  const mapColumn = profileColumn(page, "地图 Profile");
  const modColumn = profileColumn(page, "其他 Mod Profile");

  await createEmptyProfile(mapColumn, "新建地图 Profile 名称", "回归地图 Profile");
  await createEmptyProfile(modColumn, "新建 Mod Profile 名称", "回归 Mod Profile");

  const activeMapRow = mapColumn.locator(".profile-row.active");
  await activeMapRow.getByTitle("克隆 Profile").click();
  await expect(mapColumn.locator(".profile-row.active")).toContainText("回归地图 Profile Clone");

  await mapColumn.locator(".profile-row.active").getByTitle("重命名 Profile").click();
  await mapColumn.locator(".profile-row.active").getByRole("textbox").fill("回归地图重命名");
  await mapColumn.locator(".profile-row.active").getByTitle("保存名称").click();
  await expect(mapColumn.locator(".profile-row.active")).toContainText("回归地图重命名");

  await page.getByRole("button", { name: "应用当前" }).click();
  await expect(page.getByText("已应用地图和 Mod Profile。")).toBeVisible();
});

test("profile manager keeps manually selected profiles before apply", async ({ page }) => {
  await openMock(page);
  await openNav(page, "Profile");

  const mapColumn = profileColumn(page, "地图 Profile");
  const modColumn = profileColumn(page, "其他 Mod Profile");

  await createEmptyProfile(mapColumn, "新建地图 Profile 名称", "切换地图 Profile");
  await createEmptyProfile(modColumn, "新建 Mod Profile 名称", "切换 Mod Profile");

  await mapColumn.locator(".profile-row", { hasText: "主线推进" }).first().locator("button.profile").click();
  await modColumn.locator(".profile-row", { hasText: "常用工具" }).first().locator("button.profile").click();

  await expect(mapColumn.locator(".profile-row.active")).toContainText("主线推进");
  await expect(modColumn.locator(".profile-row.active")).toContainText("常用工具");
  await page.waitForTimeout(500);
  await expect(mapColumn.locator(".profile-row.active")).toContainText("主线推进");
  await expect(modColumn.locator(".profile-row.active")).toContainText("常用工具");

  await page.getByRole("button", { name: "应用当前" }).click();
  await expect(page.getByText("已应用地图和 Mod Profile。")).toBeVisible();
});

test("profile manager keeps selection when deleting another profile", async ({ page }) => {
  await openMock(page);
  await openNav(page, "Profile");

  const mapColumn = profileColumn(page, "地图 Profile");
  await createEmptyProfile(mapColumn, "新建地图 Profile 名称", "保留选中 Profile");
  await createEmptyProfile(mapColumn, "新建地图 Profile 名称", "待删除 Profile");

  await mapColumn.locator(".profile-row", { hasText: "保留选中 Profile" }).first().locator("button.profile").click();
  await expect(mapColumn.locator(".profile-row.active")).toContainText("保留选中 Profile");

  await mapColumn.locator(".profile-row", { hasText: "待删除 Profile" }).first().getByTitle("删除 Profile").click();
  const deleteDialog = page.locator(".confirm-dialog", { hasText: "确认删除 Profile" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "删除" }).click();

  await expect(mapColumn.locator(".profile-row", { hasText: "待删除 Profile" })).toHaveCount(0);
  await expect(mapColumn.locator(".profile-row.active")).toContainText("保留选中 Profile");
});

test("profile draft shortcuts undo and redo local edits", async ({ page }) => {
  await openMock(page);
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Galactica");

  const row = page.locator("tbody tr", { hasText: "Galactica" });
  await expect(row).toHaveCount(1);
  const initialTitle = (await row.getByTitle("禁用地图").isVisible()) ? "禁用地图" : "启用地图";
  const toggledTitle = initialTitle === "禁用地图" ? "启用地图" : "禁用地图";
  await row.getByTitle(initialTitle).click();
  await expect(row.getByTitle(toggledTitle)).toBeVisible();
  await page.waitForTimeout(400);

  await page.keyboard.press("Control+Z");
  await expect(row.getByTitle(initialTitle)).toBeVisible();

  await page.keyboard.press("Control+Y");
  await expect(row.getByTitle(toggledTitle)).toBeVisible();

  const bulkAction = toggledTitle === "禁用地图" ? "禁用当前结果" : "启用当前结果";
  const afterBulkTitle = toggledTitle === "禁用地图" ? "启用地图" : "禁用地图";
  await page.getByRole("button", { name: bulkAction }).click();
  const bulkDialog = page.locator(".confirm-dialog", { hasText: `确认${bulkAction.replace("当前结果", "当前结果")}` });
  await expect(bulkDialog).toBeVisible();
  await bulkDialog.getByRole("button", { name: bulkAction }).click();
  await expect(row.getByTitle(afterBulkTitle)).toBeVisible();

  await page.keyboard.press("Control+Z");
  await expect(row.getByTitle(toggledTitle)).toBeVisible();

  await page.keyboard.press("Control+Shift+Z");
  await expect(row.getByTitle(afterBulkTitle)).toBeVisible();

  await openNav(page, "Profile");
  const launchArgs = page.getByLabel("启动参数");
  await launchArgs.fill("");
  await launchArgs.click();
  await page.keyboard.type("-console");
  await expect(launchArgs).toHaveValue("-console");
  await page.keyboard.press("Control+Z");
  await expect(page.getByLabel("启动参数")).toBeFocused();

  await page
    .locator(".workspace-nav")
    .getByRole("button", { name: /本地内容/ })
    .click();
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Galactica");
  await expect(page.locator("tbody tr", { hasText: "Galactica" }).getByTitle(afterBulkTitle)).toBeVisible();
});

test("workspace navigation groups content around profile state", async ({ page }) => {
  await openMock(page);

  const nav = page.locator(".workspace-nav");
  await expect(nav.getByText("内容管理")).toBeVisible();
  await expect(nav.getByText("获取与安装")).toBeVisible();
  await expect(nav.getByText("维护")).toBeVisible();
  await expect(nav.locator(".nav-profile-summary")).toContainText("依赖 Mod");
  await expect(nav.locator(".nav-profile-summary")).toContainText("推导依赖");
  await expect(nav.getByRole("button", { name: "地图", exact: true })).toHaveCount(0);

  const profileSummaryPlacement = await nav.evaluate((navElement) => {
    const profileButton = Array.from(navElement.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Profile");
    const profileSummary = navElement.querySelector(".nav-profile-summary");
    const installHeading = Array.from(navElement.querySelectorAll(".nav-section-title")).find(
      (heading) => heading.textContent?.trim() === "获取与安装"
    );
    if (!profileButton || !profileSummary || !installHeading) throw new Error("Navigation profile placement targets are missing");
    return {
      profileButtonBottom: profileButton.getBoundingClientRect().bottom,
      profileSummaryTop: profileSummary.getBoundingClientRect().top,
      profileSummaryBottom: profileSummary.getBoundingClientRect().bottom,
      installHeadingTop: installHeading.getBoundingClientRect().top
    };
  });

  expect(profileSummaryPlacement.profileSummaryTop).toBeGreaterThanOrEqual(profileSummaryPlacement.profileButtonBottom - 1);
  expect(profileSummaryPlacement.profileSummaryBottom).toBeLessThanOrEqual(profileSummaryPlacement.installHeadingTop + 1);

  const profileSummaryMetrics = await nav.locator(".nav-profile-summary").evaluate((summary) => {
    const badges = Array.from(summary.querySelectorAll(".nav-summary-badge")).map((badge) => badge.getBoundingClientRect().width);
    const names = Array.from(summary.querySelectorAll(".nav-summary-name")).map((name) =>
      Number.parseFloat(getComputedStyle(name).fontSize)
    );
    const rightColumnAligned = Array.from(summary.querySelectorAll(".nav-summary-item")).every((row) => {
      const badge = row.querySelector(".nav-summary-badge")?.getBoundingClientRect();
      const note = row.querySelector("small")?.getBoundingClientRect();
      if (!badge || !note) return false;
      const badgeCenter = badge.left + badge.width / 2;
      const noteCenter = note.left + note.width / 2;
      return Math.abs(badgeCenter - noteCenter) <= 1;
    });
    const internalBorders = Array.from(summary.querySelectorAll(".nav-summary-item")).map((row) => getComputedStyle(row).borderTopWidth);
    return { badgeWidths: badges, nameFontSizes: names, rightColumnAligned, internalBorders };
  });
  expect(new Set(profileSummaryMetrics.badgeWidths).size).toBe(1);
  expect(Math.min(...profileSummaryMetrics.nameFontSizes)).toBeGreaterThanOrEqual(13);
  expect(profileSummaryMetrics.rightColumnAligned).toBe(true);
  expect(profileSummaryMetrics.internalBorders.every((width) => width === "0px")).toBe(true);

  const localContentNav = nav.getByRole("button", { name: /本地内容/ });
  const navBadgeAlignment = await nav.evaluate((navElement) => {
    const localBadge = navElement.querySelector(".nav-count")?.getBoundingClientRect();
    const profileBadges = Array.from(navElement.querySelectorAll(".nav-summary-badge")).map((badge) => badge.getBoundingClientRect());
    if (!localBadge || profileBadges.length === 0) return false;
    const localCenter = localBadge.left + localBadge.width / 2;
    return profileBadges.every((badge) => Math.abs(localCenter - (badge.left + badge.width / 2)) <= 1);
  });
  expect(navBadgeAlignment).toBe(true);
  await expect(localContentNav).toHaveClass(/active/);
  await page.locator(".record-view-switch").getByRole("button", { name: "其他 Mod", exact: true }).click();
  await expect(localContentNav).toHaveClass(/active/);
  await localContentNav.click();
  await expect(page.locator(".record-view-switch").getByRole("button", { name: "其他 Mod", exact: true })).toHaveClass(/active/);

  await openNav(page, "Mod 获取");
  await expect(page.getByRole("heading", { name: "Mod 获取" })).toBeVisible();
});

test("catalog install flow previews dependencies and queues the mock task", async ({ page }) => {
  await openMock(page);
  await openNav(page, "Mod 获取");

  await page.getByPlaceholder("搜索 Mod、地图、Helper").fill("Everest Gate");
  const entry = page.locator(".catalog-row", { hasText: "Everest Gate" }).first();
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "安装" }).click();

  const previewDialog = page.locator(".confirm-dialog", { hasText: "安装前依赖预览" });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog.locator(".dependency-tree")).toContainText("EverestCore");
  await expect(previewDialog.locator(".dependency-tree")).toContainText("CommunalHelper");
  await previewDialog.getByRole("button", { name: "继续安装" }).click();

  await expect(page.locator(".catalog-download-summary")).toContainText("队列");
  await openNav(page, "下载管理");
  await expect(page.locator(".download-task-panel")).toContainText("Everest Gate");
});

test("catalog rows keep mod names prominent and compact", async ({ page }) => {
  await openMock(page);
  await page.getByRole("button", { name: "其他 Mod", exact: true }).click();
  const localModTitleWeight = await page
    .locator(".mod-table .name-cell strong")
    .first()
    .evaluate((title) => getComputedStyle(title).fontWeight);

  await openNav(page, "Mod 获取");

  const entry = page.locator(".catalog-row", { hasText: "Everest Gate" }).first();
  const title = entry.locator(".catalog-row-title");
  await expect(entry).toBeVisible();
  await expect(title).toContainText("Everest Gate");

  const metrics = await entry.evaluate((row) => {
    const titleElement = row.querySelector<HTMLElement>(".catalog-row-title");
    const chipElement = row.querySelector<HTMLElement>(".catalog-row-chip");
    if (!titleElement || !chipElement) throw new Error("Catalog row style targets are missing");
    const titleStyle = getComputedStyle(titleElement);
    const chipStyle = getComputedStyle(chipElement);
    return {
      chipRadius: chipStyle.borderRadius,
      rowHeight: row.getBoundingClientRect().height,
      titleFontSize: Number.parseFloat(titleStyle.fontSize),
      titleFontWeight: titleStyle.fontWeight,
      titleRadius: titleStyle.borderRadius,
      chipFontSize: Number.parseFloat(chipStyle.fontSize)
    };
  });

  expect(metrics.titleFontSize).toBeGreaterThan(metrics.chipFontSize);
  expect(metrics.titleFontWeight).toBe(localModTitleWeight);
  expect(metrics.titleRadius).not.toBe(metrics.chipRadius);
  expect(metrics.rowHeight).toBeLessThanOrEqual(66);
});

test("mock dependency tree update opens the tree preview", async ({ page }) => {
  await openMock(page);
  await page.getByRole("button", { name: "其他 Mod", exact: true }).click();
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Dependency Tree");
  await page.getByRole("button", { name: "检查更新" }).click();
  await expect(page.getByText(/发现 \d+ 个可更新 Mod/)).toBeVisible({ timeout: 5000 });

  const rootRow = page.locator("tbody tr", { hasText: "Mock Dependency Tree Root" });
  await expect(rootRow).toHaveCount(1);
  await rootRow.getByRole("button", { name: "更新" }).click();

  const previewDialog = page.locator(".confirm-dialog", { hasText: "更新前依赖预览" });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog.locator(".dependency-tree")).toContainText("Mock Dependency Tree Outdated");
  await expect(previewDialog.locator(".dependency-tree")).toContainText("Mock Dependency Tree Missing");
  await expect(previewDialog.locator(".dependency-tree")).toContainText("Mock Dependency Tree Cycle A");
  await previewDialog.getByRole("button", { name: "取消" }).click();
});

test("bulk enable and disable current results require confirmation", async ({ page }) => {
  await openMock(page);
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("ChinaMirror");
  const row = page.locator(".record-table tbody tr", { hasText: "ChinaMirror" });
  await expect(row).toHaveCount(1);
  await expect(row.getByTitle("启用地图")).toBeVisible();

  await page.getByRole("button", { name: "启用当前结果" }).click();
  const enableDialog = page.locator(".confirm-dialog", { hasText: "确认启用当前结果" });
  await expect(enableDialog).toContainText("1 个");
  await enableDialog.getByRole("button", { name: "取消" }).click();
  await expect(row.getByTitle("启用地图")).toBeVisible();

  await page.getByRole("button", { name: "启用当前结果" }).click();
  await page.locator(".confirm-dialog", { hasText: "确认启用当前结果" }).getByRole("button", { name: "启用当前结果" }).click();
  await expect(row.getByTitle("禁用地图")).toBeVisible();

  await page.getByRole("button", { name: "禁用当前结果" }).click();
  const disableDialog = page.locator(".confirm-dialog", { hasText: "确认禁用当前结果" });
  await expect(disableDialog).toContainText("1 个");
  await disableDialog.getByRole("button", { name: "取消" }).click();
  await expect(row.getByTitle("禁用地图")).toBeVisible();

  await page.getByRole("button", { name: "禁用当前结果" }).click();
  await page.locator(".confirm-dialog", { hasText: "确认禁用当前结果" }).getByRole("button", { name: "禁用当前结果" }).click();
  await expect(row.getByTitle("启用地图")).toBeVisible();
});

test("bulk disable ignores dependents included in the same result set", async ({ page }) => {
  await openMock(page);
  await page.getByRole("button", { name: "其他 Mod", exact: true }).click();
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("MockDependencyTree");

  await expect(page.locator("tbody tr", { hasText: "Mock Dependency Tree Root" })).toHaveCount(1);
  await expect(page.locator("tbody tr", { hasText: "Mock Dependency Tree Outdated" })).toHaveCount(1);
  await page.getByRole("button", { name: "禁用当前结果" }).click();
  await page.locator(".confirm-dialog", { hasText: "确认禁用当前结果" }).getByRole("button", { name: "禁用当前结果" }).click();

  await expect(page.getByText("部分 Mod 未禁用：EverestCore 是内置项目。")).toBeVisible();
  await expect(page.getByText(/部分 Mod 未禁用：.*被/)).toHaveCount(0);
  await expect(page.locator("tbody tr", { hasText: "Mock Dependency Tree Root" }).getByTitle("启用Mod")).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: "Mock Dependency Tree Outdated" }).getByTitle("启用Mod")).toBeVisible();
});

test("bulk disable ignores always-enabled dependents", async ({ page }) => {
  await openMock(page);
  await page.getByRole("button", { name: "其他 Mod", exact: true }).click();
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Mock Dependency Tree Root");
  const rootRow = page.locator("tbody tr", { hasText: "Mock Dependency Tree Root" });
  await expect(rootRow).toHaveCount(1);
  await rootRow.getByTitle("设为 始终启用").click();
  await expect(page.getByText("已设为始终启用")).toBeVisible();

  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("MockDependencyTreeOutdated");
  const outdatedRow = page.locator("tbody tr", { hasText: "Mock Dependency Tree Outdated" });
  await expect(outdatedRow).toHaveCount(1);
  await page.getByRole("button", { name: "禁用当前结果" }).click();
  await page.locator(".confirm-dialog", { hasText: "确认禁用当前结果" }).getByRole("button", { name: "禁用当前结果" }).click();

  await expect(page.getByText("部分 Mod 未禁用")).toHaveCount(0);
  await expect(outdatedRow.getByTitle("禁用Mod")).toBeVisible();

  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Mock Dependency Tree");
  await page.getByLabel("启用状态").selectOption("enabled");
  await expect(page.locator("tbody tr", { hasText: "Mock Dependency Tree Root" })).toHaveCount(1);
  await expect(page.locator("tbody tr", { hasText: "Mock Dependency Tree Outdated" })).toHaveCount(1);
});

test("mod update status grouping separates update, unknown, and latest records", async ({ page }) => {
  test.setTimeout(60_000);
  await openMock(page);
  await page.getByRole("button", { name: "其他 Mod", exact: true }).click();
  await page.getByRole("button", { name: "检查更新" }).click();
  await expect(page.getByText(/发现 \d+ 个可更新 Mod/)).toBeVisible({ timeout: 5000 });

  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Mock Dependency Tree");
  const statusFilter = page.locator(".mod-filters .field", { has: page.locator("span", { hasText: /^状态$/ }) }).locator("select");
  await expect(statusFilter).toHaveCount(1);
  await expect(statusFilter).toHaveValue("all");
  const groupToggle = page.locator(".mod-filters .record-update-group-toggle input");
  await expect(groupToggle).toHaveCount(1);
  await groupToggle.check();

  await expect(page.locator(".record-panel")).toContainText("可更新");
  await expect(page.locator(".record-panel")).toContainText("未知状态");
  await expect(page.locator(".record-panel")).toContainText("已是最新");
  const order = await page.locator(".record-panel").evaluate((panel) => {
    const text = panel.textContent ?? "";
    return {
      latest: text.indexOf("已是最新"),
      latestRecord: text.indexOf("Mock Dependency Tree Outdated"),
      unknown: text.indexOf("未知状态"),
      unknownRecord: text.indexOf("Mock Dependency Tree Cycle A"),
      update: text.indexOf("可更新"),
      updateRecord: text.indexOf("Mock Dependency Tree Root")
    };
  });
  expect(order.update).toBeLessThan(order.unknown);
  expect(order.unknown).toBeLessThan(order.latest);
  expect(order.updateRecord).toBeGreaterThan(order.update);
  expect(order.updateRecord).toBeLessThan(order.unknown);
  expect(order.unknownRecord).toBeGreaterThan(order.unknown);
  expect(order.unknownRecord).toBeLessThan(order.latest);
  expect(order.latestRecord).toBeGreaterThan(order.latest);
});

test("map update status grouping separates update, unknown, and latest records", async ({ page }) => {
  test.setTimeout(60_000);
  await openMock(page);
  await page.getByRole("button", { name: "检查更新" }).click();
  await expect(page.getByText(/发现 \d+ 个可更新 Mod/)).toBeVisible({ timeout: 5000 });

  const progressFilter = page.locator(".map-filters .field", { has: page.locator("span", { hasText: /^进度$/ }) }).locator("select");
  await expect(progressFilter).toHaveCount(1);
  await expect(progressFilter).toHaveValue("all");
  const groupToggle = page.locator(".map-filters .record-update-group-toggle input");
  await expect(groupToggle).toHaveCount(1);
  await groupToggle.check();

  await expect(page.locator(".record-panel")).toContainText("可更新");
  await expect(page.locator(".record-panel")).toContainText("未知状态");
  const initialOrder = await page.locator(".record-panel").evaluate((panel) => {
    const text = panel.textContent ?? "";
    return {
      unknown: text.indexOf("未知状态"),
      update: text.indexOf("可更新"),
      updateRecord: text.indexOf("Galactica")
    };
  });
  expect(initialOrder.update).toBeLessThan(initialOrder.unknown);
  expect(initialOrder.updateRecord).toBeGreaterThan(initialOrder.update);
  expect(initialOrder.updateRecord).toBeLessThan(initialOrder.unknown);

  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Strawberry Jam");
  await expect(page.locator(".record-panel")).toContainText("已是最新");
  await expect(page.locator(".record-panel")).toContainText("Strawberry Jam Collab");

  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Celeste 官方地图");
  await expect(page.locator(".record-panel")).toContainText("已是最新");
  await expect(page.locator(".record-panel")).toContainText("Celeste 官方地图");
});

test("update all button uses every downloadable update from map and mod tabs", async ({ page }) => {
  test.setTimeout(60_000);
  await openMock(page);
  await page.getByRole("button", { name: "检查更新" }).click();
  await expect(page.getByText(/发现 \d+ 个可更新 Mod/)).toBeVisible({ timeout: 5000 });

  const updateAllButton = page.locator(".update-all-button");
  const updateTitle = await updateAllButton.getAttribute("title");
  const globalUpdateCount = Number(updateTitle?.match(/更新全部 (\d+) 个 Mod/)?.[1] ?? 0);
  expect(globalUpdateCount).toBeGreaterThan(0);

  const mapProgressFilter = page.locator(".map-filters .field", { has: page.locator("span", { hasText: /^进度$/ }) }).locator("select");
  await mapProgressFilter.selectOption("updates");
  const mapResultCount = await visibleRecordCount(page);
  expect(globalUpdateCount).toBeGreaterThan(mapResultCount);
  await updateAllButton.click();
  const mapUpdateDialog = page.locator(".confirm-dialog", { hasText: "批量更新 Mod" });
  await expect(mapUpdateDialog).toContainText("Mock Install Failure");
  await mapUpdateDialog.getByRole("button", { name: "取消" }).click();

  await page.locator(".record-view-switch").getByRole("button", { name: "其他 Mod", exact: true }).click();
  const modUpdateFilter = page.locator(".mod-filters .field", { has: page.locator("span", { hasText: /^状态$/ }) }).locator("select");
  await modUpdateFilter.selectOption("updates");
  const modResultCount = await visibleRecordCount(page);
  expect(globalUpdateCount).toBeGreaterThan(modResultCount);
  await updateAllButton.click();
  const modUpdateDialog = page.locator(".confirm-dialog", { hasText: "批量更新 Mod" });
  await expect(modUpdateDialog).toContainText("Galactica");
  await modUpdateDialog.getByRole("button", { name: "取消" }).click();
});

test("mod detail opens the local mod location from the header", async ({ page }) => {
  await openMock(page);
  await page.getByRole("button", { name: "其他 Mod", exact: true }).click();
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("SpeedrunTool");

  const modRow = page.locator("tbody tr", { hasText: "SpeedrunTool" });
  await expect(modRow).toHaveCount(1);
  await modRow.click();

  await page.locator(".detail-heading").getByRole("button", { name: "打开所在位置" }).click();
  await expect(page.getByText("已打开本地内容位置。")).toBeVisible();
});

test("map detail opens the local map location from the header", async ({ page }) => {
  await openMock(page);
  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Strawberry Jam");

  const mapRow = page.locator("tbody tr", { hasText: "Strawberry Jam Collab" });
  await expect(mapRow).toHaveCount(1);
  await mapRow.click();

  await page.locator(".detail-heading").getByRole("button", { name: "打开所在位置" }).click();
  await expect(page.getByText("已打开本地内容位置。")).toBeVisible();
});

test("sub-map filters stay above the map detail sub-map list", async ({ page }) => {
  await openMock(page);
  await expect(page.locator(".filter-dock")).toHaveCount(0);
  await expect(page.locator(".sub-map-filter-panel")).toHaveCount(0);

  await page.getByPlaceholder("搜索地图、SID、Mod、依赖").fill("Strawberry Jam");
  const mapRow = page.locator("tbody tr", { hasText: "Strawberry Jam Collab" });
  await expect(mapRow).toHaveCount(1);
  await mapRow.click();

  await expect(page.locator(".sub-map-filter-panel")).toHaveCount(0);
  await page.locator(".detail-tabs button", { hasText: "小图" }).click();
  await expect(page.locator(".filter-dock")).toHaveCount(0);
  await expect(page.locator(".sub-map-filter-panel")).toBeVisible();
  await expect(page.locator(".sub-map-filter-options")).toContainText("排序");
  await expect(page.locator(".sub-map-filter-options")).toContainText("方向");
  await expect(page.locator(".sub-map-filter-options")).toContainText("分组");
  await expect(page.locator(".sub-map-filter-options")).toContainText("范围");

  const filterPlacement = await page.locator(".sub-map-tab-panel").evaluate((panel) => {
    const filters = panel.querySelector(".sub-map-filter-panel")?.getBoundingClientRect();
    const breadcrumbs = panel.querySelector(".sub-map-breadcrumbs")?.getBoundingClientRect();
    const table = panel.querySelector(".sub-map-table-wrap")?.getBoundingClientRect();
    if (!filters || !breadcrumbs || !table) throw new Error("Sub-map filter placement targets are missing");
    return { breadcrumbsBottom: breadcrumbs.bottom, breadcrumbsTop: breadcrumbs.top, filtersBottom: filters.bottom, tableTop: table.top };
  });
  expect(filterPlacement.filtersBottom).toBeLessThanOrEqual(filterPlacement.breadcrumbsTop + 1);
  expect(filterPlacement.breadcrumbsBottom).toBeLessThanOrEqual(filterPlacement.tableTop + 1);
  const optionPlacement = await page.locator(".sub-map-filter-options").evaluate((options) => {
    const labels = Array.from(options.querySelectorAll(":scope > .field > span, :scope > .sub-map-filter-control > span"));
    const rangeLabel = labels.find((label) => label.textContent?.trim() === "范围");
    if (!rangeLabel) throw new Error("Range filter label is missing");
    return {
      labelCount: labels.length,
      rangeRight: rangeLabel.getBoundingClientRect().right,
      optionsRight: options.getBoundingClientRect().right
    };
  });
  expect(optionPlacement.labelCount).toBe(4);
  expect(optionPlacement.rangeRight).toBeGreaterThan(optionPlacement.optionsRight - 190);

  await page.locator(".sub-map-filter-panel").getByPlaceholder("搜索小图名称、SID").fill("Squeeze");
  await expect(page.locator(".sub-map-table tbody tr", { hasText: "Squeeze" })).toHaveCount(1);

  await page.locator(".sub-map-filter-panel").getByRole("button", { name: "仅搜索当前层级" }).click();
  await expect(page.locator(".sub-map-table tbody tr", { hasText: "Squeeze" })).toHaveCount(0);

  await openNav(page, "Profile");
  await expect(page.locator(".sub-map-filter-panel")).toHaveCount(0);
});

test("settings save-file and catalog-cache actions show persistent feedback", async ({ page }) => {
  await openMock(page);
  await openNav(page, "设置");

  const theoSave = page.getByRole("button", { name: /Theo/ });
  await expect(theoSave).toHaveClass(/active/);
  await theoSave.click();
  await expect(theoSave).not.toHaveClass(/active/);

  await page.getByRole("button", { name: "刷新列表缓存" }).click();
  await expect(page.getByText(/已刷新 \d+ 个 Mod 数据源缓存。|Mock：官方指针源暂时较慢/)).toBeVisible();
});

test("backup manager creates, restores, and deletes mock backups", async ({ page }) => {
  await openMock(page);
  await openNav(page, "备份还原");

  await expect(page.getByRole("heading", { name: "备份还原" })).toBeVisible();
  const initialBackupCount = await page.locator(".backup-item").count();
  const backupManager = page.locator(".backup-manager");

  await backupManager.getByRole("button", { name: "备份", exact: true }).click();
  await expect(page.getByText(/已创建备份：/)).toBeVisible();
  await expect(page.locator(".backup-item")).toHaveCount(initialBackupCount + 1);

  const newestBackup = page.locator(".backup-item").first();
  await newestBackup.getByRole("button", { name: "还原启用状态" }).click();
  const restoreDialog = page.locator(".confirm-dialog", { hasText: "还原启用状态" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog.getByRole("button", { name: "确认还原启用状态" }).click();
  await expect(page.getByText("已还原游戏文件。")).toBeVisible();

  await newestBackup.getByRole("button", { name: "删除" }).click();
  const deleteDialog = page.locator(".confirm-dialog", { hasText: "删除备份" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("已删除备份。")).toBeVisible();
  await expect(page.locator(".backup-item")).toHaveCount(initialBackupCount);
});

test("download manager pauses, cancels, and retries failed mock update tasks", async ({ page }) => {
  await openMock(page);

  await page.getByRole("button", { name: "其他 Mod" }).click();
  await page.getByRole("button", { name: "检查更新" }).click();
  await expect(page.getByText(/发现 \d+ 个可更新 Mod/)).toBeVisible({ timeout: 5000 });
  const updateFilter = page.locator(".mod-filters .field", { has: page.locator("span", { hasText: /^状态$/ }) }).locator("select");
  await expect(updateFilter).toHaveCount(1);
  await updateFilter.selectOption("updates");
  await expect(page.locator(".record-panel")).toContainText("Mock Install Failure");
  await expect(page.locator(".record-panel")).toContainText("Mock Download Failure");
  const updateTitle = await page.locator(".update-all-button").getAttribute("title");
  const updateCount = Number(updateTitle?.match(/更新全部 (\d+) 个 Mod/)?.[1] ?? 0);
  const shownUpdateCount = await visibleRecordCount(page);
  expect(updateCount).toBeGreaterThan(shownUpdateCount);

  await page.getByRole("button", { name: /更新全部/ }).click();
  const updateDialog = page.locator(".confirm-dialog", { hasText: "批量更新 Mod" });
  await expect(updateDialog).toBeVisible();
  await expect(updateDialog).toContainText("Galactica");
  await updateDialog.getByRole("button", { name: "更新全部" }).click();

  const downloadsNav = page.locator(".workspace-nav").getByRole("button", { name: "下载管理", exact: true });
  await expect(downloadsNav.locator(".nav-task-badge")).toContainText(/\d+ \/ \d+ \/ \d+/);

  await openNav(page, "下载管理");
  await expect(page.getByRole("heading", { name: "下载管理" })).toBeVisible();
  await expect(page.locator(".download-task-panel")).toContainText(/下载中 [1-9]/);
  const taskOrder = await page.locator(".download-task-panel").evaluate((panel) => {
    const text = panel.textContent ?? "";
    return {
      downloadFailure: text.indexOf("Mock Download Failure"),
      helper: text.indexOf("Mock Helper 001"),
      installFailure: text.indexOf("Mock Install Failure")
    };
  });
  expect(taskOrder.installFailure).toBeGreaterThanOrEqual(0);
  expect(taskOrder.downloadFailure).toBeGreaterThanOrEqual(0);
  expect(taskOrder.helper).toBeGreaterThan(taskOrder.installFailure);
  expect(taskOrder.helper).toBeGreaterThan(taskOrder.downloadFailure);
  await expect(page.locator(".download-task-panel")).toContainText("安装失败 1", { timeout: 5000 });
  await expect(page.locator(".download-task-panel")).toContainText("下载失败 1", { timeout: 5000 });
  await expect(page.locator(".download-task-panel")).toContainText(
    "暂存旧 Mod 失败：另一个程序正在使用此文件，进程无法访问。 (os error 32)"
  );
  await expect(page.locator(".download-task-panel")).toContainText("下载 Mod 失败：网络连接已中断，无法继续读取远端文件。");
  const installFailureMessage = page.locator(".download-task-group em.download-task-error", { hasText: "暂存旧 Mod 失败" });
  await expect(installFailureMessage).toHaveCSS("white-space", "normal");
  await expect(installFailureMessage).toHaveCSS("overflow-wrap", "anywhere");
  await expect(installFailureMessage).toHaveCSS("text-overflow", "clip");

  await page.getByRole("button", { name: "停止下载" }).click();
  await expect(page.getByRole("button", { name: "恢复下载" })).toBeVisible();
  await page.getByRole("button", { name: "恢复下载" }).click();
  await expect(page.getByRole("button", { name: "停止下载" })).toBeVisible();

  await page.getByRole("button", { name: "取消下载" }).click();
  await expect(page.locator(".download-task-panel")).toContainText(/下载失败 [1-9]/);
  const failedMessage = page.locator(".download-task-group em.download-task-error").first();
  await expect(failedMessage).toHaveCSS("white-space", "normal");
  await expect(failedMessage).toHaveCSS("overflow-wrap", "anywhere");
  await expect(failedMessage).toHaveCSS("text-overflow", "clip");
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "重试失败" }).click();
  await expect(page.locator(".download-task-panel")).toContainText(/下载中 [1-9]|成功 [1-9]/, { timeout: 5000 });
  const installedGroup = page.locator(".download-task-group", { has: page.getByRole("heading", { name: /安装成功/ }) });
  await expect(installedGroup).toContainText("Mock Download Failure", { timeout: 5000 });
  await expect(page.locator(".download-task-group", { has: page.getByRole("heading", { name: /下载失败/ }) })).not.toContainText(
    "Mock Download Failure"
  );
});

async function visibleRecordCount(page: Page) {
  const text = await page.locator(".record-list-title p").textContent();
  const count = Number(text?.match(/^(\d+) \//)?.[1] ?? Number.NaN);
  if (!Number.isFinite(count)) throw new Error(`Cannot parse visible record count from: ${text ?? ""}`);
  return count;
}
