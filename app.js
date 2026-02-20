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
    this.friction = 0.98;
    this.centerAttraction = 0.0003;
    this.touch = { x: 0, y: 0, isDown: false, target: null };
    this.longPressTimer = null;
    this.unsubscribe = null;
    this.localIds = new Set(); // 跟踪本地添加的 ID，避免重复
    
    // 物理参数
    this.repulsionBase = 300;
    this.attractionBase = 0.0008;
    
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
            const colorConfig = this.getColorByImportance(data.importance);
            const radius = 20 + Math.pow(data.importance, 2) * 100;
            
            this.todos.push({
              id: id,
              text: data.text,
              importance: data.importance,
              targetImportance: data.importance,
              reason: data.reason,
              radius: radius,
              targetRadius: radius,
              x: this.centerX + (Math.random() - 0.5) * 200,
              y: this.centerY + (Math.random() - 0.5) * 200,
              vx: 0, vy: 0,
              color: colorConfig.bg,
              textColor: colorConfig.text,
              done: false, opacity: 1, scale: 1,
              isAnalyzing: false
            });
          }
        } else {
          // 已存在 - 更新数据（AI分析结果等）
          const todo = this.todos[existingIndex];
          if (todo.importance !== data.importance || todo.reason !== data.reason) {
            todo.importance = data.importance;
            todo.targetImportance = data.importance;
            todo.reason = data.reason;
            todo.targetRadius = 20 + Math.pow(data.importance, 2) * 100;
            const colorConfig = this.getColorByImportance(data.importance);
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
   * Gemini API 语义分析
   * 需要先在 https://ai.google.dev/ 申请 API Key
   */
  async geminiAnalyze(text) {
    // 从 localStorage 获取 API Key，如果没有则提示用户
    let API_KEY = localStorage.getItem('gemini-api-key');
    
    if (!API_KEY) {
      // 尝试使用默认 key（仅用于演示）
      API_KEY = 'YOUR_GEMINI_API_KEY';
    }
    
    if (API_KEY === 'YOUR_GEMINI_API_KEY') {
      console.log('[BubbleGTD] Gemini API Key not set, using local analysis');
      throw new Error('API Key not configured');
    }
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `分析这个任务的重要性，基于复利思维（时间价值、边际收益、网络效应、杠杆效应）。

任务："${text}"

请以JSON格式返回：
{
  "score": 0.0-1.0,
  "reason": "简短说明，如：💰 高价值投资决策",
  "category": "金融/商业/学习/紧急/日常"
}

只返回JSON，不要其他文字。`
              }]
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 150
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BubbleGTD] Gemini API error:', response.status, errorData);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0]) {
        throw new Error('Invalid response format');
      }
      
      const content = data.candidates[0].content.parts[0].text;
      
      // 解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(Math.max(result.score, 0.1), 1.0),
          reason: result.reason || result.category || '🤖 AI分析',
          needsAI: false // 已经是AI分析的结果
        };
      }
    } catch (e) {
      console.error('[BubbleGTD] Gemini API failed:', e.message);
    }
    
    // 失败时回退到本地分析
    return this.semanticAnalyze(text);
  }
  
  /**
   * 本地快速评估（使用语义分析）
   */
  localAnalyze(text) {
    return this.semanticAnalyze(text);
  }
  
  /**
   * 异步 AI 分析（用于深度分析）
   */
  async analyzeWithAI(text) {
    // 优先使用 Gemini
    return await this.geminiAnalyze(text);
  }
  
  getColorByImportance(importance) {
    if (importance > 0.9) return { bg: { r: 220, g: 53, b: 69 }, text: '#fff' };
    if (importance > 0.8) return { bg: { r: 253, g: 126, b: 20 }, text: '#fff' };
    if (importance > 0.7) return { bg: { r: 255, g: 193, b: 7 }, text: '#212529' };
    if (importance > 0.6) return { bg: { r: 40, g: 167, b: 69 }, text: '#fff' };
    if (importance > 0.5) return { bg: { r: 23, g: 162, b: 184 }, text: '#fff' };
    if (importance > 0.4) return { bg: { r: 0, g: 123, b: 255 }, text: '#fff' };
    if (importance > 0.3) return { bg: { r: 111, g: 66, b: 193 }, text: '#fff' };
    if (importance > 0.2) return { bg: { r: 108, g: 117, b: 125 }, text: '#fff' };
    return { bg: { r: 73, g: 80, b: 87 }, text: '#fff' };
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
    const radius = 20 + Math.pow(quickAnalysis.score, 2) * 100;
    
    // 标记为本地添加，避免 onSnapshot 重复处理
    this.localIds.add(id);
    
    this.todos.push({
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
    });
    
    input.value = '';
    
    // 后台使用 Gemini API 深度分析
    console.log('[BubbleGTD] Starting Gemini analysis...');
    this.analyzeWithAI(text).then(aiAnalysis => {
      console.log('[BubbleGTD] Gemini analysis result:', aiAnalysis);
      
      // 更新本地气泡
      const todo = this.todos.find(t => t.id === id);
      if (todo) {
        todo.importance = aiAnalysis.score;
        todo.targetImportance = aiAnalysis.score;
        todo.reason = aiAnalysis.reason;
        todo.targetRadius = 20 + Math.pow(aiAnalysis.score, 2) * 100;
        const newColorConfig = this.getColorByImportance(aiAnalysis.score);
        todo.color = newColorConfig.bg;
        todo.textColor = newColorConfig.text;
        todo.isAnalyzing = false;
      }
      
      // 更新 Firebase
      setDoc(doc(db, 'todos', id), {
        text: text,
        importance: aiAnalysis.score,
        reason: aiAnalysis.reason,
        needsAI: false,
        aiAnalyzed: true,
        createdAt: serverTimestamp()
      }).catch(e => console.error('[BubbleGTD] Update failed:', e));
    }).catch(e => {
      console.error('[BubbleGTD] Gemini analysis failed:', e);
    });
    
    // 先保存初始数据到 Firebase
    setDoc(doc(db, 'todos', id), {
      text: text,
      importance: quickAnalysis.score,
      reason: quickAnalysis.reason,
      needsAI: true,
      aiAnalyzed: false,
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
    
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      if (todo.done) continue;
      
      let fx = 0, fy = 0;
      
      const centerForce = this.centerAttraction * (0.5 + todo.importance * 1.5);
      fx += (this.centerX - todo.x) * centerForce;
      fy += (this.centerY - todo.y) * centerForce;
      
      for (let j = 0; j < this.todos.length; j++) {
        if (i === j) continue;
        const other = this.todos[j];
        if (other.done) continue;
        
        const dx = other.x - todo.x;
        const dy = other.y - todo.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;
        
        const minDist = todo.radius + other.radius + 15;
        if (dist < minDist) {
          const repulsionForce = this.repulsionBase / (dist * dist + 1);
          fx -= (dx / dist) * repulsionForce;
          fy -= (dy / dist) * repulsionForce;
        }
        
        const importanceDiff = Math.abs(todo.importance - other.importance);
        if (importanceDiff < 0.2 && dist > 80) {
          const attractionForce = this.attractionBase * (1 - importanceDiff) * (dist - 80);
          fx += (dx / dist) * attractionForce;
          fy += (dy / dist) * attractionForce;
        }
      }
      
      todo.vx += fx;
      todo.vy += fy;
      todo.vx *= this.friction;
      todo.vy *= this.friction;
      todo.x += todo.vx;
      todo.y += todo.vy;
      
      const margin = todo.radius + 20;
      if (todo.x < margin) { todo.x = margin; todo.vx *= -0.5; }
      if (todo.x > this.canvas.width - margin) { todo.x = this.canvas.width - margin; todo.vx *= -0.5; }
      if (todo.y < margin) { todo.y = margin; todo.vy *= -0.5; }
      if (todo.y > this.canvas.height - margin) { todo.y = this.canvas.height - margin; todo.vy *= -0.5; }
    }
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.02;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (const todo of this.todos) {
      if (todo.done && todo.opacity <= 0) continue;
      const r = todo.radius * todo.scale;
      
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
    
    for (const p of this.particles) {
      const c = p.color;
      this.ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${p.life})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  animate() {
    this.updatePhysics();
    this.render();
    requestAnimationFrame(() => this.animate());
  }
}

new BubbleTodo();
