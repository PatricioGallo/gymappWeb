const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params = new URLSearchParams(window.location.search);
    const container          = document.getElementById('container');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');
    let weekId = 0
    let exc_api_array;
    let max_num_exc = 20;

    function printExc(user){
        container.innerHTML = `
            <h1 class="services_taital">Modificar Rutina</h1>
            <p class="services_text" id="services_text">${user.nombre}, selecciona la semana de: "${user.rutinas[rutina_id].nombre}", para poder editar los ejercicios que necesites.</p>
            <br/>
            <div class="trainer_section_2" id="trainer_section_2">
            </div>
            <div id=loaderBody></div>
        `
        const configBody = document.createElement('div');
        configBody.classList.add("configBody");
        const userCardsContainer = document.getElementById('trainer_section_2');
        let main_body;
        main_body = `
            <div class="email_box">
                <form id="myForm">
                    <select class="email-bt" id="weeks" name="weeks" required autocomplete="off" autocorrect="off" autocapitalize="none">
            `
        user.rutinas[rutina_id].semanas.forEach((week,index) => {
            main_body += `
                <option value="${index}">Semana ${week.numero}</option>
            `
        })
        main_body +=`
                                
                            </select><br><br>
                            <div class="send_bt">
                                <button type="submit" class="login-botton">Ver Ejercicios</button>
                            </div>
                        </form>
                    </div>
                </div>
            `
        configBody.innerHTML = main_body;
        userCardsContainer.appendChild(configBody);

        document.getElementById('myForm').addEventListener('submit', (event) =>{
            event.preventDefault();
            weekId = document.getElementById("weeks").value;
            services_text = document.getElementById("services_text");
            services_text.innerHTML = `${user.nombre} ahora podras modificar los ejercicios de: "${user.rutinas[rutina_id].nombre}" semana numero: ${parseInt(weekId)+1} <br/>`
            main_body = `
                <div class="configFace">
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
                user.rutinas[rutina_id].semanas[weekId].dias.forEach((dia, diaIndex) => {
                    let exc_count = 0;
                    // Alternamos las clases de color según el índice de los días
                    let dayClass = diaIndex % 2 === 0 ? 'day-dark' : 'day-light';

                    dia.ejercicios.forEach((exc,excIndex) => {
                        if (exc_count == 0) {
                            main_body += `
                            <tr class="${dayClass}">
                                <td rowspan="${arraysCount(dia.ejercicios)}">${dia.nombre}</td>
                                <td><select id="exc-0-${diaIndex}" name="exc-0-${diaIndex}" required class="selector-email-bt">
                                    <option value="${exc.nombre}">${exc.nombre}</option>
                            `
                            exc_api_array.forEach((exc)=>{
                                main_body += `<option value="${exc.id}">${exc.name}</option>`
                            })
                            main_body +=`
                                </select></td>
                                <td><center><input type="number" id="serie-0-${diaIndex}" name="serie-0-${diaIndex}" value="${exc.serie}" class="number_input-bt"></center></td>
                                <td><center><input type="number" id="repe-0-${diaIndex}" name="repe-0-${diaIndex}" value="${exc.repe}" class="number_input-bt"></center></td>
                            </tr>`;
                            exc_count++;
                        } else {
                            main_body += `
                            <tr class="${dayClass}">
                                <td><select id="exc-${excIndex}-${diaIndex}" name="exc-${excIndex}-${diaIndex}" required class="selector-email-bt">
                                    <option value="${exc.nombre}">${exc.nombre}</option>`
                                    exc_api_array.forEach((exc)=>{
                                        main_body += `<option value="${exc.id}">${exc.name}</option>`
                                    })
                                    main_body +=`
                                    </select></td>
                                <td><center><input type="number" id="serie-${excIndex}-${diaIndex}" name="serie-${excIndex}-${diaIndex}" value="${exc.serie}" class="number_input-bt"></center></td>
                                <td><center><input type="number" id="repe-${excIndex}-${diaIndex}" name="repe-${excIndex}-${diaIndex}" value="${exc.repe}" class="number_input-bt"></center></td>
                            </tr>`;
                        }
                        
                        });
                });

                // Cerrar la tabla
                main_body += `
                                </tbody>
                            </table>
                            </br>
                            <div class="alert_message" id="alert_message"></div>
                            <div class="send_bt">
                                    <button type="submit" class="login-botton">Guardar</button>
                            </div>
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

            document.getElementById('myForm').addEventListener('submit', (event) =>{
                event.preventDefault();
                let alert_message = document.getElementById("alert_message"); 
                let loaderBody = document.getElementById("loaderBody");
                //VARIABLES
                let userPath = user.rutinas[parseInt(rutina_id)].semanas[weekId];
                let dayCount = userPath.dias.length;
                let days_array = []
                let error = 0;

                for (let d = 0; d < dayCount; d++) { 
                    //VARIABLES
                    let excPath  = user.rutinas[parseInt(rutina_id)].semanas[weekId].dias[d].ejercicios;
                    let excCount = excPath.length;
                    let day_obj = {
                        nombre: "",
                        ejercicios: []
                    }
                    let exc_array =[]

                    for (let e= 0; e < excCount; e++) {
                        let exc_obj = {
                            nombre: "",
                            peso_anterior: 0,
                            peso: 0,
                            serie: 0,
                            fecha: "",
                            repe: 0,
                            info: "",
                            nota: "",
                            id_exc: 4
                        }
                        exc_obj.peso_anterior   = excPath[e].peso_anterior;
                        exc_obj.peso            = excPath[e].peso;
                        exc_obj.fecha           = excPath[e].fecha;
                        exc_obj.info            = excPath[e].info;
                        exc_obj.id_exc          = excPath[e].id_exc;
                        exc_obj.nota            = excPath[e].nota;
                        exc_obj.nombre          = document.getElementById("exc-"+e+"-"+d).value;

                        if(document.getElementById("serie-"+e+"-"+d).value && document.getElementById("repe-"+e+"-"+d).value){
                            exc_obj.serie   = parseInt(document.getElementById("serie-"+e+"-"+d).value)
                            exc_obj.repe    = parseInt(document.getElementById("repe-"+e+"-"+d).value)

                            if(exc_obj.serie > 10 || exc_obj.serie < 1 || exc_obj.repe > 30 || exc_obj.repe<1){
                                error = 1;
                            }else{
                                error = 0;
                            }
                        }else{
                            error = 1;
                        }

                        exc_array.push(exc_obj);
                    }
                    day_obj.ejercicios = exc_array;
                    day_obj.nombre = userPath.dias[d].nombre;
                    days_array.push(day_obj)
                }                

                if( error == 0){
                    user.rutinas[parseInt(rutina_id)].semanas[weekId].dias = days_array;
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
                        <p>Actualizando rutina...</p>
                    </div>`
                    actRutina(actID,user);
                } else{
                    alert_message.innerHTML = `<p>Ingrese todos los valores solicitados o valores validos.</p>`
                    days_array = []
                }
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
            exc_api_array.sort((a, b) => a.name.localeCompare(b.name));

        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }


    async function actRutina(userId, user) {
        let loaderBody = document.getElementById("loaderBody");
        let alert_message = document.getElementById("alert_message"); 
        try {
            const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
                method: 'PUT',  
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(user)  
            });

            if (response.ok) {
                loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>¡Rutina actualizada con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `index.html`;
                }, 3000); 
                return 0;
            } else {
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>ERROR! No se pudo subir la rutina.</p>`
            }
        } catch (error) {
            loaderBody.innerHTML = ``;
            alert_message.innerHTML = `<p>ERROR! Hubo un problema con la solicitud</p>`
        }
    }

    // Llamar a la función para obtener los usuarios al cargar la página
    fetchUsers();
    fetchExc();
} else {
    window.location.href = `login.html`;
}