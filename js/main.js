// Seleccionar el contenedor donde se agregarán las tarjetas
const userCardsContainer = document.getElementById('user-cards');

// Función para crear y agregar las tarjetas de los usuarios
function createUserCard(user, index) {
    const card = document.createElement('div');
    let has_click = false;
    let has_print_exc = false;
    let user_id = index

    // Crear el contenido de la tarjeta
    card.classList.add('card');
    card.innerHTML = `
                <div class="header_card">
                    <img src="img/default_profile.webp" alt="">
                    <h1>${user.nombre} ${user.apellido}</h1>
                </div>
                <div class="body_card">
                    <h3>Edad: ${user.edad} años</h3>
                    <h3>Rutinas: ${arraysCount(user.rutinas)}</h3>
                    <h3>Ultimo entreno: ${last_training(user.historial)}</h3>
                </div>
    `;
    userCardsContainer.appendChild(card);

    // Agregar funcionalidad al hacer click en la tarjeta
    card.addEventListener('click', () => {
        if(!has_click){
            card.innerHTML = ``;
            card.classList.add('bigCard');
            // Crear la tabla de rutinas dinámicamente
            let tableContent = `
                <div class="header_card">
                    <img src="img/default_profile.webp" alt="">
                    <h1>${user.nombre} ${user.apellido}</h1>
                    <button id="addRutins" title="Agregar una nueva rutina">+</button>
                </div>
            `;
            user.rutinas.forEach( (rutina,index) =>{
                tableContent+=`
                   <div class="body_card">
                        <h3>Nombre: ${rutina.nombre}</h3>
                        <h3>Cantidad de semanas: ${arraysCount(rutina.semanas)}</h3>
                        <h3>Dias: ${arraysCount(rutina.semanas[0].dias)} dias</h3>
                        <h3>Cantidad de ejercicios: ${excCount(rutina.semanas[0].dias)} ejercicios</h3>
                `;
                //Init table
                if(has_print_exc == true){
                    tableContent +=`
                            <div class="main_button_class">
                                <button id="printTable">Ocultar ejercicios</button> 
                                <button class="modExc" data-index="${index}">Modificar ejercicios</button>
                            </div>
                        </div> 
                        <div class="tabla">
                            <table class="training-table">
                                <thead>
                                    <tr>
                                        <th>Día</th>
                                        <th>Ejercicio</th>
                                        <th>Series</th>
                                        <th>Repes</th>
                                        <th>Último peso</th>
                                        <th>Última fecha de entreno</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    
                    // Generar las filas de la tabla con los ejercicios
                        rutina.semanas[0].dias.forEach((dia, diaIndex) => {
                            let exc_count = 0;
                            // Alternamos las clases de color según el índice de los días
                            let dayClass = diaIndex % 2 === 0 ? 'day-dark' : 'day-light';

                            dia.ejercicios.forEach((ejercicio) => {
                                if (exc_count == 0) {
                                    tableContent += `
                                    <tr class="${dayClass}">
                                        <td rowspan="${arraysCount(dia.ejercicios)}">${dia.nombre}</td>
                                        <td>${ejercicio.nombre}</td>
                                        <td>${ejercicio.serie}</td>
                                        <td>${ejercicio.repe}</td>
                                        <td>${ejercicio.peso}kg</td>
                                        <td>${ejercicio.fecha}</td>
                                    </tr>`;
                                    exc_count++;
                                } else {
                                    tableContent += `
                                    <tr class="${dayClass}">
                                        <td>${ejercicio.nombre}</td>
                                        <td>${ejercicio.serie}</td>
                                        <td>${ejercicio.repe}</td>
                                        <td>${ejercicio.peso}kg</td>
                                        <td>${ejercicio.fecha}</td>
                                    </tr>
                                `;
                                }
                            });
                        });

                        // Cerrar la tabla
                        tableContent += `
                                    </tbody>
                                </table>
                            </div>
                            <hr class="custom-line"></hr>
                        `;
                    }else{
                        tableContent +=`
                            <div class="main_button_class">
                                <button id="printTable">Mostrar ejercicios</button>
                                <button class="modExc" data-index="${index}">Modificar ejercicios</button>
                            </div>
                            <hr class="custom-line"></hr>
                        </div> `
                    }

                card.innerHTML = tableContent;
            });//End foreach rutinas   

            const table_button  = document.getElementById("printTable");
            const modExcButtons = document.querySelectorAll('.modExc');
            const addRutins     = document.getElementById("addRutins")

            table_button.addEventListener("click", () =>{
                has_print_exc = !has_print_exc;
                has_click = !has_click;
            });

            modExcButtons.forEach((button, index) => {
                button.addEventListener('click', () => {
                    has_click = !has_click;
                    const userId = user_id;  
                    const rutinaId = index;  
                    window.location.href = `excView.html?id=${userId}&rutina=${rutinaId}`;
                });
            });
            
            addRutins.addEventListener("click",() =>{
                has_click = !has_click;
                window.location.href = `rutinsView.html?id=${user_id}`;
            })
        }
        else{
            card.classList.remove("bigCard");
            card.classList.add('card');
            card.innerHTML = `
            <div class="header_card">
                    <img src="img/default_profile.webp" alt="">
                    <h1>${user.nombre} ${user.apellido}</h1>
                </div>
                <div class="body_card">
                    <h3>Edad: ${user.edad} años</h3>
                    <h3>Rutinas: ${arraysCount(user.rutinas)}</h3>
                    <h3>Ultimo entreno: ${last_training(user.historial)}</h3>
                </div>
        `; 
        }
        has_click = !has_click;
    });

    // Manejo del hover para agrandar la tarjeta
    card.addEventListener('mouseover', () => {
        if (!has_click) {
            card.style.transform = 'scale(1.1)';
        }
    });

    card.addEventListener('mouseout', () => {
        if (!has_click) {
            card.style.transform = 'scale(1)';
        }
    });

    function arraysCount(arrays){
        let count = 0;
        arrays.forEach( () => {
            count++;
        })
        return count
    }
    function last_training(historial){
        let last_train = historial.at(-1)
        return last_train.fecha
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
}

// Función para obtener los usuarios desde la API
async function fetchUsers() {
    try {
        // Hacer la solicitud a la API
        const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
        const users = await response.json();

        // Crear una tarjeta por cada usuario
        users.forEach((user,index) => createUserCard(user,index));
    } catch (error) {
        console.error('Error al obtener los usuarios:', error);
    }
}

// Llamar a la función para obtener los usuarios al cargar la página
fetchUsers();
