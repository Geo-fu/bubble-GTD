// Firebase 配置
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
    
    // 直接加载数据，不需要登录
    this.loadTodosFromFirebase();
  }
  
  async loadTodosFromFirebase() {
    // 使用简单的集合结构，所有人共享
    const q = query(collection(db, 'todos'), orderBy('createdAt', 'desc'));
    
    // 只使用实时监听，不阻塞加载
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const id = change.doc.id;
        
        if (change.type === 'added') {
          // 跳过本地已添加的（避免重复）
          if (this.localIds.has(id)) {
            this.localIds.delete(id); // 清理
            return;
          }
          // 避免重复添加
          if (this.todos.find(t => t.id === id)) return;
          
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
        } else if (change.type === 'modified') {
          // AI 分析完成后更新
          const index = this.todos.findIndex(t => t.id === id);
          if (index !== -1) {
            const todo = this.todos[index];
            todo.importance = data.importance;
            todo.targetImportance = data.importance;
            todo.reason = data.reason;
            todo.targetRadius = 20 + Math.pow(data.importance, 2) * 100;
            const colorConfig = this.getColorByImportance(data.importance);
            todo.color = colorConfig.bg;
            todo.textColor = colorConfig.text;
          }
        } else if (change.type === 'removed') {
          const index = this.todos.findIndex(t => t.id === id);
          if (index !== -1 && !this.todos[index].done) {
            this.todos[index].done = true;
            this.triggerExplosion(this.todos[index]);
          }
        }
      });
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
   * 本地快速评估（AI 分析在后台每8小时执行一次）
   */
  localAnalyze(text) {
    let score = 0.5;
    const reasons = [];
    const lowerText = text.toLowerCase();
    
    // 金融/投资 - 高价值
    const financeWords = ['融资', '并购', '上市', 'ipo', '尽调', '尽职调查', '审计', '估值', '投资', '风控', '合规'];
    if (financeWords.some(w => lowerText.includes(w))) {
      score += 0.25;
      reasons.push('💰 金融/投资');
    }
    
    // 商业关键
    const businessWords = ['谈判', '签约', '合作', '客户', '战略', '决策', '规划'];
    if (businessWords.some(w => lowerText.includes(w))) {
      score += 0.15;
      reasons.push('💼 商业关键');
    }
    
    // 复利相关
    const compoundWords = ['学习', '读书', '技能', '产品', '系统', '团队', '流程'];
    if (compoundWords.some(w => lowerText.includes(w))) {
      score += 0.1;
      reasons.push('📈 复利');
    }
    
    // 紧急
    if (/紧急|马上|立刻|deadline|截止|今天/.test(lowerText)) {
      score += 0.1;
      reasons.push('⏰ 紧急');
    }
    
    // 低价值标记
    if (/回复|确认|收到|好的|谢谢/.test(lowerText) && reasons.length === 0) {
      score -= 0.1;
    }
    
    return {
      score: Math.min(Math.max(score, 0.2), 0.85), // 本地分析最高 0.85，留空间给 AI
      reason: reasons.join(' | ') || '一般任务',
      needsAI: reasons.length === 0 || score > 0.7 // 需要 AI 进一步分析
    };
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
    
    // 本地分析
    const analysis = this.localAnalyze(text);
    const id = Date.now().toString();
    
    // 立即本地显示（0.1秒内）
    const colorConfig = this.getColorByImportance(analysis.score);
    const radius = 20 + Math.pow(analysis.score, 2) * 100;
    
    // 标记为本地添加，避免 onSnapshot 重复处理
    this.localIds.add(id);
    
    this.todos.push({
      id: id,
      text: text,
      importance: analysis.score,
      targetImportance: analysis.score,
      reason: analysis.reason,
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
    
    input.value = '';
    
    // 后台同步到 Firebase（不阻塞）
    setDoc(doc(db, 'todos', id), {
      text: text,
      importance: analysis.score,
      reason: analysis.reason,
      needsAI: analysis.needsAI,
      aiAnalyzed: false,
      createdAt: serverTimestamp()
    }).catch(e => console.error('Save failed:', e));
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
      
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * todo.opacity})`;
      this.ctx.beginPath();
      this.ctx.arc(todo.x - r * 0.3, todo.y - r * 0.3, r * 0.2, 0, Math.PI * 2);
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
