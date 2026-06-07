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

test("catalog install flow previews dependencies and queues the mock task", async ({ page }) => {
  await openMock(page);
  await openNav(page, "下载 Mod");

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

  await openNav(page, "下载 Mod");

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

  await page.getByRole("button", { name: /更新全部/ }).click();
  const updateDialog = page.locator(".confirm-dialog", { hasText: "批量更新 Mod" });
  await expect(updateDialog).toBeVisible();
  await updateDialog.getByRole("button", { name: "更新全部" }).click();

  const downloadsNav = page.locator(".workspace-nav").getByRole("button", { name: "下载管理", exact: true });
  await expect(downloadsNav.locator(".nav-task-badge")).toContainText(/\d+ \/ \d+ \/ \d+/);

  await openNav(page, "下载管理");
  await expect(page.getByRole("heading", { name: "下载管理" })).toBeVisible();
  await expect(page.locator(".download-task-panel")).toContainText(/下载中 [1-9]/);

  await page.getByRole("button", { name: "停止下载" }).click();
  await expect(page.getByRole("button", { name: "恢复下载" })).toBeVisible();
  await page.getByRole("button", { name: "恢复下载" }).click();
  await expect(page.getByRole("button", { name: "停止下载" })).toBeVisible();

  await page.getByRole("button", { name: "取消下载" }).click();
  await expect(page.locator(".download-task-panel")).toContainText(/下载失败 [1-9]/);
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "重试失败" }).click();
  await expect(page.locator(".download-task-panel")).toContainText(/下载中 [1-9]|成功 [1-9]/, { timeout: 5000 });
});
