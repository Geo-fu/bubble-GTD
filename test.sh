#!/bin/bash
# Bubble GTD 测试脚本
# 用于验证关键功能

echo "🧪 Bubble GTD 功能测试"
echo "======================"
echo ""

# 测试 1: 检查文件完整性
echo "✓ 测试 1: 检查文件完整性"
files=("index.html" "app.js" "package.json")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file 存在"
    else
        echo "  ✗ $file 缺失"
    fi
done
echo ""

# 测试 2: 检查 Firebase 配置
echo "✓ 测试 2: 检查 Firebase 配置"
if grep -q "apiKey.*AIzaSyCsdgcHag" app.js; then
    echo "  ✓ Firebase API Key 已配置"
else
    echo "  ✗ Firebase API Key 未找到"
fi

if grep -q "projectId.*bubble-gtd" app.js; then
    echo "  ✓ Firebase Project ID 已配置"
else
    echo "  ✗ Firebase Project ID 未找到"
fi
echo ""

# 测试 3: 检查关键功能代码
echo "✓ 测试 3: 检查关键功能代码"
if grep -q "localAnalyze" app.js; then
    echo "  ✓ 本地分析函数存在"
else
    echo "  ✗ 本地分析函数缺失"
fi

if grep -q "getColorByImportance" app.js; then
    echo "  ✓ 颜色配置函数存在"
else
    echo "  ✗ 颜色配置函数缺失"
fi

if grep -q "updatePhysics" app.js; then
    echo "  ✓ 物理引擎存在"
else
    echo "  ✗ 物理引擎缺失"
fi
echo ""

# 测试 4: 检查依赖
echo "✓ 测试 4: 检查依赖"
if [ -d "node_modules/playwright" ]; then
    echo "  ✓ playwright 已安装"
else
    echo "  ✗ playwright 未安装"
fi
echo ""

echo "======================"
echo "测试完成！"
echo ""
echo "📋 手动测试清单："
echo "  1. 访问 https://bubble-gtd.vercel.app/"
echo "  2. 添加任务 '尽职调查'，检查是否显示为高重要性（红色）"
echo "  3. 添加任务 '回复邮件'，检查是否显示为低重要性"
echo "  4. 刷新页面，检查数据是否持久化"
echo "  5. 长按气泡，检查是否能完成任务"
