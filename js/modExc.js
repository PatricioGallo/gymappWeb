// Obtener los parámetros de la URL
const params = new URLSearchParams(window.location.search);

// Acceder a un parámetro específico
const user_id = params.get('id');
const rutina_id = params.get('rutina');

function printExc(user){
    console.log(user.nombre)
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

// Llamar a la función para obtener los usuarios al cargar la página
fetchUsers();