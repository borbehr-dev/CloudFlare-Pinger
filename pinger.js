import { Hono } from 'hono'

// Импортируем оба JSON-файла напрямую — теперь это работает нативно!
import listJson from './list.json'
import config from './config.json'

const app = new Hono()

// Глобальный кэш состояния сайтов в оперативной памяти воркера
let runtimeCache = listJson.map(site => ({
  ...site,
  status: "unknown",
  uptime: 100,
  response_time: 0,
  last_checked: "Ни разу"
}))

// --- ИНТЕРФЕЙС (РУССКИЙ ЯЗЫК + СВЕТЛАЯ/ТЕМНАЯ ТЕМА) ---
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\${config.settings.app_name}</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            --card-bg: #ffffff;
            --text-main: #333333;
            --text-muted: #666666;
            --border-color: #e2e8f0;
            --stat-bg: #f8f9fa;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-gradient: linear-gradient(135deg, #1a1c23 0%, #111217 100%);
                --card-bg: #1e202b;
                --text-main: #f3f4f6;
                --text-muted: #9ca3af;
                --border-color: #374151;
                --stat-bg: #2d3142;
            }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: var(--bg-gradient);
            color: var(--text-main);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            flex-direction: column;
            transition: background 0.3s ease;
        }
        .container { max-width: 1000px; margin: 0 auto; flex: 1; width: 100%; }
        .header { text-align: center; margin-bottom: 40px; padding: 20px; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { font-size: 1.1rem; opacity: 0.8; color: var(--text-muted); }
        
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px; margin-bottom: 30px;
        }
        .stat-card {
            background: var(--card-bg); border-radius: 12px; padding: 20px;
            text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border: 1px solid var(--border-color);
        }
        .stat-card i { font-size: 2rem; margin-bottom: 10px; }
        .stat-card.total i { color: #3b82f6; }
        .stat-card.up i { color: #10b981; }
        .stat-card.down i { color: #ef4444; }
        .stat-card.uptime i { color: #f59e0b; }
        .stat-card h3 { font-size: 1.8rem; margin-bottom: 5px; }

        .websites-list {
            background: var(--card-bg); border-radius: 12px; padding: 25px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid var(--border-color);
            margin-bottom: 40px;
        }
        .list-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;
        }
        
        .btn {
            background: #10b981; color: white; border: none; padding: 8px 16px;
            border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .website-card {
            border: 1px solid var(--border-color); border-radius: 8px;
            padding: 15px; margin-bottom: 15px; display: grid; gap: 12px;
        }
        .website-card.up { border-left: 4px solid #10b981; }
        .website-card.down { border-left: 4px solid #ef4444; }
        .website-card.unknown { border-left: 4px solid #9ca3af; }

        .card-top { display: flex; justify-content: space-between; align-items: center; }
        .site-name { font-weight: bold; font-size: 1.1rem; }
        .site-url { color: #3b82f6; text-decoration: none; font-size: 0.9rem; }
        
        .badge { padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
        .badge.up { background: rgba(16, 185, 129, 0.2); color: #10b981; }
        .badge.down { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .badge.unknown { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }

        .progress-bar { width: 100%; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; background: #10b981; transition: width 0.3s; }

        .card-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; }
        .card-stat-box { background: var(--stat-bg); padding: 8px; border-radius: 6px; }
        .stat-val { font-weight: bold; font-size: 1.1rem; }
        .stat-lbl { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }

        .loading { text-align: center; padding: 30px; color: var(--text-muted); }
        .loading i { animation: spin 1s linear infinite; font-size: 2rem; margin-bottom: 10px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .footer {
            text-align: center;
            padding: 20px;
            font-size: 0.95rem;
            color: var(--text-muted);
            border-top: 1px solid var(--border-color);
            margin-top: auto;
        }
        .footer a {
            color: #3b82f6;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s;
        }
        .footer a:hover {
            color: #2563eb;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-heartbeat"></i> \${config.settings.app_name}</h1>
            <p>Мониторинг доступности ресурсов в реальном времени</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card total"><i class="fas fa-globe"></i><h3 id="totalSites">0</h3><p>Всего сайтов</p></div>
            <div class="stat-card up"><i class="fas fa-check-circle"></i><h3 id="upSites">0</h3><p>Доступны</p></div>
            <div class="stat-card down"><i class="fas fa-times-circle"></i><h3 id="downSites">0</h3><p>Недоступны</p></div>
            <div class="stat-card uptime"><i class="fas fa-chart-line"></i><h3 id="avgUptime">100%</h3><p>Средний аптайм</p></div>
        </div>

        <div class="websites-list">
            <div class="list-header">
                <h2><i class="fas fa-list"></i> Наблюдаемые ресурсы</h2>
                \${config.settings.allow_manual_check ? `
                <button class="btn" id="checkBtn" onclick="checkAllNow()">
                    <i class="fas fa-sync-alt"></i> Проверить сейчас
                </button>` : ''}
            </div>
            <div id="container"><div class="loading"><i class="fas fa-spinner"></i><p>Загрузка данных...</p></div></div>
        </div>
    </div>

    <footer class="footer">
        Работает на CloudFlare-Pinger. <a href="https://github.com/borbehr-dev/CloudFlare-Pinger" target="_blank"><i class="fab fa-github"></i> Click to Github repo</a>
    </footer>

    <script>
        document.addEventListener('DOMContentLoaded', loadData);
        setInterval(loadData, 20000); // автообновление UI каждые 20 секунд

        async function loadData() {
            try {
                const res = await fetch('/api/websites');
                const sites = await res.json();
                render(sites);
            } catch (e) { console.error("Ошибка обновления данных", e); }
        }

        function render(sites) {
            const total = sites.length;
            const up = sites.filter(s => s.status === 'up').length;
            const down = sites.filter(s => s.status === 'down').length;
            const avg = total > 0 ? (sites.reduce((acc, s) => acc + s.uptime, 0) / total).toFixed(2) : 100;

            document.getElementById('totalSites').textContent = total;
            document.getElementById('upSites').textContent = up;
            document.getElementById('downSites').textContent = down;
            document.getElementById('avgUptime').textContent = avg + '%';

            document.getElementById('container').innerHTML = sites.map(s => \`
                <div class="website-card \${s.status}">
                    <div class="card-top">
                        <div>
                            <div class="site-name">\${s.name}</div>
                            <a href="\${s.url}" target="_blank" class="site-url">\${s.url}</a>
                        </div>
                        <span class="badge \${s.status}">
                            \${s.status === 'up' ? 'ДОСТУПЕН' : s.status === 'down' ? 'УПАЛ' : 'ОЖИДАНИЕ'}
                        </span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width: \${s.uptime}%"></div></div>
                    <div class="card-stats">
                        <div class="card-stat-box"><div class="stat-val">\${s.uptime}%</div><div class="stat-lbl">Аптайм</div></div>
                        <div class="card-stat-box"><div class="stat-val">\${s.response_time} мс</div><div class="stat-lbl">Отклик</div></div>
                        <div class="card-stat-box"><div class="stat-val">\${formatTime(s.last_checked)}</div><div class="stat-lbl">Проверен</div></div>
                    </div>
                </div>
            \`).join('');
        }

        async function checkAllNow() {
            const btn = document.getElementById('checkBtn');
            if(!btn) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сканирую...';
            await fetch('/api/check-now', { method: 'POST' });
            await loadData();
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить сейчас';
        }

        function formatTime(timeStr) {
            if (timeStr === 'Ни разу' || !timeStr) return 'Ни разу';
            const diff = Math.floor((new Date() - new Date(timeStr)) / 1000);
            if (diff < 15) return 'Только что';
            if (diff < 60) return \`\${diff} сек. назад\`;
            if (diff < 3600) return \`\${Math.floor(diff / 60)} мин. назад\`;
            return \`\${Math.floor(diff / 3600)} ч. назад\`;
        }
    </script>
</body>
</html>
`

// --- ЛОГИКА API ---

app.get('/', (c) => c.html(HTML_TEMPLATE))

app.get('/api/websites', (c) => {
    return c.json(runtimeCache)
})

app.post('/api/check-now', async (c) => {
    if (!config.settings.allow_manual_check) return c.json({ error: 'Запрещено настройками' }, 403)
    await runPinger()
    return c.json({ success: true, data: runtimeCache })
})

// Системный цикл пинга ресурсов с защитой от ложных падений (403/429 капчи)
async function runPinger() {
    for (let site of runtimeCache) {
        const start = Date.now()
        try {
            const res = await fetch(site.url, { 
                method: 'HEAD', 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
                },
                timeout: config.settings.fetch_timeout_ms 
            })
            
            site.response_time = Date.now() - start
            
            if (res.status < 400 || res.status === 403 || res.status === 429) {
                site.status = 'up'
                site.uptime = 100
            } else {
                site.status = 'down'
                site.uptime = 0
            }
        } catch (e) {
            site.response_time = 0
            site.status = 'down'
            site.uptime = 0
        }
        site.last_checked = new Date().toISOString()
    }
}

export default {
    fetch: app.fetch,
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runPinger())
    }
}