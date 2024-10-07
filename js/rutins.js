const params = new URLSearchParams(window.location.search);
const userCardsContainer = document.getElementById('user-cards');
// Acceder a un parámetro específico
const user_id = params.get('id');
let printTable = false;
let weeks = 0;
let rut_name = "";
let days = 0;
let excArray = [1,1,1,1,1,1,1];
let max_num_exc = 20;
let weeks_array = []
let days_array = []

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
                `
                for (let i = 0; i < days; i++) {
                    let dayClass = i % 2 === 0 ? 'day-dark' : 'day-light';
                    main_body += `
                        <tr class="${dayClass}">
                            <td rowspan="${max_num_exc}"><select id="day-${i}" name="day-${i}" placeholder="Ingrese dia" required>
                                <option value="Lunes">Lunes</option>
                                <option value="Martes">Martes</option>
                                <option value="Miercoles">Miercoles</option>
                                <option value="Jueves">Jueves</option>
                                <option value="Viernes">Viernes</option>
                                <option value="Sabado">Sabado</option>
                                <option value="Domingo">Domingo</option>
                            </select></td>
                            <td><select id="exc-0-${i}" name="exc-0-${i}" required>
                                <option value="pecho plano">Pecho Plano</option>
                                <option value="pecho inclinado">Pecho Inclinado</option>
                            </select></td>
                            <td><input type="number" id="serie-0-${i}" name="serie-0-${i}" placeholder="series" required></td>
                            <td><input type="number" id="repe-0-${i}" name="repe-0-${i}" placeholder="repeticiones" required></td>
                        </tr>`
                        for (let j = 0; j < max_num_exc; j++) {
                            main_body +=`<tr id="row-${j+1}-${i}" class="${dayClass}"></tr>`
                        }
                    main_body +=`    
                        <tr class="${dayClass}">
                            <td colspan="4">
                                <button class="addButton" id="addRow" title="Agregar una nueva fila">+<button>
                            </td>
                        </tr>`
                }
            
                main_body += `
                            </tbody>
                        </table>
                        <button type="submit">Guardar Cambios</button>
                    </form>
                </div>`

            body.innerHTML = main_body;
            document.getElementById('table_form').addEventListener('submit', (event) =>{
                event.preventDefault();
                for (let d = 0; d < days; d++) { 
                    let day_obj = {
                        nombre: "",
                        ejercicios: []
                    }
                    let exc_array =[]
                    for (let e= 0; e < excArray[d]; e++) {
                        let exc_obj = {
                            nombre: "",
                            peso_anterior: 0,
                            peso: 0,
                            serie: 0,
                            fecha: "",
                            repe: 0,
                            info: "",
                            id_exc: 4
                        }
                        console.log("exc-"+e+"-"+d)
                        exc_obj.nombre  = document.getElementById("exc-"+e+"-"+d).value;
                        exc_obj.serie   = document.getElementById("serie-"+e+"-"+d).value;
                        exc_obj.repe    = document.getElementById("repe-"+e+"-"+d).value;
                        exc_array.push(exc_obj);
                    }
                    day_obj.ejercicios = exc_array;
                    day_obj.nombre = document.getElementById("day-"+d).value;
                    days_array.push(day_obj)
                }

                for (let w = 0; w < weeks; w++) {
                    let week_obj ={
                        numero: 0,
                        dias: []
                    }
                    week_obj.numero = w+1;
                    week_obj.dias = days_array;
                    weeks_array.push(week_obj);
                }

                let rutina_obj = {
                    nombre: "",
                    semanas: [],
                }

                rutina_obj.nombre = rut_name;
                rutina_obj.semanas = weeks_array;
                user.rutinas.push(rutina_obj)
                let actID = (parseInt(user_id) + 1)
                subirRutina(actID,user)
            })
            
            // Agregar el evento de agregar fila
            document.querySelectorAll('.addButton').forEach((button, index) => {
                button.addEventListener('click', function() {
                    let rowName = ("row-"+ (excArray[index])+"-"+index)
                    console.log(rowName)
                    const actualRow = document.getElementById(rowName);
                    const newRow = `
                        <td><select id="exc-${excArray[index]}-${index}" name="exc-${excArray[index]}-${index}" required>
                            <option value="pecho plano">Pecho Plano</option>
                            <option value="pecho inclinado">Pecho Inclinado</option>
                        </select></td>
                        <td><input type="number" id="serie-${excArray[index]}-${index}" name="serie-${excArray[index]}-${index}" placeholder="Series"></td>
                        <td><input type="number" id="repe-${excArray[index]}-${index}" name="repe-${excArray[index]}-${index}" placeholder="Repeticiones"></td>
                        `;
                    excArray[index] += 1;
                    console.log(excArray[index]);
                    actualRow.insertAdjacentHTML('beforeend', newRow);  // Agregar la nueva fila al final de la tabla
                });
            });

        });//GET ELEMENT
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

async function subirRutina(userId, user) {
    try {
        const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
            method: 'PUT',  // Utiliza POST para crear un nuevo recurso
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)  // Convierte la rutina a formato JSON
        });

        if (response.ok) {
            const datos = await response.json();
            console.log('Rutina subida con éxito:', datos);
            alert("Rutina subida con éxito.");
            window.location.href = `index.html`;
        } else {
            console.error('Error al subir la rutina:', response.statusText);
            alert("Error al subir la rutina.");
        }
    } catch (error) {
        console.error('Hubo un problema con la solicitud:', error);
        alert("Error en la conexión.");
    }
}

// Llamar a la función para obtener los usuarios al cargar la página
fetchUsers();