class BubbleTodo {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.todos = [];
    this.particles = [];
    this.friction = 0.98;
    this.centerAttraction = 0.0005;
    this.touch = { x: 0, y: 0, isDown: false, target: null };
    this.longPressTimer = null;
    
    // API 配置（使用 Kimi API）
    this.apiKey = 'YOUR_API_KEY';
    this.useAI = false;
    
    this.init();
  }
  
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('touchstart', (e) => this.handleStart(e.touches[0].clientX, e.touches[0].clientY), {passive: false});
    this.canvas.addEventListener('touchend', () => this.handleEnd());
    this.canvas.addEventListener('mousedown', (e) => this.handleStart(e.clientX, e.clientY));
    this.canvas.addEventListener('mouseup', () => this.handleEnd());
    document.getElementById('addBtn').addEventListener('click', async () => await this.addTodo());
    document.getElementById('todoInput').addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') await this.addTodo();
    });
    
    this.loadTodos();
    this.animate();
  }
  
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }
  
  analyzeImportance(text) {
    const baseScore = this.baseAnalysis(text);
    const compoundScore = this.compoundAnalysis(text);
    const finalScore = baseScore * 0.3 + compoundScore * 0.7;
    
    return {
      score: Math.min(Math.max(finalScore, 0.1), 1),
      reason: this.generateReason(text, compoundScore)
    };
  }
  
  baseAnalysis(text) {
    let score = 0.3;
    const lowerText = text.toLowerCase();
    
    const urgencyKeywords = {
      high: ['紧急', '马上', '立刻', '现在', 'deadline', '截止', '到期', '超时'],
      medium: ['今天', '明天', '本周', '近期'],
      low: ['下周', '以后', '有空', '随缘']
    };
    
    urgencyKeywords.high.forEach(word => { if (lowerText.includes(word)) score += 0.25; });
    urgencyKeywords.medium.forEach(word => { if (lowerText.includes(word)) score += 0.1; });
    urgencyKeywords.low.forEach(word => { if (lowerText.includes(word)) score -= 0.1; });
    
    const peopleKeywords = ['老板', '客户', '领导', 'ceo', '总裁', '董事长'];
    peopleKeywords.forEach(word => { if (lowerText.includes(word)) score += 0.15; });
    
    if (/\d{1,2}[:\：]\d{2}/.test(text)) score += 0.1;
    if (/\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}/.test(text)) score += 0.1;
    
    return Math.min(Math.max(score, 0.1), 1);
  }
  
  compoundAnalysis(text) {
    let score = 0.5;
    const lowerText = text.toLowerCase();
    
    const timeCompoundKeywords = [
      '学习', '读书', '技能', '提升', '成长', '积累', '沉淀',
      '习惯', '锻炼', '健康', '理财', '投资', '知识', '能力'
    ];
    timeCompoundKeywords.forEach(word => {
      if (lowerText.includes(word)) score += 0.15;
    });
    
    const marginalGainKeywords = [
      '产品', '系统', '流程', '自动化', '工具', '平台',
      '品牌', '口碑', '影响力', '网络', '生态', '标准'
    ];
    marginalGainKeywords.forEach(word => {
      if (lowerText.includes(word)) score += 0.12;
    });
    
    const networkEffectKeywords = [
      '团队', '合作', '协作', '分享', '交流', '会议', '沟通',
      '招聘', '培训', '传承', '文档', '知识库', '方法论'
    ];
    networkEffectKeywords.forEach(word => {
      if (lowerText.includes(word)) score += 0.1;
    });
    
    const leverageKeywords = [
      '战略', '决策', '方向', '规划', '布局', '资源',
      '融资', '并购', '上市', 'ipo', '扩张', '规模化'
    ];
    leverageKeywords.forEach(word => {
      if (lowerText.includes(word)) score += 0.18;
    });
    
    const negativeCompoundKeywords = [
      '琐事', '重复', '机械', '无意义', '浪费时间', '内耗',
      '扯皮', '推诿', '拖延', '逃避', '应付', '交差'
    ];
    negativeCompoundKeywords.forEach(word => {
      if (lowerText.includes(word)) score -= 0.2;
    });
    
    if (/会议|开会|讨论|评审/.test(text)) {
      if (!/决策|确定|批准|通过/.test(text)) {
        score -= 0.1;
      }
    }
    
    if (/回复|答复|确认|知悉/.test(text)) {
      score -= 0.15;
    }
    
    if (/思考|规划|设计|架构/.test(text)) {
      score += 0.15;
    }
    
    return Math.min(Math.max(score, 0.1), 1);
  }
  
  generateReason(text, compoundScore) {
    const reasons = [];
    const lowerText = text.toLowerCase();
    
    if (compoundScore > 0.8) {
      reasons.push('🔥 高复利价值');
    } else if (compoundScore > 0.6) {
      reasons.push('📈 有累积效应');
    } else if (compoundScore < 0.4) {
      reasons.push('⚠️ 低复利价值');
    }
    
    if (/学习|读书|技能/.test(lowerText)) reasons.push('💡 能力提升');
    if (/产品|系统|流程/.test(lowerText)) reasons.push('🛠️ 系统建设');
    if (/团队|合作|培训/.test(lowerText)) reasons.push('👥 组织发展');
    if (/战略|决策|规划/.test(lowerText)) reasons.push('🎯 战略级');
    if (/紧急|马上|立刻/.test(lowerText)) reasons.push('⏰ 紧急');
    
    return reasons.join(' | ') || '一般任务';
  }
  
  async analyzeWithAI(text) {
    if (!this.useAI || !this.apiKey) {
      return null;
    }
    
    try {
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'kimi-k2.5',
          messages: [{
            role: 'system',
            content: `你是一个基于复利思维的任务重要性分析专家。请分析以下任务的重要性（0-1分），并说明原因。

复利思维评估维度：
1. 时间复利：今天做的事对未来有多大累积效应
2. 边际收益：每多做一次，收益是否递增
3. 网络效应：是否产生连接，价值随规模增长
4. 杠杆效应：一份努力能否产生多份回报

请以JSON格式返回：{"score": 0.85, "reason": "原因说明"}`
          }, {
            role: 'user',
            content: `任务：${text}`
          }],
          temperature: 0.3
        })
      });
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      const match = content.match(/\{[^}]+\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      console.log('AI analysis failed:', e);
    }
    return null;
  }
  
  getColorByImportance(importance) {
    if (importance > 0.8) return { r: 255, g: 80, b: 80 };
    if (importance > 0.65) return { r: 255, g: 140, b: 60 };
    if (importance > 0.5) return { r: 255, g: 200, b: 80 };
    if (importance > 0.35) return { r: 100, g: 200, b: 255 };
    return { r: 150, g: 150, b: 180 };
  }
  
  async addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    
    const btn = document.getElementById('addBtn');
    btn.textContent = '...';
    btn.disabled = true;
    
    let analysis = this.analyzeImportance(text);
    
    if (this.useAI) {
      const aiResult = await this.analyzeWithAI(text);
      if (aiResult) {
        analysis.score = aiResult.score * 0.6 + analysis.score * 0.4;
        analysis.reason = aiResult.reason;
      }
    }
    
    const radius = 25 + analysis.score * 55;
    
    const todo = {
      id: Date.now(),
      text: text,
      importance: analysis.score,
      reason: analysis.reason,
      radius: radius,
      x: this.centerX + (Math.random() - 0.5) * 100,
      y: this.centerY + (Math.random() - 0.5) * 100,
      vx: 0, vy: 0,
      color: this.getColorByImportance(analysis.score),
      done: false, opacity: 1, scale: 1
    };
    
    this.todos.push(todo);
    this.saveTodos();
    
    input.value = '';
    btn.textContent = '+';
    btn.disabled = false;
  }
  
  saveTodos() {
    localStorage.setItem('bubbleTodos', JSON.stringify(this.todos.filter(t => !t.done)));
  }
  
  loadTodos() {
    const saved = localStorage.getItem('bubbleTodos');
    if (saved) {
      this.todos = JSON.parse(saved);
      this.todos.forEach(todo => {
        todo.vx = 0; todo.vy = 0;
        todo.done = false; todo.opacity = 1; todo.scale = 1;
      });
    }
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
  
  handleEnd() {
    clearTimeout(this.longPressTimer);
    this.touch.isDown = false;
    this.touch.target = null;
  }
  
  completeTodo(todo) {
    if (todo.done) return;
    todo.done = true;
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x: todo.x, y: todo.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, color: todo.color, size: 3 + Math.random() * 5
      });
    }
    const fadeOut = () => {
      todo.opacity -= 0.05;
      todo.scale += 0.1;
      if (todo.opacity > 0) requestAnimationFrame(fadeOut);
    };
    fadeOut();
    this.saveTodos();
  }
  
  updatePhysics() {
    for (const todo of this.todos) {
      if (todo.done) continue;
      todo.vx += (this.centerX - todo.x) * this.centerAttraction;
      todo.vy += (this.centerY - todo.y) * this.centerAttraction;
      for (const other of this.todos) {
        if (todo === other || other.done) continue;
        const dx = other.x - todo.x, dy = other.y - todo.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;
        const minDist = todo.radius + other.radius + 20;
        if (dist < minDist) {
          const force = 200 / (dist * dist);
          todo.vx -= (dx / dist) * force;
          todo.vy -= (dy / dist) * force;
        }
      }
      todo.vx *= this.friction;
      todo.vy *= this.friction;
      todo.x += todo.vx;
      todo.y += todo.vy;
      const margin = todo.radius;
      todo.x = Math.max(margin, Math.min(this.canvas.width - margin, todo.x));
      todo.y = Math.max(margin, Math.min(this.canvas.height - margin, todo.y));
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
      const gradient = this.ctx.createRadialGradient(
        todo.x - r * 0.3, todo.y - r * 0.3, 0,
        todo.x, todo.y, r
      );
      gradient.addColorStop(0, `rgba(${todo.color.r + 50}, ${todo.color.g + 50}, ${todo.color.b + 50}, ${todo.opacity})`);
      gradient.addColorStop(0.5, `rgba(${todo.color.r}, ${todo.color.g}, ${todo.color.b}, ${todo.opacity})`);
      gradient.addColorStop(1, `rgba(${todo.color.r - 30}, ${todo.color.g - 30}, ${todo.color.b - 30}, ${todo.opacity})`);
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(todo.x, todo.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * todo.opacity})`;
      this.ctx.beginPath();
      this.ctx.arc(todo.x - r * 0.3, todo.y - r * 0.3, r * 0.2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = `rgba(255, 255, 255, ${todo.opacity})`;
      this.ctx.font = `${Math.max(12, r * 0.2)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const maxWidth = r * 1.6;
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
      const lineHeight = r * 0.25;
      const startY = todo.y - (lines.length - 1) * lineHeight / 2;
      lines.forEach((line, index) => {
        this.ctx.fillText(line, todo.x, startY + index * lineHeight);
      });
      if (todo.reason && r > 40) {
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * todo.opacity})`;
        this.ctx.font = `${Math.max(10, r * 0.1)}px sans-serif`;
        this.ctx.fillText(todo.reason, todo.x, startY + lines.length * lineHeight + 5);
      }
    }
    for (const p of this.particles) {
      this.ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.life})`;
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
