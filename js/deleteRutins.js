const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params = new URLSearchParams(window.location.search);
    const userCardsContainer = document.getElementById('user-cards');
    const container          = document.getElementById('container');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');
    let exc_api_array;

    function printExc(user){
        container.innerHTML = `
            <h1 class="services_taital">Eliminar rutina</h1>
            <p class="services_text" id="services_text">${user.nombre}, ¿Estas seguro que quieres eliminar: "${user.rutinas[rutina_id].nombre}" ?</p>
            <p class="services_text" id="services_text">Si es asi, haz click en el boton "Eliminar"</p>
            <br/>
            <div id=loaderBody></div>
            <div class="trainer_section_2" id="trainer_section_2">
            </div>
        `
        const userCardsContainer = document.getElementById('trainer_section_2');
        const configBody = document.createElement('div');
        configBody.classList.add("configBody");
        let main_body;
        main_body = `
            <div class="email_box">
                        <form id="myForm">
                            <div class="alert_message" id="alert_message"></div>
                            <div class="send_bt">
                                <button type="submit" id="but" value="1" class="login-botton">Eliminar</button>
                            </div>
                        </form>
                    
                </div>
            `
        configBody.innerHTML = main_body;
        userCardsContainer.appendChild(configBody);

        document.getElementById('myForm').addEventListener('submit', (event) =>{
            event.preventDefault();
            let rutins = user.rutinas;
            rutins.splice(rutina_id, 1);
            user.rutinas = rutins;
            let actID = (parseInt(user_id) + 1)
            let loaderBody = document.getElementById("loaderBody");
            loaderBody.innerHTML = `
            <div id="loading" class="loader-container">
                <div class="modern-spinner">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <p>Eliminando rutina...</p>
            </div>
            `
            actRutina(actID,user);
        });//End submit
    }

    // Función para obtener los usuarios desde la API
    async function fetchUsers() {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            const users = await response.json();

            printExc(users[user_id]);
        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }

    async function fetchExc() {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices');
            const exc = await response.json();
            exc_api_array = exc;
            exc_api_array.sort((a, b) => a.name.localeCompare(b.name));

        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }


    async function actRutina(userId, user) {
        try {
            const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
                method: 'PUT',  
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(user)  
            });

            if (response.ok) {
                const datos = await response.json();
                loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>¡Rutina eliminada con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `index.html`;
                }, 3000); 
            } else {
                let loaderBody = document.getElementById("loaderBody");
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>ERROR! No se pudo subir la rutina.</p>`
            }
        } catch (error) {
            let loaderBody = document.getElementById("loaderBody");
            loaderBody.innerHTML = ``;
            alert_message.innerHTML = `<p>ERROR! No se pudo subir la rutina.</p>`
        }
    }

    // Llamar a la función para obtener los usuarios al cargar la página
    fetchUsers();
    fetchExc();
} else {
    window.location.href = `profile.html`;
}