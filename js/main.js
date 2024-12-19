const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    // Seleccionar el contenedor donde se agregarán las tarjetas
    const personal_info = document.getElementById('personal_info');
    const personal_rutins = document.getElementById('personal_rutins');

    // Función para crear y agregar las tarjetas de los usuarios
    function createUserCard(user, index) {
        const profile_info = document.createElement('div');
        let user_id = index

        // Crear el contenido de la tarjeta personal
        profile_info.classList.add('profile_info');
        profile_info.innerHTML = `
                    <div class="header_card">
                        <img src="img/default_profile.webp" alt="">
                        <h1>${user.nombre} ${user.apellido}</h1>
                    </div>
                    <div class="body_card">
                        <h3>Edad: ${user.edad} años</h3>
                        <h3>Cantidad de rutinas: ${arraysCount(user.rutinas)}</h3>
                        <h3>Ultimo entreno: ${last_training(user.historial)}</h3>
                        <h3>Ultima ejercicio entrenado: ${last_exc(user.historial)}</h3>
                        <div class="main_button_class">
                            <button id="stats" class="statsButton">Ver estadisticas</button>
                        </div>
                    </div>
        `;
        personal_info.appendChild(profile_info);

        // Crear el contenido de la rutina
        const table_container = document.createElement('div');
        table_container.classList.add('table_container');
        let table_container_content = `
                        <div class="header_card">
                            <h1>Rutinas</h1>
                            <button id="addRutins" title="Agregar una nueva rutina">+</button>
                        </div>
        `;

        if(user.rutinas.length != 0){ //En caso de rutinas vacias
            user.rutinas.forEach( (rutina,index) =>{
                table_container_content+=`
                <div class="body_card">
                        <hr class="custom-line"></hr>
                        <h3>Nombre: ${rutina.nombre}</h3>
                        <h3>Cantidad de semanas: ${arraysCount(rutina.semanas)}</h3>
                        <h3>Dias: ${arraysCount(rutina.semanas[0].dias)} dias</h3>
                        <h3>Cantidad de ejercicios: ${excCount(rutina.semanas[0].dias)} </h3>
                        <h3>Porcentaje de la rutina: ${porcentaje(rutina)}% </h3>
                        <h3>Ultima semana entrenada: Semana ${last_week(rutina)} </h3>
                        <h3>Ultimo dia entrenado: ${last_day(rutina)} </h3>
                        <div class="main_button_class">
                            <button class="showExc" data-index="${index}">Mostrar ejercicios</button>
                            <button class="modExc" data-index="${index}">Modificar ejercicios</button>
                            <button class="addPeso" data-index="${index}">Pesos semanales</button>
                            <button class="button_red" data-index="${index}">Eliminar Rutina</button>
                        </div>
                </div> 
                `
            });//end foreach rutina
        } else{ //else if lenght != 0
            table_container_content+=`
                <div class="body_card">
                        <h3>Actualmente no posee rutinas</h3>
                        <h3>Clickear en el boton "+" para agregar una nueva rutina</h3>
                        <hr class="custom-line"></hr>
                `;            
        }
        table_container.innerHTML = table_container_content;
        personal_rutins.appendChild(table_container);
        
        //Buttons
        const showStats     = document.getElementById("stats");
        const showExcButton = document.querySelectorAll('.showExc');
        const modExcButtons = document.querySelectorAll('.modExc');
        const addPesoButton = document.querySelectorAll('.addPeso');

        showStats.addEventListener("click",()=>{
            const userId = user_id;  
            window.location.href = `progress.html?id=${userId}`;
        })

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
                
        addRutins.addEventListener("click",() =>{
            window.location.href = `rutinsView.html?id=${user_id}`;
        })

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
        function last_exc(historial){
            if(historial.length != 0){
                let last_train = historial.at(-1)
                return exc_api_array[parseInt(last_train.id_exc)].name
            } else{
                return "Sin entrenos previos"
            }
        }
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
                        if(exc.peso != 0){
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
            rutina.semanas.reverse().forEach((semana) => {
                semana.dias.reverse().forEach((dia) => {
                    dia.ejercicios.reverse().forEach((exc) => {
                        if(week_num == 0){
                            if (exc.peso != 0) {
                                week_num = semana.numero
                            }
                        }
                    });
                });
            });   
            return week_num
        }
        function last_day(rutina) {  
            let day_name = 0;      
            rutina.semanas.reverse().forEach((semana) => {
                semana.dias.reverse().forEach((dia) => {
                    dia.ejercicios.reverse().forEach((exc) => {
                        if(day_name == 0){
                            if (exc.peso != 0) {
                                day_name = dia.nombre
                            }
                        }
                    });
                });
            });   
            return day_name
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

    // Función para obtener los usuarios desde la API
    async function fetchUsers() {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            const users = await response.json();

            switch (users[gymapp_id].user_type) {
            case 0:
                // users.forEach((user,index) => createUserCard(user,index));
                createUserCard(users[gymapp_id],gymapp_id);
                break;
            case 1:
                alert("tipo 1"); //TODO completar logica
                break;
            case 2:
                createUserCard(users[gymapp_id],gymapp_id);
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
    window.location.href = `login.html`;
}
