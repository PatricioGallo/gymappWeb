const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    // Seleccionar el contenedor donde se agregarán las tarjetas
    const personal_info     = document.getElementById('personal_info');
    const personal_rutins   = document.getElementById('personal_rutins');
    let exc_api_array;
    const trainer_section_2 = document.getElementById('trainer_section_2');
    const services_section  = document.getElementById('services_section');    
    let users; 

    // Función para crear y agregar las tarjetas de los usuarios
    function createUserCard(user, index) {
        const profile_info = document.createElement('div');
        let user_id = index

        services_section.innerHTML = `
        <div class="container">
            <h1 class="services_taital">Hola ${user.nombre}</h1>
            <p class="services_text">Bienvenido a tu perfil, aqui podras encontrar tus rutinas activas, crear nuevas, ver estadisticas e informacion personal.</p>
            <div class="services_section_2 layout_padding">
            <div class="row">
                <div class="col-sm-4">
                <a href="#rutinas"><div class="box_main">
                    <div class="icon_1"></div>
                    <a href="#rutinas"><h6 class="heavy_text">ENTRENAMIENTO <br>Rutinas</h6>
                </div></a>
                </div>
                <div class="col-sm-4">
                <a href="progress.html?id=${user_id}"><div class="box_main active">
                    <div class="icon_2"></div>
                    <h6 class="heavy_text active">GRAFICOS <br>Y AVANCES</h6>
                </div></a>
                </div>
                <div class="col-sm-4">
                <a href="rutinsView.html?id=${user_id}"><div class="box_main">
                    <div class="icon_3"></div>
                    <h6 class="heavy_text">CREAR <br>NUEVA RUTINA</h6>
                </div></a>
                </div>
            </div>
            <div class="read_bt"><a href="progress.html?id=${user_id}">ESTADISTICAS</a></div>
            </div>
        </div>
        `
        // Crear el contenido de la tarjeta personal
        profile_info.classList.add('profile_info');
        trainer_section_2.innerHTML = `
                    <div class="row">
                        <div class="col-md-6 padding_0">
                        <div class="trainer_box">
                            <h3 class="trainer_text">${user.nombre}</h3>
                            <p class="lorem_text">Sabemos lo mucho que te gusta entrenar, por eso te traemos algunos datos:</p>
                            <p"><span class="highlight">Nombre:</span> ${user.nombre}</p>
                            <p"><span class="highlight">Cantidad de rutinas:</span> ${arraysCount(user.rutinas)}</p>
                            <p"><span class="highlight">Último entreno:</span> ${last_training(user.historial)}</p>
                        </div>
                        </div>
                        <div class="col-md-6 padding_0">
                        <div class="image_1"></div>
                        </div>
                    </div>
        `;

        // Crear el contenido de la rutina
        const table_container = document.createElement('div');
        table_container.classList.add('table_container');
        let table_container_content = `
        `;

        if(user.rutinas.length != 0){ //En caso de rutinas vacias
            user.rutinas.forEach( (rutina,index) =>{
                table_container_content +=`
                <div class="body_card">
                        <hr class="custom-line"></hr>
                        <p"><span class="highlight">Nombre:</span> ${rutina.nombre}</p>
                        <p"><span class="highlight">Cantidad de semanas:</span> ${arraysCount(rutina.semanas)}</p>
                        <p"><span class="highlight">Dias:</span> ${arraysCount(rutina.semanas[0].dias)} dias</p>
                        <p"><span class="highlight">Cantidad de ejercicios:</span> ${excCount(rutina.semanas[0].dias)}</p>
                        <p"><span class="highlight">Porcentaje de la rutina:</span> ${porcentaje(rutina)}% </p>
                        <p"><span class="highlight">Ultima semana entrenada:</span> Semana ${last_week(rutina)}</p>
                        <p"><span class="highlight">Ultimo dia entrenado:</span> ${last_day(rutina)}</p>
                        <div class="main_button_class">
                            <button class="showExc" data-index="${index}">Mostrar Ejercicios</button>
                            <button class="modExc" data-index="${index}">Modificar Ejercicios</button>
                            <button class="addPeso" data-index="${index}">Pesos Semanales</button>
                            <button class="button_red" data-index="${index}">Eliminar Rutina</button>
                        </div>
                </div> 
                `
            });//end foreach rutina
        } else{ //else if lenght != 0
            table_container_content+=`
                <div class="body_card">
                        <br/>
                        <h3>Actualmente no posees rutinas.</h3>
                        <h3>Clickear en el boton "CREAR NUEVA RUTINA" para agregar una nueva.</h3>
                </div> 

                `;            
        }
        table_container.innerHTML = table_container_content;
        personal_rutins.appendChild(table_container);
        
        //Buttons
        const showStats     = document.getElementById("stats");
        const showExcButton = document.querySelectorAll('.showExc');
        const modExcButtons = document.querySelectorAll('.modExc');
        const addPesoButton = document.querySelectorAll('.addPeso');
        const delRutin      = document.querySelectorAll('.button_red');

        showExcButton.forEach((button, index) => {
            button.addEventListener('click', () => {
                const userId = user_id;  
                const rutinaId = index;  
                window.location.href = `showExc.html?id=${userId}&rutina=${rutinaId}`;
            });
        });

        modExcButtons.forEach((button, index) => {
            button.addEventListener('click', () => {
                const userId = user_id;  
                const rutinaId = index;  
                window.location.href = `excView.html?id=${userId}&rutina=${rutinaId}`;
            });
        });

        addPesoButton.forEach((button, index) => {
            button.addEventListener('click', () => {
                const userId = user_id;  
                const rutinaId = index;  
                window.location.href = `pesos.html?id=${userId}&rutina=${rutinaId}`;
            });
        });

        delRutin.forEach((button, index) => {
            button.addEventListener('click', () => {
                const userId = user_id;  
                const rutinaId = index;  
                window.location.href = `deleteRutins.html?id=${userId}&rutina=${rutinaId}`;
            });
        });
                
        function arraysCount(arrays){
            let count = 0;
            arrays.forEach( () => {
                count++;
            })
            return count
        }
        function last_training(historial){
            if(historial.length != 0){
                let last_train = historial.at(-1)
                return last_train.fecha
            } else{
                return "Sin entrenos previos"
            }
        }
        // function last_exc(historial){
        //     let ret;
        //     if(historial.length != 0){
        //         let last_train = historial.at(-1)
        //         exc_api_array.forEach((exc)=>{
        //             if(exc.id == last_train.id_exc){
        //                 ret = exc.name;
        //             }
        //         })
        //     } else{
        //         ret = "Sin entrenos previos";
        //     }
        //     return ret
        // }
        function excCount(dias){
            let count = 0;
            let id_array = [];
            dias.forEach( (dia) =>{
                dia.ejercicios.forEach( (ejercicio) =>{
                    let same_id = 0;
                    id_array.forEach( (item) =>{
                        if(item == ejercicio.id_array){
                            same_id = 1;
                        }
                    })
                    if(same_id == 0){
                        count++;
                        id_array.push(ejercicio.id_exc);
                    }
                })
            })
            return count
        }
        function porcentaje(rutina){
            let exc_count = 0;
            let count = 0;
            rutina.semanas.forEach( (semana) =>{
                semana.dias.forEach((dia)=>{
                    dia.ejercicios.forEach(exc => {
                        if(exc.peso > 0 ){
                            count++; 
                        }
                        exc_count++;
                    });
                })
            })
            return(parseInt((count/exc_count)*100))
        }

        function last_week(rutina) {  
            let week_num = 0;
            rutina.semanas.forEach((semana) => {
                semana.dias.forEach((dia) => {
                    dia.ejercicios.forEach((exc) => {
                        if(week_num == 0){
                            if (exc.peso > 0) {
                                week_num = semana.numero
                            }
                        }
                    });
                });
            });
            if(week_num==0){
                return "sin entreno previo"
            }else{
                return week_num
            }
        }

        function last_day(rutina) {  
            let day_name = "";
            rutina.semanas.forEach((semana) => {
                semana.dias.forEach((dia) => {
                    dia.ejercicios.forEach((exc) => {
                        if(day_name == ""){
                            if (exc.peso > 0) {
                                day_name = dia.nombre
                            }
                        }
                    });
                });
            });
            if(day_name==0){
                return "sin entreno previo"
            }else{
                return day_name
            }
        }
    }

    function configMenu(user){
        const config = document.getElementById('config'); 
        if (config) {
            config.addEventListener('click', (e) => {
                e.preventDefault();
                let loaderBody = document.getElementById("loaderBody");
                loaderBody.innerHTML = `
                <div id="success-check" class="success-check-container">
                    <div class="exc_container">
                        <div class="exc_info">
                            <div class="exc_title"><h1>Configuracion</h1></div>
                            <div class= "exc_detail">
                                <h2>Nombre:</h2>
                                <h3><input type="text" placeholder="${user.nombre}" name="userName" id="userName"></h3>
                                <h2>Apellido:</h2>
                                <h3><input type="text" placeholder="${user.apellido}" name="sname" id="sname"></h3>
                                <h2>Mail:</h2>
                                <h3><input type="email" placeholder="${user.mail}" name="mail" id="mail"></h3>
                                <h2>Contraseña:</h2>
                                <h3><input type="password" placeholder="••••••••••••" name="pswd" id="pswd"></h3>
                            </div>
                            <div class="alert_message" id="alert_message"></div>
                            <div class= "exc_buttons">
                                <button class="exc_button" id="saveChanges">Guardar</button>
                                <button class="exc_button" onclick="document.getElementById('loaderBody').innerHTML = '';">Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
                `;
                saveChanges.addEventListener('click', (e) => {
                    e.preventDefault();
                    let noEmpty = 0;
                    let newUser = user;
                    let configError = 0;

                    if(userName.value){
                        if(userName.value.length > 2 && isNaN(userName.value)){
                            newUser.nombre = userName.value;
                        }else{
                            configError = 2;
                        }
                        noEmpty = 1;
                    } 
                    if(sname.value){
                        if(sname.value.length > 2 && isNaN(sname.value)){
                            newUser.apellido = sname.value;
                        }else{
                            configError = 3;
                        }
                        noEmpty = 1;
                    }
                    if(mail.value){
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (emailRegex.test(mail.value)) {
                            let repeatedMail = isRepeated(mail.value)
                            if (repeatedMail == 0){
                                newUser.mail = mail.value;
                            }else{
                                configError = 6; 
                            }
                        } else {
                            configError = 4;
                        }
                        noEmpty = 1;
                    }
                    if(pswd.value){
                        if(pswd.value.length > 6){
                            newUser.contrasena = pswd.value;
                        }else{
                            configError = 5;
                        }
                        noEmpty = 1;
                    }

                    if(noEmpty == 0){
                        configError = 1;
                    }

                    switch (configError) {
                        case 1:
                            alert_message.innerHTML = `<p>Ingresaste un valor incorrecto o ningun valor.</p>`
                            break;
                        case 2:
                            alert_message.innerHTML = `<p>Ingresaste un nombre incorrecto</p>`
                            break;
                        case 3:
                            alert_message.innerHTML = `<p>Ingresaste un apellido incorrecto.</p>`
                            break;
                        case 4:
                            alert_message.innerHTML = `<p>Ingresaste un email incorrecto.</p>`
                            break;
                        case 5:
                            alert_message.innerHTML = `<p>Ingresaste una contraseña no valida</p>`
                            break;
                        case 6:
                            alert_message.innerHTML = `<p>El email ya esta registrado.</p>`
                            break;
                        case 0:
                            alert_message.innerHTML = ``
                            updateUser(parseInt(gymapp_id)+1,newUser);
                            break;
                        default:
                            console.log("Error!");
                            break;
                    }

                    function isRepeated(mail){
                        let repeated = 0;
                        users.forEach(user =>{
                            if(user.mail == mail){
                                repeated = 1;
                            }
                        })
                        return repeated
                    }

                })
            });
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


    async function updateUser(userId, updatedData) {
        try {
            const response = await fetch(`https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users/${userId}`, {
                method: 'PUT', // Cambiar a 'PATCH' si solo modificas campos específicos
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedData)
            });
    
            if (response.ok) {
                const updatedUser = await response.json();
                loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>¡Cambios guardados con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `profile.html`;
                    loaderBody.innerHTML = ``;
                }, 3000); 
                return updatedUser;
            } else {
                alert_message.innerHTML = `Error al guardar cambios`
                console.error('Error al actualizar el usuario:', response.status);
            }
        } catch (error) {
            console.error('Error en la solicitud de actualización:', error);
        }
    }

    // Función para obtener los usuarios desde la API
    async function fetchUsers() {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            users = await response.json();

            switch (users[gymapp_id].user_type) {
            case 0:
                // users.forEach((user,index) => createUserCard(user,index));
                createUserCard(users[gymapp_id],gymapp_id);
                configMenu(users[gymapp_id]);
                break;
            case 1:
                alert("tipo 1"); //TODO completar logica
                break;
            case 2:
                createUserCard(users[gymapp_id],gymapp_id);
                configMenu(users[gymapp_id]);
                break;
            default:
                console.log("Error: sin coincidencias en el case");
            }

        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }

    // Llamar a la función para obtener los usuarios al cargar la página
    fetchExc();
    fetchUsers();
} else {
    window.location.href = `index.html`;
}
