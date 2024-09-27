// Seleccionar el contenedor donde se agregarán las tarjetas
const userCardsContainer = document.getElementById('user-cards');

// Función para crear y agregar las tarjetas de los usuarios
function createUserCard(user) {
    // Crear el elemento div para la tarjeta
    const card = document.createElement('div');
    card.classList.add('card');

    // Crear el contenido de la tarjeta
    card.innerHTML = `
        <h2>${user.nombre} ${user.apellido}</h2>
        <p><strong>Edad:</strong> ${user.edad}</p>
        <p><strong>Rutina:</strong> ${user.rutina ? 'Sí' : 'No'}</p>
    `;

    // Agregar la tarjeta al contenedor
    userCardsContainer.appendChild(card);

    // Agregar funcionalidad al hacer click en la tarjeta
    card.addEventListener('click', () => {
        alert(`Nombre: ${user.nombre} ${user.apellido}\nEdad: ${user.edad}\nTiene Rutina: ${user.rutina ? 'Sí' : 'No'}`);
    });

    // Manejo del hover para agrandar la tarjeta
    card.addEventListener('mouseover', () => {
        card.style.transform = 'scale(1.1)';
    });

    card.addEventListener('mouseout', () => {
        card.style.transform = 'scale(1)';
    });
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
