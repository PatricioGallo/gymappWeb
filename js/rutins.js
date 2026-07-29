// GymApp — crear una rutina nueva (pages/rutinsView.html)

const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('id');
    const container = document.getElementById('container');
    const dayNames = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

    let currentUser = null;
    let exc_api_array = [];

    function excOptions(selectedId) {
        return exc_api_array.map((exc) => `<option value="${exc.id}" ${String(exc.id) === String(selectedId) ? 'selected' : ''}>${exc.name}</option>`).join('');
    }

    function excBlockMarkup() {
        return `
            <div class="exc-block">
                <div class="exc-edit-row">
                    <select class="excSelectInput">
                        <option value="">Elegir ejercicio</option>
                        ${excOptions()}
                    </select>
                    <input type="number" class="mini-input serieInput" placeholder="Series" min="1" max="10">
                    <input type="number" class="mini-input repeInput" placeholder="Repes" min="1" max="30">
                    <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
                </div>
                <div class="exc-extra">
                    <label><input type="checkbox" class="noWeightCheck"> Sin peso</label>
                    <input type="text" class="notaInput" placeholder="Nota para este ejercicio (opcional)" maxlength="140">
                </div>
            </div>
        `;
    }

    function dayCardMarkup(dayIndex) {
        return `
            <div class="day-card reveal" data-day="${dayIndex}">
                <select class="day-name-select">
                    ${dayNames.map((name, i) => `<option value="${name}" ${i === dayIndex % 7 ? 'selected' : ''}>${name}</option>`).join('')}
                </select>
                <div class="exc-list">${excBlockMarkup()}</div>
                <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
            </div>
        `;
    }

    function renderSetupForm() {
        container.innerHTML = `
            <div class="auth-card reveal">
                <span class="eyebrow">Nueva rutina</span>
                <h1>Creá tu rutina</h1>
                <p class="subtitle">Elegí el nombre y cuántas semanas y días vas a entrenar. Después cargás los ejercicios de cada día.</p>

                <form id="setupForm" novalidate>
                    <div class="field">
                        <label for="rutinName">Nombre de la rutina</label>
                        <input type="text" id="rutinName" placeholder="Ej: Full body">
                    </div>
                    <div class="field-row">
                        <div class="field">
                            <label for="weeksInput">Semanas</label>
                            <input type="number" id="weeksInput" min="1" max="10" placeholder="Ej: 4">
                        </div>
                        <div class="field">
                            <label for="daysInput">Días por semana</label>
                            <input type="number" id="daysInput" min="1" max="7" placeholder="Ej: 3">
                        </div>
                    </div>
                    <div class="alert_message" id="setupAlert"></div>
                    <button type="submit" class="btn btn-primary btn-block">Continuar</button>
                </form>
            </div>
        `;

        document.getElementById('setupForm').addEventListener('submit', (event) => {
            event.preventDefault();
            const name = document.getElementById('rutinName').value.trim();
            const weeks = parseInt(document.getElementById('weeksInput').value);
            const days = parseInt(document.getElementById('daysInput').value);
            const alertEl = document.getElementById('setupAlert');

            if (name.length < 2) {
                alertEl.innerHTML = `<p>Ingresá un nombre para la rutina.</p>`;
                return;
            }
            if (!weeks || weeks < 1 || weeks > 10) {
                alertEl.innerHTML = `<p>La cantidad de semanas tiene que ser entre 1 y 10.</p>`;
                return;
            }
            if (!days || days < 1 || days > 7) {
                alertEl.innerHTML = `<p>La cantidad de días tiene que ser entre 1 y 7.</p>`;
                return;
            }

            renderBuilder(name, weeks, days);
        });
    }

    function renderBuilder(name, weeks, days) {
        const dayCards = Array.from({ length: days }, (_, i) => dayCardMarkup(i)).join('');

        container.innerHTML = `
            <div class="section-head reveal">
                <span class="eyebrow">${name}</span>
                <h2>Cargá los ejercicios de cada día</h2>
                <p>Se van a repetir en las ${weeks} semana${weeks > 1 ? 's' : ''} de la rutina.</p>
            </div>

            <div id="dayCards">${dayCards}</div>

            <div class="alert_message" id="builderAlert"></div>
            <div class="auth-trust">
                <button class="btn btn-primary" id="createRoutine" type="button">Crear rutina</button>
            </div>
        `;

        document.getElementById('dayCards').addEventListener('click', (event) => {
            if (event.target.classList.contains('day-add-btn')) {
                event.target.previousElementSibling.insertAdjacentHTML('beforeend', excBlockMarkup());
            }
            if (event.target.classList.contains('exc-remove')) {
                const block = event.target.closest('.exc-block');
                const list = block.parentElement;
                if (list.children.length > 1) block.remove();
            }
        });

        document.getElementById('createRoutine').addEventListener('click', () => submitRoutine(name, weeks, days));
    }

    function submitRoutine(name, weeks, days) {
        const alertEl = document.getElementById('builderAlert');
        const dayCardsEls = document.querySelectorAll('#dayCards .day-card');
        const days_array = [];
        let error = '';

        dayCardsEls.forEach((dayCard) => {
            const dayName = dayCard.querySelector('.day-name-select').value;
            const ejercicios = [];

            dayCard.querySelectorAll('.exc-block').forEach((block) => {
                const excId = block.querySelector('.excSelectInput').value;
                const serie = parseInt(block.querySelector('.serieInput').value);
                const repe = parseInt(block.querySelector('.repeInput').value);
                const noWeight = block.querySelector('.noWeightCheck').checked;
                const nota = block.querySelector('.notaInput').value.trim();

                if (!excId) { error = 'Elegí un ejercicio en cada fila.'; return; }
                if (!serie || serie < 1 || serie > 10) { error = 'Las series tienen que ser entre 1 y 10.'; return; }
                if (!repe || repe < 1 || repe > 30) { error = 'Las repeticiones tienen que ser entre 1 y 30.'; return; }
                if (nota.length > 140) { error = 'Las notas tienen un máximo de 140 caracteres.'; return; }

                const excDef = exc_api_array.find((exc) => String(exc.id) === String(excId));

                ejercicios.push({
                    nombre: excDef.name,
                    info: excDef.info,
                    id_exc: excDef.id,
                    serie,
                    repe,
                    nota,
                    peso_anterior: noWeight ? -1 : 0,
                    peso: noWeight ? -1 : 0,
                    fecha: ""
                });
            });

            if (!error && ejercicios.length === 0) error = 'Agregá al menos un ejercicio en cada día.';
            days_array.push({ nombre: dayName, ejercicios });
        });

        if (error) {
            alertEl.innerHTML = `<p>${error}</p>`;
            return;
        }

        // Cada semana necesita SU PROPIA copia de los dias: si todas comparten
        // el mismo objeto, cargar un peso en la semana 1 tambien lo cambia en
        // el resto de las semanas.
        const semanas = Array.from({ length: weeks }, (_, i) => ({
            numero: i + 1,
            dias: JSON.parse(JSON.stringify(days_array))
        }));

        currentUser.rutinas.push({ nombre: name, semanas });

        alertEl.innerHTML = '';
        const loaderBody = document.getElementById('loaderBody');
        loaderBody.innerHTML = `
            <div class="loader-container">
                <div class="modern-spinner"><div></div><div></div><div></div><div></div></div>
                <p>Creando rutina...</p>
            </div>
        `;
        subirRutina(parseInt(user_id) + 1, currentUser);
    }

    async function subirRutina(userId, user) {
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
                        <p>¡Rutina creada con éxito! Espere, será redirigido</p>
                    </div>
                `;
                setTimeout(() => { window.location.href = `profile.html`; }, 2500);
            } else {
                loaderBody.innerHTML = '';
                document.getElementById('builderAlert').innerHTML = `<p>ERROR! No se pudo crear la rutina.</p>`;
            }
        } catch (error) {
            loaderBody.innerHTML = '';
            const alertEl = document.getElementById('builderAlert');
            if (alertEl) alertEl.innerHTML = `<p>ERROR! Hubo un problema con la solicitud.</p>`;
        }
    }

    async function init() {
        try {
            const [usersRes, excRes] = await Promise.all([
                fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users'),
                fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices')
            ]);
            const users = await usersRes.json();
            exc_api_array = await excRes.json();
            exc_api_array.sort((a, b) => a.name.localeCompare(b.name));

            currentUser = users[user_id];
            renderSetupForm();
        } catch (error) {
            console.error('Error al cargar el formulario:', error);
        }
    }

    init();
} else {
    window.location.href = `login.html`;
}
