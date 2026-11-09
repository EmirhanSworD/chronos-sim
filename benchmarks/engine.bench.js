/**
 * Chronos-Sim Engine High-Load Performance Benchmark
 * Executes 100 ticks with 1,000 active agents navigating on a spatial grid
 * featuring variable terrain, predator threats, and charging stations.
 * Measures Ticks Per Second (TPS), Tick Latency (ms), and Memory Footprint (MB).
 */
import { performance } from 'node:perf_hooks';
import { SimulationEngine } from '../src/core/Engine.js';
function calculatePercentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[index] ?? 0;
}
function bytesToMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}
async function runBenchmark() {
    const AGENT_COUNT = 1000;
    const TOTAL_TICKS = 100;
    const GRID_SIZE = 80;
    console.log('\n===============================================================');
    console.log('       CHRONOS-SIM ENGINE HIGH-LOAD PERFORMANCE BENCHMARK       ');
    console.log('===============================================================\n');
    console.log(`[Setup] Initializing SimulationEngine (Grid: ${GRID_SIZE}x${GRID_SIZE}, Tick: 50ms)...`);
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
    });
    // 1. Seed charging stations
    engine.addStation({ x: 5, y: 5 });
    engine.addStation({ x: GRID_SIZE - 5, y: GRID_SIZE - 5 });
    // 2. Seed terrain (Roads & Mud)
    for (let x = 0; x < GRID_SIZE; x++) {
        engine.setCellType({ x, y: Math.floor(GRID_SIZE / 2) }, 'ROAD');
    }
    for (let x = 10; x < 25; x++) {
        for (let y = 10; y < 25; y++) {
            engine.setCellType({ x, y }, 'MUD');
        }
    }
    // 3. Seed dynamic obstacles (scattered pillars)
    console.log('[Setup] Registering 200 dynamic obstacles in Spatial Hash Grid...');
    for (let x = 8; x < GRID_SIZE - 8; x += 6) {
        for (let y = 8; y < GRID_SIZE - 8; y += 6) {
            engine.addObstacle({ x, y });
        }
    }
    // 4. Seed predator threat
    engine.addThreat({
        id: 'Apex-Predator',
        position: { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) },
        radius: 1.0,
    });
    // 5. Spawn 1,000 active agents with distant targets
    console.log(`[Setup] Spawning ${AGENT_COUNT.toLocaleString()} active navigating agents...`);
    const spawnStart = performance.now();
    for (let i = 0; i < AGENT_COUNT; i++) {
        const startX = 2 + (i % (GRID_SIZE - 4));
        const startY = 2 + Math.floor(i / (GRID_SIZE - 4));
        const targetX = (GRID_SIZE - 3) - (i % (GRID_SIZE - 4));
        const targetY = (GRID_SIZE - 3) - Math.floor(i / (GRID_SIZE - 4));
        const startPos = {
            x: Math.min(GRID_SIZE - 2, Math.max(1, startX)),
            y: Math.min(GRID_SIZE - 2, Math.max(1, startY)),
        };
        const targetPos = {
            x: Math.min(GRID_SIZE - 2, Math.max(1, targetX)),
            y: Math.min(GRID_SIZE - 2, Math.max(1, targetY)),
        };
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
            stamina: 500,
            maxStamina: 500,
            energyBurnRate: 0.2,
        });
    }
    const spawnDuration = performance.now() - spawnStart;
    console.log(`[Setup] 1,000 agents spawned & initial paths routed in ${spawnDuration.toFixed(2)} ms.\n`);
    const memBefore = process.memoryUsage();
    console.log(`[Benchmark] Executing ${TOTAL_TICKS} simulation ticks under full load...`);
    const tickLatencies = [];
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
    const stats = {
        min: minLatency,
        max: maxLatency,
        avg: avgLatency,
        p95: p95Latency,
    };
    const heapUsedStartMB = bytesToMB(memBefore.heapUsed);
    const heapUsedEndMB = bytesToMB(memAfter.heapUsed);
    const heapDiffMB = (Number(heapUsedEndMB) - Number(heapUsedStartMB)).toFixed(2);
    const rssMB = bytesToMB(memAfter.rss);
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
}
runBenchmark().catch((err) => {
    console.error('[Benchmark Error]', err);
    process.exit(1);
});
//# sourceMappingURL=engine.bench.js.map