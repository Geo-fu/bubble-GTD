// Firebase 配置
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
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
const auth = getAuth(app);
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
    this.userId = null;
    this.unsubscribe = null;
    
    // 物理参数
    this.repulsionBase = 300;
    this.attractionBase = 0.0008;
    
    // API 配置
    this.apiKey = 'sk-bykEHxDd8e40RqS1jjywffXa2FwbFpdKpDzbT7Q1WyTk4kxY';
    this.useAI = true;
    this.aiCache = new Map();
    this.loadCache();
    
    // API 限流控制
    this.apiQueue = [];
    this.apiProcessing = false;
    this.apiDelay = 1000; // 请求间隔 1 秒
    
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
    
    // Firebase 匿名登录
    this.initAuth();
  }
  
  async initAuth() {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.userId = user.uid;
        console.log('Logged in:', user.uid);
        this.loadTodosFromFirebase();
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });
  }
  
  async loadTodosFromFirebase() {
    if (!this.userId) return;
    
    const q = query(collection(db, 'users', this.userId, 'todos'), orderBy('createdAt', 'desc'));
    
    // 1. 先获取现有数据
    try {
      const snapshot = await getDocs(q);
      this.todos = []; // 清空本地数据
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const colorConfig = this.getColorByImportance(data.importance);
        const radius = 20 + Math.pow(data.importance, 2) * 100;
        
        this.todos.push({
          id: doc.id,
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
      });
      
      console.log('Loaded', this.todos.length, 'todos');
    } catch (e) {
      console.error('Load failed:', e);
    }
    
    // 2. 然后监听实时更新
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const id = change.doc.id;
        
        if (change.type === 'added') {
          // 检查是否已存在（避免重复添加初始数据）
          if (!this.todos.find(t => t.id === id)) {
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
  
  // 缓存管理
  loadCache() {
    try {
      const saved = localStorage.getItem('bubbleAICache');
      if (saved) {
        const data = JSON.parse(saved);
        this.aiCache = new Map(data);
      }
    } catch (e) {
      this.aiCache = new Map();
    }
  }
  
  saveCache() {
    try {
      const entries = Array.from(this.aiCache.entries());
      if (entries.length > 100) {
        entries.splice(0, entries.length - 100);
      }
      localStorage.setItem('bubbleAICache', JSON.stringify(entries));
    } catch (e) {
      console.log('Save cache failed:', e);
    }
  }
  
  /**
   * 调用 Kimi API 进行智能语义分析（带缓存和限流）
   */
  async analyzeWithAI(text) {
    const cacheKey = text.trim().toLowerCase();
    
    if (this.aiCache.has(cacheKey)) {
      return this.aiCache.get(cacheKey);
    }
    
    // 加入队列
    return new Promise((resolve) => {
      this.apiQueue.push({ text, cacheKey, resolve });
      this.processApiQueue();
    });
  }
  
  async processApiQueue() {
    if (this.apiProcessing || this.apiQueue.length === 0) return;
    
    this.apiProcessing = true;
    const { text, cacheKey, resolve } = this.apiQueue.shift();
    
    let retries = 3;
    let result = null;
    
    while (retries > 0) {
      try {
        result = await this.callKimiAPI(text);
        if (result) break;
      } catch (e) {
        if (e.message.includes('429')) {
          console.log('Rate limited, waiting...');
          await this.sleep(2000 * (4 - retries)); // 递增等待
        }
      }
      retries--;
    }
    
    // 如果 API 失败，使用本地分析
    if (!result) {
      result = this.localAnalyze(text);
    }
    
    // 缓存结果
    this.aiCache.set(cacheKey, result);
    this.saveCache();
    
    resolve(result);
    
    this.apiProcessing = false;
    
    // 延迟处理下一个请求
    await this.sleep(this.apiDelay);
    this.processApiQueue();
  }
  
  async callKimiAPI(text) {
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
          content: `你是一个任务重要性分析专家。请以JSON返回：{"score": 0.85, "reason": "💰 金融高价值"}`
        }, {
          role: 'user',
          content: `分析："${text}"`
        }],
        temperature: 0.3,
        max_tokens: 80
      })
    });
    
    if (response.status === 429) {
      throw new Error('429 Rate limited');
    }
    
    if (!response.ok) return null;
    
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
    return null;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 本地快速评估（备用）
   */
  localAnalyze(text) {
    let score = 0.5;
    const reasons = [];
    const lowerText = text.toLowerCase();
    
    const financeWords = ['融资', '并购', '上市', 'ipo', '尽调', '尽职调查', '审计', '估值', '投资', '风控'];
    if (financeWords.some(w => lowerText.includes(w))) {
      score += 0.25;
      reasons.push('💰 金融/投资');
    }
    
    const businessWords = ['谈判', '签约', '合作', '客户', '战略', '决策'];
    if (businessWords.some(w => lowerText.includes(w))) {
      score += 0.15;
      reasons.push('💼 商业关键');
    }
    
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
    if (!text || !this.userId) return;
    
    const btn = document.getElementById('addBtn');
    btn.textContent = '...';
    btn.disabled = true;
    
    let analysis = await this.analyzeWithAI(text);
    if (!analysis) analysis = this.localAnalyze(text);
    
    // 保存到 Firebase
    try {
      await setDoc(doc(db, 'users', this.userId, 'todos', Date.now().toString()), {
        text: text,
        importance: analysis.score,
        reason: analysis.reason,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Save failed:', e);
    }
    
    input.value = '';
    btn.textContent = '+';
    btn.disabled = false;
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
    
    // 从 Firebase 删除
    if (this.userId) {
      try {
        await deleteDoc(doc(db, 'users', this.userId, 'todos', todo.id));
      } catch (e) {
        console.error('Delete failed:', e);
      }
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
