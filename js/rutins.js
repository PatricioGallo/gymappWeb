const params = new URLSearchParams(window.location.search);
const userCardsContainer = document.getElementById('user-cards');
// Acceder a un parámetro específico
const user_id = params.get('id');
let printTable = false;
let weeks = 0;
let rut_name = "";
let days = 0;

function addRutins(user){
    const body = document.createElement('div');
    body.classList.add("body");
    userCardsContainer.appendChild(body);
    let main_body;
    main_body = `
        <div class="form_body">
                    <div class="header_form">
                        <h1>${user.nombre} agrega una nueva rutina</h1>
                    </div>
        <div class="form">
                    <form id="myForm">
                        <label for="name">Nombre de la rutina</label>
                        <input type="text" id="name" name="name" required><br>

                        <label for="weeks">Cantidad de semanas</label>
                        <input type="number" id="weeks" name="weeks" min="1" max="10" required><br>

                        <label for="days">Cantidad de dias</label>
                        <input type="number" id="days" name="days" min="1" max="7" required><br>

                        <button type="submit">Crear tabla</button>
                    </form>
                </div>
            </div>
        `
        body.innerHTML = main_body;

        document.getElementById('myForm').addEventListener('submit', (event) =>{
            event.preventDefault();
            rut_name = document.getElementById('name').value;
            weeks = document.getElementById('weeks').value;
            days = document.getElementById('days').value;
            main_body = `
                <div class="header_form">
                    <h1>Agrega los ejercicios para ${rut_name}</h1></br></br>
                </div>
                <div class="table_body">
                    <form id="table_form">
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
                                <tr class="day-dark ">
                                    <td rowspan="1"><input type="text" id="serie-id" name="day" placeholder="Ingrese el dia"></td>
                                    <td><select id="frutas" name="frutas" required>
                                        <option value="a">a</option>
                                        <option value="manzana">Manzana</option>
                                        <option value="banana">Banana</option>
                                        <option value="naranja">Naranja</option>
                                        <option value="fresa">Fresa</option>
                                        <option value="pera">Pera</option>
                                    </select></td>
                                    <td><input type="number" id="serie-id" name="series" placeholder="3"></td>
                                    <td><input type="number" id="repe-id" name="repeticiones" placeholder="3"></td>
                                </tr>
                            </tbody>
                        </table>
                        <button type="submit">Guardar Cambios</button>
                    </form>
                </div>
            
            `;
            body.innerHTML = main_body;
            document.getElementById('table_form').addEventListener('submit', (event) =>{
                event.preventDefault();
                alert("Click")
            })
        });
}

// Función para obtener los usuarios desde la API
async function fetchUsers() {
    try {
        // Hacer la solicitud a la API
        const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
        const users = await response.json();

        addRutins(users[user_id]);
    } catch (error) {
        console.error('Error al obtener los usuarios:', error);
    }
}

// Llamar a la función para obtener los usuarios al cargar la página
fetchUsers();