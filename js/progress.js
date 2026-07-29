// GymApp — progreso detallado por ejercicio (pages/progress.html)

const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('id');

    let users = [];
    let exc_api_array = [];
    let chartInstance = null;

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

    function entriesForExercise(historial, excId) {
        return historial.filter((entry) => String(entry.id_exc) === String(excId));
    }

    function showEmpty() {
        document.getElementById('pageSubtitle').textContent = 'Todavía no tenés entrenamientos registrados.';
        document.getElementById('excPicker').remove();
        document.getElementById('progressContent').innerHTML = `
            <div class="empty-state reveal">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
                <h3>Todavía no tenés estadísticas</h3>
                <p>Cuando cargues el peso de un ejercicio en "Pesos semanales", tu progreso va a aparecer acá.</p>
                <a href="profile.html" class="btn btn-primary btn-sm">Volver al perfil</a>
            </div>
        `;
    }

    function renderExercise(historial, excDef) {
        const entries = entriesForExercise(historial, excDef.id);
        const weights = entries.map((e) => e.peso);
        const max = Math.max(...weights);
        const min = Math.min(...weights);
        const avg = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);

        document.getElementById('progressContent').innerHTML = `
            <div class="card-grid cols-3">
                <div class="stat-card reveal"><div class="label">Peso máximo</div><div class="value">${max} kg</div></div>
                <div class="stat-card reveal"><div class="label">Peso promedio</div><div class="value">${avg} kg</div></div>
                <div class="stat-card reveal"><div class="label">Veces entrenado</div><div class="value">${entries.length}</div></div>
            </div>
            <div class="chart-card reveal">
                <h3>${excDef.name}</h3>
                <p class="chart-sub">Ejercicio de ${authorLabel(excDef.author)} · peso mínimo registrado: ${min} kg</p>
                <div class="chart-wrap"><canvas id="progressChart"></canvas></div>
            </div>
        `;

        if (chartInstance) chartInstance.destroy();
        const canvas = document.getElementById('progressChart');
        if (!canvas || typeof Chart === 'undefined') return;

        chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: entries.map((e) => e.fecha),
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
