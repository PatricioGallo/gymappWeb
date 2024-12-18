const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params = new URLSearchParams(window.location.search);
    const userCardsContainer = document.getElementById('user-cards');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');
    let weekId = 0;
    let dayId = 0;
    let exc_api_array;

    function printExc(user){
        const configBody = document.createElement('div');
        configBody.classList.add("configBody");
        let main_body;
        main_body = `
            <div class="form_body">
                        <div class="header_form">
                            <h1>${user.nombre} agregar pesos diarios en: ${user.rutinas[rutina_id].nombre}</h1>
                        </div>
            <div class="form">
                        <form id="myForm">
                            <br><label for="name">Selecciona la semana y el dia de la rutina para agregar tus pesos</label></br></br>
                            <select id="weeks" name="weeks" required autocomplete="off" autocorrect="off" autocapitalize="none">
            `
        user.rutinas[rutina_id].semanas.forEach((week,index) => {
            main_body += `
                <option value="${index}">Semana ${week.numero}</option>
            `
        })
        
        main_body += `
            </select><br><br>
            <select id="day" name="day" required>
            `
        user.rutinas[rutina_id].semanas[0].dias.forEach((day,index) => {
            main_body += `
                <option value="${index}">${day.nombre}</option>
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
            dayId = document.getElementById("day").value;
            dayValue = user.rutinas[rutina_id].semanas[weekId].dias[dayId].nombre.toLowerCase();
            main_body = `
                <div class="configFace">
                    <div class="configHeader">
                        <h1>Modificar pesos del dia ${dayValue} de la semana numero ${user.rutinas[rutina_id].semanas[weekId].numero}</h1>
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
                                        <th>Peso anterior</th>
                                        <th>Peso actual</th>
                                    </tr>
                                </thead>
                                <tbody>

                `
                    let exc_count = 0;
                    user.rutinas[rutina_id].semanas[weekId].dias[dayId].ejercicios.forEach((exc,excIndex) => {
                        if (exc_count == 0) {
                            main_body += `
                            <tr class="day-dark">
                                <td rowspan="${arraysCount(user.rutinas[rutina_id].semanas[weekId].dias[dayId].ejercicios)}">${user.rutinas[rutina_id].semanas[weekId].dias[dayId].nombre}</td>
                                <td>${exc.nombre}</td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                <td>${peso_anterior(exc.id_exc)}</td>
                                <td><center><input type="number" id="repe-0" name="repe-0" value="${exc.peso}"></center></td>
                            </tr>`;
                            exc_count++;
                        } else {
                            main_body += `
                            <tr class="day-dark">
                                <td>${exc.nombre}</td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                <td>${peso_anterior(exc.id_exc)}</td>
                                <td><center><input type="number" id="repe-${excIndex}" name="repe-${excIndex}" value="${exc.peso}"></center></td>
                            </tr>
                        `;
                        }
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

            function arraysCount(arrays){
                let count = 0;
                arrays.forEach( () => {
                    count++;
                })
                return count
            }

            function peso_anterior(id){
                let peso;
                let cnt = 0;
                user.historial.slice().reverse().forEach(e => {
                    if(e.id_exc == id){
                        if(cnt == 0){
                            peso = e.peso;
                            cnt++;
                        }
                    }
                });
                if(peso == undefined){
                    return("Sin peso anterior")
                }else{
                    return(peso)
                }
            }

            document.getElementById('myForm').addEventListener('submit', (event) =>{
                event.preventDefault();
                let excPath     = user.rutinas[rutina_id].semanas[weekId].dias[dayId].ejercicios;
                let excCount    = excPath.length;
                let exc_histo   = user.historial;

                for (let e= 0; e < excCount; e++) {
                    let peso_exc = parseInt(document.getElementById("repe-"+e).value);

                    if( peso_exc != 0){

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

                        let exc_obj_array = {
                            peso: 0,
                            fecha: "",
                            id_exc: 4
                        }
                        
                        const fecha = new Date();
                        const dia = String(fecha.getDate()).padStart(2, '0');
                        const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses empiezan desde 0
                        const año = String(fecha.getFullYear()); // Obtenemos los últimos 2 dígitos del año
                        const fechaFormateada = `${dia}-${mes}-${año}`;
                        
                        exc_obj.peso_anterior   = excPath[e].peso_anterior;
                        exc_obj.peso            = peso_exc;
                        exc_obj.fecha           = fechaFormateada;
                        exc_obj.info            = excPath[e].info;
                        exc_obj.id_exc          = excPath[e].id_exc;
                        exc_obj.nombre          = excPath[e].nombre;;
                        exc_obj.serie           = excPath[e].serie;;
                        exc_obj.repe            = excPath[e].repe;;

                        exc_obj_array.peso            = peso_exc;
                        exc_obj_array.fecha           = fechaFormateada;
                        exc_obj_array.id_exc          = excPath[e].id_exc;

                        user.rutinas[rutina_id].semanas[weekId].dias[dayId].ejercicios[e] = exc_obj;
                        exc_histo.push(exc_obj_array);
                    }

                }
                user.historial = exc_histo;
                let actID = (parseInt(user_id) + 1)
                actRutina(actID,user);
            });
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
                alert("Peso agregado con éxito.");
                window.location.href = `index.html`;
            } else {
                console.error('Error al subir el peso:', response.statusText);
                alert("Error al subir pesos.");
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