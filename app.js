// Firebase 配置
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsdgcHag_08oDCn6pGZU9Sq4tiz762IUU",
  authDomain: "bubble-gtd.firebaseapp.com",
  projectId: "bubble-gtd",
  storageBucket: "bubble-gtd.firebasestorage.app",
  messagingSenderId: "651653716880",
  appId: "1:651653716880:web:466a414d0fb2f5c940b115",
  measurementId: "G-Z1B8YXZ5KM"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class BubbleTodo {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.todos = [];
    this.particles = [];
    this.friction = 0.82;  // 平衡阻尼，快速稳定不振荡
    this.centerAttraction = 0.0003;
    this.touch = { x: 0, y: 0, isDown: false, target: null };
    this.longPressTimer = null;
    this.unsubscribe = null;
    this.localIds = new Set(); // 跟踪本地添加的 ID，避免重复
    
    // 物理参数
    this.repulsionBase = 600;  // 显著增加排斥力，让不相关任务距离更远
    this.attractionBase = 0.008;  // 大幅增大相关性吸引力，形成紧密簇
    
    // 任务间相关性数据（由 Gemini 分析）
    this.relations = [];
    
    // 先设置默认中心坐标，避免异步加载时 NaN
    this.canvas.width = window.innerWidth || 800;
    this.canvas.height = window.innerHeight || 600;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
    
    this.init();
  }
  
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('touchstart', (e) => this.handleStart(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
    this.canvas.addEventListener('touchend', () => this.handleEnd());
    this.canvas.addEventListener('mousedown', (e) => this.handleStart(e.clientX, e.clientY));
    this.canvas.addEventListener('mouseup', () => this.handleEnd());
    document.getElementById('addBtn').addEventListener('click', () => this.addTodo());
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTodo();
    });
    
    // 设置按钮
    this.initSettings();
    
    // 直接加载数据，不需要登录
    this.loadTodosFromFirebase();
  }
  
  initSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    const modal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeModal');
    const saveBtn = document.getElementById('saveApiKey');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    // 加载已保存的 key
    const savedKey = localStorage.getItem('gemini-api-key');
    if (savedKey) {
      apiKeyInput.value = savedKey;
    }
    
    settingsBtn.addEventListener('click', () => {
      modal.classList.add('active');
    });
    
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
    
    saveBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key) {
        localStorage.setItem('gemini-api-key', key);
        alert('API Key 已保存');
      } else {
        localStorage.removeItem('gemini-api-key');
        alert('已清除 API Key，将使用本地分析');
      }
      modal.classList.remove('active');
    });
    
    // 点击模态框外部关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  }
  
  async loadTodosFromFirebase() {
    // 使用简单的集合结构，所有人共享
    // 暂时不使用 orderBy，避免索引问题
    const q = query(collection(db, 'todos'));
    
    // 只使用实时监听，不阻塞加载
    console.log('[BubbleGTD] Setting up Firebase listener...');
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[BubbleGTD] Snapshot received, docs count:', snapshot.docs.length);
      // 处理初始数据和变更
      const currentIds = new Set();
      
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        currentIds.add(id);
        
        console.log('[BubbleGTD] Processing doc:', id, data.text, 'localIds:', this.localIds.has(id));
        
        // 检查是否已存在
        const existingIndex = this.todos.findIndex(t => t.id === id);
        
        if (existingIndex === -1) {
          // 新文档 - 添加
          // 跳过本地已添加的（避免重复）
          if (this.localIds.has(id)) {
            this.localIds.delete(id);
            console.log('[BubbleGTD] Skipped local id:', id);
          } else {
            // 从 Firebase 加载的新文档
            console.log('[BubbleGTD] Adding from Firebase:', id, data.text);
            const importance = typeof data.importance === 'number' ? data.importance : 0.5;
            const colorConfig = this.getColorByImportance(importance);
            const radius = this.getUniqueRadius(data.text || '', importance);
            
            this.todos.push({
              id: id,
              text: data.text || '',
              importance: importance,
              targetImportance: importance,
              reason: data.reason || '一般任务',
              radius: radius,
              targetRadius: radius,
              x: this.centerX + (Math.random() - 0.5) * 200,
              y: this.centerY + (Math.random() - 0.5) * 200,
              vx: 0, vy: 0,
              color: colorConfig?.bg || { r: 100, g: 100, b: 100 },
              textColor: colorConfig?.text || '#fff',
              done: false, opacity: 1, scale: 1,
              isAnalyzing: false
            });
          }
        } else {
          // 已存在 - 更新数据（AI分析结果等）
          const todo = this.todos[existingIndex];
          const newImportance = typeof data.importance === 'number' ? data.importance : todo.importance;
          const newReason = data.reason || todo.reason;
          
          if (todo.importance !== newImportance || todo.reason !== newReason) {
            todo.importance = newImportance;
            todo.targetImportance = newImportance;
            todo.reason = newReason;
            todo.targetRadius = 20 + Math.pow(newImportance, 2) * 100;
            const colorConfig = this.getColorByImportance(newImportance);
            todo.color = colorConfig.bg;
            todo.textColor = colorConfig.text;
          }
        }
      });
      
      // 删除本地不存在于 Firebase 的任务
      for (let i = this.todos.length - 1; i >= 0; i--) {
        if (!currentIds.has(this.todos[i].id) && !this.todos[i].done) {
          this.todos[i].done = true;
          this.triggerExplosion(this.todos[i]);
        }
      }
    }, (error) => {
      console.error('[BubbleGTD] Snapshot error:', error.code, error.message);
      const hint = document.querySelector('.hint');
      if (hint) {
        hint.textContent = '数据加载失败: ' + error.message;
        hint.style.color = '#ff6b6b';
      }
    });
    
    this.animate();
  }
  
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }
  
  /**
   * 基于语义的重要性分析
   * 使用语义相似度而非关键词匹配
   */
  semanticAnalyze(text) {
    const lowerText = text.toLowerCase();
    
    // 定义语义类别（包含同义词和相关概念）
    const categories = [
      {
        name: '💰 金融/投资',
        weight: 0.25,
        patterns: [
          /融资|并购|上市|ipo|尽调|尽职调查|审计|估值|投资|风控|合规|财报|财报|股权|债权|基金|证券|期货|外汇|理财|信托|保险|银行|贷款|抵押|担保|回购|定增|配股|分红|股息|利息|本金|收益|风险|回报|杠杆|对冲|套利|量化|私募|公募|vc|pe|lp|gp|irr|npv|roi|ebitda|pe ratio|pb/i
        ]
      },
      {
        name: '💼 商业关键',
        weights: 0.15,
        patterns: [
          /谈判|签约|合作|客户|战略|决策|规划|商务|业务|销售|市场|品牌|渠道|供应链|采购|招标|投标|竞标|合同|协议|条款|违约|赔偿|仲裁|诉讼|法务|知识产权|专利|商标|版权|许可|授权|加盟|代理|分销|零售|批发|电商|直播|社群|私域/i
        ]
      },
      {
        name: '📈 复利/成长',
        weight: 0.12,
        patterns: [
          /学习|读书|技能|产品|系统|团队|流程|知识|能力|经验|成长|进步|提升|培训|教育|课程|证书|学历|学位|专业|专家|资深|架构|设计|开发|测试|运维|管理|领导力|沟通|协作|效率|工具|方法|框架|模型|理论|实践|复盘|总结|沉淀|积累/i
        ]
      },
      {
        name: '⏰ 紧急/ deadline',
        weight: 0.08,
        patterns: [
          /紧急|马上|立刻|deadline|截止|今天|明天|本周|下周|月底前|季度末|年底前| asap|尽快|赶|催|急|火烧眉毛|刻不容缓|迫在眉睫|当务之急/i
        ]
      },
      {
        name: '👥 人际/关系',
        weight: 0.06,
        patterns: [
          /老板|领导|上级|下属|同事|团队|客户|用户|合作伙伴|投资人|股东|董事会|高管|中层|骨干|新人| mentor|导师| mentee|徒弟|朋友|家人|亲戚|关系|人脉|资源|圈子|社群|组织|协会/i
        ]
      },
      {
        name: '🔧 执行/落地',
        weight: 0.05,
        patterns: [
          /执行|落地|实施|推进|跟进|落实|完成|交付|上线|发布|发布|部署|配置|安装|调试|测试|验收|确认|签字|盖章|归档|存档|备案|登记|注册|申请|审批|审核|核准/i
        ]
      }
    ];
    
    let score = 0.5; // 基础分
    const matchedCategories = [];
    
    // 计算每个类别的匹配度
    for (const cat of categories) {
      let matchCount = 0;
      for (const pattern of cat.patterns) {
        const matches = lowerText.match(pattern);
        if (matches) {
          matchCount += matches.length;
        }
      }
      
      if (matchCount > 0) {
        // 匹配越多，权重递减（避免重复词汇堆砌）
        const effectiveWeight = cat.weight * Math.min(matchCount, 3) / Math.max(matchCount, 1);
        score += effectiveWeight;
        matchedCategories.push(cat.name);
      }
    }
    
    // 语义增强：检测复合概念（如"融资谈判"比单独的"融资"+"谈判"更重要）
    const compoundPatterns = [
      { pattern: /融资.*谈判|谈判.*融资/, bonus: 0.1 },
      { pattern: /战略.*规划|规划.*战略/, bonus: 0.08 },
      { pattern: /团队.*建设|建设.*团队/, bonus: 0.06 },
      { pattern: /产品.*上线|上线.*产品/, bonus: 0.07 },
      { pattern: /客户.*签约|签约.*客户/, bonus: 0.09 },
      { pattern: /紧急.*重要|重要.*紧急/, bonus: 0.1 }
    ];
    
    for (const compound of compoundPatterns) {
      if (compound.pattern.test(lowerText)) {
        score += compound.bonus;
        matchedCategories.push('🔗 复合概念');
        break; // 只加一次复合概念 bonus
      }
    }
    
    // 降低低价值任务的分数
    const lowValuePatterns = /^(回复|确认|收到|好的|谢谢|ok|okay|嗯|哦|啊|吧|呢)[\s!！.。]*$/i;
    if (lowValuePatterns.test(text.trim()) && matchedCategories.length === 0) {
      score -= 0.15;
    }
    
    // 长度惩罚：太短的描述通常信息不足
    if (text.length < 5 && matchedCategories.length === 0) {
      score -= 0.05;
    }
    
    // 长度奖励：详细描述通常更重要
    if (text.length > 20 && matchedCategories.length > 0) {
      score += 0.03;
    }
    
    return {
      score: Math.min(Math.max(score, 0.15), 0.9),
      reason: matchedCategories.slice(0, 3).join(' | ') || '一般任务',
      needsAI: matchedCategories.length === 0 || score > 0.75
    };
  }
  
  /**
   * Gemini API 批量分析 - 同时评估重要性和任务间相关性
   * 一次性分析所有任务，减少 API 调用
   */
  async geminiAnalyzeAll(todos) {
    const API_KEY = 'AIzaSyDsIFkGLqONEXS3SCOG8rmggAMYkMPcg6c';
    
    // 构建任务列表文本
    const tasksText = todos.map((t, i) => `${i + 1}. ${t.text}`).join('\n');
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `你是一位专业的任务管理顾问，请分析以下任务列表。

## 任务列表
${tasksText}

## 分析要求

### 1. 重要性评估 (0-1)
基于复利思维评估每个任务的重要性：
- **时间价值**：对未来有多大累积效应
- **杠杆效应**：一份努力能否产生多份回报
- **紧急程度**：时间敏感度
- **战略价值**：对长期目标的影响

评分标准：
- 0.9-1.0：极高价值（如融资、战略决策）
- 0.7-0.9：高价值（如重要客户、关键项目）
- 0.5-0.7：中等价值（如日常学习、团队建设）
- 0.3-0.5：一般价值（如常规会议、文档整理）
- 0.1-0.3：低价值（如简单回复、琐事）

### 2. 相关性评估 (0-1)
你是心之声CEO，评估任务相关性时从三个维度考虑：

**维度分类**：
- 🏢 **公司/工作**：融资、产品、团队、客户、战略、运营
- 🏠 **家庭**：家人、伴侣、子女、父母、家务、家庭决策
- 👤 **个人生活**：健康、学习、社交、兴趣爱好、个人成长

**高相关 (0.7-1.0)**：
- 同一维度内的强关联（如"融资路演"和"投资人会议"）
- 因果关系（如"产品上线"→"用户反馈收集"）
- 同一项目/主题的不同环节

**中等相关 (0.4-0.7)**：
- 同一维度内的弱关联（如"团队招聘"和"团队团建"）
- 跨维度但有时间关联（如"加班赶项目"和"推迟家庭聚会"）

**低相关 (0-0.4)**：
- 完全不同维度（如"融资谈判"和"周末爬山"）
- 无直接关联的独立任务

## 输出格式
只返回JSON：
{
  "tasks": [
    {"index": 1, "score": 0.85, "reason": "💰 关键融资活动", "tags": ["金融", "高杠杆"]},
    {"index": 2, "score": 0.45, "reason": "📋 日常事务", "tags": ["行政"]}
  ],
  "relations": [
    {"from": 1, "to": 2, "score": 0.75, "reason": "同一项目环节"},
    {"from": 3, "to": 4, "score": 0.3, "reason": "同一领域"}
  ]
}

注意：
- 只返回相关性 >= 0.3 的配对
- reason 要简洁（10字以内）
- 不要返回任何其他文字`
              }]
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
          })
        }
      );
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = await response.json();
      const content = data.candidates[0].content.parts[0].text;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[BubbleGTD] Gemini batch analysis failed:', e.message);
    }
    return null;
  }
  
  /**
   * 分析单个任务（使用本地分析，批量分析时调用 geminiAnalyzeAll）
   */
  localAnalyze(text) {
    return this.semanticAnalyze(text);
  }
  
  /**
   * 计算任务间相关性（用于物理引擎）
   * 基于 Gemini 返回的相关性数据或本地计算
   */
  getTaskRelation(todo1, todo2) {
    // 如果有 Gemini 分析的相关性数据，直接使用
    if (this.relations) {
      const rel = this.relations.find(r => 
        (r.from === todo1.id && r.to === todo2.id) ||
        (r.from === todo2.id && r.to === todo1.id)
      );
      if (rel) return rel.score;
    }
    
    // 本地计算相关性：基于CEO的三个维度
    const text1 = (todo1.text + ' ' + (todo1.reason || '')).toLowerCase();
    const text2 = (todo2.text + ' ' + (todo2.reason || '')).toLowerCase();
    
    // 维度关键词
    const dimensions = {
      company: ['融资', '投资', '客户', '产品', '团队', '战略', '运营', '销售', '市场', '招聘', '会议', '财报', '股权', '董事会', '高管'],
      family: ['家人', '伴侣', '配偶', '妻子', '丈夫', '孩子', '子女', '父母', '父亲', '母亲', '家庭', '家务', '买房', '装修', '搬家'],
      personal: ['健康', '健身', '运动', '跑步', '学习', '读书', '课程', '考试', '证书', '社交', '朋友', '聚会', '旅行', '爱好', '个人']
    };
    
    let sameDimension = false;
    let matchCount = 0;
    
    for (const [dim, keywords] of Object.entries(dimensions)) {
      const inDim1 = keywords.some(kw => text1.includes(kw));
      const inDim2 = keywords.some(kw => text2.includes(kw));
      
      if (inDim1 && inDim2) {
        sameDimension = true;
        // 同一维度内再检查具体关键词匹配
        for (const kw of keywords) {
          if (text1.includes(kw) && text2.includes(kw)) {
            matchCount++;
          }
        }
      }
    }
    
    if (!sameDimension) {
      // 不同维度 = 低相关
      return 0.2;
    }
    
    // 同一维度内的相关性
    return Math.min(0.5 + matchCount * 0.15, 0.85);
  }
  
  /**
   * 根据任务类别返回中心偏移量
   * 让不同类别向屏幕不同区域聚集
   */
  getCategoryOffset(todo) {
    const text = (todo.text + ' ' + (todo.reason || '')).toLowerCase();
    
    // 检测类别
    const companyWords = ['融资', '投资', '客户', '产品', '团队', '战略', '运营', '销售', '市场', '会议', '财报', '股权', '董事会', '社交', '合作', '谈判'];
    const personalWords = ['学习', '读书', '技能', '健康', '健身', '运动', '知识', '能力', '成长', '培训', '课程', '证书'];
    const familyWords = ['家人', '伴侣', '配偶', '孩子', '子女', '父母', '家庭', '家务', '买房', '装修'];
    
    let companyScore = companyWords.filter(w => text.includes(w)).length;
    let personalScore = personalWords.filter(w => text.includes(w)).length;
    let familyScore = familyWords.filter(w => text.includes(w)).length;
    
    // 返回偏移量（将屏幕分为三个区域）
    if (companyScore >= personalScore && companyScore >= familyScore) {
      // 公司事务：左上方
      return { x: -this.canvas.width * 0.3, y: -this.canvas.height * 0.25 };
    } else if (personalScore >= familyScore) {
      // 个人成长：右上方
      return { x: this.canvas.width * 0.3, y: -this.canvas.height * 0.25 };
    } else {
      // 家庭责任：正下方
      return { x: 0, y: this.canvas.height * 0.3 };
    }
  }

  getColorByImportance(importance) {
    // 确保 importance 是有效数字
    const score = typeof importance === 'number' && isFinite(importance) ? importance : 0.5;
    
    if (score > 0.9) return { bg: { r: 220, g: 53, b: 69 }, text: '#fff' };
    if (score > 0.8) return { bg: { r: 253, g: 126, b: 20 }, text: '#fff' };
    if (score > 0.7) return { bg: { r: 255, g: 193, b: 7 }, text: '#212529' };
    if (score > 0.6) return { bg: { r: 40, g: 167, b: 69 }, text: '#fff' };
    if (score > 0.5) return { bg: { r: 23, g: 162, b: 184 }, text: '#fff' };
    if (score > 0.4) return { bg: { r: 0, g: 123, b: 255 }, text: '#fff' };
    if (score > 0.3) return { bg: { r: 111, g: 66, b: 193 }, text: '#fff' };
    if (score > 0.2) return { bg: { r: 108, g: 117, b: 125 }, text: '#fff' };
    return { bg: { r: 73, g: 80, b: 87 }, text: '#fff' };
  }
  
  /**
   * 基于文本生成唯一半径，确保任意两个气泡大小不同
   */
  getUniqueRadius(text, importance) {
    // 简单的字符串哈希
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转为32位整数
    }
    
    // 基于重要性确定基础大小范围
    const baseRadius = 20 + Math.pow(importance, 2) * 100;
    
    // 使用哈希添加微小差异 (-5 到 +5 像素)
    const variation = (Math.abs(hash) % 100) / 10 - 5;
    
    return Math.max(15, baseRadius + variation);
  }
  
  async addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;

    // 先使用本地分析快速显示
    const quickAnalysis = this.localAnalyze(text);
    const id = Date.now().toString();

    // 立即本地显示（0.1秒内）
    const colorConfig = this.getColorByImportance(quickAnalysis.score);
    const radius = this.getUniqueRadius(text, quickAnalysis.score);

    // 标记为本地添加，避免 onSnapshot 重复处理
    this.localIds.add(id);

    const newTodo = {
      id: id,
      text: text,
      importance: quickAnalysis.score,
      targetImportance: quickAnalysis.score,
      reason: quickAnalysis.reason + ' (分析中...)',
      radius: radius,
      targetRadius: radius,
      x: this.centerX + (Math.random() - 0.5) * 200,
      y: this.centerY + (Math.random() - 0.5) * 200,
      vx: 0, vy: 0,
      color: colorConfig.bg,
      textColor: colorConfig.text,
      done: false, opacity: 1, scale: 1,
      isAnalyzing: true
    };

    this.todos.push(newTodo);
    input.value = '';

    // 保存到 Firebase
    setDoc(doc(db, 'todos', id), {
      text: text,
      importance: quickAnalysis.score,
      reason: quickAnalysis.reason,
      needsAI: true,
      aiAnalyzed: false,
      createdAt: serverTimestamp()
    }).catch(e => console.error('[BubbleGTD] Save failed:', e));

    // 批量 Gemini 分析（分析所有任务，包括新添加的）
    if (this.todos.length >= 1) {
      console.log('[BubbleGTD] Starting batch Gemini analysis...');

      // 延迟执行，等待 Firebase 同步
      setTimeout(async () => {
        const allTodos = this.todos.filter(t => !t.done).map((t, idx) => ({
          index: idx + 1,
          id: t.id,
          text: t.text
        }));

        const result = await this.geminiAnalyzeAll(allTodos);

        if (result && result.tasks) {
          console.log('[BubbleGTD] Batch analysis complete:', result);

          // 更新所有任务的重要性
          result.tasks.forEach(task => {
            const todo = this.todos.find(t => t.id === allTodos[task.index - 1]?.id);
            if (todo) {
              todo.importance = task.score;
              todo.targetImportance = task.score;
              todo.reason = task.reason;
              todo.targetRadius = 20 + Math.pow(task.score, 2) * 100;
              const newColor = this.getColorByImportance(task.score);
              todo.color = newColor.bg;
              todo.textColor = newColor.text;
              todo.isAnalyzing = false;

              // 更新 Firebase
              setDoc(doc(db, 'todos', todo.id), {
                text: todo.text,
                importance: task.score,
                reason: task.reason,
                needsAI: false,
                aiAnalyzed: true,
                createdAt: serverTimestamp()
              }).catch(e => console.error('[BubbleGTD] Update failed:', e));
            }
          });

          // 保存相关性数据
          if (result.relations) {
            this.relations = result.relations.map(r => ({
              from: allTodos[r.from - 1]?.id,
              to: allTodos[r.to - 1]?.id,
              score: r.score,
              reason: r.reason || ''
            })).filter(r => r.from && r.to);
          }
        }
      }, 1000);
    }
  }
  
  triggerExplosion(todo) {
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x: todo.x, y: todo.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: todo.color,
        size: 3 + Math.random() * 5
      });
    }
    const fadeOut = () => {
      todo.opacity -= 0.05;
      todo.scale += 0.1;
      if (todo.opacity > 0) requestAnimationFrame(fadeOut);
    };
    fadeOut();
  }
  
  updateTodoSize(todo) {
    // 确保 targetRadius 是有效数字
    if (!isFinite(todo.targetRadius) || todo.targetRadius <= 0) {
      todo.targetRadius = 20;
    }
    if (!isFinite(todo.radius) || todo.radius <= 0) {
      todo.radius = todo.targetRadius;
    }
    
    if (Math.abs(todo.radius - todo.targetRadius) > 0.5) {
      todo.radius += (todo.targetRadius - todo.radius) * 0.1;
      return true;
    }
    todo.radius = todo.targetRadius;
    todo.importance = todo.targetImportance;
    return false;
  }
  
  getTodoAt(x, y) {
    for (let i = this.todos.length - 1; i >= 0; i--) {
      const todo = this.todos[i];
      if (todo.done) continue;
      const dx = x - todo.x, dy = y - todo.y;
      if (dx * dx + dy * dy < todo.radius * todo.radius) return todo;
    }
    return null;
  }
  
  handleStart(x, y) {
    this.touch.x = x; this.touch.y = y; this.touch.isDown = true;
    const todo = this.getTodoAt(x, y);
    if (todo) {
      this.touch.target = todo;
      this.longPressTimer = setTimeout(() => this.completeTodo(todo), 600);
    }
  }
  
  handleEnd() { clearTimeout(this.longPressTimer); this.touch.isDown = false; this.touch.target = null; }
  
  async completeTodo(todo) {
    if (todo.done) return;
    
    try {
      await deleteDoc(doc(db, 'todos', todo.id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }
  
  updatePhysics() {
    this.todos.forEach(todo => { if (!todo.done) this.updateTodoSize(todo); });
    
    // 找到最大气泡（重要性最高）作为锚点
    let maxTodo = null;
    let maxImportance = -1;
    for (const todo of this.todos) {
      if (!todo.done && todo.importance > maxImportance) {
        maxImportance = todo.importance;
        maxTodo = todo;
      }
    }
    
    // 计算所有气泡的平均位置（质心）
    let avgX = 0, avgY = 0, count = 0;
    for (const todo of this.todos) {
      if (!todo.done) {
        avgX += todo.x;
        avgY += todo.y;
        count++;
      }
    }
    if (count > 0) {
      avgX /= count;
      avgY /= count;
    } else {
      avgX = this.centerX;
      avgY = this.centerY;
    }
    
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      if (todo.done) continue;
      
      let fx = 0, fy = 0;
      
      // 1. 所有气泡都向中心 gentle 靠拢
      const dx = this.centerX - todo.x;
      const dy = this.centerY - todo.y;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      if (distToCenter > 0) {
        // 最大气泡引力稍强，其他气泡 gentle 靠拢
        const strength = (todo === maxTodo) ? 0.005 : 0.002;
        const attraction = Math.min(distToCenter * strength, 3);
        fx += (dx / distToCenter) * attraction;
        fy += (dy / distToCenter) * attraction;
      }
      
      // 2. 温和排斥 - 防止过度重叠，允许轻微重叠
      for (let j = 0; j < this.todos.length; j++) {
        if (i === j) continue;
        const other = this.todos[j];
        if (other.done) continue;
        
        const odx = other.x - todo.x;
        const ody = other.y - todo.y;
        const dist = Math.sqrt(odx * odx + ody * ody);
        if (!isFinite(dist) || dist === 0) continue;
        
        // 允许5%重叠：只有当重叠超过半径的5%时才排斥
        const minDist = (todo.radius + other.radius) * 0.95;
        if (dist < minDist) {
          const overlap = minDist - dist;
          const repulsion = overlap * 0.4; // 温和排斥
          fx -= (odx / dist) * repulsion;
          fy -= (ody / dist) * repulsion;
        }
      }
      
      // 2. 应用力
      todo.vx += fx;
      todo.vy += fy;
      
      // 3. 速度限制
      const maxSpeed = 8;
      const speed = Math.sqrt(todo.vx * todo.vx + todo.vy * todo.vy);
      if (speed > maxSpeed) {
        todo.vx = (todo.vx / speed) * maxSpeed;
        todo.vy = (todo.vy / speed) * maxSpeed;
      }
      
      // 4. 阻尼 - 增大以更快稳定
      todo.vx *= 0.8;
      todo.vy *= 0.8;
      
      // 5. 速度很小时归零（静止阈值）
      if (speed < 0.1) {
        todo.vx = 0;
        todo.vy = 0;
      }
      
      todo.x += todo.vx;
      todo.y += todo.vy;
      
      // 6. 边界限制
      const margin = todo.radius + 10;
      if (todo.x < margin) { todo.x = margin; todo.vx = 0; }
      if (todo.x > this.canvas.width - margin) { todo.x = this.canvas.width - margin; todo.vx = 0; }
      if (todo.y < margin) { todo.y = margin; todo.vy = 0; }
      if (todo.y > this.canvas.height - margin) { todo.y = this.canvas.height - margin; todo.vy = 0; }
    }
    
    // 粒子动画
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.02;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 找到最大气泡
    let maxTodo = null;
    let maxImportance = -1;
    for (const todo of this.todos) {
      if (!todo.done && todo.importance > maxImportance) {
        maxImportance = todo.importance;
        maxTodo = todo;
      }
    }
    
    // 先渲染非最大气泡（底层）
    for (const todo of this.todos) {
      if (todo === maxTodo) continue;
      if (todo.done && todo.opacity <= 0) continue;
      this.renderTodo(todo);
    }
    
    // 最后渲染最大气泡（最上层）
    if (maxTodo && !maxTodo.done) {
      this.renderTodo(maxTodo);
    }
    
    // 粒子动画
    for (const p of this.particles) {
      const c = p.color;
      this.ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${p.life})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  renderTodo(todo) {
    const r = todo.radius * todo.scale;
    
    // 检查所有渲染需要的值
    if (!isFinite(todo.x) || !isFinite(todo.y) || !isFinite(r) || r <= 0) {
      console.warn('[BubbleGTD] Invalid position/radius:', todo.x, todo.y, r);
      return;
    }
    
    // 检查颜色数据
    if (!todo.color || typeof todo.color.r !== 'number' || typeof todo.color.g !== 'number' || typeof todo.color.b !== 'number') {
      console.warn('[BubbleGTD] Invalid color:', todo.color);
      todo.color = { r: 100, g: 100, b: 100 }; // 默认灰色
    }
    
    // 检查透明度
    if (typeof todo.opacity !== 'number' || !isFinite(todo.opacity)) {
      todo.opacity = 1;
    }
    
    const bg = todo.color;
      
      // 主渐变 - 模拟球体光照
      const gradient = this.ctx.createRadialGradient(
        todo.x - r * 0.3, todo.y - r * 0.3, r * 0.1,
        todo.x, todo.y, r
      );
      // 高光区域（左上角）
      gradient.addColorStop(0, `rgba(${Math.min(bg.r + 60, 255)}, ${Math.min(bg.g + 60, 255)}, ${Math.min(bg.b + 60, 255)}, ${todo.opacity})`);
      // 中间过渡
      gradient.addColorStop(0.3, `rgba(${Math.min(bg.r + 20, 255)}, ${Math.min(bg.g + 20, 255)}, ${Math.min(bg.b + 20, 255)}, ${todo.opacity})`);
      // 主体颜色
      gradient.addColorStop(0.6, `rgba(${bg.r}, ${bg.g}, ${bg.b}, ${todo.opacity})`);
      // 阴影区域（右下角）
      gradient.addColorStop(1, `rgba(${Math.max(bg.r - 40, 0)}, ${Math.max(bg.g - 40, 0)}, ${Math.max(bg.b - 40, 0)}, ${todo.opacity})`);
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(todo.x, todo.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 主高光 - 柔和的大光斑
      const highlightGrad = this.ctx.createRadialGradient(
        todo.x - r * 0.4, todo.y - r * 0.4, 0,
        todo.x - r * 0.4, todo.y - r * 0.4, r * 0.25
      );
      highlightGrad.addColorStop(0, `rgba(255, 255, 255, ${0.5 * todo.opacity})`);
      highlightGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.15 * todo.opacity})`);
      highlightGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
      
      this.ctx.fillStyle = highlightGrad;
      this.ctx.beginPath();
      this.ctx.arc(todo.x - r * 0.4, todo.y - r * 0.4, r * 0.25, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 小高光点 - 增加真实感
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * todo.opacity})`;
      this.ctx.beginPath();
      this.ctx.arc(todo.x - r * 0.35, todo.y - r * 0.35, r * 0.06, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 边缘反光 - 模拟环境光
      const rimGrad = this.ctx.createRadialGradient(
        todo.x + r * 0.2, todo.y + r * 0.2, r * 0.5,
        todo.x, todo.y, r
      );
      rimGrad.addColorStop(0, `rgba(255, 255, 255, 0)`);
      rimGrad.addColorStop(0.8, `rgba(255, 255, 255, 0)`);
      rimGrad.addColorStop(1, `rgba(255, 255, 255, ${0.1 * todo.opacity})`);
      
      this.ctx.fillStyle = rimGrad;
      this.ctx.beginPath();
      this.ctx.arc(todo.x, todo.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      
      const textColor = todo.textColor || '#fff';
      this.ctx.fillStyle = textColor === '#fff' 
        ? `rgba(255, 255, 255, ${todo.opacity})`
        : `rgba(33, 37, 41, ${todo.opacity})`;
      
      const fontSize = Math.max(14, Math.min(r * 0.25, 32));
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      const maxWidth = r * 1.5;
      const words = todo.text.split('');
      let line = '', lines = [];
      for (const word of words) {
        const testLine = line + word;
        if (this.ctx.measureText(testLine).width > maxWidth && line !== '') {
          lines.push(line); line = word;
        } else { line = testLine; }
      }
      lines.push(line);
      if (lines.length > 3) lines = lines.slice(0, 2).concat(['...']);
      
      const lineHeight = r * 0.28;
      const startY = todo.y - (lines.length - 1) * lineHeight / 2;
      lines.forEach((line, index) => {
        this.ctx.fillText(line, todo.x, startY + index * lineHeight);
      });
      
      if (todo.reason && r > 40) {
        this.ctx.fillStyle = textColor === '#fff'
          ? `rgba(255, 255, 255, ${0.7 * todo.opacity})`
          : `rgba(33, 37, 41, ${0.7 * todo.opacity})`;
        const reasonFontSize = Math.max(10, Math.min(r * 0.12, 14));
        this.ctx.font = `${reasonFontSize}px sans-serif`;
        this.ctx.fillText(todo.reason, todo.x, startY + lines.length * lineHeight + 8);
      }
  }

  animate() {
    this.updatePhysics();
    this.render();
    requestAnimationFrame(() => this.animate());
  }
}

new BubbleTodo();
