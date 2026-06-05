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

test("profile manager creates, copies, renames, and applies mock profiles", async ({ page }) => {
  await openMock(page);
  await openNav(page, "Profile");

  const mapColumn = profileColumn(page, "地图 Profile");
  const modColumn = profileColumn(page, "其他 Mod Profile");

  await createEmptyProfile(mapColumn, "新建地图 Profile 名称", "回归地图 Profile");
  await createEmptyProfile(modColumn, "新建 Mod Profile 名称", "回归 Mod Profile");

  const activeMapRow = mapColumn.locator(".profile-row.active");
  await activeMapRow.getByTitle("复制 Profile").click();
  await expect(mapColumn.locator(".profile-row.active")).toContainText("回归地图 Profile Copy");

  await mapColumn.locator(".profile-row.active").getByTitle("重命名 Profile").click();
  await mapColumn.locator(".profile-row.active").getByRole("textbox").fill("回归地图重命名");
  await mapColumn.locator(".profile-row.active").getByTitle("保存名称").click();
  await expect(mapColumn.locator(".profile-row.active")).toContainText("回归地图重命名");

  await page.getByRole("button", { name: "应用当前" }).click();
  await expect(page.getByText("已应用地图和 Mod Profile。")).toBeVisible();
});

test("catalog install flow asks for dependency choices and queues the mock task", async ({ page }) => {
  await openMock(page);
  await openNav(page, "下载 Mod");

  await page.getByPlaceholder("搜索 Mod、地图、Helper").fill("Everest Gate");
  const entry = page.locator(".catalog-row", { hasText: "Everest Gate" }).first();
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "安装" }).click();

  const confirmDialog = page.getByRole("dialog", { name: "安装 Mod" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "安装", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "需要更新 Everest" })).toBeVisible();
  await page.getByRole("button", { name: "更新 Everest 后继续" }).click();

  await expect(page.getByRole("dialog", { name: "安装前依赖检查" })).toBeVisible();
  await page.getByRole("button", { name: "更新必须" }).click();

  await expect(page.locator(".catalog-download-summary")).toContainText("队列");
  await openNav(page, "下载管理");
  await expect(page.getByText("Everest Gate")).toBeVisible();
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
