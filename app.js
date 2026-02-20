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
    
    // 物理参数
    this.repulsionBase = 300;      // 基础斥力
    this.attractionBase = 0.0008;  // 基础引力
    this.relevanceThreshold = 0.3; // 相关度阈值
    
    // API 配置
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
    document.getElementById('addBtn').addEventListener('click', () => this.addTodo());
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTodo();
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
  
  /**
   * 计算两个事项的相关度 (0-1)
   */
  calculateRelevance(todo1, todo2) {
    const text1 = todo1.text.toLowerCase();
    const text2 = todo2.text.toLowerCase();
    let relevance = 0;
    
    // 1. 关键词重叠
    const keywords1 = this.extractKeywords(text1);
    const keywords2 = this.extractKeywords(text2);
    const commonWords = keywords1.filter(w => keywords2.includes(w));
    if (commonWords.length > 0) {
      relevance += commonWords.length * 0.15;
    }
    
    // 2. 同类型任务（都有复利关键词）
    const compoundWords = ['学习', '读书', '技能', '产品', '系统', '战略', '团队'];
    const hasCompound1 = compoundWords.some(w => text1.includes(w));
    const hasCompound2 = compoundWords.some(w => text2.includes(w));
    if (hasCompound1 && hasCompound2) relevance += 0.2;
    
    // 3. 同紧急程度
    const urgentWords = ['紧急', '马上', '立刻', 'deadline'];
    const isUrgent1 = urgentWords.some(w => text1.includes(w));
    const isUrgent2 = urgentWords.some(w => text2.includes(w));
    if (isUrgent1 && isUrgent2) relevance += 0.15;
    
    // 4. 重要性相近
    const importanceDiff = Math.abs(todo1.importance - todo2.importance);
    if (importanceDiff < 0.2) relevance += 0.1;
    
    // 5. 人物相关
    const peopleWords = ['老板', '客户', '领导', 'ceo'];
    const hasPeople1 = peopleWords.some(w => text1.includes(w));
    const hasPeople2 = peopleWords.some(w => text2.includes(w));
    if (hasPeople1 && hasPeople2) relevance += 0.15;
    
    return Math.min(relevance, 1);
  }
  
  extractKeywords(text) {
    // 提取有意义的关键词（过滤常见词）
    const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
    return text.split(/[\s,，.。!！?？;；]/)
      .filter(w => w.length >= 2 && !stopWords.includes(w))
      .slice(0, 5); // 最多取5个关键词
  }
  
  /**
   * 快速评估 - 立即显示
   */
  quickAnalyze(text) {
    let score = 0.5;
    const lowerText = text.toLowerCase();
    
    const urgentWords = ['紧急', '马上', '立刻', '现在', 'deadline', '截止'];
    urgentWords.forEach(w => { if (lowerText.includes(w)) score += 0.2; });
    
    const importantPeople = ['老板', '客户', '领导', 'ceo', '总裁'];
    importantPeople.forEach(w => { if (lowerText.includes(w)) score += 0.15; });
    
    const compoundWords = ['学习', '读书', '技能', '产品', '系统', '战略', '团队'];
    compoundWords.forEach(w => { if (lowerText.includes(w)) score += 0.1; });
    
    return {
      score: Math.min(Math.max(score, 0.3), 0.9),
      reason: '快速评估中...',
      isQuick: true
    };
  }
  
  /**
   * 深度评估 - 异步重新计算
   */
  deepAnalyze(text) {
    let score = 0.5;
    const lowerText = text.toLowerCase();
    const reasons = [];
    
    const timeWords = ['学习', '读书', '技能', '提升', '成长', '习惯', '健康', '理财'];
    let timeScore = 0;
    timeWords.forEach(w => { if (lowerText.includes(w)) timeScore += 0.15; });
    if (timeScore > 0) { score += Math.min(timeScore, 0.3); reasons.push('💡 时间复利'); }
    
    const marginWords = ['产品', '系统', '流程', '自动化', '品牌', '平台'];
    let marginScore = 0;
    marginWords.forEach(w => { if (lowerText.includes(w)) marginScore += 0.12; });
    if (marginScore > 0) { score += Math.min(marginScore, 0.25); reasons.push('🛠️ 边际收益'); }
    
    const networkWords = ['团队', '合作', '培训', '分享', '传承', '文档'];
    let networkScore = 0;
    networkWords.forEach(w => { if (lowerText.includes(w)) networkScore += 0.1; });
    if (networkScore > 0) { score += Math.min(networkScore, 0.2); reasons.push('👥 网络效应'); }
    
    const leverageWords = ['战略', '决策', '规划', '融资', '并购', '上市'];
    let leverageScore = 0;
    leverageWords.forEach(w => { if (lowerText.includes(w)) leverageScore += 0.18; });
    if (leverageScore > 0) { score += Math.min(leverageScore, 0.35); reasons.push('🎯 杠杆效应'); }
    
    const negativeWords = ['琐事', '重复', '机械', '无意义', '内耗', '扯皮'];
    negativeWords.forEach(w => { if (lowerText.includes(w)) score -= 0.2; });
    
    if (/会议|开会|讨论/.test(text) && !/决策|确定/.test(text)) {
      score -= 0.1; reasons.push('⚠️ 低产出会议');
    }
    
    if (/回复|确认|知悉/.test(text)) score -= 0.1;
    if (/思考|规划|设计|架构/.test(text)) score += 0.1;
    
    return { score: Math.min(Math.max(score, 0.1), 1), reason: reasons.join(' | ') || '一般任务', isQuick: false };
  }
  
  getColorByImportance(importance) {
    if (importance > 0.8) return { r: 255, g: 80, b: 80 };
    if (importance > 0.65) return { r: 255, g: 140, b: 60 };
    if (importance > 0.5) return { r: 255, g: 200, b: 80 };
    if (importance > 0.35) return { r: 100, g: 200, b: 255 };
    return { r: 150, g: 150, b: 180 };
  }
  
  addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    
    const quickAnalysis = this.quickAnalyze(text);
    const radius = 20 + Math.pow(quickAnalysis.score, 2) * 100; // 指数增长，区分度更大
    
    const todo = {
      id: Date.now(), text, importance: quickAnalysis.score, targetImportance: quickAnalysis.score,
      reason: quickAnalysis.reason, radius, targetRadius: radius,
      x: this.centerX + (Math.random() - 0.5) * 100, y: this.centerY + (Math.random() - 0.5) * 100,
      vx: 0, vy: 0, color: this.getColorByImportance(quickAnalysis.score),
      done: false, opacity: 1, scale: 1, isAnalyzing: true
    };
    
    this.todos.push(todo);
    this.saveTodos();
    input.value = '';
    
    setTimeout(() => {
      const deepAnalysis = this.deepAnalyze(text);
      todo.targetImportance = deepAnalysis.score;
      todo.targetRadius = 20 + Math.pow(deepAnalysis.score, 2) * 100;
      todo.reason = deepAnalysis.reason;
      todo.color = this.getColorByImportance(deepAnalysis.score);
      todo.isAnalyzing = false;
      this.saveTodos();
    }, 500);
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
  
  saveTodos() { localStorage.setItem('bubbleTodos', JSON.stringify(this.todos.filter(t => !t.done))); }
  
  loadTodos() {
    const saved = localStorage.getItem('bubbleTodos');
    if (saved) {
      this.todos = JSON.parse(saved);
      this.todos.forEach(todo => {
        todo.vx = 0; todo.vy = 0; todo.done = false; todo.opacity = 1; todo.scale = 1;
        todo.targetRadius = todo.radius; todo.targetImportance = todo.importance; todo.isAnalyzing = false;
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
  
  handleEnd() { clearTimeout(this.longPressTimer); this.touch.isDown = false; this.touch.target = null; }
  
  completeTodo(todo) {
    if (todo.done) return;
    todo.done = true;
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30;
      const speed = 2 + Math.random() * 4;
      this.particles.push({ x: todo.x, y: todo.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: todo.color, size: 3 + Math.random() * 5 });
    }
    const fadeOut = () => { todo.opacity -= 0.05; todo.scale += 0.1; if (todo.opacity > 0) requestAnimationFrame(fadeOut); };
    fadeOut();
    this.saveTodos();
  }
  
  /**
   * 物理引擎 - 包含相关度的引力和斥力
   */
  updatePhysics() {
    this.todos.forEach(todo => { if (!todo.done) this.updateTodoSize(todo); });
    
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      if (todo.done) continue;
      
      let fx = 0, fy = 0;
      
      // 1. 中心引力（防止飘出屏幕）
      fx += (this.centerX - todo.x) * this.centerAttraction;
      fy += (this.centerY - todo.y) * this.centerAttraction;
      
      // 2. 与其他事项的相互作用（基于相关度）
      for (let j = 0; j < this.todos.length; j++) {
        if (i === j) continue;
        const other = this.todos[j];
        if (other.done) continue;
        
        const dx = other.x - todo.x;
        const dy = other.y - todo.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0 || dist > 300) continue; // 距离太远忽略
        
        // 计算相关度
        const relevance = this.calculateRelevance(todo, other);
        
        // 基础斥力（防止重叠）
        const minDist = todo.radius + other.radius + 10;
        if (dist < minDist) {
          const repulsionForce = this.repulsionBase / (dist * dist);
          fx -= (dx / dist) * repulsionForce;
          fy -= (dy / dist) * repulsionForce;
        }
        
        // 基于相关度的引力和斥力
        if (relevance > this.relevanceThreshold) {
          // 高相关度 → 相互吸引（距离适中）
          const targetDist = 100 + (1 - relevance) * 100; // 相关度越高，目标距离越近
          if (dist > targetDist) {
            const attractionForce = this.attractionBase * relevance * (dist - targetDist);
            fx += (dx / dist) * attractionForce;
            fy += (dy / dist) * attractionForce;
          }
        } else {
          // 低相关度 → 相互排斥（距离过近时）
          if (dist < 150) {
            const lowRelevanceRepulsion = this.repulsionBase * 0.5 * (1 - relevance) / (dist * dist);
            fx -= (dx / dist) * lowRelevanceRepulsion;
            fy -= (dy / dist) * lowRelevanceRepulsion;
          }
        }
      }
      
      // 应用力
      todo.vx += fx;
      todo.vy += fy;
      todo.vx *= this.friction;
      todo.vy *= this.friction;
      todo.x += todo.vx;
      todo.y += todo.vy;
      
      // 边界限制
      const margin = todo.radius;
      todo.x = Math.max(margin, Math.min(this.canvas.width - margin, todo.x));
      todo.y = Math.max(margin, Math.min(this.canvas.height - margin, todo.y));
    }
    
    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.02;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 绘制相关度连线（高相关度的事项之间）
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < this.todos.length; i++) {
      for (let j = i + 1; j < this.todos.length; j++) {
        const todo1 = this.todos[i];
        const todo2 = this.todos[j];
        if (todo1.done || todo2.done) continue;
        
        const relevance = this.calculateRelevance(todo1, todo2);
        if (relevance > 0.5) {
          this.ctx.globalAlpha = relevance * 0.3;
          this.ctx.beginPath();
          this.ctx.moveTo(todo1.x, todo1.y);
          this.ctx.lineTo(todo2.x, todo2.y);
          this.ctx.stroke();
        }
      }
    }
    this.ctx.globalAlpha = 1;
    
    // 绘制气泡
    for (const todo of this.todos) {
      if (todo.done && todo.opacity <= 0) continue;
      const r = todo.radius * todo.scale;
      
      // 气泡主体
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
      
      // 分析中动画
      if (todo.isAnalyzing) {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(todo.x, todo.y, r + 5, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      
      // 高光
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * todo.opacity})`;
      this.ctx.beginPath();
      this.ctx.arc(todo.x - r * 0.3, todo.y - r * 0.3, r * 0.2, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 文字 - 字体大小与气泡半径成正比
      this.ctx.fillStyle = `rgba(255, 255, 255, ${todo.opacity})`;
      // 字体大小：最小14px，最大根据半径计算 (r * 0.25)，确保大气泡有大字体
      const fontSize = Math.max(14, Math.min(r * 0.25, 32));
      this.ctx.font = `${fontSize}px sans-serif`;
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
      
      // 原因 - 字体也随气泡大小调整
      if (todo.reason && r > 40) {
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * todo.opacity})`;
        const reasonFontSize = Math.max(10, Math.min(r * 0.12, 16));
        this.ctx.font = `${reasonFontSize}px sans-serif`;
        this.ctx.fillText(todo.reason, todo.x, startY + lines.length * lineHeight + 5);
      }
    }
    
    // 粒子
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
