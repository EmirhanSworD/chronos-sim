/**
 * Chronos-Sim: Live HTML5 Canvas Simulation Viewer
 * Connects to Server-Sent Events (SSE) stream, renders 50x50 spatial grid,
 * agents, A* paths, targets, dynamic obstacles, and real-time event telemetry.
 */

(function () {
  const canvas = document.getElementById('simCanvas');
  const ctx = canvas.getContext('2d');

  const valTick = document.getElementById('valTick');
  const valAgents = document.getElementById('valAgents');
  const valFps = document.getElementById('valFps');
  const coordHint = document.getElementById('coordHint');
  const logList = document.getElementById('logList');
  const chkFilterMovement = document.getElementById('chkFilterMovement');
  const btnSpawnAgent = document.getElementById('btnSpawnAgent');
  const btnTogglePause = document.getElementById('btnTogglePause');
  const btnClearObstacles = document.getElementById('btnClearObstacles');
  const pauseIcon = document.getElementById('pauseIcon');
  const pauseText = document.getElementById('pauseText');

  const GRID_SIZE = 50;
  const CELL_SIZE = canvas.width / GRID_SIZE; // 750 / 50 = 15px

  // State
  let agents = [];
  const obstacles = new Set();
  let currentTick = 0;
  let activeAgents = 0;
  let hoverCell = null;
  let isPaused = false;

  // FPS calculation
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let currentFps = 60;

  // Agent Color Palette Map
  const agentColors = {
    'Agent-Alpha': '#38bdf8', // sky blue
    'Agent-Beta': '#ec4899',  // pink
    'Agent-Gamma': '#f59e0b', // amber
    'Agent-Delta': '#a855f7', // purple
  };

  function getAgentColor(id) {
    if (agentColors[id]) return agentColors[id];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 80%, 60%)`;
  }

  // --- Rendering Loop ---

  function render(now) {
    // FPS computation
    frameCount++;
    if (now - lastFpsUpdate >= 500) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      valFps.textContent = currentFps;
      frameCount = 0;
      lastFpsUpdate = now;
    }

    // 1. Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw 50x50 Grid Lines
    ctx.strokeStyle = '#151c2c';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const pos = i * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    // 3. Draw Dynamic Obstacles (Gray Blocks)
    for (const key of obstacles) {
      const [cx, cy] = key.split(':').map(Number);
      const px = cx * CELL_SIZE;
      const py = cy * CELL_SIZE;

      ctx.fillStyle = '#475569';
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    // 4. Draw Hover Highlight
    if (hoverCell) {
      const hx = hoverCell.x * CELL_SIZE;
      const hy = hoverCell.y * CELL_SIZE;
      ctx.fillStyle = obstacles.has(`${hoverCell.x}:${hoverCell.y}`)
        ? 'rgba(239, 68, 68, 0.3)'
        : 'rgba(56, 189, 248, 0.25)';
      ctx.fillRect(hx, hy, CELL_SIZE, CELL_SIZE);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx, hy, CELL_SIZE, CELL_SIZE);
    }

    // 5. Draw Targets (Green Circles/Rings)
    for (const agent of agents) {
      if (agent.target) {
        const tx = (agent.target.x + 0.5) * CELL_SIZE;
        const ty = (agent.target.y + 0.5) * CELL_SIZE;

        // Outer glow
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, CELL_SIZE * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        // Inner target point
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(tx, ty, CELL_SIZE * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Target center dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. Draw Calculated A* Paths (Thin lines)
    for (const agent of agents) {
      if (agent.path && agent.path.length > 0) {
        const color = getAgentColor(agent.id);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        // Start from agent position
        const startX = (agent.position.x + 0.5) * CELL_SIZE;
        const startY = (agent.position.y + 0.5) * CELL_SIZE;
        ctx.moveTo(startX, startY);

        for (const pt of agent.path) {
          const px = (pt.x + 0.5) * CELL_SIZE;
          const py = (pt.y + 0.5) * CELL_SIZE;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }
    }

    // 7. Draw Agents (Colored Circles with State Rings)
    for (const agent of agents) {
      const ax = (agent.position.x + 0.5) * CELL_SIZE;
      const ay = (agent.position.y + 0.5) * CELL_SIZE;
      const baseColor = getAgentColor(agent.id);
      const radius = CELL_SIZE * 0.42;

      // State Ring
      if (agent.state === 'BLOCKED') {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (agent.state === 'COMPLETED') {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Main Agent Circle
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(ax, ay, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner white highlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ax - radius * 0.3, ay - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
      ctx.fill();

      // Agent ID label above agent
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '10px ui-monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agent.id.replace('Agent-', ''), ax, ay - radius - 3);
    }

    requestAnimationFrame(render);
  }

  // --- Mouse Interactivity (Dynamic Obstacle Placement) ---

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);

    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      hoverCell = { x, y };
      const status = obstacles.has(`${x}:${y}`) ? 'ENGEL VAR (Kaldırmak için tıkla)' : 'BOŞ (Engel koymak için tıkla)';
      coordHint.textContent = `Grid: [x: ${x}, y: ${y}] | ${status}`;
    } else {
      hoverCell = null;
      coordHint.textContent = 'Grid: [x: --, y: --] | Engel eklemek/kaldırmak için tıkla';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoverCell = null;
    coordHint.textContent = 'Grid: [x: --, y: --] | Engel eklemek/kaldırmak için tıkla';
  });

  canvas.addEventListener('click', async (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);

    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
      return;
    }

    // Optimistic toggle
    const key = `${x}:${y}`;
    if (obstacles.has(key)) {
      obstacles.delete(key);
    } else {
      obstacles.add(key);
    }

    try {
      await fetch('/api/obstacles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch (err) {
      console.error('Failed to toggle obstacle:', err);
    }
  });

  // --- Controls Bar Handlers ---

  btnSpawnAgent.addEventListener('click', async () => {
    const sx = Math.floor(Math.random() * 46) + 2;
    const sy = Math.floor(Math.random() * 46) + 2;
    const tx = Math.floor(Math.random() * 46) + 2;
    const ty = Math.floor(Math.random() * 46) + 2;

    try {
      await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startX: sx, startY: sy, targetX: tx, targetY: ty }),
      });
    } catch (err) {
      console.error('Failed to spawn agent:', err);
    }
  });

  btnTogglePause.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/toggle-pause', { method: 'POST' });
      const data = await res.json();
      isPaused = !data.active;
      if (isPaused) {
        pauseIcon.textContent = '▶';
        pauseText.textContent = 'Devam Et';
      } else {
        pauseIcon.textContent = '⏸';
        pauseText.textContent = 'Durdur';
      }
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  });

  btnClearObstacles.addEventListener('click', async () => {
    obstacles.clear();
    try {
      await fetch('/api/obstacles/clear', { method: 'POST' });
    } catch (err) {
      console.error('Failed to clear obstacles:', err);
    }
  });

  // --- Event Stream & Logs Panel ---

  function appendLog(event) {
    if (chkFilterMovement.checked && event.type === 'AGENT_MOVED') {
      return;
    }

    const item = document.createElement('div');
    item.className = 'log-item';

    let detail = '';
    switch (event.type) {
      case 'OBSTACLE_ADDED':
        detail = `Engel eklendi: (${event.position.x}, ${event.position.y})`;
        break;
      case 'OBSTACLE_REMOVED':
        detail = `Engel kaldırıldı: (${event.position.x}, ${event.position.y})`;
        break;
      case 'PATH_CALCULATED':
        detail = `${event.agentId}: (${event.from.x.toFixed(0)}, ${event.from.y.toFixed(0)}) -> (${event.to.x}, ${event.to.y}) [Rota: ${event.pathLength} adım]`;
        break;
      case 'AGENT_BLOCKED':
        detail = `${event.agentId} BLOKE OLDU! (${event.position.x.toFixed(0)}, ${event.position.y.toFixed(0)}) Sebep: ${event.reason}`;
        break;
      case 'AGENT_REACHED_TARGET':
        detail = `${event.agentId} hedefe vardı! (${event.target.x}, ${event.target.y})`;
        break;
      case 'AGENT_SPAWNED':
        detail = `${event.agent.id} oluşturuldu (${event.agent.position.x}, ${event.agent.position.y})`;
        break;
      case 'AGENT_STATE_CHANGED':
        detail = `${event.agentId}: ${event.previousState} -> ${event.newState} (${event.reason || ''})`;
        break;
      case 'SNAPSHOT_CREATED':
        detail = `Snapshot kaydedildi (Ajan: ${event.agentCount}, Engel: ${event.obstacleCount})`;
        break;
      case 'AGENT_MOVED':
        detail = `${event.agentId}: (${event.to.x.toFixed(1)}, ${event.to.y.toFixed(1)})`;
        break;
      default:
        detail = JSON.stringify(event);
    }

    item.innerHTML = `
      <span class="log-tick">#${event.tick}</span>
      <span class="log-type type-${event.type}">${event.type}</span>
      <span class="log-detail">${detail}</span>
    `;

    logList.appendChild(item);

    // Limit DOM log size
    while (logList.children.length > 200) {
      logList.removeChild(logList.firstChild);
    }

    // Auto-scroll to latest
    logList.scrollTop = logList.scrollHeight;
  }

  function connectEventStream() {
    const sse = new EventSource('/api/stream');

    sse.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.type === 'INIT' || data.type === 'TICK') {
          currentTick = data.tick;
          activeAgents = data.activeAgents ?? data.agents?.length ?? 0;
          agents = data.agents || [];

          valTick.textContent = currentTick;
          valAgents.textContent = activeAgents;

          if (data.obstacles) {
            obstacles.clear();
            for (const o of data.obstacles) {
              obstacles.add(`${o.x}:${o.y}`);
            }
          }

          if (data.events && Array.isArray(data.events)) {
            for (const ev of data.events) {
              appendLog(ev);
            }
          }
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };

    sse.onerror = () => {
      document.getElementById('connection-status').textContent = 'Yeniden Bağlanıyor...';
      document.getElementById('connection-status').style.color = '#f59e0b';
    };

    sse.onopen = () => {
      document.getElementById('connection-status').textContent = 'Canlı Yayın (SSE)';
      document.getElementById('connection-status').style.color = '#10b981';
    };
  }

  // Start loop & SSE
  connectEventStream();
  requestAnimationFrame(render);
})();
