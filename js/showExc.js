// GymApp — ver los ejercicios de una rutina (pages/showExc.html)
// Pagina de solo lectura: funciona logueado (tu propia rutina) o sin login,
// via el link que arma el boton "Compartir rutina".

const gymapp_id = localStorage.getItem("gymapp_id");
const isLoggedIn = gymapp_id != null;

const params = new URLSearchParams(window.location.search);
const user_id = params.get('id');
const rutina_id = params.get('rutina');

let users = [];
let exc_api_array = [];

function renderNav() {
    const nav = document.getElementById('siteNav');
    if (!nav) return;

    nav.innerHTML = isLoggedIn
        ? `<a href="profile.html">Perfil</a><a href="exit.html">Salir</a>`
        : `<a href="../index.html">Inicio</a><a href="register.html" class="btn btn-primary nav-cta">Registrate gratis</a>`;
}

function authorLabel(idExc) {
    const excDef = exc_api_array.find((exc) => exc.id == idExc);
    if (!excDef || excDef.author === undefined || excDef.author === 'gymapp') return 'GymApp';
    const author = users[excDef.author - 1];
    return author ? `${author.nombre} ${author.apellido}` : 'GymApp';
}

function initShare(routineName, ownerName) {
    const shareBtn = document.getElementById('shareBtn');
    if (!shareBtn) return;
    const originalHTML = shareBtn.innerHTML;

    shareBtn.addEventListener('click', async () => {
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: `Rutina de ${ownerName} - GymApp`, text: `Mirá la rutina "${routineName}" en GymApp`, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            shareBtn.textContent = '¡Copiado!';
            setTimeout(() => { shareBtn.innerHTML = originalHTML; }, 2000);
        } catch (err) {
            console.error('No se pudo compartir la rutina:', err);
        }
    });
}

function showNotFound(message) {
    document.getElementById('routineTitle').textContent = message;
    const actions = document.getElementById('routineActions');
    const weekPicker = document.getElementById('weekPicker');
    if (actions) actions.remove();
    if (weekPicker) weekPicker.remove();
}

function renderWeekOptions(rutina) {
    const select = document.getElementById('weekSelect');
    const lastIndex = rutina.semanas.length - 1;

    select.innerHTML = rutina.semanas.map((semana, index) => `<option value="${index}">Semana ${semana.numero}</option>`).join('');
    select.value = lastIndex;
    select.addEventListener('change', () => renderWeek(rutina, Number(select.value)));

    renderWeek(rutina, lastIndex);
}

function renderWeek(rutina, weekIndex) {
    const semana = rutina.semanas[weekIndex];
    const weekContent = document.getElementById('weekContent');

    weekContent.innerHTML = semana.dias.map((dia, diaIndex) => `
        <div class="day-card reveal">
            <h3>${dia.nombre}</h3>
            ${dia.ejercicios.map((exc, excIndex) => `
                <div class="exc-row">
                    <button class="exc-name" type="button" data-dia="${diaIndex}" data-exc="${excIndex}">
                        ${exc.nombre}
                        ${exc.nota ? '<span class="exc-note-dot" title="Tiene nota del entrenador"></span>' : ''}
                    </button>
                    <span class="exc-meta">
                        ${exc.serie}x${exc.repe} · <strong>${exc.peso > 0 ? exc.peso + ' kg' : 'Sin peso'}</strong>${exc.fecha ? ' · ' + exc.fecha : ''}
                    </span>
                </div>
            `).join('')}
        </div>
    `).join('');

    weekContent.querySelectorAll('.exc-name').forEach((button) => {
        button.addEventListener('click', () => {
            const dia = semana.dias[Number(button.dataset.dia)];
            const exc = dia.ejercicios[Number(button.dataset.exc)];
            openExerciseModal(exc);
        });
    });
}

function openExerciseModal(exc) {
    const loaderBody = document.getElementById('loaderBody');

    loaderBody.innerHTML = `
        <div class="success-check-container">
            <div class="modal-card">
                <h2>${exc.nombre}</h2>
                <p class="subtitle">${exc.info || 'Sin descripción cargada.'}</p>
                ${exc.nota ? `
                <div class="notice">
                    <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>
                    <div><strong>Nota del entrenador</strong><p>${exc.nota}</p></div>
                </div>` : ''}
                <p class="auth-foot" style="text-align:left;margin-top:16px;">Ejercicio de ${authorLabel(exc.id_exc)}</p>
                <div class="modal-actions"><button class="btn btn-outline" id="closeExcModal">Cerrar</button></div>
            </div>
        </div>
    `;

    document.getElementById('closeExcModal').addEventListener('click', () => {
        loaderBody.innerHTML = '';
    });
}

async function init() {
    renderNav();

    try {
        const [usersRes, excRes] = await Promise.all([
            fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users'),
            fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices')
        ]);
        users = await usersRes.json();
        exc_api_array = await excRes.json();

        const user = users[user_id];
        const rutina = user ? user.rutinas[rutina_id] : null;

        if (!user || !rutina) {
            showNotFound('No se encontró esta rutina.');
            return;
        }

        document.getElementById('routineTitle').textContent = rutina.nombre;
        document.getElementById('routineSubtitle').textContent = `Rutina de ${user.nombre} ${user.apellido}`;

        initShare(rutina.nombre, `${user.nombre} ${user.apellido}`);
        renderWeekOptions(rutina);
    } catch (error) {
        console.error('Error al cargar la rutina:', error);
        showNotFound('Ocurrió un error al cargar la rutina.');
    }
}

init();
