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
   * 快速评估 - 立即显示
   */
  quickAnalyze(text) {
    let score = 0.5;
    const lowerText = text.toLowerCase();
    
    // 紧急关键词
    const urgentWords = ['紧急', '马上', '立刻', '现在', 'deadline', '截止'];
    urgentWords.forEach(w => { if (lowerText.includes(w)) score += 0.2; });
    
    // 重要人物
    const importantPeople = ['老板', '客户', '领导', 'ceo', '总裁'];
    importantPeople.forEach(w => { if (lowerText.includes(w)) score += 0.15; });
    
    // 复利关键词
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
    
    // 1. 时间复利
    const timeWords = ['学习', '读书', '技能', '提升', '成长', '习惯', '健康', '理财'];
    let timeScore = 0;
    timeWords.forEach(w => { if (lowerText.includes(w)) timeScore += 0.15; });
    if (timeScore > 0) {
      score += Math.min(timeScore, 0.3);
      reasons.push('💡 时间复利');
    }
    
    // 2. 边际收益
    const marginWords = ['产品', '系统', '流程', '自动化', '品牌', '平台'];
    let marginScore = 0;
    marginWords.forEach(w => { if (lowerText.includes(w)) marginScore += 0.12; });
    if (marginScore > 0) {
      score += Math.min(marginScore, 0.25);
      reasons.push('🛠️ 边际收益递增');
    }
    
    // 3. 网络效应
    const networkWords = ['团队', '合作', '培训', '分享', '传承', '文档'];
    let networkScore = 0;
    networkWords.forEach(w => { if (lowerText.includes(w)) networkScore += 0.1; });
    if (networkScore > 0) {
      score += Math.min(networkScore, 0.2);
      reasons.push('👥 网络效应');
    }
    
    // 4. 杠杆效应
    const leverageWords = ['战略', '决策', '规划', '融资', '并购', '上市'];
    let leverageScore = 0;
    leverageWords.forEach(w => { if (lowerText.includes(w)) leverageScore += 0.18; });
    if (leverageScore > 0) {
      score += Math.min(leverageScore, 0.35);
      reasons.push('🎯 杠杆效应');
    }
    
    // 5. 紧急程度
    const urgentWords = ['紧急', '马上', '立刻', 'deadline', '截止'];
    let urgentScore = 0;
    urgentWords.forEach(w => { if (lowerText.includes(w)) urgentScore += 0.15; });
    if (urgentScore > 0) {
      score += Math.min(urgentScore, 0.3);
      reasons.push('⏰ 紧急');
    }
    
    // 6. 负面复利（减分）
    const negativeWords = ['琐事', '重复', '机械', '无意义', '内耗', '扯皮'];
    negativeWords.forEach(w => { if (lowerText.includes(w)) score -= 0.2; });
    
    // 7. 任务类型判断
    if (/会议|开会|讨论/.test(text) && !/决策|确定/.test(text)) {
      score -= 0.1;
      reasons.push('⚠️ 低产出会议');
    }
    
    if (/回复|确认|知悉/.test(text)) {
      score -= 0.1;
    }
    
    if (/思考|规划|设计|架构/.test(text)) {
      score += 0.1;
    }
    
    const finalScore = Math.min(Math.max(score, 0.1), 1);
    
    return {
      score: finalScore,
      reason: reasons.length > 0 ? reasons.join(' | ') : '一般任务',
      isQuick: false
    };
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
    
    // 1. 快速评估 - 立即显示
    const quickAnalysis = this.quickAnalyze(text);
    const radius = 25 + quickAnalysis.score * 55;
    
    const todo = {
      id: Date.now(),
      text: text,
      importance: quickAnalysis.score,
      targetImportance: quickAnalysis.score, // 目标重要性（用于动画过渡）
      reason: quickAnalysis.reason,
      radius: radius,
      targetRadius: radius,
      x: this.centerX + (Math.random() - 0.5) * 100,
      y: this.centerY + (Math.random() - 0.5) * 100,
      vx: 0, vy: 0,
      color: this.getColorByImportance(quickAnalysis.score),
      done: false, opacity: 1, scale: 1,
      isAnalyzing: true
    };
    
    this.todos.push(todo);
    this.saveTodos();
    input.value = '';
    
    // 2. 异步深度评估 - 500ms 后重新计算
    setTimeout(() => {
      const deepAnalysis = this.deepAnalyze(text);
      
      // 更新目标值（通过动画过渡到新大小）
      todo.targetImportance = deepAnalysis.score;
      todo.targetRadius = 25 + deepAnalysis.score * 55;
      todo.reason = deepAnalysis.reason;
      todo.color = this.getColorByImportance(deepAnalysis.score);
      todo.isAnalyzing = false;
      
      this.saveTodos();
    }, 500);
  }
  
  // 动画过渡到新大小
  updateTodoSize(todo) {
    if (Math.abs(todo.radius - todo.targetRadius) > 0.5) {
      todo.radius += (todo.targetRadius - todo.radius) * 0.1;
      return true; // 还在动画中
    }
    todo.radius = todo.targetRadius;
    todo.importance = todo.targetImportance;
    return false;
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
        todo.targetRadius = todo.radius;
        todo.targetImportance = todo.importance;
        todo.isAnalyzing = false;
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
    // 更新气泡大小动画
    this.todos.forEach(todo => {
      if (!todo.done) {
        this.updateTodoSize(todo);
      }
    });
    
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
      
      // 分析中动画效果
      if (todo.isAnalyzing) {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(todo.x, todo.y, r + 5, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      
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
