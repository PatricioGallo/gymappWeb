// GymApp — progreso detallado por ejercicio (pages/progress.html)

const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('id');

    const RECENT_WINDOW = 5;
    const PROJECTION_DAYS = 28;

    let users = [];
    let exc_api_array = [];

    let lineChartInstance = null;
    let sessionChartInstance = null;
    let volumeChartInstance = null;
    let topMaxChartInstance = null;
    let topProgressChartInstance = null;

    function trainedExercises(historial) {
        const seenIds = [];
        const result = [];
        historial.forEach((entry) => {
            if (seenIds.includes(entry.id_exc)) return;
            const excDef = exc_api_array.find((exc) => exc.id == entry.id_exc);
            if (!excDef) return;
            seenIds.push(entry.id_exc);
            result.push(excDef);
        });
        return result;
    }

    function authorLabel(author) {
        if (author === undefined || author === 'gymapp') return 'GymApp';
        const user = users[author - 1];
        return user ? `${user.nombre} ${user.apellido}` : 'GymApp';
    }

    function parseFechaDMY(fecha) {
        if (!fecha) return null;
        const partes = fecha.split('-');
        if (partes.length !== 3) return null;
        const [dd, mm, yyyy] = partes.map(Number);
        if (!dd || !mm || !yyyy) return null;
        return new Date(yyyy, mm - 1, dd);
    }

    // Entradas de UN ejercicio, ordenadas cronologicamente. Es la base para
    // cualquier estadistica: sin orden, "promedio reciente" o "proyeccion"
    // no significan nada.
    function sortedEntries(historial, excId) {
        return historial
            .filter((entry) => String(entry.id_exc) === String(excId))
            .map((entry) => ({ ...entry, date: parseFechaDMY(entry.fecha) }))
            .filter((entry) => entry.date)
            .sort((a, b) => a.date - b.date);
    }

    // Estimacion de 1RM (formula de Epley). Solo tiene sentido si sabemos
    // cuantas repeticiones se hicieron con ese peso.
    function sesionesLabel(n) {
        return `${n} ${n === 1 ? 'sesión' : 'sesiones'}`;
    }

    function ultimasSesionesLabel(n) {
        return n === 1 ? 'Última sesión registrada' : `Últimas ${n} sesiones registradas`;
    }

    function oneRepMax(peso, repe) {
        if (!repe || repe <= 1) return peso;
        return Math.round(peso * (1 + repe / 30));
    }

    function bestOneRepMax(points) {
        const withReps = points.filter((p) => p.repe);
        if (withReps.length === 0) return null;
        return withReps.reduce((best, p) => {
            const rm = oneRepMax(p.peso, p.repe);
            return !best || rm > best.rm ? { rm, entry: p } : best;
        }, null);
    }

    // Regresion lineal simple sobre (dias desde el primer registro, peso)
    // para proyectar el peso dentro de PROJECTION_DAYS.
    function projectWeight(points, daysAhead) {
        if (points.length < 2) return null;
        const x0 = points[0].date.getTime();
        const xs = points.map((p) => (p.date.getTime() - x0) / 86400000);
        const ys = points.map((p) => p.peso);
        const n = xs.length;
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
        const sumXX = xs.reduce((a, x) => a + x * x, 0);
        const denom = n * sumXX - sumX * sumX;
        if (denom === 0) return null;
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        const projX = xs[xs.length - 1] + daysAhead;
        return Math.round(slope * projX + intercept);
    }

    function buildOverviewData(historial, trained) {
        return trained.map((excDef) => {
            const points = sortedEntries(historial, excDef.id);
            const weights = points.map((p) => p.peso);
            const max = Math.max(...weights);
            const delta = points[points.length - 1].peso - points[0].peso;
            return { name: excDef.name, max, delta, entries: points.length };
        });
    }

    function barChart(canvasId, labels, data, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined') return null;
        return new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: color,
                    borderRadius: 6,
                    maxBarThickness: 28
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { color: '#9aa1ac' }, grid: { color: '#262b33' } },
                    y: { ticks: { color: '#9aa1ac' }, grid: { display: false } }
                }
            }
        });
    }

    function showEmpty() {
        document.getElementById('pageSubtitle').textContent = 'Todavía no tenés entrenamientos registrados.';
        document.getElementById('excPicker').remove();
        document.getElementById('detailHead').remove();
        document.getElementById('overviewContent').innerHTML = '';
        document.getElementById('progressContent').innerHTML = `
            <div class="empty-state reveal">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
                <h3>Todavía no tenés estadísticas</h3>
                <p>Cuando cargues el peso de un ejercicio en "Pesos semanales", tu progreso va a aparecer acá.</p>
                <a href="profile.html" class="btn btn-primary btn-sm">Volver al perfil</a>
            </div>
        `;
    }

    // "Primero que nada": un resumen con los ejercicios donde levantás mas
    // peso y en los que mas progresaste, antes de entrar al detalle de uno.
    function renderOverview(historial, trained) {
        const overviewContent = document.getElementById('overviewContent');
        const data = buildOverviewData(historial, trained);

        const topByMax = [...data].sort((a, b) => b.max - a.max).slice(0, 5);
        const topByProgress = data.filter((d) => d.entries >= 2 && d.delta > 0)
            .sort((a, b) => b.delta - a.delta).slice(0, 5);

        overviewContent.innerHTML = `
            <div class="section-head reveal">
                <span class="eyebrow">Resumen</span>
                <h2>Tus mejores ejercicios</h2>
                <p>En cuáles levantás más peso y en cuáles progresaste más desde tu primer registro.</p>
            </div>
            <div class="chart-grid">
                <div class="chart-card reveal">
                    <h3>Mejores ejercicios</h3>
                    <p class="chart-sub">Por peso máximo levantado.</p>
                    <div class="chart-wrap"><canvas id="topMaxChart"></canvas></div>
                </div>
                <div class="chart-card reveal">
                    <h3>Mayor progreso</h3>
                    ${topByProgress.length === 0 ? `
                        <p class="chart-sub">Todavía no hay suficientes registros para comparar progreso.</p>
                    ` : `
                        <p class="chart-sub">Kilos ganados desde tu primer registro.</p>
                        <div class="chart-wrap"><canvas id="topProgressChart"></canvas></div>
                    `}
                </div>
            </div>
        `;

        if (topMaxChartInstance) topMaxChartInstance.destroy();
        if (topProgressChartInstance) topProgressChartInstance.destroy();

        topMaxChartInstance = barChart('topMaxChart', topByMax.map((d) => d.name), topByMax.map((d) => d.max), '#ff8a3d');
        if (topByProgress.length > 0) {
            topProgressChartInstance = barChart('topProgressChart', topByProgress.map((d) => d.name), topByProgress.map((d) => d.delta), '#2fd971');
        }
    }

    function renderExercise(historial, excDef) {
        const points = sortedEntries(historial, excDef.id);
        const weights = points.map((p) => p.peso);

        const max = Math.max(...weights);
        const maxEntry = points.find((p) => p.peso === max);
        const min = Math.min(...weights);

        const recent = points.slice(-RECENT_WINDOW);
        const recentAvg = Math.round(recent.reduce((a, p) => a + p.peso, 0) / recent.length);

        const first = points[0];
        const last = points[points.length - 1];
        const delta = last.peso - first.peso;
        const deltaPct = first.peso > 0 ? Math.round((delta / first.peso) * 100) : 0;

        const rm = bestOneRepMax(points);
        const projected = projectWeight(points, PROJECTION_DAYS);

        const volumePoints = points.filter((p) => p.serie && p.repe).map((p) => ({ fecha: p.fecha, volumen: p.serie * p.repe * p.peso }));

        document.getElementById('progressContent').innerHTML = `
            <div class="card-grid">
                <div class="stat-card reveal">
                    <div class="label">Peso máximo</div>
                    <div class="value">${max} kg<small>${maxEntry.fecha}</small></div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">1RM estimado</div>
                    <div class="value">${rm ? `${rm.rm} kg` : '—'}<small>${rm ? 'Fórmula de Epley' : 'Cargá repeticiones para calcularlo'}</small></div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Promedio últimas ${sesionesLabel(recent.length)}</div>
                    <div class="value">${recentAvg} kg</div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Peso proyectado (4 semanas)</div>
                    <div class="value">${projected !== null ? `${projected} kg` : '—'}<small>${projected !== null ? 'Según tu ritmo de progreso' : 'Necesitás más registros'}</small></div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Progreso total</div>
                    <div class="value">${points.length >= 2 ? `${delta >= 0 ? '+' : ''}${delta} kg<small>${deltaPct >= 0 ? '+' : ''}${deltaPct}% desde el primer registro</small>` : `—<small>Necesitás al menos 2 registros</small>`}</div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Veces entrenado</div>
                    <div class="value">${points.length}<small>Mínimo registrado: ${min} kg</small></div>
                </div>
            </div>

            <div class="chart-card reveal">
                <h3>${excDef.name}</h3>
                <p class="chart-sub">Ejercicio de ${authorLabel(excDef.author)} · evolución del peso a lo largo del tiempo</p>
                <div class="chart-wrap"><canvas id="progressChart"></canvas></div>
            </div>

            <div class="chart-card reveal">
                <h3>Peso por sesión</h3>
                <p class="chart-sub">${ultimasSesionesLabel(Math.min(points.length, 10))}.</p>
                <div class="chart-wrap"><canvas id="sessionChart"></canvas></div>
            </div>

            ${volumePoints.length >= 2 ? `
            <div class="chart-card reveal">
                <h3>Volumen por sesión</h3>
                <p class="chart-sub">Series × repeticiones × peso, últimas ${sesionesLabel(Math.min(volumePoints.length, 10))}.</p>
                <div class="chart-wrap"><canvas id="volumeChart"></canvas></div>
            </div>` : ''}
        `;

        if (lineChartInstance) lineChartInstance.destroy();
        if (sessionChartInstance) sessionChartInstance.destroy();
        if (volumeChartInstance) volumeChartInstance.destroy();

        const lineCanvas = document.getElementById('progressChart');
        if (lineCanvas && typeof Chart !== 'undefined') {
            lineChartInstance = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels: points.map((p) => p.fecha),
                    datasets: [{
                        label: 'Peso (kg)',
                        data: weights,
                        borderColor: '#ff8a3d',
                        backgroundColor: 'rgba(255, 138, 61, 0.18)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#ff8a3d'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { ticks: { color: '#9aa1ac' }, grid: { color: '#262b33' } },
                        x: { ticks: { color: '#9aa1ac' }, grid: { display: false } }
                    }
                }
            });
        }

        const recentSessions = points.slice(-10);
        const sessionCanvas = document.getElementById('sessionChart');
        if (sessionCanvas && typeof Chart !== 'undefined') {
            sessionChartInstance = new Chart(sessionCanvas, {
                type: 'bar',
                data: {
                    labels: recentSessions.map((p) => p.fecha),
                    datasets: [{
                        data: recentSessions.map((p) => p.peso),
                        backgroundColor: '#ff4d4d',
                        borderRadius: 6,
                        maxBarThickness: 34
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { color: '#9aa1ac' }, grid: { color: '#262b33' } },
                        x: { ticks: { color: '#9aa1ac' }, grid: { display: false } }
                    }
                }
            });
        }

        if (volumePoints.length >= 2) {
            const recentVolume = volumePoints.slice(-10);
            const volumeCanvas = document.getElementById('volumeChart');
            if (volumeCanvas && typeof Chart !== 'undefined') {
                volumeChartInstance = new Chart(volumeCanvas, {
                    type: 'bar',
                    data: {
                        labels: recentVolume.map((p) => p.fecha),
                        datasets: [{
                            data: recentVolume.map((p) => p.volumen),
                            backgroundColor: '#2fd971',
                            borderRadius: 6,
                            maxBarThickness: 34
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { color: '#9aa1ac' }, grid: { color: '#262b33' } },
                            x: { ticks: { color: '#9aa1ac' }, grid: { display: false } }
                        }
                    }
                });
            }
        }
    }

    async function init() {
        try {
            const [usersRes, excRes] = await Promise.all([
                fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users'),
                fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices')
            ]);
            users = await usersRes.json();
            exc_api_array = await excRes.json();
            exc_api_array.sort((a, b) => a.name.localeCompare(b.name));

            const user = users[user_id];
            if (!user) {
                showEmpty();
                return;
            }

            document.getElementById('pageTitle').textContent = `Progreso de ${user.nombre}`;

            const trained = trainedExercises(user.historial || []);
            if (trained.length === 0) {
                showEmpty();
                return;
            }

            renderOverview(user.historial, trained);

            const select = document.getElementById('excSelect');
            select.innerHTML = trained.map((exc) => `<option value="${exc.id}">${exc.name}</option>`).join('');
            select.addEventListener('change', () => {
                const chosen = trained.find((exc) => String(exc.id) === select.value);
                renderExercise(user.historial, chosen);
            });

            renderExercise(user.historial, trained[0]);
        } catch (error) {
            console.error('Error al cargar el progreso:', error);
        }
    }

    init();
} else {
    window.location.href = `login.html`;
}
