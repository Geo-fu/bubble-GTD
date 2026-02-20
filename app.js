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
    this.animate();
  }
  
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }
  
  analyzeImportance(text) {
    let score = 0.3;
    const keywords = {
      high: ['紧急', '重要', '立刻', '马上', 'deadline', '截止', '必须'],
      medium: ['今天', '明天', '本周', '需要'],
      low: ['下周', '以后', '有空', '也许']
    };
    const lowerText = text.toLowerCase();
    keywords.high.forEach(word => { if (lowerText.includes(word)) score += 0.3; });
    keywords.medium.forEach(word => { if (lowerText.includes(word)) score += 0.15; });
    keywords.low.forEach(word => { if (lowerText.includes(word)) score -= 0.1; });
    return Math.min(Math.max(score, 0.1), 1);
  }
  
  getColorByImportance(importance) {
    if (importance > 0.7) return { r: 255, g: 100, b: 100 };
    if (importance > 0.5) return { r: 255, g: 180, b: 80 };
    if (importance > 0.3) return { r: 255, g: 220, b: 100 };
    return { r: 100, g: 200, b: 255 };
  }
  
  addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    const importance = this.analyzeImportance(text);
    const radius = 30 + importance * 50;
    this.todos.push({
      id: Date.now(), text, importance, radius,
      x: this.centerX + (Math.random() - 0.5) * 100,
      y: this.centerY + (Math.random() - 0.5) * 100,
      vx: 0, vy: 0,
      color: this.getColorByImportance(importance),
      done: false, opacity: 1, scale: 1
    });
    input.value = '';
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
