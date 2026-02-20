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
    this.repulsionBase = 300;
    this.attractionBase = 0.0008;
    
    // API 配置 - 使用你的 Key
    this.apiKey = 'sk-bykEHxDd8e40RqS1jjywffXa2FwbFpdKpDzbT7Q1WyTk4kxY';
    this.useAI = true;
    
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
   * 调用 Kimi API 进行智能语义分析
   */
  async analyzeWithAI(text) {
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
      
      if (!response.ok) throw new Error('API error');
      
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
      console.log('AI analysis failed:', e);
    }
    return null;
  }
  
  /**
   * 本地快速评估（备用）
   */
  localAnalyze(text) {
    let score = 0.5;
    const reasons = [];
    const lowerText = text.toLowerCase();
    
    // 金融/投资
    const financeWords = ['融资', '并购', '上市', 'ipo', '尽调', '尽职调查', '审计', '估值', '投资', '风控'];
    if (financeWords.some(w => lowerText.includes(w))) {
      score += 0.25;
      reasons.push('💰 金融/投资');
    }
    
    // 商业关键
    const businessWords = ['谈判', '签约', '合作', '客户', '战略', '决策'];
    if (businessWords.some(w => lowerText.includes(w))) {
      score += 0.15;
      reasons.push('💼 商业关键');
    }
    
    // 紧急
    if (/紧急|马上|立刻|deadline|截止/.test(lowerText)) {
      score += 0.1;
      reasons.push('⏰ 紧急');
    }
    
    return {
      score: Math.min(Math.max(score, 0.3), 0.9),
      reason: reasons.join(' | ') || '一般任务'
    };
  }
  
  getColorByImportance(importance) {
    // 返回背景色和文字色
    if (importance > 0.9) return { bg: { r: 220, g: 53, b: 69 }, text: '#fff' };    // 深红
    if (importance > 0.8) return { bg: { r: 253, g: 126, b: 20 }, text: '#fff' };   // 橙色
    if (importance > 0.7) return { bg: { r: 255, g: 193, b: 7 }, text: '#212529' }; // 黄色
    if (importance > 0.6) return { bg: { r: 40, g: 167, b: 69 }, text: '#fff' };    // 绿色
    if (importance > 0.5) return { bg: { r: 23, g: 162, b: 184 }, text: '#fff' };   // 青色
    if (importance > 0.4) return { bg: { r: 0, g: 123, b: 255 }, text: '#fff' };    // 蓝色
    if (importance > 0.3) return { bg: { r: 111, g: 66, b: 193 }, text: '#fff' };   // 紫色
    if (importance > 0.2) return { bg: { r: 108, g: 117, b: 125 }, text: '#fff' };  // 灰色
    return { bg: { r: 73, g: 80, b: 87 }, text: '#fff' };                            // 深灰
  }
  
  async addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    
    const btn = document.getElementById('addBtn');
    btn.textContent = '...';
    btn.disabled = true;
    
    // 优先使用 AI 分析
    let analysis = await this.analyzeWithAI(text);
    
    // AI 失败则使用本地分析
    if (!analysis) {
      analysis = this.localAnalyze(text);
    }
    
    const radius = 20 + Math.pow(analysis.score, 2) * 100;
    
    const todo = {
      id: Date.now(),
      text: text,
      importance: analysis.score,
      targetImportance: analysis.score,
      reason: analysis.reason,
      radius: radius,
      targetRadius: radius,
      x: this.centerX + (Math.random() - 0.5) * 200,
      y: this.centerY + (Math.random() - 0.5) * 200,
      vx: 0, vy: 0,
      color: this.getColorByImportance(analysis.score).bg,
      textColor: this.getColorByImportance(analysis.score).text,
      done: false, opacity: 1, scale: 1,
      isAnalyzing: false
    };
    
    this.todos.push(todo);
    this.saveTodos();
    input.value = '';
    btn.textContent = '+';
    btn.disabled = false;
  }
  
  saveTodos() {
    localStorage.setItem('bubbleTodos', JSON.stringify(this.todos.filter(t => !t.done).map(t => t.text)));
  }
  
  async loadTodos() {
    const saved = localStorage.getItem('bubbleTodos');
    if (saved) {
      const texts = JSON.parse(saved);
      for (const text of texts) {
        if (typeof text === 'string') {
          // 重新用 AI 评估
          let analysis = await this.analyzeWithAI(text);
          if (!analysis) analysis = this.localAnalyze(text);
          
          const radius = 20 + Math.pow(analysis.score, 2) * 100;
          this.todos.push({
            id: Date.now() + Math.random(),
            text: text,
            importance: analysis.score,
            targetImportance: analysis.score,
            reason: analysis.reason,
            radius: radius,
            targetRadius: radius,
            x: this.centerX + (Math.random() - 0.5) * 200,
            y: this.centerY + (Math.random() - 0.5) * 200,
            vx: 0, vy: 0,
            color: this.getColorByImportance(analysis.score).bg,
            textColor: this.getColorByImportance(analysis.score).text,
            done: false, opacity: 1, scale: 1,
            isAnalyzing: false
          });
        }
      }
    }
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
  
  updatePhysics() {
    this.todos.forEach(todo => { if (!todo.done) this.updateTodoSize(todo); });
    
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      if (todo.done) continue;
      
      let fx = 0, fy = 0;
      
      // 重要性越高中引力越强
      const centerForce = this.centerAttraction * (0.5 + todo.importance * 1.5);
      fx += (this.centerX - todo.x) * centerForce;
      fy += (this.centerY - todo.y) * centerForce;
      
      // 与其他事项的相互作用
      for (let j = 0; j < this.todos.length; j++) {
        if (i === j) continue;
        const other = this.todos[j];
        if (other.done) continue;
        
        const dx = other.x - todo.x;
        const dy = other.y - todo.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;
        
        // 防止重叠
        const minDist = todo.radius + other.radius + 15;
        if (dist < minDist) {
          const repulsionForce = this.repulsionBase / (dist * dist + 1);
          fx -= (dx / dist) * repulsionForce;
          fy -= (dy / dist) * repulsionForce;
        }
        
        // 重要性相近的事项相互吸引（聚类）
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
      
      // 获取颜色配置
      const colorConfig = this.getColorByImportance(todo.importance);
      const bg = colorConfig.bg;
      
      const gradient = this.ctx.createRadialGradient(
        todo.x - r * 0.3, todo.y - r * 0.3, 0,
        todo.x, todo.y, r
      );
      gradient.addColorStop(0, `rgba(${Math.min(bg.r + 40, 255)}, ${Math.min(bg.g + 40, 255)}, ${Math.min(bg.b + 40, 255)}, ${todo.opacity})`);
      gradient.addColorStop(0.5, `rgba(${bg.r}, ${bg.g}, ${bg.b}, ${todo.opacity})`);
      gradient.addColorStop(1, `rgba(${Math.max(bg.r - 20, 0)}, ${Math.max(bg.g - 20, 0)}, ${Math.max(bg.b - 20, 0)}, ${todo.opacity})`);
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(todo.x, todo.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 高光
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * todo.opacity})`;
      this.ctx.beginPath();
      this.ctx.arc(todo.x - r * 0.3, todo.y - r * 0.3, r * 0.2, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 文字颜色根据背景色自动选择
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
      
      // 原因文字
      if (todo.reason && r > 40) {
        this.ctx.fillStyle = textColor === '#fff'
          ? `rgba(255, 255, 255, ${0.7 * todo.opacity})`
          : `rgba(33, 37, 41, ${0.7 * todo.opacity})`;
        const reasonFontSize = Math.max(10, Math.min(r * 0.12, 14));
        this.ctx.font = `${reasonFontSize}px sans-serif`;
        this.ctx.fillText(todo.reason, todo.x, startY + lines.length * lineHeight + 8);
      }
    }
    
    // 粒子效果
    for (const p of this.particles) {
      this.ctx.fillStyle = `rgba(${p.color.r || p.color.bg?.r || 100}, ${p.color.g || p.color.bg?.g || 100}, ${p.color.b || p.color.bg?.b || 100}, ${p.life})`;
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
