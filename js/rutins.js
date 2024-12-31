const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const container          = document.getElementById('container');
    // Acceder a un parámetro específico
    const user_id = params.get('id');
    let weeks = 0;
    let rut_name = "";
    let days = 0;
    let excArray = [1,1,1,1,1,1,1];
    let max_num_exc = 20;
    let weeks_array = []
    let days_array = [];
    let exc_api_array;
    let users;

    function addRutins(user){
        container.innerHTML = `
            <h1 class="services_taital">Agregar rutina</h1>
            <p class="services_text" id="services_text">${user.nombre}, completa el formulario con el nombre de la rutina, la cantidad de semanas y dias.</p>
            <br/>
            <div class="trainer_section_2" id="trainer_section_2">
            </div>
            <div id=loaderBody></div>
        `
        const userCardsContainer = document.getElementById('trainer_section_2');
        const body = document.createElement('div');
        body.classList.add("body");
        userCardsContainer.appendChild(body);
        let main_body;
        main_body = `
            <div class="email_box">
                        
            <div class="form">
                        <form id="myForm">
                            <div class="form-group">
                                <input type="text" class="email-bt" placeholder="Nombre de la rutina" name="name" id="name" required>
                            </div>
                            <div class="form-group">
                                <input type="number" class="email-bt" placeholder="Cantidad de semanas" name="weeks" id="weeks" min="1" max="10" required>
                            </div>

                            <div class="form-group">
                                <input type="number" class="email-bt" placeholder="Cantidad de dias" name="days" id="days" min="1" max="7" required>
                            </div>
                            <div class="send_bt">
                                <button type="submit" class="login-botton">CREAR TABLA</button>
                            </div>
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
                services_text = document.getElementById("services_text");
                services_text.innerHTML = `${user.nombre}, ahora podes rellenar la tabla segun como queres completar tu rutina: "${rut_name}". <br/>`
                main_body = `
                    <div class="table_body">
                        <form id="table_form">
                            <table class="training-table">
                                <thead>
                                    <tr>
                                        <th>Día</th>
                                        <th>Ejercicio</th>
                                        <th>Series</th>
                                        <th>Repeticiones</th>
                                        <th>Sin peso</th>
                                        <th>Nota (opcional)</th>
                                        <th>Eliminar</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `
                    for (let i = 0; i < days; i++) {
                        let dayClass = i % 2 === 0 ? 'day-dark' : 'day-light';
                        main_body += `
                            <tr class="${dayClass}">
                                <td rowspan="${max_num_exc}"><select id="day-${i}" name="day-${i}" placeholder="Ingrese dia" class="selector-rutins-bt" required>
                                    <option value="Lunes">Lunes</option>
                                    <option value="Martes">Martes</option>
                                    <option value="Miercoles">Miercoles</option>
                                    <option value="Jueves">Jueves</option>
                                    <option value="Viernes">Viernes</option>
                                    <option value="Sabado">Sabado</option>
                                    <option value="Domingo">Domingo</option>
                                </select></td>
                                <td><select id="exc-0-${i}" name="exc-0-${i}" class="selector-rutins-bt" required>
                                `
                                exc_api_array.forEach(exc => {
                                    main_body += `<option title="${exc.info}" value="${exc.id}">${exc.name}  (by: ${viewAuthor(exc.author)})</option>`
                                });

                                main_body +=`
                                </select></td>
                                <td><center><input type="number" class="number_input-bt" id="serie-0-${i}" name="serie-0-${i}" placeholder="Series" required></center></td>
                                <td><center><input type="number" class="number_input-bt" id="repe-0-${i}" name="repe-0-${i}" placeholder="Repes" required></center></td>
                                <td><input type="checkbox" id="check-0-${i}" onclick="this.value = this.checked ? 1 : 0;"></td>
                                <td><input type="text" id="nota-0-${i}" class="input-nota" placeholder="Agregar nota..."></td>
                                <td></td>
                            </tr>`
                            for (let j = 0; j < max_num_exc; j++) {
                                main_body +=`<tr id="row-${j+1}-${i}" class="${dayClass}"></tr>`
                            }
                            
                        main_body +=`    
                            <tr class="${dayClass}">
                                <td colspan="7">
                                    <button id="addRow" class="addButton" type="button" title="Agregar una nueva fila">+</button>
                                </td>
                            </tr>`
                    }
                
                    main_body += `
                                </tbody>
                            </table>
                            </br>
                            <div class="alert_message" id="alert_message"></div>
                            <div class="send_bt">
                                <button type="submit" id="login-botton" class="login-botton">Guardar</button>
                            </div>
                            <br/><br/>
                            <p class="services_text" id="services_text">Nota:  ${user.nombre}, Puedes agregar una "nota" opcional para registrar detalles específicos relacionados con el ejercicio (maximo 140 caracteres). Estas notas serán visibles posteriormente en la sección de "pesos semanales", y son especialmente útiles si el ejercicio requiere observaciones adicionales o ajustes particulares..</p>
                        </form>
                    </div>`

                body.innerHTML = main_body;

                function viewAuthor(id){
                    if(id != "gymapp"){
                        return `${users[id-1].nombre} ${users[id-1].apellido}`
                    }else{
                        return "gymapp"
                    }
                }

                document.getElementById('login-botton').addEventListener('click', (event) =>{
                    event.preventDefault();
                    let alert_message = document.getElementById("alert_message"); 
                    let error = 0;
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
                                nota: "",
                                id_exc: 0
                            }
                            exc_obj.id_exc  = parseInt(document.getElementById("exc-"+e+"-"+d).value)//recibo el id
                            exc_obj.nombre  = returnName(exc_obj.id_exc);
                            exc_obj.info    = returnInfo(exc_obj.id_exc);

                            if(document.getElementById("check-"+e+"-"+d).value == 1){
                                exc_obj.peso_anterior = -1;
                                exc_obj.peso = -1;
                            }

                            if(document.getElementById("serie-"+e+"-"+d).value && document.getElementById("repe-"+e+"-"+d).value){
                                exc_obj.serie   = parseInt(document.getElementById("serie-"+e+"-"+d).value)
                                exc_obj.repe    = parseInt(document.getElementById("repe-"+e+"-"+d).value)
                                exc_obj.nota    = document.getElementById("nota-"+e+"-"+d).value;
                                if(exc_obj.serie > 10){
                                    error = 2;
                                }else if(exc_obj.serie < 1 ) {
                                    error = 3;
                                }else if(exc_obj.repe > 30){
                                    error = 4;
                                }else if(exc_obj.repe<1){
                                    error = 5;
                                }else if(exc_obj.nota.length > 140){
                                    error = 6;
                                }else{
                                    error = 0;
                                }
                            }else{
                                error = 1;
                            }
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
                
                    switch (error) {
                        case 0:
                            user.rutinas.push(rutina_obj)
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
                                <p>Subiendo rutina...</p>
                            </div>
                            `
                            subirRutina(actID,user);
                            break;
                        case 1:
                            alert_message.innerHTML = `<p>Por favor, ingrese todos los valores solicitados.</p>`
                            cleanAll()
                            break;
                        case 2:
                            alert_message.innerHTML = `<p>El valor maximo de las series es 10.</p>`
                            cleanAll()
                            break;
                        case 3:
                            alert_message.innerHTML = `<p>El valor minimo de las series es 1.</p>`
                            cleanAll()
                            break;
                        case 4:
                            alert_message.innerHTML = `<p>El valor maximo de las repeticiones es 30.</p>`
                            cleanAll()
                            break;    
                        case 5:
                            alert_message.innerHTML = `<p>El valor minimo de las repeticiones es 1.</p>`
                            cleanAll()
                            break;  
                        case 6:
                            alert_message.innerHTML = `<p>Las notas tiene un maximo de 140 caracteres.</p>`
                            cleanAll()
                            break;                      
                        default:
                            alert_message.innerHTML = `<p>Por favor, ingrese todos los valores solicitados o valores validos (la nota tiene un maximo de 140 caracteres).</p>`
                            break;
                    }

                    function cleanAll(){
                        rutina_obj = {};
                        week_obj = {};
                        day_obj = {};
                        weeks_array = []
                        days_array = [];
                    }
                    function returnName(id){
                        let nombre;
                        exc_api_array.forEach(ex =>{
                            if(ex.id == id){
                                nombre =  ex.name;
                            }
                        })
                        return nombre
                    }
                    function returnInfo(id){
                        let info;
                        exc_api_array.forEach(ex =>{
                            if(ex.id == id){
                                info = ex.info
                            }
                        })
                        return info
                    }
                })
                
                // Agregar fila
                document.querySelectorAll('.addButton').forEach((button, index) => {
                    button.addEventListener('click', function() {
                        let rowName = ("row-"+ (excArray[index])+"-"+index)
                        const actualRow = document.getElementById(rowName);
                        let newRow = `
                            <td><select id="exc-${excArray[index]}-${index}" name="exc-${excArray[index]}-${index}" class="selector-rutins-bt" required>`

                            exc_api_array.forEach(exc => {
                                newRow += `<option title="${exc.info}" value="${exc.id}">${exc.name}  (by: ${viewAuthor(exc.author)})</option>`
                            });
                                
                            newRow +=`    
                            </select></td>
                            <td><center><input type="number" class="number_input-bt" id="serie-${excArray[index]}-${index}" name="serie-${excArray[index]}-${index}" placeholder="Series" required></center></td>
                            <td><center><input type="number" class="number_input-bt" id="repe-${excArray[index]}-${index}" name="repe-${excArray[index]}-${index}" placeholder="Repes" required></center></td>
                            <td><input type="checkbox" id="check-${excArray[index]}-${index}" onclick="this.value = this.checked ? 1 : 0;"></td>
                            <td><input type="text" id="nota-${excArray[index]}-${index}" class="input-nota" placeholder="Agregar nota..."></td>
                            <td><button id="addRow" class="delButton" type="button" title="Eliminar fila">-</button></td>
                            `;
                        excArray[index] += 1;
                        actualRow.insertAdjacentHTML('beforeend', newRow);  // Agregar la nueva fila al final de la tabla
                    });
                });

                //Eliminar fila
                document.getElementById('container').addEventListener('click', function (event) {
                    if (event.target.classList.contains('delButton')) {
                        const rowToDelete = event.target.closest('tr'); // Encuentra la fila más cercana al botón
                        let palabra = rowToDelete.id;
                        let partes = palabra.split("-"); // ["row", fila, index]
                        let index = parseInt(partes[2]); // Obtiene index
                        excArray[index] -= 1;
                        rowToDelete.innerHTML = ``
                    }
                });


            });//GET ELEMENT
    }

    // Función para obtener los usuarios desde la API
    async function fetchUsers() {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            users = await response.json();

            addRutins(users[user_id]);
        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }

    async function subirRutina(userId, user) {
        let alert_message = document.getElementById("alert_message"); 
        let loaderBody = document.getElementById("loaderBody");
        try {
            const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
                method: 'PUT',  // Utiliza POST para crear un nuevo recurso
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(user)  // Convierte la rutina a formato JSON
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
                        <p>¡Rutina subida con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `index.html`;
                }, 3000); 
                return 0;
            } else {
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>ERROR! No se pudo subir la rutina.</p>`
                return 1;
            }
        } catch (error) {
            loaderBody.innerHTML = ``;
            alert_message.innerHTML = `<p>ERROR! Hubo un problema con la solicitud</p>`
            return 2;
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

    // Llamar a la función para obtener los usuarios al cargar la página
    fetchUsers();
    fetchExc();
} else {
    window.location.href = `login.html`;
}