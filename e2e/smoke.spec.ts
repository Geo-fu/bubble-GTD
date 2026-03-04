import { test, expect } from "@playwright/test";

test("页面加载测试", async ({ page }) => {
  await page.goto("https://bubble-gtd.vercel.app");
  
  // 检查页面标题
  await expect(page).toHaveTitle(/Bubble/);
  
  // 检查输入框存在
  const input = page.locator("#todoInput");
  await expect(input).toBeVisible();
  
  // 检查按钮存在
  const button = page.locator("#addBtn");
  await expect(button).toHaveText("+");
  
  console.log("✅ 页面加载测试通过");
});

test("添加任务响应时间测试", async ({ page }) => {
  await page.goto("https://bubble-gtd.vercel.app");
  await page.waitForSelector("canvas");
  
  const input = page.locator("#todoInput");
  const button = page.locator("#addBtn");
  
  // 输入任务
  await input.fill("测试任务");
  
  // 记录时间并点击
  const start = Date.now();
  await button.click();
  
  // 等待输入框清空（表示响应完成）
  await expect(input).toHaveValue("", { timeout: 1000 });
  
  const responseTime = Date.now() - start;
  console.log(`⏱️ 响应时间: ${responseTime}ms`);
  
  // 验证响应时间小于 500ms
  expect(responseTime).toBeLessThan(500);
  console.log("✅ 响应时间测试通过");
});
