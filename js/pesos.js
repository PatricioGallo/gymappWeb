const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params = new URLSearchParams(window.location.search);
    const container          = document.getElementById('container');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');
    let weekId = 0;
    let dayId = 0;
    let exc_api_array;
    let users;

    function printExc(user){
        let last_weekId = last_week(user,rutina_id);
        let last_dayId  = last_day(user,rutina_id);
        reinventir_rutina(user,rutina_id);
        container.innerHTML = `
            <h1 class="services_taital">Tus pesos</h1>
            <p class="services_text" id="services_text">${user.nombre} selecciona la semana y el dia de tu rutina: "${user.rutinas[rutina_id].nombre}", para poder ver los ejercicios y agregarle el peso del dia.</p>
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
                    <div class="form-group">
                        <select class="email-bt" id="weeks" name="weeks" required autocomplete="off" autocorrect="off" autocapitalize="none">
            `
        user.rutinas[rutina_id].semanas.forEach((week,index) => {
            main_body += `
                <option value="${index}" ${index === last_weekId ? 'selected' : ''}>Semana ${week.numero}</option>
            `
        })
        
        main_body += `
            </select><br><br>
            <select class="email-bt" id="day" name="day" required autocomplete="off" autocorrect="off" autocapitalize="none">
            `
        user.rutinas[rutina_id].semanas[0].dias.forEach((day,index) => {
            main_body += `
                <option value="${index}" ${index === last_dayId ? 'selected' : ''}>${day.nombre}</option>
            `
        })
        main_body +=`
                                
                            </select><br><br>
                            <div class="send_bt">
                                <button type="submit" class="login-botton">Ver Ejercicios</button>
                            </div>
                            <br/><br/>
                            <p class="services_text" id="services_text">Nota: ${user.nombre}, de manera automática, GymApp identificará el día y la semana que te corresponde entrenar hoy, para que siempre estés al tanto de tu rutina.</p>
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
            services_text = document.getElementById("services_text");
            services_text.innerHTML = `${user.nombre} ahora podras agregar pesos en los ejercicios de "${user.rutinas[rutina_id].nombre}" semana numero: ${parseInt(weekId)+1} <br/>`
            main_body = `
                <div class="configFace">
                    <div class="configForm">
                        <form id="myForm">
                            <table class="training-table">
                                <thead>
                                    <tr>
                                        <th>Día</th>
                                        <th>Ejercicio (tocar para ver)</th>
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
                                <td><button id="excDesc" class="excDesc" type="button" title="Ver informacion del ejercicio">${exc.nombre}${existNote(exc.nota)}</button></td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                `
                                
                                if(exc.peso_anterior != -1){  //para no poner la entrada de valores en caso de un ejercicio sin peso  
                                    main_body += `
                                        <td>${peso_anterior(exc.id_exc)}</td>
                                        <td><center><input type="number" id="repe-${excIndex}" name="repe-${excIndex}" placeholder="${exc.peso}" class="number_input-bt"></center></td>
                                    </tr>
                                    `;
                                }else{
                                    main_body += `
                                        <td>Sin peso <input type="number" id="repe-${excIndex}" style="display: none;" value="-1"></td>
                                        <td></td>
                                    </tr>
                                        `
                                }

                            exc_count++;
                        } else {
                            main_body += `
                            <tr class="day-dark">
                                <td><button id="excDesc" class="excDesc" type="button" title="Ver informacion del ejercicio">${exc.nombre}${existNote(exc.nota)}</button></td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                `
                            if(exc.peso_anterior != -1){   
                                main_body += `
                                    <td>${peso_anterior(exc.id_exc)}</td>
                                    <td><center><input type="number" id="repe-${excIndex}" name="repe-${excIndex}" placeholder="${exc.peso}" class="number_input-bt"></center></td>
                                </tr>
                                `;
                            }else{
                                main_body += `
                                    <td>Sin peso <input type="number" id="repe-${excIndex}" style="display: none;" value="-1"></td>
                                    <td></td>
                                </tr>
                                    `
                            }
                        }
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
                            </br>
                            </br>
                            <p class="services_text" id="services_text">Nota: Los ejercicios marcados con un " * " indican que el entrenador ha dejado una nota especial relacionada con ellos.</p>
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

            function existNote(nota){
                if(nota != undefined && nota != ""){
                    return "*"
                }else{
                    return ""
                }
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
                let alert_message = document.getElementById("alert_message"); 
                let excPath     = user.rutinas[rutina_id].semanas[weekId].dias[dayId].ejercicios;
                let excCount    = excPath.length;
                let exc_histo   = user.historial;
                let switch_resp_array = []
                let correctValue = 0;
                let beforeError = 0;

                for (let e= 0; e < excCount; e++) {
                    let peso_exc = parseInt(document.getElementById("repe-"+e).value);
                    let switch_resp = debugItem(peso_exc); //me fijo si se ingreso un valor correcto
                    switch_resp_array.push(switch_resp)

                    if( switch_resp == 3){

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

                for (let valor of switch_resp_array) {
                    if(valor == 3 && beforeError == 0){
                        correctValue = 1;
                    } else if(valor == 1 || valor == 2){
                        correctValue = 0;
                        beforeError = 1;
                    }
                }

                if(correctValue != 0){
                    let loaderBody = document.getElementById("loaderBody");
                        loaderBody.innerHTML = `
                        <div id="loading" class="loader-container">
                            <div class="modern-spinner">
                                <div></div>
                                <div></div>
                                <div></div>
                                <div></div>
                            </div>
                            <p>Subiendo rutina...</p>
                        </div>
                        `
                    actRutina(actID,user);
                }else{
                    alert_message.innerHTML = `<p>ERROR! Ingresaste un valor incorrecto o ningun valor.</p>`
                }

            });

            document.querySelectorAll('.excDesc').forEach((button, index) => {
                button.addEventListener('click', function() {
                    let loaderBody = document.getElementById("loaderBody");
                    let exc = user.rutinas[rutina_id].semanas[weekId].dias[dayId].ejercicios[index];
                    loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="exc_container">
                            <div class="exc_info">
                                <div class="exc_title"><h1>${exc.nombre}</h1></div>
                                <div class= "exc_detail">
                                    <h2>Descripcion:</h2>
                                    <h3>${exc.info}</h3>
                                    <div id="note">
                                    </div>
                                    <br/>
                                    <h2>Desarrollado por:</h2>
                                    <h3>${viewAuthorID(exc.id_exc)}</h3>
                                </div>
                                <div class= "exc_buttons"><button class="exc_button" onclick="document.getElementById('loaderBody').innerHTML = '';">Cerrar</button></div>
                            </div>
                        </div>
                    </div>
                    `;
                    if(exc.nota != undefined && exc.nota != ""){
                        note.innerHTML = `
                            <br/>
                            <h2>Nota del entrenador:</h2>
                            <h3>${exc.nota}</h3>
                        `
                    }
                });
            });
            
            function viewAuthorID(id){
                let id_author = exc_api_array[id-1].author;
                return viewAuthor(id_author);
            }

            function viewAuthor(id){
                if(id != "gymapp"){
                    return `${users[id-1].nombre} ${users[id-1].apellido}`;
                }else{
                    return "gymapp"
                }
            }

            function debugItem(item){
                if(item == 0){
                    return 0
                } else if (item < -1){
                    return 1
                } else if(isNaN(item)){
                    return 2
                } else{
                    return 3
                }
            }
        });//End submit
    
        function last_week(user,rutinaId) {  
            let week_num = 0;      
            user.rutinas[rutinaId].semanas.reverse().forEach((semana) => {
                semana.dias.reverse().forEach((dia) => {
                    dia.ejercicios.reverse().forEach((exc) => {
                        if(week_num == 0){
                            if (exc.peso > 0) {
                                week_num = semana.numero
                            }
                        }
                    });
                });
            });   
            return (week_num -1)
        }
        function last_day(user,rutinaId) {  
            let day_name = 0;    
            let total_count = user.rutinas[rutinaId].semanas[0].dias.length;  
            let count;
            user.rutinas[rutinaId].semanas.forEach((semana) => {
                count = total_count -1;
                semana.dias.forEach((dia) => {
                    dia.ejercicios.forEach((exc) => {
                        if(day_name == 0){
                            if (exc.peso > 0) {
                                day_name = count;
                            }
                        }
                    });
                    count--;
                });
            });   
            return (day_name +1)
        }
        function reinventir_rutina(user,rutinaId){
            let day_name = 0;      
            user.rutinas[rutinaId].semanas.reverse().forEach((semana) => {
                semana.dias.reverse().forEach((dia, index) => {
                    dia.ejercicios.reverse().forEach((exc) => {
                        if(day_name == 0){
                            if (exc.peso > 0) {
                                day_name = index
                            }
                        }
                    });
                });
            });   
        }
    }

    // Función para obtener los usuarios desde la API
    async function fetchUsers() {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            users = await response.json();

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
        let alert_message = document.getElementById("alert_message"); 
        let loaderBody = document.getElementById("loaderBody");
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
                        <p>¡Peso actualizado con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    loaderBody.innerHTML = ``;
                }, 3000); 
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