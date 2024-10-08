let myForm = document.getElementById("myForm");
let mail, pass, sur, userName = "";
let age = 0;

myForm.addEventListener("submit", async (event)=>{
    event.preventDefault();
    mail = document.getElementById("mail").value;
    sur = document.getElementById("surn").value;
    userName = document.getElementById("name").value;
    pass = document.getElementById("pass").value;
    age = document.getElementById("age").value;

    let switch_resp = await fetchUsers(mail);

    switch (switch_resp) {
        case 0:
            alert("perfecto")
            addUser(mail,pass,userName,sur,age);
            break;
        case 1:
            alert("Mail ya regisrado")
            break;
        default:
          console.log("Error: sin coincidencias en el case");
      }
   
})

async function fetchUsers(mail) {
    try {
        // Hacer la solicitud a la API
        const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
        const users = await response.json();
        let user_status = false;

        users.forEach((user,index) => {
            if(user.mail == mail){
                user_status = true;
            }
        });
        
        if(user_status == false){
            return 0
        } else if(user_status == true){
            return 1
        }

    } catch (error) {
        console.error('Error al obtener los usuarios:', error);
    }
}

async function addUser(mail,pass,userName,sur,age) {
    const newUser = {
        nombre: userName,
        mail: mail,
        contrasena: pass,
        apellido: sur,
        edad: age,
        historial: [],
        rutinas: []
    };

    try {
        const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users', {
            method: 'POST', // Método POST para crear un nuevo recurso
            headers: {
                'Content-Type': 'application/json' // El cuerpo será un JSON
            },
            body: JSON.stringify(newUser) // Convertir el objeto a una cadena JSON
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Usuario agregado con éxito:', data);
            alert('Usuario agregado con éxito');
            window.location.href = `index.html`;
        } else {
            console.error('Error al agregar el usuario:', response.statusText);
            alert('Error al agregar el usuario');
        }
    } catch (error) {
        console.error('Hubo un problema con la solicitud:', error);
        alert('Error en la conexión');
    }
}