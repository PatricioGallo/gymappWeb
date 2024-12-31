const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){

    const params             = new URLSearchParams(window.location.search);
    const container          = document.getElementById('container');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    const rutina_id = params.get('rutina');
    let user;
    let weekId = 0
    let exc_api_array;

    function printExc(user){
        container.innerHTML = `
            <h1 class="services_taital">Tus ejercicios</h1>
            <p class="services_text" id="services_text">${user.nombre} selecciona la semana de tu rutina: ${user.rutinas[rutina_id].nombre} para poder ver los ejercicios.</p>
            <br/>
            <div class="trainer_section_2" id="trainer_section_2">
            </div>
            <div id=loaderBody></div>
        `
        const userCardsContainer = document.getElementById('trainer_section_2');
        const configBody = document.createElement('div');
        configBody.classList.add("configBody");
        let main_body;
        main_body = `

                            <div class="email_box">
                                    <form id="myForm">
                                        <div class="form-group">
                                            <select class="email-bt" id="weeks" name="weeks" required autocomplete="off" autocorrect="off" autocapitalize="none">        
            `
        user.rutinas[rutina_id].semanas.forEach((week,index) => {
            main_body += `
                <option value="${index}">Semana ${week.numero}</option>
            `
        })
        main_body +=`
                                
                            </select></div><br>
                            <div class="send_bt">
                                <button type="submit" class="login-botton">Ver Ejercicios</button>
                            </div>
                        </form>
                </div>
            `
        configBody.innerHTML = main_body;
        userCardsContainer.appendChild(configBody);

        document.getElementById('myForm').addEventListener('submit', (event) =>{
            event.preventDefault();
            weekId = document.getElementById("weeks").value;
            services_text = document.getElementById("services_text");
            services_text.innerHTML = `${user.nombre} ahora podras ver los ejercicios de "${user.rutinas[rutina_id].nombre}" semana numero: ${parseInt(weekId)+1} <br/>`
            main_body = `
                <div class="configFace">
                    <div class="configForm">
                            <table class="training-table">
                                <thead>
                                    <tr>
                                        <th>Día</th>
                                        <th>Ejercicio (tocar para ver)</th>
                                        <th>Series</th>
                                        <th>Repes</th>
                                        <th>Ultimo Peso</th>
                                        <th>Ultimo Entreno</th>
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
                                <td><button id="excDesc" class="excDesc" type="button" title="Ver informacion del ejercicio">${exc.nombre}${existNote(exc.nota)}</button></td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                <td>${exc.peso > 0 ? exc.peso: "Sin peso"}</td>
                                <td>${exc.fecha}</td>
                            </tr>`;
                            exc_count++;
                        } else {
                            main_body += `
                            <tr class="${dayClass}">
                                <td><button id="excDesc" class="excDesc" type="button" title="Ver informacion del ejercicio">${exc.nombre}${existNote(exc.nota)}</button></td>
                                <td>${exc.serie}</td>
                                <td>${exc.repe}</td>
                                <td>${exc.peso}</td>
                                <td>${exc.fecha}</td>
                            </tr>
                        `;
                        }
                    });
                });

                // Cerrar la tabla
                main_body += `
                            </tbody>
                        </table>
                        <div class="read_bt"><a href="showExc.html?id=${user_id}&rutina=${rutina_id}">Elegir Otra Semana</a></div>
                    </div>
                </div>
                `;

            configBody.innerHTML = main_body;
            
            document.querySelectorAll('.excDesc').forEach((button, index) => {
                let day_index = getDayIndex(index);
                let backgroundColor = day_index % 2 === 0 ? '#e0e0e0' : '#f2f2f2';
                button.style.backgroundColor = backgroundColor;
            })

            document.querySelectorAll('.excDesc').forEach((button, index) => {
                button.addEventListener('click', function() {
                    let dayIndex = getDayIndex(index);
                    let excIndex = getExcIndex(index);
                    let loaderBody = document.getElementById("loaderBody");
                    let exc = user.rutinas[rutina_id].semanas[weekId].dias[dayIndex].ejercicios[excIndex];
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

            function getDayIndex(index){
                let exc_count = -1;
                let day_index;
                user.rutinas[rutina_id].semanas[weekId].dias.forEach((dia, day_i)=>{
                    dia.ejercicios.forEach(exc =>{
                        exc_count ++; 
                        if(exc_count == index){
                            day_index = day_i;
                        }
                    })
                })
                return day_index
            }
            function getExcIndex(index){
                let exc_count = -1;
                let exc_index;
                user.rutinas[rutina_id].semanas[weekId].dias.forEach((dia, day_i)=>{
                    dia.ejercicios.forEach((exc,e_index) =>{
                        exc_count ++; 
                        if(exc_count == index){
                            exc_index = e_index;
                        }
                    })
                })
                return exc_index
            }

            function existNote(nota){
                if(nota != undefined && nota != ""){
                    return "*"
                }else{
                    return ""
                }
            }

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