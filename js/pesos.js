// GymApp — cargar pesos semanales (pages/pesos.html)
// "peso_anterior" en cada ejercicio de la rutina no es un peso: es un flag.
// -1 significa "este ejercicio no lleva peso" (ej: elongacion). Cualquier
// otro valor significa "se le puede cargar peso".

const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');

    let currentUser = null;
    let currentRutina = null;

    function currentWeekIndex(rutina) {
        let found = -1;
        rutina.semanas.forEach((semana, index) => {
            semana.dias.forEach((dia) => {
                dia.ejercicios.forEach((exc) => {
                    if (exc.peso > 0) found = index;
                });
            });
        });
        return found === -1 ? 0 : found;
    }

    function routineProgress(rutina) {
        let total = 0;
        let done = 0;
        rutina.semanas.forEach((semana) => {
            semana.dias.forEach((dia) => {
                dia.ejercicios.forEach((exc) => {
                    total++;
                    if (exc.peso > 0) done++;
                });
            });
        });
        return total === 0 ? 0 : Math.round((done / total) * 100);
    }

    function dayProgress(dia) {
        const trackable = dia.ejercicios.filter((exc) => exc.peso_anterior !== -1);
        if (trackable.length === 0) return 100;
        const done = trackable.filter((exc) => exc.peso > 0).length;
        return Math.round((done / trackable.length) * 100);
    }

    function ringMarkup(pct) {
        const r = 16;
        const circumference = 2 * Math.PI * r;
        const offset = circumference * (1 - pct / 100);
        return `
            <div class="day-ring">
                <svg viewBox="0 0 40 40">
                    <circle class="ring-bg" cx="20" cy="20" r="${r}"></circle>
                    <circle class="ring-fg" cx="20" cy="20" r="${r}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
                </svg>
                <span class="day-ring-pct">${pct}%</span>
            </div>
        `;
    }

    function renderWeekStatus(rutina, weekIndex) {
        const semana = rutina.semanas[weekIndex];
        document.getElementById('weekStatus').innerHTML = `
            <span class="hero-badge">Estás en la semana ${semana.numero}</span>
            <span class="hero-badge">Progreso de la rutina: ${routineProgress(rutina)}%</span>
        `;
    }

    function renderWeek(weekIndex) {
        const semana = currentRutina.semanas[weekIndex];
        const weekContent = document.getElementById('weekContent');
        weekContent.dataset.week = weekIndex;

        renderWeekStatus(currentRutina, weekIndex);

        weekContent.innerHTML = semana.dias.map((dia, diaIndex) => {
            const pct = dayProgress(dia);
            const done = pct >= 100;
            const trackableCount = dia.ejercicios.filter((exc) => exc.peso_anterior !== -1).length;
            const doneCount = dia.ejercicios.filter((exc) => exc.peso_anterior !== -1 && exc.peso > 0).length;
            const subtitle = trackableCount === 0
                ? 'Sin ejercicios con peso'
                : `${doneCount} de ${trackableCount} ejercicios con peso cargado`;

            return `
                <button class="day-row reveal ${done ? 'done' : ''}" type="button" data-dia="${diaIndex}">
                    ${ringMarkup(pct)}
                    <div class="day-row-info">
                        <h3>${dia.nombre}</h3>
                        <p>${subtitle}</p>
                    </div>
                    <span class="day-row-status ${done ? 'done' : 'pending'}">${done ? 'Completo' : 'Pendiente'}</span>
                    <svg class="day-row-chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </button>
            `;
        }).join('');

        weekContent.querySelectorAll('.day-row').forEach((row) => {
            row.addEventListener('click', () => openDay(weekIndex, Number(row.dataset.dia)));
        });
    }

    function openDay(weekIndex, diaIndex) {
        const semana = currentRutina.semanas[weekIndex];
        const dia = semana.dias[diaIndex];
        const weekContent = document.getElementById('weekContent');
        document.getElementById('weekPicker').style.display = 'none';
        document.getElementById('weekStatus').style.display = 'none';

        const trackable = dia.ejercicios
            .map((exc, excIndex) => ({ exc, excIndex }))
            .filter((item) => item.exc.peso_anterior !== -1);

        if (trackable.length === 0) {
            weekContent.innerHTML = `
                <a class="back-link" id="backToWeek" href="#"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</a>
                <div class="empty-state reveal">
                    <h3>${dia.nombre} no tiene ejercicios con peso</h3>
                    <p>No hay nada para cargar este día.</p>
                </div>
            `;
            document.getElementById('backToWeek').addEventListener('click', (e) => { e.preventDefault(); backToWeek(weekIndex); });
            return;
        }

        weekContent.innerHTML = `
            <a class="back-link" id="backToWeek" href="#"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver a la semana</a>
            <div class="auth-card reveal">
                <span class="eyebrow">${dia.nombre}</span>
                <h1>Cargar pesos</h1>
                <p class="subtitle">${currentRutina.nombre} · Semana ${semana.numero}</p>

                ${trackable.map(({ exc, excIndex }) => `
                    <div class="weight-field">
                        <div>
                            <div class="weight-field-label">${exc.nombre}</div>
                            <div class="weight-field-sub">${exc.serie}x${exc.repe} · anterior: ${exc.peso > 0 ? exc.peso + ' kg' : 'sin registro'}</div>
                        </div>
                        <input type="number" class="mini-input weightInput" data-exc="${excIndex}" placeholder="kg">
                    </div>
                `).join('')}

                <div class="alert_message" id="alert_message"></div>
                <button class="btn btn-primary btn-block" id="saveWeights" type="button">Guardar</button>
            </div>
        `;

        document.getElementById('backToWeek').addEventListener('click', (e) => { e.preventDefault(); backToWeek(weekIndex); });
        document.getElementById('saveWeights').addEventListener('click', () => saveWeights(weekIndex, diaIndex));
    }

    function backToWeek(weekIndex) {
        document.getElementById('weekPicker').style.display = '';
        document.getElementById('weekStatus').style.display = '';
        renderWeek(weekIndex);
    }

    function saveWeights(weekIndex, diaIndex) {
        const alert_message = document.getElementById('alert_message');
        const dia = currentRutina.semanas[weekIndex].dias[diaIndex];
        const inputs = document.querySelectorAll('.weightInput');

        const today = new Date();
        const fecha = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

        let touched = 0;
        let error = false;

        inputs.forEach((input) => {
            const value = input.value.trim();
            if (value === '') return;
            const peso = Number(value);
            if (isNaN(peso) || peso <= 0) { error = true; return; }

            const excIndex = Number(input.dataset.exc);
            const exc = dia.ejercicios[excIndex];
            exc.peso = peso;
            exc.fecha = fecha;
            currentUser.historial.push({ peso, fecha, id_exc: exc.id_exc });
            touched++;
        });

        if (error) {
            alert_message.innerHTML = `<p>Ingresá solo números mayores a 0.</p>`;
            return;
        }
        if (touched === 0) {
            alert_message.innerHTML = `<p>Cargá al menos un peso para guardar.</p>`;
            return;
        }

        alert_message.innerHTML = '';
        const loaderBody = document.getElementById('loaderBody');
        loaderBody.innerHTML = `
            <div class="loader-container">
                <div class="modern-spinner"><div></div><div></div><div></div><div></div></div>
                <p>Guardando pesos...</p>
            </div>
        `;
        actRutina(parseInt(user_id) + 1, currentUser);
    }

    async function actRutina(userId, user) {
        const loaderBody = document.getElementById('loaderBody');
        try {
            const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });

            if (response.ok) {
                loaderBody.innerHTML = `
                    <div class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>¡Peso actualizado con éxito! Espere, será redirigido</p>
                    </div>
                `;
                setTimeout(() => { window.location.href = `profile.html`; }, 2500);
            } else {
                loaderBody.innerHTML = '';
                const alert_message = document.getElementById('alert_message');
                if (alert_message) alert_message.innerHTML = `<p>ERROR! No se pudo guardar.</p>`;
            }
        } catch (error) {
            loaderBody.innerHTML = '';
            const alert_message = document.getElementById('alert_message');
            if (alert_message) alert_message.innerHTML = `<p>ERROR! Hubo un problema con la solicitud.</p>`;
        }
    }

    async function init() {
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            const users = await response.json();
            currentUser = users[user_id];
            currentRutina = currentUser ? currentUser.rutinas[rutina_id] : null;

            if (!currentUser || !currentRutina) {
                document.getElementById('routineTitle').textContent = 'No se encontró esta rutina.';
                document.getElementById('weekPicker').remove();
                document.getElementById('weekStatus').remove();
                return;
            }

            document.getElementById('routineTitle').textContent = currentRutina.nombre;
            document.getElementById('routineSubtitle').textContent = 'Elegí un día para cargar el peso de hoy.';

            const startWeek = currentWeekIndex(currentRutina);

            const weekSelect = document.getElementById('weekSelect');
            weekSelect.innerHTML = currentRutina.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join('');
            weekSelect.value = startWeek;
            weekSelect.addEventListener('change', () => renderWeek(Number(weekSelect.value)));

            renderWeek(startWeek);
        } catch (error) {
            console.error('Error al cargar los pesos:', error);
        }
    }

    init();
} else {
    window.location.href = `login.html`;
}
