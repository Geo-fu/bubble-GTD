import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "https://bubble-gtd.vercel.app";

test.describe("Bubble GTD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // 等待画布加载
    await page.waitForSelector("canvas");
  });

  test("页面加载成功", async ({ page }) => {
    // 检查标题和输入框
    await expect(page.locator("input#todoInput")).toBeVisible();
    await expect(page.locator("button#addBtn")).toHaveText("+");
  });

  test("添加事项后立即显示气泡", async ({ page }) => {
    const input = page.locator("input#todoInput");
    const addBtn = page.locator("button#addBtn");
    
    // 输入任务
    await input.fill("测试任务");
    
    // 记录点击前的时间
    const startTime = Date.now();
    
    // 点击添加
    await addBtn.click();
    
    // 清空输入框表示已响应
    await expect(input).toHaveValue("");
    
    // 检查响应时间（应该 < 500ms）
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(500);
    
    // 等待画布渲染（给一点动画时间）
    await page.waitForTimeout(100);
    
    // 截图验证
    await expect(page).toHaveScreenshot("bubble-added.png", {
      maxDiffPixels: 1000,
    });
  });

  test("添加高优先级任务显示大红色气泡", async ({ page }) => {
    const input = page.locator("input#todoInput");
    const addBtn = page.locator("button#addBtn");
    
    // 添加高优先级任务
    await input.fill("紧急融资谈判");
    await addBtn.click();
    
    // 等待渲染
    await page.waitForTimeout(200);
    
    // 截图验证（红色大气泡）
    await expect(page).toHaveScreenshot("high-priority-bubble.png", {
      maxDiffPixels: 1000,
    });
  });

  test("跨设备同步 - 添加后另一窗口可见", async ({ browser }) => {
    // 创建两个独立的页面
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    await page1.goto(BASE_URL);
    await page2.goto(BASE_URL);
    
    await page1.waitForSelector("canvas");
    await page2.waitForSelector("canvas");
    
    // 在 page1 添加任务
    await page1.locator("input#todoInput").fill("同步测试任务");
    await page1.locator("button#addBtn").click();
    
    // 等待 Firebase 同步（最多 5 秒）
    await page2.waitForTimeout(5000);
    
    // 截图验证 page2 也显示了气泡
    await expect(page2).toHaveScreenshot("synced-bubble.png", {
      maxDiffPixels: 1000,
    });
    
    await context1.close();
    await context2.close();
  });

  test("长按完成任务", async ({ page }) => {
    const input = page.locator("input#todoInput");
    const addBtn = page.locator("button#addBtn");
    
    // 先添加一个任务
    await input.fill("待完成任务");
    await addBtn.click();
    await page.waitForTimeout(200);
    
    // 获取画布位置
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    
    // 长按画布中心（气泡应该在那里）
    await canvas.click({
      position: { x: box.width / 2, y: box.height / 2 },
      delay: 800, // 长按 800ms
    });
    
    // 等待爆炸动画
    await page.waitForTimeout(1000);
    
    // 截图验证任务消失
    await expect(page).toHaveScreenshot("task-completed.png", {
      maxDiffPixels: 1000,
    });
  });

  test("性能 - 连续添加多个任务", async ({ page }) => {
    const input = page.locator("input#todoInput");
    const addBtn = page.locator("button#addBtn");
    
    const tasks = ["任务1", "任务2", "任务3", "任务4", "任务5"];
    
    const startTime = Date.now();
    
    for (const task of tasks) {
      await input.fill(task);
      await addBtn.click();
      // 每个任务应该快速响应，不需要等待
    }
    
    const totalTime = Date.now() - startTime;
    
    // 5个任务应该在2秒内完成
    expect(totalTime).toBeLessThan(2000);
    
    // 等待渲染
    await page.waitForTimeout(500);
    
    // 截图验证
    await expect(page).toHaveScreenshot("multiple-tasks.png", {
      maxDiffPixels: 2000,
    });
  });
});
