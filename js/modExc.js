// Obtener los parámetros de la URL
const params = new URLSearchParams(window.location.search);

// Acceder a un parámetro específico
const nombre = params.get('nombre');
const edad = params.get('edad');

// Mostrar los valores
console.log('Nombre:', nombre); // "Juan"
console.log('Edad:', edad); // "30"