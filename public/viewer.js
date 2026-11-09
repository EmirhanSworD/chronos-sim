/**
 * Chronos-Sim // Tactical Radar Command Center & Time-Travel Engine
 * Cyberpunk dark-themed HTML5 Canvas renderer with drag-and-draw terrain editing,
 * dynamic threat auras, FSM-colored agents, stamina indicators, and time-travel replay.
 */

(function () {
  'use strict';

  // --- DOM Element References ---
  const canvas = document.getElementById('simCanvas');
  const ctx = canvas.getContext('2d');

  const coordHint = document.getElementById('coordHint');
  const radarTip = document.getElementById('radarTip');
  const connectionStatus = document.getElementById('connection-status');
  const brushButtons = document.querySelectorAll('.brush-btn');
  const btnClearObstacles = document.getElementById('btnClearObstacles');

  const btnTogglePause = document.getElementById('btnTogglePause');
  const pauseIcon = document.getElementById('pauseIcon');
  const pauseText = document.getElementById('pauseText');
  const btnStep = document.getElementById('btnStep');
  const selectSpeed = document.getElementById('selectSpeed');
  const replayModeTag = document.getElementById('replayModeTag');
  const timelineTickLabel = document.getElementById('timelineTickLabel');
  const btnGoLive = document.getElementById('btnGoLive');
  const timelineSlider = document.getElementById('timelineSlider');

  const valTps = document.getElementById('valTps');
  const valAgents = document.getElementById('valAgents');
  const valRecharging = document.getElementById('valRecharging');
  const valAStarTime = document.getElementById('valAStarTime');
  const valFps = document.getElementById('valFps');

  const matrixTotalBadge = document.getElementById('matrixTotalBadge');
  const countNavigating = document.getElementById('countNavigating');
  const countEvading = document.getElementById('countEvading');
  const countRecharging = document.getElementById('countRecharging');
  const countExhausted = document.getElementById('countExhausted');
  const countBlocked = document.getElementById('countBlocked');
  const countCompleted = document.getElementById('countCompleted');

  const terminalLogs = document.getElementById('terminalLogs');

  // --- Constants ---
  const GRID_SIZE = 50;
  const CELL_SIZE = canvas.width / GRID_SIZE; // 750 / 50 = 15px

  // --- Simulation State ---
  let agents = [];
  const obstacles = new Set();
  const cellTypes = new Map(); // "x:y" -> CellType
  let stations = [];
  let threats = [];
  let currentTick = 0;
  let maxRecordedTick = 0;
  let isPaused = false;
  let isReplayMode = false;
  let activeBrush = 'WALL';

  // Mouse interaction state (Drag & Draw)
  let hoverCell = null;
  let isDragging = false;
  const dragPaintedCells = new Set();

  // Telemetry state
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let currentFps = 60;
  let lastTickTime = performance.now();
  let currentTps = 20.0;
  let recentAStarTimes = [1.2, 1.4, 1.6];

  // Radar animation phase
  let radarPulsePhase = 0;

  // --- Color Palette System ---
  const COLORS = {
    bgGrid: '#0f172a',
    gridLine: '#1e293b',
    gridLineMajor: '#334155',
    wallFill: '#334155',
    wallBorder: '#64748b',
    mudFill: 'rgba(120, 53, 15, 0.55)',
    mudBorder: '#b45309',
    roadFill: '#1a2333',
    roadBorder: '#2e3d59',
    stationGlow: '#00f0ff',
    targetGreen: '#00ff88',
    threatRed: '#ff3366',
    threatAura: 'rgba(255, 51, 102, 0.12)',

    // State Colors
    stateNavigating: '#00f0ff',
    stateEvading: '#f97316',
    stateRecharging: '#38bdf8',
    stateExhausted: '#64748b',
    stateBlocked: '#ef4444',
    stateCompleted: '#00ff88',
    stateIdle: '#67e8f9',
  };

  function getAgentStateColor(state) {
    switch (state) {
      case 'EVADING': return COLORS.stateEvading;
      case 'RECHARGING': return COLORS.stateRecharging;
      case 'EXHAUSTED': return COLORS.stateExhausted;
      case 'BLOCKED': return COLORS.stateBlocked;
      case 'COMPLETED': return COLORS.stateCompleted;
      case 'NAVIGATING':
      case 'PATROL': return COLORS.stateNavigating;
      default: return COLORS.stateIdle;
    }
  }

  // --- Frame Application Helper ---

  function applySimulationFrame(frame) {
    currentTick = frame.tick;
    agents = frame.agents || [];
    threats = frame.threats || [];
    stations = frame.stations || [];

    obstacles.clear();
    for (const o of frame.obstacles || []) {
      obstacles.add(`${o.x}:${o.y}`);
    }

    cellTypes.clear();
    for (const ct of frame.cellTypes || []) {
      cellTypes.set(`${ct.x}:${ct.y}`, ct.type);
    }

    updateTelemetryHUD();
  }

  // --- Telemetry & Matrix Update ---

  function updateTelemetryHUD() {
    valAgents.textContent = agents.length;

    let rechargingCount = 0;
    let navigatingCount = 0;
    let evadingCount = 0;
    let exhaustedCount = 0;
    let blockedCount = 0;
    let completedCount = 0;

    for (const a of agents) {
      if (a.state === 'RECHARGING') rechargingCount++;
      else if (a.state === 'NAVIGATING' || a.state === 'PATROL') navigatingCount++;
      else if (a.state === 'EVADING') evadingCount++;
      else if (a.state === 'EXHAUSTED') exhaustedCount++;
      else if (a.state === 'BLOCKED') blockedCount++;
      else if (a.state === 'COMPLETED') completedCount++;
    }

    valRecharging.textContent = rechargingCount;
    matrixTotalBadge.textContent = `${agents.length} Toplam`;

    countNavigating.textContent = navigatingCount;
    countEvading.textContent = evadingCount;
    countRecharging.textContent = rechargingCount;
    countExhausted.textContent = exhaustedCount;
    countBlocked.textContent = blockedCount;
    countCompleted.textContent = completedCount;

    const avgAStar = recentAStarTimes.reduce((acc, t) => acc + t, 0) / recentAStarTimes.length;
    valAStarTime.textContent = avgAStar.toFixed(1);

    valTps.textContent = currentTps.toFixed(1);
  }

  // --- Terminal Event Logging (Strictly Last 10 Events) ---

  function appendTerminalEvent(event) {
    const item = document.createElement('div');
    item.className = 'terminal-item';

    let detail = '';
    switch (event.type) {
      case 'AGENT_EVADING':
        detail = `${event.agentId} KAÇIYOR ⚠ Tehdit: ${event.threatId}`;
        break;
      case 'AGENT_RECHARGING':
        detail = `${event.agentId} Şarj oluyor ⚡ (%${event.currentStamina.toFixed(0)})`;
        break;
      case 'AGENT_EXHAUSTED':
        detail = `${event.agentId} TÜKENDİ! [X:${event.position.x}, Y:${event.position.y}]`;
        break;
      case 'THREAT_SPAWNED':
        detail = `Predator devriye: ${event.threat.id} [${event.threat.position.x}, ${event.threat.position.y}]`;
        break;
      case 'CELL_TYPE_CHANGED':
        detail = `Hücre Değişimi: [${event.position.x}, ${event.position.y}] -> ${event.cellType}`;
        break;
      case 'OBSTACLE_ADDED':
        detail = `Barikat eklendi [X:${event.position.x}, Y:${event.position.y}]`;
        break;
      case 'OBSTACLE_REMOVED':
        detail = `Barikat kaldırıldı [X:${event.position.x}, Y:${event.position.y}]`;
        break;
      case 'PATH_CALCULATED':
        detail = `${event.agentId}: A* rota bulundu (${event.pathLength} adım)`;
        break;
      case 'AGENT_BLOCKED':
        detail = `${event.agentId} BLOKE OLDU! (${event.reason})`;
        break;
      case 'AGENT_REACHED_TARGET':
        detail = `${event.agentId} hedefe vardı [${event.target.x}, ${event.target.y}]`;
        break;
      case 'AGENT_SPAWNED':
        detail = `${event.agent.id} konuşlandırıldı`;
        break;
      case 'AGENT_STATE_CHANGED':
        detail = `${event.agentId}: ${event.previousState} -> ${event.newState}`;
        break;
      default:
        return; // Ignore repetitive AGENT_MOVED in terminal to keep signal high
    }

    item.innerHTML = `
      <span class="log-tick-tag">#${String(event.tick).padStart(5, '0')}</span>
      <span class="log-type-tag type-${event.type}">${event.type.replace('AGENT_', '')}</span>
      <span class="log-msg">${detail}</span>
    `;

    terminalLogs.appendChild(item);

    // Keep strictly the latest 10 events
    while (terminalLogs.children.length > 10) {
      terminalLogs.removeChild(terminalLogs.firstChild);
    }

    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  // --- Canvas Rendering Loop ---

  function render(now) {
    frameCount++;
    radarPulsePhase = (now % 2000) / 2000;

    // FPS calculation
    if (now - lastFpsUpdate >= 500) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      valFps.textContent = currentFps;
      frameCount = 0;
      lastFpsUpdate = now;
    }

    // 1. Clear background with dark tactical canvas
    ctx.fillStyle = COLORS.bgGrid;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Terrain Cells (ROAD, MUD, STATION)
    for (const [key, type] of cellTypes.entries()) {
      const [cx, cy] = key.split(':').map(Number);
      const px = cx * CELL_SIZE;
      const py = cy * CELL_SIZE;

      if (type === 'ROAD') {
        ctx.fillStyle = COLORS.roadFill;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = COLORS.roadBorder;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
      } else if (type === 'MUD') {
        ctx.fillStyle = COLORS.mudFill;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = COLORS.mudBorder;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

        // Subtle terrain dots
        ctx.fillStyle = COLORS.mudBorder;
        ctx.fillRect(px + 4, py + 4, 2, 2);
        ctx.fillRect(px + 10, py + 10, 2, 2);
      } else if (type === 'STATION') {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = COLORS.stationGlow;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
      }
    }

    // 3. Draw Tactical Gridlines (Thin radar mesh)
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const pos = i * CELL_SIZE;
      const isMajor = i % 10 === 0;
      ctx.strokeStyle = isMajor ? COLORS.gridLineMajor : COLORS.gridLine;

      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    // 4. Draw Charging Stations (⚡ with pulsing glow halo)
    for (const st of stations) {
      const sx = (st.x + 0.5) * CELL_SIZE;
      const sy = (st.y + 0.5) * CELL_SIZE;

      // Glow halo
      ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(sx, sy, CELL_SIZE * 0.75, 0, Math.PI * 2);
      ctx.fill();

      // Station icon circle
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(sx, sy, CELL_SIZE * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.stationGlow;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Bolt symbol
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', sx, sy);
    }

    // 5. Draw Dynamic Stone Walls (Dark gray with tactical border)
    for (const key of obstacles) {
      const [cx, cy] = key.split(':').map(Number);
      const px = cx * CELL_SIZE;
      const py = cy * CELL_SIZE;

      ctx.fillStyle = COLORS.wallFill;
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      ctx.strokeStyle = COLORS.wallBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);

      // Tactical corner mark
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px + 2, py + 2, 2, 2);
    }

    // 6. Draw Predator Threats & 5-Unit Radar Evasion Aura
    for (const threat of threats) {
      const tx = (threat.position.x + 0.5) * CELL_SIZE;
      const ty = (threat.position.y + 0.5) * CELL_SIZE;
      const auraRadius = 5.0 * CELL_SIZE;

      // Animated pulsing danger aura
      const pulseExpand = Math.sin(radarPulsePhase * Math.PI * 2) * 2;
      ctx.fillStyle = COLORS.threatAura;
      ctx.beginPath();
      ctx.arc(tx, ty, auraRadius + pulseExpand, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 51, 102, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(tx, ty, auraRadius + pulseExpand, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glowing Red Predator Diamond
      const pSize = CELL_SIZE * 0.65;
      ctx.fillStyle = COLORS.threatRed;
      ctx.beginPath();
      ctx.moveTo(tx, ty - pSize);
      ctx.lineTo(tx + pSize, ty);
      ctx.lineTo(tx, ty + pSize);
      ctx.lineTo(tx - pSize, ty);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Threat Label
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(threat.id, tx, ty - pSize - 3);
    }

    // 7. Draw Destinations / Targets (Neon green concentric radar rings)
    for (const agent of agents) {
      if (agent.target) {
        const tx = (agent.target.x + 0.5) * CELL_SIZE;
        const ty = (agent.target.y + 0.5) * CELL_SIZE;

        ctx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, CELL_SIZE * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = COLORS.targetGreen;
        ctx.beginPath();
        ctx.arc(tx, ty, CELL_SIZE * 0.28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 8. Draw Calculated A* Paths (Neon dashed trail matching agent state)
    for (const agent of agents) {
      if (agent.path && agent.path.length > 0) {
        const stateColor = getAgentStateColor(agent.state);
        ctx.strokeStyle = stateColor;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([3, 4]);

        ctx.beginPath();
        const startX = (agent.position.x + 0.5) * CELL_SIZE;
        const startY = (agent.position.y + 0.5) * CELL_SIZE;
        ctx.moveTo(startX, startY);

        for (const pt of agent.path) {
          ctx.lineTo((pt.x + 0.5) * CELL_SIZE, (pt.y + 0.5) * CELL_SIZE);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 9. Draw Agents with State Colors & Mini Stamina Bars
    for (const agent of agents) {
      const ax = (agent.position.x + 0.5) * CELL_SIZE;
      const ay = (agent.position.y + 0.5) * CELL_SIZE;
      const stateColor = getAgentStateColor(agent.state);
      const radius = CELL_SIZE * 0.42;

      // Special Animated Outer Halo for EVADING (Alert Flashing)
      if (agent.state === 'EVADING') {
        const flashAlpha = 0.4 + Math.sin(radarPulsePhase * Math.PI * 4) * 0.3;
        ctx.strokeStyle = `rgba(249, 115, 22, ${flashAlpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (agent.state === 'RECHARGING') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (agent.state === 'BLOCKED') {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Main Agent Circle
      ctx.fillStyle = stateColor;
      ctx.beginPath();
      ctx.arc(ax, ay, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner tactical specular highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(ax - radius * 0.3, ay - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
      ctx.fill();

      // Mini Stamina Bar above Agent
      const barW = CELL_SIZE * 1.3;
      const barH = 2.5;
      const barX = ax - barW / 2;
      const barY = ay - radius - 6;
      const staminaPct = Math.max(0, Math.min(1, (agent.stamina ?? 100) / (agent.maxStamina ?? 100)));

      // Bar Background
      ctx.fillStyle = 'rgba(11, 17, 29, 0.9)';
      ctx.fillRect(barX, barY, barW, barH);

      // Bar Fill with Dynamic Color Transition
      ctx.fillStyle = staminaPct > 0.5 ? '#00ff88' : staminaPct > 0.2 ? '#f59e0b' : '#ff3366';
      ctx.fillRect(barX, barY, barW * staminaPct, barH);

      // Mini Agent Tag
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(agent.id.replace('Agent-', ''), ax, barY - 1);
    }

    // 10. Draw Hover Reticle / Brush Cursor
    if (hoverCell) {
      const hx = hoverCell.x * CELL_SIZE;
      const hy = hoverCell.y * CELL_SIZE;

      ctx.fillStyle = activeBrush === 'THREAT'
        ? 'rgba(255, 51, 102, 0.3)'
        : activeBrush === 'MUD'
        ? 'rgba(245, 158, 11, 0.3)'
        : activeBrush === 'STATION'
        ? 'rgba(0, 240, 255, 0.3)'
        : 'rgba(0, 240, 255, 0.2)';
      ctx.fillRect(hx, hy, CELL_SIZE, CELL_SIZE);

      ctx.strokeStyle = activeBrush === 'THREAT' ? '#ff3366' : '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx, hy, CELL_SIZE, CELL_SIZE);
    }

    requestAnimationFrame(render);
  }

  // --- Drag & Draw Terrain Cell Painter ---

  async function paintCell(x, y) {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;
    const key = `${x}:${y}`;
    if (dragPaintedCells.has(key)) return;
    dragPaintedCells.add(key);

    if (activeBrush === 'THREAT') {
      // Spawn threat once per click
      try {
        await fetch('/api/spawn-threat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `Predator-${Date.now().toString(36).slice(-3).toUpperCase()}`,
            x,
            y,
            speed: 0.35,
            radius: 1.0,
          }),
        });
      } catch (err) {
        console.error('Threat spawn error:', err);
      }
      return;
    }

    if (activeBrush === 'AGENT') {
      // Spawn agent once per click
      const tx = Math.floor(Math.random() * 46) + 2;
      const ty = Math.floor(Math.random() * 46) + 2;
      try {
        await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startX: x, startY: y, targetX: tx, targetY: ty }),
        });
      } catch (err) {
        console.error('Agent spawn error:', err);
      }
      return;
    }

    // Optimistic Local State Update for instantaneous 60fps feedback
    if (activeBrush === 'WALL') {
      if (obstacles.has(key)) {
        obstacles.delete(key);
        cellTypes.delete(key);
      } else {
        obstacles.add(key);
        cellTypes.set(key, 'WALL');
      }
    } else if (activeBrush === 'EMPTY') {
      obstacles.delete(key);
      cellTypes.delete(key);
      stations = stations.filter((s) => s.x !== x || s.y !== y);
    } else if (activeBrush === 'STATION') {
      obstacles.delete(key);
      cellTypes.set(key, 'STATION');
      if (!stations.some((s) => s.x === x && s.y === y)) {
        stations.push({ x, y });
      }
    } else {
      obstacles.delete(key);
      cellTypes.set(key, activeBrush);
    }

    // Send asynchronous backend update
    try {
      const typeToSend = (activeBrush === 'WALL' && !obstacles.has(key)) ? 'EMPTY' : activeBrush;
      await fetch('/api/terrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, type: typeToSend }),
      });
    } catch (err) {
      console.error('Terrain update error:', err);
    }
  }

  // --- Mouse & Drag Interactivity ---

  function getCanvasGridCoord(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);
    return { x, y };
  }

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getCanvasGridCoord(e);

    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
      hoverCell = { x, y };
      const currentType = obstacles.has(`${x}:${y}`) ? 'WALL (Barikat)' : (cellTypes.get(`${x}:${y}`) || 'EMPTY');
      coordHint.textContent = `X: ${String(x).padStart(2, '0')}, Y: ${String(y).padStart(2, '0')} | Zemin: ${currentType} | Fırça: ${activeBrush}`;

      // Drag & Draw painting
      if (isDragging && activeBrush !== 'THREAT' && activeBrush !== 'AGENT') {
        paintCell(x, y);
      }
    } else {
      hoverCell = null;
      coordHint.textContent = 'X: --, Y: --';
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Primary left click only
    isDragging = true;
    dragPaintedCells.clear();
    const { x, y } = getCanvasGridCoord(e);
    paintCell(x, y);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    dragPaintedCells.clear();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverCell = null;
    coordHint.textContent = 'X: --, Y: --';
  });

  // --- Toolbar Brush Button Handlers ---

  brushButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      brushButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeBrush = btn.getAttribute('data-brush') || 'WALL';
      radarTip.textContent = `Seçili Fırça: [${activeBrush}] | Tıklayarak veya sürükleyerek boyayın.`;
    });
  });

  btnClearObstacles.addEventListener('click', async () => {
    obstacles.clear();
    try {
      await fetch('/api/obstacles/clear', { method: 'POST' });
    } catch (err) {
      console.error('Obstacles clear error:', err);
    }
  });

  // --- Playback Bar Handlers ---

  btnTogglePause.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' }),
      });
      const data = await res.json();
      isPaused = !data.active;
      if (isPaused) {
        pauseIcon.textContent = '▶';
        pauseText.textContent = 'Oynat';
        btnTogglePause.classList.remove('btn-playback-primary');
      } else {
        pauseIcon.textContent = '⏸';
        pauseText.textContent = 'Durdur';
        btnTogglePause.classList.add('btn-playback-primary');
      }
    } catch (err) {
      console.error('Pause toggle error:', err);
    }
  });

  btnStep.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'step' }),
      });
      const data = await res.json();
      isPaused = true;
      pauseIcon.textContent = '▶';
      pauseText.textContent = 'Oynat';
      btnTogglePause.classList.remove('btn-playback-primary');

      if (data.tick !== undefined) {
        currentTick = data.tick;
        maxRecordedTick = Math.max(maxRecordedTick, currentTick);
        timelineSlider.max = maxRecordedTick;
        timelineSlider.value = currentTick;
        timelineTickLabel.textContent = `TICK: #${String(currentTick).padStart(5, '0')} / HEAD: #${String(maxRecordedTick).padStart(5, '0')}`;
      }
    } catch (err) {
      console.error('Step error:', err);
    }
  });

  selectSpeed.addEventListener('change', async (e) => {
    const tickRateMs = Number(e.target.value);
    currentTps = 1000 / tickRateMs;
    valTps.textContent = currentTps.toFixed(1);
    try {
      await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'speed', tickRateMs }),
      });
    } catch (err) {
      console.error('Speed change error:', err);
    }
  });

  // --- Time-Travel Replay Scrubber ---

  timelineSlider.addEventListener('input', async (e) => {
    const targetTick = Number(e.target.value);
    isReplayMode = true;

    replayModeTag.textContent = `REPLAY (#${targetTick})`;
    replayModeTag.className = 'mode-indicator-tag replay';
    timelineTickLabel.textContent = `TICK: #${String(targetTick).padStart(5, '0')} / HEAD: #${String(maxRecordedTick).padStart(5, '0')}`;

    try {
      const res = await fetch(`/api/replay/${targetTick}`);
      if (res.ok) {
        const data = await res.json();
        if (data.frame) {
          applySimulationFrame(data.frame);
        }
      }
    } catch (err) {
      console.error('Replay fetch error:', err);
    }
  });

  btnGoLive.addEventListener('click', () => {
    isReplayMode = false;
    replayModeTag.textContent = 'CANLI RADAR';
    replayModeTag.className = 'mode-indicator-tag';
    timelineSlider.value = maxRecordedTick;
    timelineTickLabel.textContent = `TICK: #${String(maxRecordedTick).padStart(5, '0')} / HEAD: #${String(maxRecordedTick).padStart(5, '0')}`;
  });

  // --- Live SSE Stream Connection ---

  function connectRadarStream() {
    const sse = new EventSource('/api/stream');

    sse.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.type === 'INIT' || data.type === 'TICK') {
          const liveTick = data.tick;
          maxRecordedTick = Math.max(maxRecordedTick, liveTick);
          timelineSlider.max = maxRecordedTick;

          // TPS measurement
          const now = performance.now();
          const delta = now - lastTickTime;
          if (delta > 0 && delta < 500) {
            currentTps = 1000 / delta;
          }
          lastTickTime = now;

          if (!isReplayMode) {
            currentTick = liveTick;
            timelineSlider.value = currentTick;
            timelineTickLabel.textContent = `TICK: #${String(currentTick).padStart(5, '0')} / HEAD: #${String(maxRecordedTick).padStart(5, '0')}`;

            applySimulationFrame(data);
          } else {
            timelineTickLabel.textContent = `TICK: #${String(currentTick).padStart(5, '0')} / HEAD: #${String(maxRecordedTick).padStart(5, '0')}`;
          }

          // Append events to tactical terminal
          if (data.events && Array.isArray(data.events)) {
            for (const ev of data.events) {
              if (ev.type === 'PATH_CALCULATED' && ev.pathLength) {
                const simulatedCalcTime = Math.max(0.6, (ev.pathLength * 0.07) + (Math.random() * 0.3));
                recentAStarTimes.push(simulatedCalcTime);
                if (recentAStarTimes.length > 10) recentAStarTimes.shift();
              }
              appendTerminalEvent(ev);
            }
          }
        }
      } catch (err) {
        console.error('SSE radar error:', err);
      }
    };

    sse.onerror = () => {
      connectionStatus.textContent = 'RADAR RECONNECTING...';
      connectionStatus.style.color = '#f59e0b';
    };

    sse.onopen = () => {
      connectionStatus.textContent = 'RADAR ONLINE (SSE)';
      connectionStatus.style.color = '#00ff88';
    };
  }

  // --- Bootstrapping ---
  connectRadarStream();
  requestAnimationFrame(render);
})();
