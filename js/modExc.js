

const params = new URLSearchParams(window.location.search);
const userCardsContainer = document.getElementById('user-cards');

// Acceder a un parámetro específico
const user_id = params.get('id');
const rutina_id = params.get('rutina');

function printExc(user){
    const configBody = document.createElement('div');
    configBody.classList.add("configBody");
    let main_body = `
        <div class="configFace">
            <div class="configHeader">
                <h1>Modificar Ejercicios de ${user.rutinas[rutina_id].nombre}</h1>
            </div>
            <div class="configForm">
                <form id="myForm">
                    <table class="training-table">
                        <thead>
                            <tr>
                                <th>Día</th>
                                <th>Ejercicio</th>
                                <th>Series</th>
                                <th>Repes</th>
                            </tr>
                        </thead>
                        <tbody>

        `
        // Generar las filas de la tabla con los ejercicios
        user.rutinas[rutina_id].semanas[0].dias.forEach((dia, diaIndex) => {
            let exc_count = 0;
            // Alternamos las clases de color según el índice de los días
            let dayClass = diaIndex % 2 === 0 ? 'day-dark' : 'day-light';

            dia.ejercicios.forEach((ejercicio) => {
                if (exc_count == 0) {
                    main_body += `
                    <tr class="${dayClass}">
                        <td rowspan="${arraysCount(dia.ejercicios)}">${dia.nombre}</td>
                        <td><select id="frutas" name="frutas" required>
                            <option value="${ejercicio.nombre}">${ejercicio.nombre}</option>
                            <option value="manzana">Manzana</option>
                            <option value="banana">Banana</option>
                            <option value="naranja">Naranja</option>
                            <option value="fresa">Fresa</option>
                            <option value="pera">Pera</option>
                        </select></td>
                        <td><input type="number" id="serie-id" name="series" placeholder="${ejercicio.serie}"></td>
                        <td><input type="number" id="repe-id" name="repeticiones" placeholder="${ejercicio.repe}"></td>
                    </tr>`;
                    exc_count++;
                } else {
                    main_body += `
                    <tr class="${dayClass}">
                        <td><select id="frutas" name="frutas" required>
                            <option value="${ejercicio.nombre}">${ejercicio.nombre}</option>
                            <option value="manzana">Manzana</option>
                            <option value="banana">Banana</option>
                            <option value="naranja">Naranja</option>
                            <option value="fresa">Fresa</option>
                            <option value="pera">Pera</option>
                        </select></td>
                        <td><input type="number" id="serie-id" name="series" placeholder="${ejercicio.serie}"></td>
                        <td><input type="number" id="repe-id" name="repeticiones" placeholder="${ejercicio.repe}"></td>
                    </tr>
                `;
                }
            });
        });

        // Cerrar la tabla
        main_body += `
                    </tbody>
                </table>
                    <button type="submit">Guardar</button>
                </form>
            </div>
        </div>
        `;

    configBody.innerHTML = main_body;
    userCardsContainer.appendChild(configBody);

    function arraysCount(arrays){
        let count = 0;
        arrays.forEach( () => {
            count++;
        })
        return count
    }

    document.getElementById('myForm').addEventListener('submit', (event) =>{
        event.preventDefault();
        alert(`Usuario actualizado con esito!`);
    });
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

// Llamar a la función para obtener los usuarios al cargar la página
fetchUsers();