// GymApp — modificar los ejercicios de una rutina (pages/excView.html)

const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');

    let exc_api_array = [];
    let currentUser = null;
    let currentRutina = null;

    function renderWeek(weekIndex) {
        const semana = currentRutina.semanas[weekIndex];
        const weekContent = document.getElementById('weekContent');
        weekContent.dataset.week = weekIndex;

        weekContent.innerHTML = semana.dias.map((dia, diaIndex) => `
            <div class="day-card reveal">
                <h3>${dia.nombre}</h3>
                <div class="exc-edit-header"><span>Ejercicio</span><span>Series</span><span>Repes</span></div>
                ${dia.ejercicios.map((exc, excIndex) => `
                    <div class="exc-edit-row" data-dia="${diaIndex}" data-exc="${excIndex}">
                        <select class="excSelectInput">
                            ${exc_api_array.map((e) => `<option value="${e.id}" ${e.id == exc.id_exc ? 'selected' : ''}>${e.name}</option>`).join('')}
                        </select>
                        <input type="number" class="mini-input serieInput" value="${exc.serie}" placeholder="Series" min="1" max="10">
                        <input type="number" class="mini-input repeInput" value="${exc.repe}" placeholder="Repes" min="1" max="30">
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    function saveChanges() {
        const alert_message = document.getElementById('alert_message');
        const weekIndex = Number(document.getElementById('weekContent').dataset.week);
        const semana = currentRutina.semanas[weekIndex];
        let error = false;

        document.querySelectorAll('.exc-edit-row').forEach((row) => {
            const diaIndex = Number(row.dataset.dia);
            const excIndex = Number(row.dataset.exc);
            const excId = row.querySelector('.excSelectInput').value;
            const serie = parseInt(row.querySelector('.serieInput').value);
            const repe = parseInt(row.querySelector('.repeInput').value);

            if (!excId || isNaN(serie) || isNaN(repe) || serie < 1 || serie > 10 || repe < 1 || repe > 30) {
                error = true;
                return;
            }

            const excDef = exc_api_array.find((e) => String(e.id) === String(excId));
            const target = semana.dias[diaIndex].ejercicios[excIndex];
            target.id_exc = excDef.id;
            target.nombre = excDef.name;
            target.info = excDef.info;
            target.serie = serie;
            target.repe = repe;
        });

        if (error) {
            alert_message.innerHTML = `<p>Revisá los valores: series entre 1 y 10, repeticiones entre 1 y 30.</p>`;
            return;
        }

        alert_message.innerHTML = '';
        const loaderBody = document.getElementById('loaderBody');
        loaderBody.innerHTML = `
            <div class="loader-container">
                <div class="modern-spinner"><div></div><div></div><div></div><div></div></div>
                <p>Actualizando rutina...</p>
            </div>
        `;
        actRutina(parseInt(user_id) + 1, currentUser);
    }

    async function actRutina(userId, user) {
        const loaderBody = document.getElementById('loaderBody');
        const alert_message = document.getElementById('alert_message');
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
                        <p>¡Rutina actualizada con éxito! Espere, será redirigido</p>
                    </div>
                `;
                setTimeout(() => { window.location.href = `profile.html`; }, 2500);
            } else {
                loaderBody.innerHTML = '';
                if (alert_message) alert_message.innerHTML = `<p>ERROR! No se pudo actualizar la rutina.</p>`;
            }
        } catch (error) {
            loaderBody.innerHTML = '';
            if (alert_message) alert_message.innerHTML = `<p>ERROR! Hubo un problema con la solicitud.</p>`;
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
            currentRutina = currentUser ? currentUser.rutinas[rutina_id] : null;

            if (!currentUser || !currentRutina) {
                document.getElementById('routineTitle').textContent = 'No se encontró esta rutina.';
                document.getElementById('weekPicker').remove();
                document.getElementById('saveWrap').remove();
                return;
            }

            document.getElementById('routineTitle').textContent = currentRutina.nombre;
            document.getElementById('routineSubtitle').textContent = 'Elegí la semana y editá el ejercicio, las series o las repeticiones de cada día.';

            const weekSelect = document.getElementById('weekSelect');
            weekSelect.innerHTML = currentRutina.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join('');
            weekSelect.addEventListener('change', () => renderWeek(Number(weekSelect.value)));
            renderWeek(0);

            document.getElementById('saveChanges').addEventListener('click', saveChanges);
        } catch (error) {
            console.error('Error al cargar la rutina:', error);
        }
    }

    init();
} else {
    window.location.href = `login.html`;
}
