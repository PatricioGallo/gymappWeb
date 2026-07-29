const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params = new URLSearchParams(window.location.search);
    const container = document.getElementById('container');
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');

    function printExc(user){
        const rutina = user.rutinas[rutina_id];

        if (!rutina) {
            container.innerHTML = `
                <div class="auth-card reveal">
                    <span class="eyebrow">Eliminar rutina</span>
                    <h1>No se encontró esta rutina</h1>
                    <a href="profile.html" class="btn btn-outline btn-block">Volver al perfil</a>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="auth-card reveal">
                <span class="eyebrow">Eliminar rutina</span>
                <h1>¿Eliminar "${rutina.nombre}"?</h1>
                <p class="subtitle">Esta acción no se puede deshacer: vas a perder las semanas, días y pesos cargados en esta rutina.</p>
                <div class="alert_message" id="alert_message"></div>
                <div class="modal-actions">
                    <a href="profile.html" class="btn btn-outline">Cancelar</a>
                    <button class="btn btn-danger" id="confirmDelete" type="button">Eliminar rutina</button>
                </div>
            </div>
        `;

        document.getElementById('confirmDelete').addEventListener('click', () => {
            const rutinas = user.rutinas;
            rutinas.splice(rutina_id, 1);
            user.rutinas = rutinas;

            const actID = parseInt(user_id) + 1;
            const loaderBody = document.getElementById('loaderBody');
            loaderBody.innerHTML = `
                <div class="loader-container">
                    <div class="modern-spinner"></div>
                    <p>Eliminando rutina...</p>
                </div>
            `;
            actRutina(actID, user);
        });
    }

    async function fetchUsers() {
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            const users = await response.json();
            printExc(users[user_id]);
        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
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
                        <p>¡Rutina eliminada con éxito! Espere, será redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `profile.html`;
                }, 2500);
            } else {
                loaderBody.innerHTML = '';
                if (alert_message) alert_message.innerHTML = `<p>ERROR! No se pudo eliminar la rutina.</p>`;
            }
        } catch (error) {
            loaderBody.innerHTML = '';
            if (alert_message) alert_message.innerHTML = `<p>ERROR! Hubo un problema con la solicitud.</p>`;
        }
    }

    fetchUsers();
} else {
    window.location.href = `profile.html`;
}
