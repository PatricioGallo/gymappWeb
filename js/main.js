// Seleccionar el contenedor donde se agregarán las tarjetas
const userCardsContainer = document.getElementById('user-cards');

// Función para crear y agregar las tarjetas de los usuarios
function createUserCard(user) {
    const card = document.createElement('div');
    let has_click = false;
    let rutinas = []

    // Crear el contenido de la tarjeta
    card.classList.add('card');
    card.innerHTML = `
                <div class="header_card">
                    <img src="img/default_profile.webp" alt="">
                    <h1>${user.nombre} ${user.apellido}</h1>
                </div>
                <div class="body_card">
                    <h3>Edad: ${user.edad} años</h3>
                    <h3>Rutinas: ${rutinas_count(user.rutinas)}</h3>
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
                </div>
                <div class="body_card">
                    <h3>Nombre: ${user.rutinas[0].nombre}</h3>
                    <h3>Cantidad: 3 semanas</h3>
                    <h3>Dias: 5 dias</h3>
                    <h3>Cantidad de ejercicios:</h3>
                    <h3><a href="">Ver ejercicios</a></h3>
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
            user.rutinas[0].semanas[1].dias.forEach((dia) => {
                let exc_count = 0;
                dia.ejercicios.forEach((ejercicio) => {
                    if(exc_count == 0 ){
                        tableContent += `
                        <tr>
                            <td rowspan="${day_counts(dia.ejercicios)}">${dia.nombre}</td>
                            <td>${ejercicio.nombre}</td>
                            <td>${ejercicio.serie}</td>
                            <td>${ejercicio.repe}</td>
                            <td>${ejercicio.peso}kg</td>
                            <td>${ejercicio.fecha}</td>
                        </tr>`;
                        exc_count++;
                    }else{
                        tableContent += `
                        <tr>
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
            `;
            card.innerHTML = tableContent;
            // card.innerHTML = `
            //     <div class="header_card">
            //         <img src="img/default_profile.webp" alt="">
            //         <h1>Patricio Gallo</h1>
            //     </div>
            //     <div class="body_card">
            //         <h3>Nombre: Rutina de fuerza</h3>
            //         <h3>Cantidad: 3 semanas</h3>
            //         <h3>Dias: 5 dias</h3>
            //         <h3>Cantidad de ejercicios:</h3>
            //         <h3><a href="">Ver ejercicios</a></h3>
            //     </div>
            //     <div class="tabla">
            //         <table class="training-table">
            //             <thead>
            //                 <tr>
            //                     <th>Día</th>
            //                     <th>Ejercicio</th>
            //                     <th>Series</th>
            //                     <th>Repes</th>
            //                     <th>Ultimo peso</th>
            //                     <th>Ultima fecha de entreno</th>
            //                 </tr>
            //             </thead>
            //             <tbody>
            //                 <!-- Ejercicios del lunes -->
            //                 <tr>
            //                     <td rowspan="2">Lunes</td> <!-- Combina dos filas para Lunes -->
            //                     <td>Press de banca</td>
            //                     <td>4</td>
            //                     <td>10</td>
            //                     <td>60kg</td>
            //                     <td>03/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Sentadilla</td>
            //                     <td>3</td>
            //                     <td>12</td>
            //                     <td>80kg</td>
            //                     <td>03/10/2024</td>
            //                 </tr>
                
            //                 <!-- Ejercicios del martes -->
            //                 <tr>
            //                     <td rowspan="5">Martes</td> <!-- Combina tres filas para Martes -->
            //                     <td>Deadlift</td>
            //                     <td>3</td>
            //                     <td>8</td>
            //                     <td>100kg</td>
            //                     <td>04/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Press militar</td>
            //                     <td>3</td>
            //                     <td>10</td>
            //                     <td>40kg</td>
            //                     <td>04/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Curl de bíceps</td>
            //                     <td>4</td>
            //                     <td>12</td>
            //                     <td>15kg</td>
            //                     <td>04/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Curl de bíceps</td>
            //                     <td>4</td>
            //                     <td>12</td>
            //                     <td>15kg</td>
            //                     <td>04/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Curl de bíceps</td>
            //                     <td>4</td>
            //                     <td>12</td>
            //                     <td>15kg</td>
            //                     <td>04/10/2024</td>
            //                 </tr>
                            
                
            //                 <!-- Ejercicios del miércoles -->
            //                 <tr>
            //                     <td>Miércoles</td>
            //                     <td>Remo con barra</td>
            //                     <td>3</td>
            //                     <td>10</td>
            //                     <td>70kg</td>
            //                     <td>05/10/2024</td>
            //                 </tr>
                
            //                 <!-- Ejercicios del jueves -->
            //                 <tr>
            //                     <td rowspan="2">Jueves</td>
            //                     <td>Press de hombro</td>
            //                     <td>4</td>
            //                     <td>10</td>
            //                     <td>50kg</td>
            //                     <td>06/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Elevaciones laterales</td>
            //                     <td>3</td>
            //                     <td>15</td>
            //                     <td>10kg</td>
            //                     <td>06/10/2024</td>
            //                 </tr>
                
            //                 <!-- Ejercicios del viernes -->
            //                 <tr>
            //                     <td rowspan="2">Viernes</td>
            //                     <td>Dominadas</td>
            //                     <td>3</td>
            //                     <td>Max</td>
            //                     <td>-</td>
            //                     <td>07/10/2024</td>
            //                 </tr>
            //                 <tr>
            //                     <td>Curl de bíceps</td>
            //                     <td>4</td>
            //                     <td>12</td>
            //                     <td>15kg</td>
            //                     <td>07/10/2024</td>
            //                 </tr>
            //             </tbody>
            //         </table>
            //     </div> 
            // `;
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
                    <h3>Rutinas: ${rutinas_count(user.rutinas)}</h3>
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

    function rutinas_count(rutinas){
        let count = 0;
        rutinas.forEach( rutina => {
            count++;
        })
        return count
    }
    function last_training(historial){
        let last_train = historial.at(-1)
        return last_train.fecha
    }
    function day_counts(ejercicios){
        let count = 0;
        ejercicios.forEach( ()=>{
            count++;
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
        users.forEach(user => createUserCard(user));
    } catch (error) {
        console.error('Error al obtener los usuarios:', error);
    }
}

// Llamar a la función para obtener los usuarios al cargar la página
fetchUsers();
