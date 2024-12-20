const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params = new URLSearchParams(window.location.search);
    const userCardsContainer = document.getElementById('user-cards');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');
    let weekId = 0
    let exc_api_array;

    function printExc(user){
        const configBody = document.createElement('div');
        configBody.classList.add("configBody");
        let main_body;
        main_body = `
            <div class="form_body">
                        <div class="header_form">
                            <h1>${user.nombre} puedes ver ejercicios: ${user.rutinas[rutina_id].nombre}</h1>
                        </div>
            <div class="form">
                        <form id="myForm">
                            <br><label for="name">Selecciona la semana de la rutina que deseas ver</label></br></br>
                            <select id="weeks" name="weeks" required autocomplete="off" autocorrect="off" autocapitalize="none">
            `
        user.rutinas[rutina_id].semanas.forEach((week,index) => {
            main_body += `
                <option value="${index}">Semana ${week.numero}</option>
            `
        })
        main_body +=`
                                
                            </select><br>
                            <button type="submit">Ver Ejercicios</button>
                        </form>
                    </div>
                </div>
            `
        configBody.innerHTML = main_body;
        userCardsContainer.appendChild(configBody);

        document.getElementById('myForm').addEventListener('submit', (event) =>{
            event.preventDefault();
            weekId = document.getElementById("weeks").value;
            main_body = `
                <div class="configFace">
                    <div class="configHeader">
                        <h1>Ver ejercicios de "${user.rutinas[rutina_id].nombre}"</h1>
                    </div>
                    <div class="configForm">
                            <table class="training-table">
                                <thead>
                                    <tr>
                                        <th>Día</th>
                                        <th>Ejercicio</th>
                                        <th>Series</th>
                                        <th>Repes</th>
                                        <th>Ultimo Peso</th>
                                        <th>Ultimo Entreno</th>
                                        <th>Info del ejercicio</th>
                                    </tr>
                                </thead>
                                <tbody>

                `
                // Generar las filas de la tabla con los ejercicios
                user.rutinas[rutina_id].semanas[weekId].dias.forEach((dia, diaIndex) => {
                    let exc_count = 0;
                    // Alternamos las clases de color según el índice de los días
                    let dayClass = diaIndex % 2 === 0 ? 'day-dark' : 'day-light';

                    dia.ejercicios.forEach((exc,excIndex) => {
                        if (exc_count == 0) {
                            main_body += `
                            <tr class="${dayClass}">
                                <td rowspan="${arraysCount(dia.ejercicios)}">${dia.nombre}</td>
                                <td>${exc.nombre}</td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                <td>${exc.peso}</td>
                                <td>${exc.fecha}</td>
                                <td>${exc.info}</td>
                            </tr>`;
                            exc_count++;
                        } else {
                            main_body += `
                            <tr class="${dayClass}">
                                <td>${exc.nombre}</td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                <td>${exc.peso}</td>
                                <td>${exc.fecha}</td>
                                <td>${exc.info}</td>
                            </tr>
                        `;
                        }
                    });
                });

                // Cerrar la tabla
                main_body += `
                            </tbody>
                        </table>
                    </div>
                </div>
                `;

            configBody.innerHTML = main_body;

            function arraysCount(arrays){
                let count = 0;
                arrays.forEach( () => {
                    count++;
                })
                return count
            }

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
                alert("Rutina actualizada con éxito.");
                window.location.href = `index.html`;
            } else {
                console.error('Error al subir la rutina:', response.statusText);
                alert("Error al actulizar la rutina.");
            }
        } catch (error) {
            console.error('Hubo un problema con la solicitud:', error);
            alert("Error en la conexión.");
        }
    }

    // Llamar a la función para obtener los usuarios al cargar la página
    fetchUsers();
    fetchExc();
} else {
    window.location.href = `login.html`;
}