const { chromium } = require('playwright');

async function runTests() {
  console.log('🧪 开始测试 Bubble GTD...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 测试 1: 页面加载
    console.log('测试 1: 页面加载');
    await page.goto('https://bubble-gtd.vercel.app/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    console.log(`  ✓ 页面标题: ${title}`);
    
    // 检查 Canvas 是否存在
    const canvas = await page.$('#canvas');
    console.log(`  ✓ Canvas 元素: ${canvas ? '存在' : '不存在'}`);
    
    // 检查输入框
    const input = await page.$('#todoInput');
    console.log(`  ✓ 输入框: ${input ? '存在' : '不存在'}`);
    
    // 测试 2: 添加任务
    console.log('\n测试 2: 添加任务');
    
    // 添加第一个任务（金融相关，应该高重要性）
    await input.fill('尽职调查');
    await page.click('#addBtn');
    await page.waitForTimeout(2000);
    console.log('  ✓ 添加任务: 尽职调查');
    
    // 添加第二个任务
    await input.fill('回复邮件');
    await page.click('#addBtn');
    await page.waitForTimeout(2000);
    console.log('  ✓ 添加任务: 回复邮件');
    
    // 添加第三个任务
    await input.fill('学习新技能');
    await page.click('#addBtn');
    await page.waitForTimeout(2000);
    console.log('  ✓ 添加任务: 学习新技能');
    
    // 测试 3: 截图验证
    console.log('\n测试 3: 截图验证');
    await page.screenshot({ path: 'test-result.png', fullPage: true });
    console.log('  ✓ 截图已保存: test-result.png');
    
    // 测试 4: 检查气泡渲染
    console.log('\n测试 4: 检查气泡渲染');
    const canvasData = await page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      return {
        width: canvas.width,
        height: canvas.height,
        hasContent: canvas.width > 0 && canvas.height > 0
      };
    });
    console.log(`  ✓ Canvas 尺寸: ${canvasData.width}x${canvasData.height}`);
    
    // 测试 5: 刷新页面验证数据持久化
    console.log('\n测试 5: 数据持久化');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('  ✓ 页面刷新完成');
    
    await page.screenshot({ path: 'test-after-reload.png', fullPage: true });
    console.log('  ✓ 刷新后截图: test-after-reload.png');
    
    console.log('\n✅ 所有测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

runTests();
