# Chronos-Sim

> **Deterministik Simülasyon ve Olay Tabanlı (Event-Sourced) Durum Motoru**  
> Yüksek performanslı 2D uzamsal ızgara indeksleme, dinamik engellere duyarlı A* rota planlama, tip güvenli durum makineleri ve SQLite WAL tabanlı olay günlüğü.

---

## 🏗 Sistem Mimarisi

Aşağıdaki şema, `chronos-sim` motorunun bileşenlerini ve veri akışını özetlemektedir:

```
+---------------------------------------------------------------------------------+
|                                 CHRONOS-SIM                                     |
+---------------------------------------------------------------------------------+
|                                                                                 |
|   +-----------------------+              +----------------------------------+   |
|   |   Web UI (Canvas)     | <== [SSE] == |    Express Server (app.ts)       |   |
|   | 50x50 Canlı Görünüm   |              |  - /api/stream (SSE Broadcast)   |   |
|   |  - Telemetri & FPS    | ==> [REST]=> |  - /api/obstacles (Dinamik Engel)|   |
|   |  - Son Olay Logları   |              |  - /api/agents (Ajan Yönetimi)   |   |
|   +-----------------------+              +-----------------+----------------+   |
|                                                            |                    |
|                                       +--------------------+                    |
|                                       |                                         |
|                                       v                                         |
|   +-------------------------------------------------------------------------+   |
|   |                  SIMULATION ENGINE (50ms Fixed Timestep)                |   |
|   |                                                                         |   |
|   |   +----------------------+                  +-----------------------+   |   |
|   |   |     SpatialGrid      | <==============> |    AStarPathfinder    |   |   |
|   |   |  - O(1) Komşu Arama  |   Traversable    |  - 8 Yönlü Hareket    |   |   |
|   |   |  - Dinamik Engeller  |   Engel Haritası |  - Köşe Kesme Koruması|   |   |
|   |   |  - Hash-Buckets      |                  |  - Min-Heap O(log N)  |   |   |
|   |   +----------+-----------+                  +-----------+-----------+   |   |
|   |              ^                                          ^               |   |
|   |              | Konum / Engel                            | Rota İstekleri|   |
|   |              v                                          v               |   |
|   |   +-----------------------------------------------------------------+   |   |
|   |   |                     Ajan Yöneticisi & FSM                       |   |   |
|   |   |        [IDLE] ===> [NAVIGATING] ===> [COMPLETED]                |   |   |
|   |   |                         ||                                      |   |   |
|   |   |                         v                                       |   |   |
|   |   |                     [BLOCKED]                                   |   |   |
|   |   +---------------------------------+-------------------------------+   |   |
|   +-------------------------------------|-----------------------------------+   |
|                                         |                                       |
|                                         | Discrete Events & Periodic Snapshots  |
|                                         v (Transaction Blocks)                  |
|   +-------------------------------------------------------------------------+   |
|   |                  EVENT STORE (SQLite 3 - WAL Mode)                      |   |
|   |                                                                         |   |
|   |   - events Tablosu: AGENT_SPAWNED, PATH_CALCULATED, OBSTACLE_ADDED...   |   |
|   |   - snapshots Tablosu: 20 Tick'te bir tam durum dondurma ve geri alma   |   |
|   |   - WAL (Write-Ahead-Log) & PRAGMA synchronous = NORMAL                 |   |
|   +-------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------+
```

---

## ⚡ Temel Nitelikler

1. **Deterministik Simülasyon Motoru (`SimulationEngine`):**
   * 50ms sabit zaman adımı (20 Hz tick rate).
   * Sıralı ve saf `step()` fonksiyonu ile rastgelelikten bağımsız, tekrarlanabilir çalışma.
   * `getSnapshot()` ve `restoreFromSnapshot()` ile anlık durum dondurma ve sıfır kayıpla geri yükleme.

2. **$O(1)$ Uzamsal Hash Izgarası & Arazi Hücre Tipleri (`SpatialGrid`):**
   * Dünyayı ayrık kovalara (buckets) bölerek $O(N^2)$ ikili mesafe kontrolünü ortadan kaldırır.
   * **Arazi Maliyetleri (Terrain Costs):**
     * `EMPTY`: 1.0 (Standart zemin)
     * `ROAD`: 0.5 (Hızlı asfalt koridor)
     * `MUD`: 5.0 (Ağır çamur bataklığı, yüksek stamina tüketimi)
     * `STATION`: 1.0 (Enerji şarj istasyonu)
     * `WALL`: $\infty$ (Geçilemez katı engel)
   * Yarıçap bazlı aramaları (`queryRadius`, `queryNearest`) $O(1)$ ortalama zamanda tamamlar.

3. **Maliyet Tabanlı A\* Algoritması (`AStarPathfinder`):**
   * $O(\log N)$ Min-Heap öncelik kuyruğu ile dinamik engelleri ve zemin maliyetlerini hesaplar.
   * `gCost += dirCost * terrainCost` formülüyle her zaman en ucuz rotayı seçer (örneğin çamurdan kaçınmak için yolu tercih eder).
   * 8 yönlü köşegen hareketi destekler (kardinal maliyet: $1.0$, diyagonal maliyet: $\sqrt{2}$).
   * Köşe kesme koruması (`preventCornerCutting`) ile katı engellerin köşelerinden sızmayı engeller.

4. **Gelişmiş Ajan Davranışları & Tip Güvenli FSM (`AgentBehavior` & `AgentStateMachine`):**
   * **Durumlar:** `IDLE`, `PATROL`, `NAVIGATING`, `EVADING`, `RECHARGING`, `EXHAUSTED`, `BLOCKED`, `COMPLETED`.
   * **Stamina Yönetimi:** Ajan hareket ettikçe zemin zorluğuna göre stamina harcar (`MUD` zemininde 5 kat hızlı tüketim).
   * **Acil Şarj Arama:** Stamina <%20 olduğunda ajan mevcut görevini durdurup en yakın `STATION` hücresine yönelir ve %100 dolana kadar şarj olur. Stamina sıfırlandığında `EXHAUSTED` durumuna geçerek hareketsiz kalır.
   * **Dinamik Tehdit Kaçışı (Predator Evasion):** 5 birimden yakın bir tehdit (Predator) yaklaştığında ajan `EVADING` durumuna geçerek yırtıcıdan zıt yönde kaçış vektörü üretir.
   * **Devriye Döngüleri (Patrol Waypoints):** Ajanlar sıralı kontrol noktalarını döngüsel olarak devriye gezer.

5. **Olay Kaynaklı Veri Tabanı (`EventStore`):**
   * `better-sqlite3` üzerinde **WAL** (`Write-Ahead Logging`) modunda çalışır.
   * Her tick olayları ve durum anlık görüntüleri atomik transaction blokları içinde diske yazılır.

6. **Canlı Görselleştirme:**
   * HTML5 Canvas üzerinde 50x50 ızgara, dinamik engeller, renkli ajanlar ve canlı A* rotaları.
   * Gerçek zamanlı SSE veri akışı ve fareyle tıklayarak engel ekleme/kaldırma.

---

## 📊 Performans Benchmark Sonuçları

`1.000` aktif ajan, `200` dinamik engel, değişken arazi maliyetleri (yol ve çamur) ile yırtıcı tehditlerin bulunduğu `80x80` ızgarada `100 tick` boyunca yürütülen test sonuçları:

| Metrik | Değer | Açıklama |
| :--- | :--- | :--- |
| **Aktif Ajan Sayısı** | **1.000 ajan** | Eşzamanlı ızgara üzerinde hareket eden |
| **Toplam Adım (Ticks)** | **100 tick** | Simülasyon güncelleme döngüsü |
| **Toplam Süre** | **~191 ms** | 100 tick için harcanan toplam süre |
| **Performans (TPS)** | **522.6 ticks/sn** | Saniyedeki simülasyon adımı (Hedef: >20 TPS) |
| **Ortalama Gecikme** | **1.91 ms / tick** | Tick başına harcanan işlemci süresi |
| **P95 Gecikme** | **3.67 ms** | Ticklerin %95'inin tamamlandığı süre |
| **Bellek (Heap Net Delta)** | **+46.1 MB** | 1.000 ajanın 100 tick boyunca ürettiği bellek |
| **Fiziksel RAM (RSS)** | **~297 MB** | İşletim sistemi seviyesinde fiziksel RAM |

> **Analiz:** 50ms sabit tick bütçesinin yalnızca **%3.8'i** harcanmaktadır. Motor, 1.000 eşzamanlı ajanı gerçek zamanlı hızın **~26.1 katı** hızda işleyebilmektedir.

---

## ⏳ Zaman Yolculuğu & Replay Altyapısı (Time-Travel Engine)

Chronos-Sim, her tick döngüsünde simülasyonun tam durumunu (ajan koordinatları, FSM durumları, stamina değerleri, tehdit pozisyonları, arazi hücreleri ve engeller) SQLite üzerinde `simulation_frames` tablosunda saklar.

* **Deterministik Replay:** `engine.seekToTick(tick)` metodu ile simülasyon geçmişteki herhangi bir tick'e anında taşınabilir.
* **Timeline Scrubbing:** Web arayüzündeki zaman çizelgesi kaydırıcısı ile geçmiş adımlar kare kare geriye ya da ileriye sarılabilir.
* **Adım Adım İlerleme (Step-Forward):** Simülasyon duraklatıldığında tek bir tick adım atılarak durum değişimleri canlı olarak analiz edilebilir.

### 🌐 REST API Uç Noktaları

| Metot | Uç Nokta | Gövde / Parametre | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/terrain` | `{ x: number, y: number, type: 'WALL'\|'MUD'\|'ROAD'\|'STATION'\|'EMPTY' }` | Belirtilen koordinata duvar, çamur, yol veya istasyon yerleştirir. |
| `POST` | `/api/spawn-threat` | `{ id?: string, x?: number, y?: number, speed?: number, radius?: number }` | Haritaya hareketli yırtıcı (Predator) tehdit ekler. |
| `GET` | `/api/replay/:tick` | `:tick` (Tam sayı) | Geçmiş bir tick'in tüm harita, ajan ve tehdit verisini döner. |
| `GET` | `/api/replay/range` | `?from=X&to=Y` | İki tick arasındaki tüm geçmiş kareleri dizi halinde döner. |
| `POST` | `/api/control` | `{ action: 'play'\|'pause'\|'toggle'\|'step'\|'speed'\|'seek', tickRateMs?, tick? }` | Simülasyon döngüsünü kontrol eder, adım atlatır veya hızı değiştirir. |
| `GET` | `/api/stream` | - | Gerçek zamanlı SSE (Server-Sent Events) canlı veri akışı. |
| `GET` | `/api/state` | - | Güncel simülasyon anlık durum özeti. |
| `GET` | `/api/events` | `?limit=50` | SQLite WAL'e yazılmış son olay logları. |

---

## 🚀 Çalıştırma Komutları

### Gereksinimler
* Node.js v20+ (Önerilen: v22 veya v24)
* npm v10+

### 1. Canlı Görselleştiriciyi Başlatma (Web Arayüzü)
```bash
npm start
```
Tarayıcınızda **http://localhost:3000** adresine gidin.
* Canvas üzerinde herhangi bir hücreye tıklayarak dinamik engel ekleyip kaldırabilirsiniz.
* Ajanların engeller etrafında canlı olarak rotalarını anında güncellediğini izleyebilirsiniz.

### 2. Testleri Koşma (Vitest)
```bash
npm test
```
A* algoritmasının düz yolda, U-şekilli tuzakta ve dinamik engel kapanışındaki davranışlarını ve SQLite veri bütünlüğünü doğrulayan 19 birim/entegrasyon testini koşar.

### 3. Tip Denetimi
```bash
npm run typecheck
```
Tüm TypeScript kaynak kodlarını katı (strict) modda ve sıfır `any` garantisiyle denetler.

### 4. Benchmark Çalıştırma
```bash
npm run benchmark
```
1.000 aktif ajan ile 100 tick simülasyon çalıştırarak TPS, gecikme ve bellek tüketim tablosunu konsola yazdırır.

---

## 📁 Proje Dizin Yapısı

```
chronos-sim/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI pipeline
├── benchmarks/
│   └── engine.bench.ts        # 1.000 ajanlık yüksek yük performans testi
├── public/
│   ├── index.html             # HTML5 Canvas arayüzü & telemetri paneli
│   └── viewer.js              # SSE dinleyici, A* çizici ve etkileşim mantığı
├── src/
│   ├── core/
│   │   ├── Engine.ts          # 50ms sabit adımlı deterministik simülasyon yöneticisi
│   │   └── Types.ts           # Vektör, Ajan, Yapılandırma ve Olay tipleri
│   ├── fsm/
│   │   └── StateMachine.ts    # Tip güvenli durum makinesi (IDLE, NAVIGATING, BLOCKED, COMPLETED)
│   ├── server/
│   │   └── app.ts             # Express HTTP & SSE canlı yayın sunucusu
│   ├── spatial/
│   │   ├── Pathfinding.ts     # Min-Heap optimize A* (8 yönlü, köşe kesme korumalı)
│   │   └── SpatialGrid.ts     # O(1) yakın komşu ve dinamik engel hash ızgarası
│   ├── storage/
│   │   └── EventStore.ts      # better-sqlite3 WAL modunda olay ve snapshot deposu
│   └── index.ts               # Kütüphane ana dışa aktarımları
├── tests/
│   ├── TimeTravelReplay.test.ts # Event-sourcing, time-travel seek ve API testleri
│   ├── Pathfinding.test.ts    # Düz yol, U-duvar ve engel kapanış testleri
│   ├── AdvancedSimulation.test.ts # Arazi maliyetleri, kaçış ve stamina testleri
│   ├── EventStore.test.ts     # WAL, transaction ve snapshot geri yükleme testleri
│   ├── engine.test.ts         # Motor adım ve entegrasyon testleri
│   ├── fsm.test.ts            # Durum geçişleri ve kanca testleri
│   └── spatial.test.ts        # Spatial grid ve O(1) komşu testleri
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📜 Lisans
ISC
