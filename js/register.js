let myForm = document.getElementById("myForm");
let mail, pass, sur, userName , pass2= "";
let age = 0;

myForm.addEventListener("submit", async (event)=>{
    event.preventDefault();
    mail = document.getElementById("mail").value;
    sur = document.getElementById("surn").value;
    userName = document.getElementById("name").value;
    pass = document.getElementById("pass").value;
    pass2 = document.getElementById("pass2").value;
    age = document.getElementById("age").value;
    let alert_message = document.getElementById("alert_message");

    if(userName.length < 2 || !isNaN(userName) || sur.length < 2 || !isNaN(sur)){
        alert_message.innerHTML = `<p>ERROR! Nombre o apellido invalidos.</p>`
    } else if(pass != pass2 || pass.length < 6 ){
        alert_message.innerHTML = `<p>ERROR! Contraseñas no coinciden o muy corta. (minimo 6 caracteres)</p>`
    } else if(isNaN(age) || age < 12 || age > 100){
        alert_message.innerHTML = `<p>ERROR! Edad no es correcta!.</p>`
    } else{
        let switch_resp = await fetchUsers(mail);
        switch (switch_resp) {
            case 0:
                addUser(mail,pass,userName,sur,age);
                break;
            case 1:
                alert_message.innerHTML = `<p>ERROR! Email ya registrado.</p>`
                break;
            default:
            alert_message.innerHTML = `<p>ERROR! Algo salio mal, volver a intentar.</p>`
        }
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
        user_type : 2,
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