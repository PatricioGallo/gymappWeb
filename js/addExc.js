const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    let myForm = document.getElementById("myForm");
    let excName, description = "";
    let userName = localStorage.getItem('gymapp_id');

    myForm.addEventListener("submit", async (event)=>{
        event.preventDefault();
        excName = document.getElementById("excName").value;
        description = document.getElementById("description").value;
        userName = parseInt(userName) + 1;
        addExc(excName,description,userName);
    })

    async function addExc(excName,description,userName) {
        const newRutin = {
            name: excName,
            info: description,
            author: userName,
        };

        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices', {
                method: 'POST', // Método POST para crear un nuevo recurso
                headers: {
                    'Content-Type': 'application/json' // El cuerpo será un JSON
                },
                body: JSON.stringify(newRutin) // Convertir el objeto a una cadena JSON
            });

            if (response.ok) {
                const data = await response.json();
                alert('Ejercicio agregado con éxito');
                window.location.href = `index.html`;
            } else {
                console.error('Error al agregar el ejercicio:', response.statusText);
                alert('Error al agregar el ejercicio');
            }
        } catch (error) {
            console.error('Hubo un problema con la solicitud:', error);
            alert('Error en la conexión');
        }
    }

} else {
    window.location.href = `login.html`;
}