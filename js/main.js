const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    let exc_api_array;
    let users;

    // ?id= en la URL: permite ver el perfil de otro usuario. Si no viene,
    // se ve el perfil propio (comportamiento de siempre).
    const urlParams = new URLSearchParams(window.location.search);
    const viewId = urlParams.get('id') !== null ? urlParams.get('id') : gymapp_id;
    const isOwner = String(viewId) === String(gymapp_id);

    // ---------- Helpers de datos (rutinas / historial) ----------

    function arraysCount(arrays){
        let count = 0;
        arrays.forEach( () => {
            count++;
        })
        return count
    }

    function last_training(historial){
        if(historial.length != 0){
            let last_train = historial.at(-1)
            return last_train.fecha
        } else{
            return "Sin entrenos previos"
        }
    }

    function last_exc(historial){
        let ret;
        if(historial.length != 0){
            let last_train = historial.at(-1)
            exc_api_array.forEach((exc)=>{
                if(exc.id == last_train.id_exc){
                    ret = exc.name;
                }
            })
        } else{
            ret = "Sin entrenos previos";
        }
        return ret
    }

    function mostFrequentExcId(historial) {
        const frequency = {}; // Objeto para contar las frecuencias

        historial.forEach(item => {
            const id = item.id_exc;
            if (id !== undefined) {
                frequency[id] = (frequency[id] || 0) + 1;
            }
        });

        let maxCount = 0;
        let mostFrequentId = null;

        for (const id in frequency) {
            if (frequency[id] > maxCount) {
                maxCount = frequency[id];
                mostFrequentId = id;
            }
        }

        return mostFrequentId;
    }

    function findMostFrequentId(historial) {
        const id = mostFrequentExcId(historial);
        if (id === null || !exc_api_array[id - 1]) return "—";
        return exc_api_array[id-1].name
    }

    function progressForExercise(historial, excId) {
        return historial
            .filter((entry) => String(entry.id_exc) === String(excId))
            .map((entry) => ({ fecha: entry.fecha, peso: entry.peso, date: parseFechaDMY(entry.fecha) }))
            .filter((entry) => entry.date)
            .sort((a, b) => a.date - b.date);
    }

    function userTypeLabel(userType) {
        switch (Number(userType)) {
            case 0: return "Admin";
            case 1: return "Gimnasio";
            case 2: return "Entrenador";
            case 3: return "Usuario";
            default: return "Usuario";
        }
    }

    function excCount(dias){
        let count = 0;
        let id_array = [];
        dias.forEach( (dia) =>{
            dia.ejercicios.forEach( (ejercicio) =>{
                let same_id = 0;
                id_array.forEach( (item) =>{
                    if(item == ejercicio.id_array){
                        same_id = 1;
                    }
                })
                if(same_id == 0){
                    count++;
                    id_array.push(ejercicio.id_exc);
                }
            })
        })
        return count
    }

    function porcentaje(rutina){
        let exc_count = 0;
        let count = 0;
        rutina.semanas.forEach( (semana) =>{
            semana.dias.forEach((dia)=>{
                dia.ejercicios.forEach(exc => {
                    if(exc.peso > 0 ){
                        count++;
                    }
                    exc_count++;
                });
            })
        })
        return(parseInt((count/exc_count)*100))
    }

    function last_week(rutina) {
        let week_num = 0;
        const semanas = [...rutina.semanas].reverse();

        semanas.forEach((semana) => {
            const dias = [...semana.dias].reverse();
            dias.forEach((dia) => {
                const ejercicios = [...dia.ejercicios].reverse();
                ejercicios.forEach((exc) => {
                    if (week_num === 0 && exc.peso > 0) {
                        week_num = semana.numero;
                    }
                });
            });
        });

        return week_num === 0 ? "sin entreno previo" : week_num;
    }

    function last_day(rutina) {
        let day_name = "";
        const semanas = [...rutina.semanas].reverse();

        semanas.forEach((semana) => {
            const dias = [...semana.dias].reverse();
            dias.forEach((dia) => {
                const ejercicios = [...dia.ejercicios].reverse();
                ejercicios.forEach((exc) => {
                    if (day_name === "" && exc.peso > 0) {
                        day_name = dia.nombre;
                    }
                });
            });
        });

        return day_name === "" ? "sin entreno previo" : day_name;
    }

    // ---------- Helpers de estadisticas (frecuencia semanal) ----------

    function parseFechaDMY(fecha) {
        if (!fecha) return null;
        const partes = fecha.split("-");
        if (partes.length !== 3) return null;
        const [dd, mm, yyyy] = partes.map(Number);
        if (!dd || !mm || !yyyy) return null;
        return new Date(yyyy, mm - 1, dd);
    }

    function computeWeeklyFrequency(historial, weeksBack = 8) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const buckets = [];
        for (let i = weeksBack - 1; i >= 0; i--) {
            const start = new Date(today);
            start.setDate(today.getDate() - today.getDay() - (i * 7));
            buckets.push({ start, count: 0 });
        }

        historial.forEach((entry) => {
            const fecha = parseFechaDMY(entry.fecha);
            if (!fecha) return;
            buckets.forEach((bucket) => {
                const end = new Date(bucket.start);
                end.setDate(bucket.start.getDate() + 7);
                if (fecha >= bucket.start && fecha < end) bucket.count++;
            });
        });

        return buckets.map((bucket) => ({
            label: `${bucket.start.getDate()}/${bucket.start.getMonth() + 1}`,
            count: bucket.count
        }));
    }

    // ---------- Avatar (front-end only, persistido en localStorage) ----------

    function initAvatar(userId) {
        const avatarImg = document.getElementById('avatarImg');
        if (!avatarImg) return;

        const storageKey = `gymapp_avatar_${userId}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) avatarImg.src = saved;

        // El input de archivo solo existe si sos el dueño del perfil
        // (createUserCard lo remueve del DOM para visitantes).
        const avatarInput = document.getElementById('avatarInput');
        if (!avatarInput) return;

        avatarInput.addEventListener('change', () => {
            const file = avatarInput.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                alert('La imagen es muy pesada. Elegí una de menos de 2MB.');
                avatarInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                avatarImg.src = reader.result;
                try {
                    localStorage.setItem(storageKey, reader.result);
                } catch (err) {
                    console.error('No se pudo guardar la foto localmente:', err);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // ---------- Compartir perfil (front-end only) ----------

    function initShare() {
        const shareBtn = document.getElementById('shareBtn');
        if (!shareBtn) return;
        const originalHTML = shareBtn.innerHTML;

        shareBtn.addEventListener('click', async () => {
            const url = window.location.href;
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'Mi perfil de GymApp', url });
                    return;
                }
                await navigator.clipboard.writeText(url);
                shareBtn.textContent = '¡Copiado!';
                setTimeout(() => { shareBtn.innerHTML = originalHTML; }, 2000);
            } catch (err) {
                console.error('No se pudo compartir el perfil:', err);
            }
        });
    }

    // ---------- Mini resumen (tipo de perfil, edad, amigos) ----------

    function renderProfileBadges(user) {
        const badges = document.getElementById('profileBadges');
        if (!badges) return;

        // "amigos" todavia no existe como funcionalidad real (no hay forma de
        // agregar ni guardar amigos en la API), asi que por ahora siempre es 0.
        const friendCount = Array.isArray(user.amigos) ? user.amigos.length : 0;

        badges.innerHTML = `
            <span class="profile-badge">${userTypeLabel(user.user_type)}</span>
            <span class="profile-badge">${user.edad ? `${user.edad} años` : 'Edad sin datos'}</span>
            <span class="profile-badge">${friendCount} amigos</span>
        `;
    }

    // ---------- Acciones del perfil (compartir / agregar amigo) ----------

    function renderProfileActions(ownerView) {
        const actions = document.getElementById('profileActions');
        if (!actions) return;

        actions.innerHTML = `
            <button class="btn btn-outline" id="shareBtn" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5"/></svg>
                Compartir perfil
            </button>
            ${ownerView ? '' : `
            <button class="btn btn-primary" id="addFriendBtn" type="button">+ Agregar amigo</button>
            `}
        `;

        initShare();

        if (!ownerView) {
            const addFriendBtn = document.getElementById('addFriendBtn');
            if (addFriendBtn) {
                addFriendBtn.addEventListener('click', () => {
                    addFriendBtn.textContent = 'Función en camino';
                    setTimeout(() => { addFriendBtn.textContent = '+ Agregar amigo'; }, 2000);
                });
            }
        }
    }

    // ---------- Accesos rapidos ----------

    function renderQuickActions(userId, ownerView) {
        const quickActions = document.getElementById('quickActions');
        if (!quickActions) return;

        const rutinasLabel = ownerView
            ? '<h3>Tus rutinas</h3><p>Ver y gestionar tus rutinas activas</p>'
            : '<h3>Rutinas</h3><p>Ver las rutinas activas de este perfil</p>';

        quickActions.innerHTML = `
            <a class="quick-card reveal" href="#rutinas">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div>
                <div>${rutinasLabel}</div>
            </a>
            <a class="quick-card reveal" href="progress.html?id=${userId}">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
                <div><h3>Progreso completo</h3><p>Gráficos detallados por ejercicio</p></div>
            </a>
            ${ownerView ? `
            <a class="quick-card reveal" href="rutinsView.html?id=${userId}">
                <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></div>
                <div><h3>Nueva rutina</h3><p>Armá una rutina desde cero</p></div>
            </a>` : ''}
        `;
    }

    // ---------- Estadisticas ----------

    function renderStats(user) {
        const statsContent = document.getElementById('statsContent');
        if (!statsContent) return;
        const historial = user.historial || [];

        if (historial.length === 0) {
            statsContent.innerHTML = `
                <div class="empty-state reveal">
                    <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg></div>
                    <h3>Todavía no tenés estadísticas</h3>
                    <p>Por ahora no tenés ningún entrenamiento registrado. Cuando cargues el peso de tus ejercicios, tu progreso va a aparecer acá.</p>
                    <a href="#rutinas" class="btn btn-primary btn-sm">Ir a mis rutinas</a>
                </div>
            `;
            return;
        }

        const topExcId = mostFrequentExcId(historial);
        const topExcName = findMostFrequentId(historial);
        const excProgress = topExcId !== null ? progressForExercise(historial, topExcId) : [];

        statsContent.innerHTML = `
            <div class="card-grid">
                <div class="stat-card reveal">
                    <div class="label">Último entrenamiento</div>
                    <div class="value">${last_training(historial)}</div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Ejercicio más entrenado</div>
                    <div class="value">${topExcName}</div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Entrenamientos registrados</div>
                    <div class="value">${historial.length}</div>
                </div>
                <div class="stat-card reveal">
                    <div class="label">Rutinas activas</div>
                    <div class="value">${arraysCount(user.rutinas)}</div>
                </div>
            </div>
            <div class="chart-card reveal">
                <h3>Frecuencia de entrenamiento</h3>
                <p class="chart-sub">Entrenamientos registrados por semana, últimas 8 semanas.</p>
                <div class="chart-wrap"><canvas id="freqChart"></canvas></div>
            </div>
            ${excProgress.length >= 2 ? `
            <div class="chart-card reveal">
                <h3>Progreso: ${topExcName}</h3>
                <p class="chart-sub">Evolución del peso registrado en tu ejercicio más entrenado.</p>
                <div class="chart-wrap"><canvas id="progressChart"></canvas></div>
            </div>` : ''}
        `;

        renderFreqChart(computeWeeklyFrequency(historial));
        if (excProgress.length >= 2) renderProgressChart(excProgress);
    }

    function renderFreqChart(buckets) {
        const canvas = document.getElementById('freqChart');
        if (!canvas || typeof Chart === 'undefined') return;

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: buckets.map((b) => b.label),
                datasets: [{
                    label: 'Entrenamientos',
                    data: buckets.map((b) => b.count),
                    backgroundColor: '#ff8a3d',
                    borderRadius: 6,
                    maxBarThickness: 34
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0, color: '#9aa1ac' }, grid: { color: '#262b33' } },
                    x: { ticks: { color: '#9aa1ac' }, grid: { display: false } }
                }
            }
        });
    }

    function renderProgressChart(entries) {
        const canvas = document.getElementById('progressChart');
        if (!canvas || typeof Chart === 'undefined') return;

        new Chart(canvas, {
            type: 'line',
            data: {
                labels: entries.map((e) => e.fecha),
                datasets: [{
                    label: 'Peso (kg)',
                    data: entries.map((e) => e.peso),
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
                    y: { beginAtZero: false, ticks: { color: '#9aa1ac' }, grid: { color: '#262b33' } },
                    x: { ticks: { color: '#9aa1ac' }, grid: { display: false } }
                }
            }
        });
    }

    // ---------- Rutinas ----------

    function renderRoutines(user, userId, ownerView) {
        const routinesContent = document.getElementById('routinesContent');
        if (!routinesContent) return;

        if (!user.rutinas || user.rutinas.length === 0) {
            routinesContent.innerHTML = ownerView ? `
                <div class="empty-state reveal">
                    <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div>
                    <h3>Todavía no tenés rutinas</h3>
                    <p>Creá tu primera rutina para empezar a entrenar con GymApp.</p>
                    <a href="rutinsView.html?id=${userId}" class="btn btn-primary btn-sm">Crear nueva rutina</a>
                </div>
            ` : `
                <div class="empty-state reveal">
                    <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M8 8v8M16 8v8M4 10v4M20 10v4"/></svg></div>
                    <h3>Todavía no tiene rutinas</h3>
                    <p>Este usuario no cargó ninguna rutina por ahora.</p>
                </div>
            `;
            return;
        }

        routinesContent.innerHTML = user.rutinas.map((rutina, index) => {
            const pct = porcentaje(rutina);
            const week = last_week(rutina);
            const day = last_day(rutina);
            const lastProgress = (week === "sin entreno previo" || day === "sin entreno previo")
                ? "Sin entrenos registrados"
                : `Semana ${week} · ${day}`;

            // Un visitante externo solo puede ver la rutina, no modificarla ni borrarla.
            const actions = ownerView ? `
                    <button class="btn btn-outline btn-sm showExc" data-index="${index}">Mostrar ejercicios</button>
                    <button class="btn btn-outline btn-sm modExc" data-index="${index}">Modificar ejercicios</button>
                    <button class="btn btn-outline btn-sm addPeso" data-index="${index}">Pesos semanales</button>
                    <button class="btn btn-danger btn-sm button_red" data-index="${index}">Eliminar rutina</button>
            ` : `
                    <button class="btn btn-outline btn-sm showExc" data-index="${index}">Mostrar ejercicios</button>
            `;

            return `
            <div class="routine-card reveal">
                <h3>${rutina.nombre}</h3>
                <div class="routine-stats">
                    <div><span>Semanas</span><strong>${arraysCount(rutina.semanas)}</strong></div>
                    <div><span>Días por semana</span><strong>${arraysCount(rutina.semanas[0].dias)}</strong></div>
                    <div><span>Ejercicios</span><strong>${excCount(rutina.semanas[0].dias)}</strong></div>
                    <div><span>Último progreso</span><strong>${lastProgress}</strong></div>
                </div>
                <div class="routine-progress">
                    <div class="routine-progress-head"><span>Progreso de la rutina</span><strong>${pct}%</strong></div>
                    <div class="routine-progress-bar"><span style="width:${pct}%"></span></div>
                </div>
                <div class="routine-actions">${actions}</div>
            </div>
            `;
        }).join('');

        wireRoutineButtons(userId, ownerView);
    }

    function wireRoutineButtons(userId, ownerView) {
        document.querySelectorAll('.showExc').forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = `showExc.html?id=${userId}&rutina=${button.dataset.index}`;
            });
        });

        if (!ownerView) return; // el resto de los botones ni siquiera existen para un visitante

        document.querySelectorAll('.modExc').forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = `excView.html?id=${userId}&rutina=${button.dataset.index}`;
            });
        });
        document.querySelectorAll('.addPeso').forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = `pesos.html?id=${userId}&rutina=${button.dataset.index}`;
            });
        });
        document.querySelectorAll('.button_red').forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = `deleteRutins.html?id=${userId}&rutina=${button.dataset.index}`;
            });
        });
    }

    // ---------- Armado de la pagina ----------

    function createUserCard(user, index, ownerView) {
        const user_id = index;

        const profileName = document.getElementById('profileName');
        if (profileName) {
            profileName.textContent = ownerView ? `Hola, ${user.nombre}` : `${user.nombre} ${user.apellido}`;
        }

        const avatarEditWrap = document.getElementById('avatarEditWrap');
        const avatarHint = document.getElementById('avatarHint');
        if (!ownerView) {
            if (avatarEditWrap) avatarEditWrap.remove();
            if (avatarHint) avatarHint.remove();
        }

        const configLink = document.getElementById('config');
        if (!ownerView && configLink) configLink.remove();

        initAvatar(user_id);
        renderProfileBadges(user);
        renderProfileActions(ownerView);
        renderQuickActions(user_id, ownerView);
        renderStats(user);
        renderRoutines(user, user_id, ownerView);
    }

    function configMenu(user){
        const config = document.getElementById('config');
        if (!config) return;

        config.addEventListener('click', (e) => {
            e.preventDefault();
            const loaderBody = document.getElementById("loaderBody");
            loaderBody.innerHTML = `
            <div id="success-check" class="success-check-container">
                <div class="modal-card">
                    <h2>Configuración</h2>
                    <p class="subtitle">Dejá vacío lo que no quieras cambiar.</p>

                    <div class="field">
                        <label for="userName">Nombre</label>
                        <input type="text" placeholder="${user.nombre}" name="userName" id="userName">
                    </div>
                    <div class="field">
                        <label for="sname">Apellido</label>
                        <input type="text" placeholder="${user.apellido}" name="sname" id="sname">
                    </div>
                    <div class="field">
                        <label for="mail">Mail</label>
                        <input type="email" placeholder="${user.mail}" name="mail" id="mail">
                    </div>
                    <div class="field">
                        <label for="pswd">Contraseña</label>
                        <input type="password" placeholder="••••••••••••" name="pswd" id="pswd">
                    </div>

                    <div class="alert_message" id="alert_message"></div>

                    <div class="modal-actions">
                        <button class="btn btn-primary" id="saveChanges">Guardar</button>
                        <button class="btn btn-outline" id="closeConfig">Cerrar</button>
                    </div>
                </div>
            </div>
            `;

            document.getElementById('closeConfig').addEventListener('click', () => {
                loaderBody.innerHTML = '';
            });

            document.getElementById('saveChanges').addEventListener('click', (e) => {
                e.preventDefault();
                const userNameInput = document.getElementById('userName');
                const snameInput = document.getElementById('sname');
                const mailInput = document.getElementById('mail');
                const pswdInput = document.getElementById('pswd');
                const alert_message = document.getElementById('alert_message');

                let noEmpty = 0;
                let newUser = user;
                let configError = 0;

                if(userNameInput.value){
                    if(userNameInput.value.length > 2 && isNaN(userNameInput.value)){
                        newUser.nombre = userNameInput.value;
                    }else{
                        configError = 2;
                    }
                    noEmpty = 1;
                }
                if(snameInput.value){
                    if(snameInput.value.length > 2 && isNaN(snameInput.value)){
                        newUser.apellido = snameInput.value;
                    }else{
                        configError = 3;
                    }
                    noEmpty = 1;
                }
                if(mailInput.value){
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (emailRegex.test(mailInput.value)) {
                        let repeatedMail = isRepeated(mailInput.value)
                        if (repeatedMail == 0){
                            newUser.mail = mailInput.value;
                        }else{
                            configError = 6;
                        }
                    } else {
                        configError = 4;
                    }
                    noEmpty = 1;
                }
                if(pswdInput.value){
                    if(pswdInput.value.length > 6){
                        newUser.contrasena = pswdInput.value;
                    }else{
                        configError = 5;
                    }
                    noEmpty = 1;
                }

                if(noEmpty == 0){
                    configError = 1;
                }

                switch (configError) {
                    case 1:
                        alert_message.innerHTML = `<p>Ingresaste un valor incorrecto o ningun valor.</p>`
                        break;
                    case 2:
                        alert_message.innerHTML = `<p>Ingresaste un nombre incorrecto</p>`
                        break;
                    case 3:
                        alert_message.innerHTML = `<p>Ingresaste un apellido incorrecto.</p>`
                        break;
                    case 4:
                        alert_message.innerHTML = `<p>Ingresaste un email incorrecto.</p>`
                        break;
                    case 5:
                        alert_message.innerHTML = `<p>Ingresaste una contraseña no valida</p>`
                        break;
                    case 6:
                        alert_message.innerHTML = `<p>El email ya esta registrado.</p>`
                        break;
                    case 0:
                        alert_message.innerHTML = ``
                        updateUser(parseInt(gymapp_id)+1,newUser);
                        break;
                    default:
                        console.log("Error!");
                        break;
                }

                function isRepeated(mail){
                    let repeated = 0;
                    users.forEach(user =>{
                        if(user.mail == mail){
                            repeated = 1;
                        }
                    })
                    return repeated
                }
            })
        });
    }

    async function fetchExc() {
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices');
            const exc = await response.json();
            exc_api_array = exc;
            fetchUsers();

        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }

    async function updateUser(userId, updatedData) {
        const loaderBody = document.getElementById("loaderBody");
        try {
            const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedData)
            });

            if (response.ok) {
                const updatedUser = await response.json();
                loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>¡Cambios guardados con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `profile.html`;
                }, 3000);
                return updatedUser;
            } else {
                const alert_message = document.getElementById('alert_message');
                if (alert_message) alert_message.innerHTML = `<p>Error al guardar cambios</p>`;
                console.error('Error al actualizar el usuario:', response.status);
            }
        } catch (error) {
            console.error('Error en la solicitud de actualización:', error);
        }
    }

    async function fetchUsers() {
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            users = await response.json();

            const viewedUser = users[viewId];
            if (!viewedUser) {
                const profileName = document.getElementById('profileName');
                if (profileName) profileName.textContent = 'Este perfil no existe';
                return;
            }

            createUserCard(viewedUser, viewId, isOwner);
            if (isOwner) configMenu(viewedUser);

        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }

    fetchExc();
} else {
    window.location.href = `../index.html`;
}
