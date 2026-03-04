// Bubble GTD - 力学模型稳定版
// 物理特性：中心引力∝体积 + 排斥防重叠 + 固定阻尼0.9

// Firebase 配置
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
    
    // 先设置默认中心坐标，避免异步加载时 NaN
    this.canvas.width = window.innerWidth || 800;
    this.canvas.height = window.innerHeight || 600;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
    
    this.init();
  }
  
  init() {
    const initStart = performance.now();
    console.log('[BubbleGTD] init started');
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('touchstart', (e) => this.handleStart(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
    this.canvas.addEventListener('touchmove', (e) => this.handleMove(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
    this.canvas.addEventListener('touchend', () => this.handleEnd());
    this.canvas.addEventListener('mousedown', (e) => this.handleStart(e.clientX, e.clientY));
    this.canvas.addEventListener('mousemove', (e) => this.handleMove(e.clientX, e.clientY));
    this.canvas.addEventListener('mouseup', () => this.handleEnd());
    document.getElementById('addBtn').addEventListener('click', () => this.addTodo());
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTodo();
    });
    
    const initEnd = performance.now();
    console.log('[BubbleGTD] init took:', (initEnd - initStart).toFixed(2), 'ms');
    
    // 直接加载数据，不需要登录
    this.loadTodosFromFirebase();
  }
  
  initSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    const modal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeModal');
    
    settingsBtn.addEventListener('click', () => {
      modal.classList.add('active');
    });
    
    closeBtn.addEventListener('click', () => {
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
    const startTime = performance.now();
    console.log('[BubbleGTD] loadTodosFromFirebase started at:', startTime);
    
    // 使用简单的集合结构，所有人共享
    // 暂时不使用 orderBy，避免索引问题
    const q = query(collection(db, 'todos'));
    
    // 先显示加载提示
    console.log('[BubbleGTD] Loading data...');
    
    // 使用 get() 先获取一次数据，快速渲染
    try {
      const getDocsStart = performance.now();
      const initialSnapshot = await getDocs(q);
      const getDocsEnd = performance.now();
      console.log('[BubbleGTD] getDocs took:', (getDocsEnd - getDocsStart).toFixed(2), 'ms, docs count:', initialSnapshot.docs.length);
      
      // 快速渲染初始数据
      const renderStart = performance.now();
      initialSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        
        // 检查是否已存在
        if (this.todos.findIndex(t => t.id === id) !== -1) return;
        
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
          isAnalyzing: false,
          restTime: 0
        });
      });
      const renderEnd = performance.now();
      console.log('[BubbleGTD] Initial render took:', (renderEnd - renderStart).toFixed(2), 'ms');
    } catch (e) {
      console.error('[BubbleGTD] Initial load failed:', e);
    }
    
    const totalEnd = performance.now();
    console.log('[BubbleGTD] Total loadTodosFromFirebase took:', (totalEnd - startTime).toFixed(2), 'ms');
    
    // 然后设置实时监听处理后续变更
    console.log('[BubbleGTD] Setting up realtime listener...');
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
              isAnalyzing: false,
              restTime: 0 // 静止计时器
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
   * 基于复利思维的本地重要性分析
   * 评分范围：0.1 - 1.0，扩大区分度
   */
  semanticAnalyze(text) {
    const lowerText = text.toLowerCase();
    
    // ===== 极高复利价值 (0.85-1.0) =====
    // 战略级决策、核心资产、长期复利引擎
    const ultraHighValue = [
      /融资|ipo|上市|并购|估值|股权架构|控制权|董事会|股东会|战略投资/,
      /核心算法|专利布局|知识产权|技术壁垒|护城河|垄断优势/,
      /创始人|ceo|cto|合伙人|核心团队组建|股权激励|期权池/,
      /商业模式|盈利模式|现金流结构|复利系统|自动化收入/,
      /品牌定位|市场定义|品类开创|标准制定|行业规则/,
      /关键人脉|核心资源|独家合作|战略联盟|生态位/,
      /健康.*习惯|运动.*习惯|阅读.*习惯|写作.*习惯|思考.*习惯/,
      /家庭.*教育|子女.*教育|认知.*传承|家风|价值观.*传承/
    ];
    
    // ===== 高复利价值 (0.7-0.85) =====
    // 重要项目、关键能力、重要关系
    const highValue = [
      /产品.*迭代|版本.*规划|路线图|里程碑|发布|上线/,
      /客户.*签约|大客户|战略客户|关键客户|客户成功/,
      /团队.*搭建|人才.*招聘|关键岗位|骨干培养|梯队建设/,
      /市场营销|品牌建设|内容策略|用户增长|获客渠道/,
      /数据分析|用户洞察|竞品分析|市场调研|趋势判断/,
      /财务规划|预算管理|成本控制|现金流|财务报表/,
      /法律合规|合同审核|风险评估|合规体系|审计/,
      /技能.*提升|专业.*认证|学历.*提升|跨界.*学习/,
      /关键.*关系|深度.*社交|导师.*关系|贵人.*维护/,
      /运动.*系统|健身.*计划|饮食.*管理|睡眠.*优化/
    ];
    
    // ===== 中等复利价值 (0.5-0.7) =====
    // 日常执行、常规学习、一般维护
    const mediumValue = [
      /会议|讨论|沟通|协调|跟进|推进|落实|执行/,
      /文档|报告|总结|复盘|整理|归档|备案/,
      /学习|读书|课程|培训|练习|实验|尝试/,
      /日常.*维护|常规.*工作|标准.*流程|sop/,
      /社交|聚会|活动|应酬|人情.*往来/,
      /家庭.*日常|家务|采购|维修|保养/,
      /健康.*检查|体检|疫苗|保健|养生/
    ];
    
    // ===== 低复利价值 (0.3-0.5) =====
    // 临时事务、被动响应、低价值活动
    const lowValue = [
      /回复|答复|确认|收到|好的|ok|okay|嗯|哦|啊/,
      /临时|突发|紧急.*但不重要|救火|补丁/,
      /重复.*劳动|机械.*工作|纯.*体力|无.*积累/,
      /娱乐|消遣|刷.*视频|游戏|八卦|闲聊/,
      /抱怨|吐槽|消极.*情绪|内耗|焦虑.*无行动/
    ];
    
    // ===== 极低复利价值 (0.1-0.3) =====
    // 纯粹消耗、负面价值
    const ultraLowValue = [
      /无意义|浪费.*时间|纯粹.*消耗|无效.*社交/,
      /沉迷|上瘾|失控|过度|报复.*性/
    ];
    
    // ===== 时间维度加权 =====
    // 长期 vs 短期
    const longTerm = [
      /长期|战略|规划|愿景|三年|五年|十年|终身|一生/,
      /积累|沉淀|复利|滚雪球|时间.*朋友|延迟.*满足/
    ];
    
    const shortTerm = [
      /马上|立刻|今天.*必须|今晚|明天.*早上|asap|尽快|急/,
      /临时|突击|熬夜|加班|赶工|冲刺/
    ];
    
    // ===== 杠杆维度加权 =====
    // 高杠杆 vs 低杠杆
    const highLeverage = [
      /自动化|系统化|规模化|批量化|可复制|可扩展/,
      /团队|外包|分工|协作|杠杆|借力|借势/,
      /产品化|服务化|数字化|线上化|智能化/,
      /一次.*投入|持续.*产出|睡后.*收入|被动.*收入/
    ];
    
    const lowLeverage = [
      /亲自|亲手|自己.*做|单打.*独斗|一个人|孤立/,
      /一次性|临时性|不可.*复制|不可.*持续/
    ];
    
    // 计算基础分
    let baseScore = 0.5;
    let matchedCategories = [];
    
    // 检查极高价值
    for (const pattern of ultraHighValue) {
      if (pattern.test(lowerText)) {
        baseScore = Math.max(baseScore, 0.85 + Math.random() * 0.15);
        matchedCategories.push('🚀 极高复利');
        break;
      }
    }
    
    // 检查高价值（如果还没达到极高）
    if (baseScore < 0.85) {
      for (const pattern of highValue) {
        if (pattern.test(lowerText)) {
          baseScore = Math.max(baseScore, 0.7 + Math.random() * 0.15);
          matchedCategories.push('📈 高复利');
          break;
        }
      }
    }
    
    // 检查中等价值
    if (baseScore < 0.7) {
      for (const pattern of mediumValue) {
        if (pattern.test(lowerText)) {
          baseScore = Math.max(baseScore, 0.5 + Math.random() * 0.2);
          matchedCategories.push('📊 中等复利');
          break;
        }
      }
    }
    
    // 检查低价值
    if (baseScore < 0.5) {
      for (const pattern of lowValue) {
        if (pattern.test(lowerText)) {
          baseScore = Math.max(baseScore, 0.3 + Math.random() * 0.2);
          matchedCategories.push('📉 低复利');
          break;
        }
      }
    }
    
    // 检查极低价值
    if (baseScore < 0.3) {
      for (const pattern of ultraLowValue) {
        if (pattern.test(lowerText)) {
          baseScore = Math.max(baseScore, 0.1 + Math.random() * 0.2);
          matchedCategories.push('⛔ 极低复利');
          break;
        }
      }
    }
    
    // 时间维度调整
    let timeMultiplier = 1.0;
    const hasLongTerm = longTerm.some(p => p.test(lowerText));
    const hasShortTerm = shortTerm.some(p => p.test(lowerText));
    
    if (hasLongTerm && !hasShortTerm) {
      timeMultiplier = 1.15; // 长期视角加分
      matchedCategories.push('⏳ 长期视角');
    } else if (hasShortTerm && !hasLongTerm) {
      timeMultiplier = 0.85; // 纯短期视角减分
      matchedCategories.push('⏰ 短期紧急');
    }
    
    // 杠杆维度调整
    let leverageMultiplier = 1.0;
    const hasHighLeverage = highLeverage.some(p => p.test(lowerText));
    const hasLowLeverage = lowLeverage.some(p => p.test(lowerText));
    
    if (hasHighLeverage && !hasLowLeverage) {
      leverageMultiplier = 1.15; // 高杠杆加分
      matchedCategories.push('⚡ 高杠杆');
    } else if (hasLowLeverage && !hasHighLeverage) {
      leverageMultiplier = 0.85; // 低杠杆减分
      matchedCategories.push('🔧 低杠杆');
    }
    
    // 复合概念检测（额外加分）
    const compoundPatterns = [
      { pattern: /战略.*规划|规划.*战略/, bonus: 0.08, label: '🔗 战略规划' },
      { pattern: /核心.*团队|团队.*核心/, bonus: 0.08, label: '🔗 核心团队' },
      { pattern: /产品.*迭代|迭代.*产品/, bonus: 0.06, label: '🔗 产品迭代' },
      { pattern: /客户.*成功|成功.*客户/, bonus: 0.06, label: '🔗 客户成功' },
      { pattern: /自动.*化|系统.*化/, bonus: 0.07, label: '🔗 系统化' },
      { pattern: /复利.*思维|思维.*复利/, bonus: 0.1, label: '🔗 复利思维' },
      { pattern: /长期.*主义|主义.*长期/, bonus: 0.08, label: '🔗 长期主义' },
      { pattern: /习惯.*养成|养成.*习惯/, bonus: 0.07, label: '🔗 习惯养成' }
    ];
    
    let compoundBonus = 0;
    for (const compound of compoundPatterns) {
      if (compound.pattern.test(lowerText)) {
        compoundBonus += compound.bonus;
        matchedCategories.push(compound.label);
      }
    }
    
    // 计算最终分数
    let finalScore = baseScore * timeMultiplier * leverageMultiplier + compoundBonus;
    
    // 长度惩罚/奖励
    if (text.length < 3 && matchedCategories.length === 0) {
      finalScore -= 0.15; // 太短且无匹配，减分
    } else if (text.length > 15 && matchedCategories.length >= 2) {
      finalScore += 0.03; // 详细描述且多维度匹配，加分
    }
    
    // 确保在有效范围内
    finalScore = Math.min(Math.max(finalScore, 0.1), 1.0);
    
    // 生成原因描述
    let reason = matchedCategories.slice(0, 3).join(' | ');
    if (!reason) {
      if (finalScore >= 0.7) reason = '📈 潜在高价值';
      else if (finalScore >= 0.5) reason = '📊 一般价值';
      else reason = '📉 低价值/待评估';
    }
    
    return {
      score: finalScore,
      reason: reason
    };
  }
  
  /**
   * 计算任务间相关性（用于物理引擎）
   * 基于三个维度本地计算
   */
  getTaskRelation(todo1, todo2) {
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

    // 使用本地分析
    const quickAnalysis = this.semanticAnalyze(text);
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
      reason: quickAnalysis.reason,
      radius: radius,
      targetRadius: radius,
      x: this.centerX + (Math.random() - 0.5) * 200,
      y: this.centerY + (Math.random() - 0.5) * 200,
      vx: 0, vy: 0,
      color: colorConfig.bg,
      textColor: colorConfig.text,
      done: false, opacity: 1, scale: 1,
      isAnalyzing: false,
      restTime: 0
    };

    this.todos.push(newTodo);
    input.value = '';

    // 保存到 Firebase
    setDoc(doc(db, 'todos', id), {
      text: text,
      importance: quickAnalysis.score,
      reason: quickAnalysis.reason,
      createdAt: serverTimestamp()
    }).catch(e => console.error('[BubbleGTD] Save failed:', e));
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
    this.touch.x = x; 
    this.touch.y = y; 
    this.touch.isDown = true;
    this.touch.startY = y; // 记录起始Y坐标
    this.touch.hasMoved = false; // 标记是否移动过
    const todo = this.getTodoAt(x, y);
    if (todo) {
      this.touch.target = todo;
      // 确保 targetImportance 有效，否则使用 importance 作为后备
      const validImportance = typeof todo.targetImportance === 'number' && isFinite(todo.targetImportance) 
        ? todo.targetImportance 
        : (typeof todo.importance === 'number' && isFinite(todo.importance) ? todo.importance : 0.5);
      todo.baseImportance = validImportance;
      todo.targetImportance = validImportance; // 同步确保一致
      this.longPressTimer = setTimeout(() => this.completeTodo(todo), 600);
    }
  }
  
  handleMove(x, y) {
    if (!this.touch.isDown || !this.touch.target) return;
    
    const todo = this.touch.target;
    const dx = x - this.touch.x; // 当前帧与上一帧的X差值
    const dy = y - this.touch.y; // 当前帧与上一帧的Y差值
    const totalDy = y - this.touch.startY; // 总滑动距离
    
    // 标记已移动
    if (Math.abs(totalDy) > 5) {
      this.touch.hasMoved = true;
      clearTimeout(this.longPressTimer);
    }
    
    // 气泡跟随手指移动
    todo.x += dx * 0.8; // 0.8系数让气泡有轻微滞后感
    todo.y += dy * 0.8;
    todo.vx = 0; // 清除水平速度，避免物理引擎干扰
    todo.vy = 0; // 清除垂直速度，避免物理引擎干扰
    
    // 根据总滑动距离实时调整重要度（每50px调整0.015）
    const pixelsPerAdjustment = 50;
    const adjustmentPerStep = 0.015;
    
    // 计算基于滑动距离的重要度变化
    const importanceChange = (totalDy / pixelsPerAdjustment) * adjustmentPerStep;
    
    // 基础重要度 + 滑动带来的变化（向上滑动增加，向下滑动减少）
    // 确保 baseImportance 有效
    const validBaseImportance = typeof todo.baseImportance === 'number' && isFinite(todo.baseImportance) 
      ? todo.baseImportance 
      : (typeof todo.targetImportance === 'number' && isFinite(todo.targetImportance) ? todo.targetImportance : 0.5);
    todo.baseImportance = validBaseImportance;
    
    let newImportance = validBaseImportance - importanceChange;
    newImportance = Math.max(0.1, Math.min(1.0, newImportance));
    
    if (Math.abs(newImportance - todo.targetImportance) > 0.001) {
      todo.targetImportance = newImportance;
      todo.targetRadius = 20 + Math.pow(todo.targetImportance, 2) * 100;
      const newColor = this.getColorByImportance(todo.targetImportance);
      todo.color = newColor.bg;
      todo.textColor = newColor.text;
      // 节流：每100ms更新一次Firebase
      this.throttledUpdateImportance(todo);
    }
    
    // 更新上一帧位置
    this.touch.x = x;
    this.touch.y = y;
  }
  
  async updateTodoImportance(todo) {
    try {
      await setDoc(doc(db, 'todos', todo.id), {
        importance: todo.targetImportance,
        reason: todo.reason,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('Update importance failed:', e);
    }
  }
  
  throttledUpdateImportance(todo) {
    // 简单的节流：如果上次更新超过100ms才执行
    const now = Date.now();
    if (!todo.lastImportanceUpdate || now - todo.lastImportanceUpdate > 100) {
      todo.lastImportanceUpdate = now;
      this.updateTodoImportance(todo);
    }
  }
  
  handleEnd() { 
    clearTimeout(this.longPressTimer); 
    // 如果移动过，不触发完成
    if (this.touch.hasMoved) {
      this.touch.isDown = false;
      this.touch.target = null;
      this.touch.hasMoved = false;
      return;
    }
    this.touch.isDown = false; 
    this.touch.target = null; 
  }
  
  async completeTodo(todo) {
    if (todo.done) return;
    
    try {
      await deleteDoc(doc(db, 'todos', todo.id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }
  
  updatePhysics() {
    this.todos.forEach(todo => { 
      if (!todo.done) {
        this.updateTodoSize(todo);
        // 初始化能量系数（用于能量衰减）
        if (typeof todo.energy !== 'number') todo.energy = 1.0;
      }
    });
    
    // 找到最大气泡（重要性最高）作为锚点
    let maxTodo = null;
    let maxImportance = -1;
    for (const todo of this.todos) {
      if (!todo.done && todo.importance > maxImportance) {
        maxImportance = todo.importance;
        maxTodo = todo;
      }
    }
    
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      if (todo.done) continue;
      
      let fx = 0, fy = 0;
      
      // 1. 所有气泡都向中心 gentle 靠拢（能量衰减后力度减小，半径越大引力越强）
      const dx = this.centerX - todo.x;
      const dy = this.centerY - todo.y;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      if (distToCenter > 0) {
        // 基础力度 + 半径加成（质量越大引力越强）
        const baseStrength = (todo === maxTodo) ? 0.003 : 0.001;
        const massFactor = todo.radius / 50; // 半径越大，质量越大，引力越强
        const strength = baseStrength * massFactor;
        // 能量越低，引力越小（模拟能量衰减）
        const attraction = Math.min(distToCenter * strength * todo.energy, 5);
        fx += (dx / distToCenter) * attraction;
        fy += (dy / distToCenter) * attraction;
      }
      
      // 2. 温和排斥 - 碰撞时损失能量
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
          
          // 碰撞时损失能量
          todo.energy = Math.max(0.3, todo.energy - 0.02);
          other.energy = Math.max(0.3, other.energy - 0.02);
        }
      }
      
      // 2. 应用力
      todo.vx += fx;
      todo.vy += fy;
      
      // 3. 速度限制
      const maxSpeed = 8;
      let speed = Math.sqrt(todo.vx * todo.vx + todo.vy * todo.vy);
      if (speed > maxSpeed) {
        todo.vx = (todo.vx / speed) * maxSpeed;
        todo.vy = (todo.vy / speed) * maxSpeed;
        speed = maxSpeed; // 更新 speed 为限制后的值
      }
      
      // 4. 动态阻尼 - 速度低时阻尼随时间增大
      if (speed < 1) {
        // 速度低时，增加静止计时
        todo.restTime = (todo.restTime || 0) + 1;
      } else {
        // 速度高时，重置计时
        todo.restTime = 0;
      }
      
      // 固定阻尼 0.9
      todo.vx *= 0.9;
      todo.vy *= 0.9;
      
      // 5. 速度很小时归零（静止阈值）
      if (speed < 0.01) {
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
