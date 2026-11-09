/**
 * Chronos-Sim Engine Performance Benchmark
 * Executes 100 ticks with 1,000 active agents navigating on a 100x100 spatial grid.
 * Measures Ticks Per Second (TPS), Tick Latency (ms), and Memory Footprint (MB).
 */

import { performance } from 'node:perf_hooks';
import { SimulationEngine } from '../src/core/Engine.js';
import { EventStore } from '../src/storage/EventStore.js';
import type { Vector2D } from '../src/core/Types.js';

interface LatencyStats {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p95: number;
}

function calculatePercentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

function bytesToMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

async function runBenchmark(): Promise<void> {
  const AGENT_COUNT = 1000;
  const TOTAL_TICKS = 100;
  const GRID_SIZE = 120;

  console.log('\n===============================================================');
  console.log('       CHRONOS-SIM ENGINE HIGH-LOAD PERFORMANCE BENCHMARK       ');
  console.log('===============================================================\n');
  console.log(`[Setup] Initializing SimulationEngine (Grid: ${GRID_SIZE}x${GRID_SIZE}, Tick: 50ms)...`);

  const eventStore = new EventStore({ inMemory: true });
  const engine = new SimulationEngine({
    config: {
      gridWidth: GRID_SIZE,
      gridHeight: GRID_SIZE,
      cellSize: 1.0,
      tickRateMs: 50,
      allowDiagonal: true,
      snapshotIntervalTicks: 50,
      defaultAgentSpeed: 0.8,
    },
    eventStore,
  });

  // 1. Seed dynamic obstacles (scattered pillars)
  console.log('[Setup] Registering 300 dynamic obstacles in Spatial Hash Grid...');
  for (let x = 10; x < GRID_SIZE - 10; x += 6) {
    for (let y = 10; y < GRID_SIZE - 10; y += 6) {
      engine.addObstacle({ x, y });
    }
  }

  // 2. Spawn 1,000 active agents with distant targets
  console.log(`[Setup] Spawning ${AGENT_COUNT.toLocaleString()} active navigating agents...`);
  const spawnStart = performance.now();

  for (let i = 0; i < AGENT_COUNT; i++) {
    const startX = 2 + (i % (GRID_SIZE - 4));
    const startY = 2 + Math.floor(i / (GRID_SIZE - 4));

    // Target across the board
    const targetX = (GRID_SIZE - 3) - (i % (GRID_SIZE - 4));
    const targetY = (GRID_SIZE - 3) - Math.floor(i / (GRID_SIZE - 4));

    const startPos: Vector2D = { x: Math.min(GRID_SIZE - 2, Math.max(1, startX)), y: Math.min(GRID_SIZE - 2, Math.max(1, startY)) };
    const targetPos: Vector2D = { x: Math.min(GRID_SIZE - 2, Math.max(1, targetX)), y: Math.min(GRID_SIZE - 2, Math.max(1, targetY)) };

    // Clear obstacle if accidentally spawned on one
    if (engine.spatialGrid.hasObstacle(startPos)) {
      engine.removeObstacle(startPos);
    }
    if (engine.spatialGrid.hasObstacle(targetPos)) {
      engine.removeObstacle(targetPos);
    }

    engine.spawnAgent({
      id: `agent-${i.toString().padStart(4, '0')}`,
      position: startPos,
      target: targetPos,
      speed: 0.8,
    });
  }

  const spawnDuration = performance.now() - spawnStart;
  console.log(`[Setup] 1,000 agents spawned & initial paths routed in ${spawnDuration.toFixed(2)} ms.\n`);

  // Force garbage collection if available or record initial memory
  const memBefore = process.memoryUsage();

  console.log(`[Benchmark] Executing ${TOTAL_TICKS} simulation ticks under full load...`);
  const tickLatencies: number[] = [];
  const benchmarkStart = performance.now();

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const t0 = performance.now();
    engine.step();
    const t1 = performance.now();
    tickLatencies.push(t1 - t0);
  }

  const benchmarkTotalMs = performance.now() - benchmarkStart;
  const memAfter = process.memoryUsage();

  // Metric Computations
  const totalSeconds = benchmarkTotalMs / 1000;
  const tps = TOTAL_TICKS / totalSeconds;
  const avgLatency = benchmarkTotalMs / TOTAL_TICKS;
  const minLatency = Math.min(...tickLatencies);
  const maxLatency = Math.max(...tickLatencies);
  const p95Latency = calculatePercentile(tickLatencies, 95);

  const stats: LatencyStats = {
    min: minLatency,
    max: maxLatency,
    avg: avgLatency,
    p95: p95Latency,
  };

  const heapUsedStartMB = bytesToMB(memBefore.heapUsed);
  const heapUsedEndMB = bytesToMB(memAfter.heapUsed);
  const heapDiffMB = (Number(heapUsedEndMB) - Number(heapUsedStartMB)).toFixed(2);
  const rssMB = bytesToMB(memAfter.rss);
  const heapTotalMB = bytesToMB(memAfter.heapTotal);

  // Present Results in Clean Formatted Console Table
  console.log('\n===============================================================');
  console.log('                    BENCHMARK RESULTS TABLE                    ');
  console.log('===============================================================\n');

  const resultsTable = [
    { Metrik: 'Aktif Ajan Sayısı', Deger: `${AGENT_COUNT.toLocaleString()} ajan`, Aciklama: 'Eşzamanlı ızgara üzerinde hareket eden' },
    { Metrik: 'Toplam Adım (Ticks)', Deger: `${TOTAL_TICKS} tick`, Aciklama: 'Simülasyon güncelleme döngüsü' },
    { Metrik: 'Toplam Süre', Deger: `${benchmarkTotalMs.toFixed(2)} ms`, Aciklama: `~${totalSeconds.toFixed(3)} saniye` },
    { Metrik: 'Performans (TPS)', Deger: `${tps.toFixed(1)} ticks/sn`, Aciklama: 'Saniyedeki simülasyon adımı (Hedef: >20 TPS)' },
    { Metrik: 'Ortalama Gecikme', Deger: `${stats.avg.toFixed(3)} ms/tick`, Aciklama: 'Tick başına harcanan işlemci süresi' },
    { Metrik: 'En Hızlı Tick (Min)', Deger: `${stats.min.toFixed(3)} ms`, Aciklama: 'Minimum tekil tick süresi' },
    { Metrik: 'En Yavaş Tick (Max)', Deger: `${stats.max.toFixed(3)} ms`, Aciklama: 'Maksimum tekil tick süresi' },
    { Metrik: 'P95 Gecikme', Deger: `${stats.p95.toFixed(3)} ms`, Aciklama: 'Ticklerin %95’inin tamamlandığı süre' },
    { Metrik: 'Heap Bellek (Başlangıç)', Deger: `${heapUsedStartMB} MB`, Aciklama: 'Ajanlar yüklendikten hemen sonra' },
    { Metrik: 'Heap Bellek (Bitiş)', Deger: `${heapUsedEndMB} MB`, Aciklama: '100 tick simülasyon tamamlandığında' },
    { Metrik: 'Bellek Değişimi (Delta)', Deger: `${Number(heapDiffMB) >= 0 ? '+' : ''}${heapDiffMB} MB`, Aciklama: 'Simülasyon adımları esnasındaki net fark' },
    { Metrik: 'Toplam RSS Tüketimi', Deger: `${rssMB} MB`, Aciklama: 'İşletim sistemi seviyesinde fiziksel RAM' },
  ];

  console.table(resultsTable);

  const realTimeRatio = (avgLatency / 50) * 100;
  console.log(`\n[Analiz] 50ms sabit tick bütçesinin sadece %${realTimeRatio.toFixed(1)}'i kullanıldı.`);
  console.log(`[Sonuç] Motor, 1.000 eşzamanlı ajanı gerçek zamanlı 20 Hz (50ms) hızın ~${(50 / avgLatency).toFixed(1)}x katı hızda işleyebilmektedir.\n`);

  engine.dispose();
  eventStore.close();
}

runBenchmark().catch((err: unknown) => {
  console.error('[Benchmark Error]', err);
  process.exit(1);
});
