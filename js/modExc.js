// GymApp — modificar una rutina: ejercicios, series, repes (pages/excView.html)

const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');

    let exc_api_array = [];
    let currentUser = null;
    let currentRutina = null;

    function excOptions(selectedId) {
        return exc_api_array.map((exc) => `<option value="${exc.id}" ${String(exc.id) === String(selectedId) ? 'selected' : ''}>${exc.name}</option>`).join('');
    }

    function excBlockMarkup(exc) {
        const isNoWeight = exc ? exc.peso_anterior === -1 : false;
        return `
            <div class="exc-block" data-peso="${exc ? exc.peso : 0}" data-fecha="${exc ? (exc.fecha || '') : ''}">
                <div class="exc-edit-row">
                    <select class="excSelectInput">
                        <option value="">Elegir ejercicio</option>
                        ${excOptions(exc ? exc.id_exc : undefined)}
                    </select>
                    <input type="number" class="mini-input serieInput" value="${exc ? exc.serie : ''}" placeholder="Series" min="1" max="10">
                    <input type="number" class="mini-input repeInput" value="${exc ? exc.repe : ''}" placeholder="Repes" min="1" max="30">
                    <button class="exc-remove" type="button" title="Quitar ejercicio">×</button>
                </div>
                <div class="exc-extra">
                    <label><input type="checkbox" class="noWeightCheck" ${isNoWeight ? 'checked' : ''}> Sin peso</label>
                    <input type="text" class="notaInput" placeholder="Nota para este ejercicio (opcional)" maxlength="140" value="${exc && exc.nota ? exc.nota : ''}">
                </div>
            </div>
        `;
    }

    function renderWeek(weekIndex) {
        const semana = currentRutina.semanas[weekIndex];
        const weekContent = document.getElementById('weekContent');
        weekContent.dataset.week = weekIndex;

        weekContent.innerHTML = semana.dias.map((dia) => `
            <div class="day-card reveal">
                <h3>${dia.nombre}</h3>
                <div class="exc-edit-header"><span>Ejercicio</span><span>Series</span><span>Repes</span></div>
                <div class="exc-list">${dia.ejercicios.map((exc) => excBlockMarkup(exc)).join('')}</div>
                <button class="day-add-btn" type="button">+ Agregar ejercicio</button>
            </div>
        `).join('');
    }

    function saveChanges() {
        const alert_message = document.getElementById('alert_message');
        const weekIndex = Number(document.getElementById('weekContent').dataset.week);
        const semana = currentRutina.semanas[weekIndex];
        const dayCards = document.querySelectorAll('#weekContent .day-card');
        let error = '';

        const newDias = Array.from(dayCards).map((dayCard, diaIndex) => {
            const ejercicios = [];

            dayCard.querySelectorAll('.exc-block').forEach((block) => {
                if (error) return;
                const excId = block.querySelector('.excSelectInput').value;
                const serie = parseInt(block.querySelector('.serieInput').value);
                const repe = parseInt(block.querySelector('.repeInput').value);
                const noWeight = block.querySelector('.noWeightCheck').checked;
                const nota = block.querySelector('.notaInput').value.trim();

                if (!excId) { error = 'Elegí un ejercicio en cada fila.'; return; }
                if (!serie || serie < 1 || serie > 10) { error = 'Las series tienen que ser entre 1 y 10.'; return; }
                if (!repe || repe < 1 || repe > 30) { error = 'Las repeticiones tienen que ser entre 1 y 30.'; return; }
                if (nota.length > 140) { error = 'Las notas tienen un máximo de 140 caracteres.'; return; }

                const excDef = exc_api_array.find((e) => String(e.id) === String(excId));
                const prevPeso = noWeight ? -1 : Number(block.dataset.peso || 0);
                const prevFecha = noWeight ? '' : (block.dataset.fecha || '');

                ejercicios.push({
                    nombre: excDef.name,
                    info: excDef.info,
                    id_exc: excDef.id,
                    serie,
                    repe,
                    nota,
                    peso_anterior: noWeight ? -1 : 0,
                    peso: prevPeso,
                    fecha: prevFecha
                });
            });

            if (!error && ejercicios.length === 0) error = 'Agregá al menos un ejercicio en cada día.';
            return { nombre: semana.dias[diaIndex].nombre, ejercicios };
        });

        if (error) {
            alert_message.innerHTML = `<p>${error}</p>`;
            return;
        }

        semana.dias = newDias;

        alert_message.innerHTML = '';
        const loaderBody = document.getElementById('loaderBody');
        loaderBody.innerHTML = `
            <div class="loader-container">
                <div class="modern-spinner"></div>
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
            document.getElementById('routineSubtitle').textContent = 'Elegí la semana, agregá o quitá ejercicios y editá series, repeticiones o notas de cada día.';

            const weekSelect = document.getElementById('weekSelect');
            weekSelect.innerHTML = currentRutina.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join('');
            weekSelect.addEventListener('change', () => renderWeek(Number(weekSelect.value)));
            renderWeek(0);

            // Delegado una sola vez: weekContent se re-arma en cada renderWeek,
            // pero el elemento en si nunca cambia.
            document.getElementById('weekContent').addEventListener('click', (event) => {
                if (event.target.classList.contains('day-add-btn')) {
                    event.target.previousElementSibling.insertAdjacentHTML('beforeend', excBlockMarkup());
                }
                if (event.target.classList.contains('exc-remove')) {
                    const block = event.target.closest('.exc-block');
                    const list = block.parentElement;
                    if (list.children.length > 1) block.remove();
                }
            });

            document.getElementById('saveChanges').addEventListener('click', saveChanges);
        } catch (error) {
            console.error('Error al cargar la rutina:', error);
        }
    }

    init();
} else {
    window.location.href = `login.html`;
}
