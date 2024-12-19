const params = new URLSearchParams(window.location.search);
const userCardsContainer = document.getElementById('user-cards');

// Acceder a un parámetro específico
const user_id = params.get('id');
const rutina_id = params.get('rutina');
let exc_api_array;

function printExc(user){
    const configBody = document.createElement('div');
    configBody.classList.add("configBody");
    let main_body;
    main_body = `
        <div class="form_body">
                    <div class="header_form">
                        <br><br><h1>${user.nombre}, ¿estas seguro que deseas eliminar: ${user.rutinas[rutina_id].nombre}?</h1>
                    </div>
        <div class="form">
                    <form id="myForm">
                        <br><label for="name">Estas por eliminar la rutina ${user.rutinas[rutina_id].nombre}, haz click en el boton eliminar</label></br></br>
                        <center><button id="but" value="1" type="submit">Eliminar</button>
                    </form>
                </div>
            </div>
        `
    configBody.innerHTML = main_body;
    userCardsContainer.appendChild(configBody);

    document.getElementById('myForm').addEventListener('submit', (event) =>{
        event.preventDefault();
        let rutins = user.rutinas;
        rutins.splice(rutina_id, 1);
        user.rutinas = rutins;
        let actID = (parseInt(user_id) + 1)
        actRutina(actID,user);
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
            alert("Rutina eliminada con éxito.");
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