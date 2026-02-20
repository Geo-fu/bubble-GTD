#!/usr/bin/env node
/**
 * 后台 AI 分析脚本
 * 每 8 小时执行一次，分析所有需要 AI 评估的任务
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Firebase Admin SDK 初始化（需要服务账号）
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Moonshot API Key
const API_KEY = 'sk-bykEHxDd8e40RqS1jjywffXa2FwbFpdKpDzbT7Q1WyTk4kxY';

/**
 * 调用 Kimi API 分析任务
 */
async function analyzeWithAI(text) {
  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'kimi-k2.5',
        messages: [{
          role: 'system',
          content: `你是一个专业的任务重要性分析专家，基于复利思维评估任务。

请深入理解任务的语义和专业背景：
- "尽职调查"是投资/并购前的关键调查，涉及重大财务决策，重要性很高
- "审计"、"风控"、"合规"是金融核心活动
- "融资"、"并购"、"IPO"具有极高杠杆效应
- "谈判"、"签约"具有直接商业价值
- 区分日常事务和战略级任务

分析维度：
1. 时间复利：对未来有多大累积效应
2. 边际收益：是否越做越有价值  
3. 网络效应：是否产生连接价值
4. 杠杆效应：一份努力能否产生多份回报

请以JSON返回：{"score": 0.85, "reason": "💰 金融高价值 | 🎯 杠杆效应"}`
        }, {
          role: 'user',
          content: `分析这个任务："${text}"`
        }],
        temperature: 0.3,
        max_tokens: 150
      })
    });
    
    if (!response.ok) {
      console.error('API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content;
    
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      return {
        score: Math.min(Math.max(result.score, 0.1), 1),
        reason: result.reason || 'AI评估'
      };
    }
  } catch (e) {
    console.error('AI analysis failed:', e);
  }
  return null;
}

/**
 * 主函数：分析所有需要 AI 的任务
 */
async function main() {
  console.log('Starting AI analysis job...', new Date().toISOString());
  
  try {
    // 获取所有需要 AI 分析的任务（新的数据结构）
    const todosQuery = await db.collection('todos')
      .where('needsAI', '==', true)
      .where('aiAnalyzed', '==', false)
      .get();
    
    console.log(`${todosQuery.docs.length} tasks need analysis`);
    
    for (const todoDoc of todosQuery.docs) {
      const todo = todoDoc.data();
      
      // 调用 AI 分析
      const analysis = await analyzeWithAI(todo.text);
      
      if (analysis) {
        // 更新任务
        await todoDoc.ref.update({
          importance: analysis.score,
          reason: analysis.reason,
          aiAnalyzed: true,
          aiAnalyzedAt: new Date()
        });
        
        console.log(`  Analyzed: "${todo.text.substring(0, 30)}..." -> ${analysis.score}`);
        
        // 限流：每 2 秒分析一个任务
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('AI analysis job completed.', new Date().toISOString());
  } catch (e) {
    console.error('Job failed:', e);
    process.exit(1);
  }
}

main();
