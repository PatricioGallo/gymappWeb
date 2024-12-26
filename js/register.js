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
        let loaderBody = document.getElementById("loaderBody");
        loaderBody.innerHTML = `
        <div id="loading" class="loader-container">
            <div class="modern-spinner">
                <div></div>
                <div></div>
                <div></div>
                <div></div>
            </div>
            <p>Ingresando...</p>
        </div>
        `
        let switch_resp = await fetchUsers(mail);
        switch (switch_resp) {
            case 0:
                addUser(mail,pass,userName,sur,age);
                break;
            case 1:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>ERROR! Email ya registrado.</p>`
                break;
            default:
            loaderBody.innerHTML = ``;
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
    let loaderBody = document.getElementById("loaderBody");
    let alert_message = document.getElementById("alert_message");

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
            loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>¡Ususario registrado con exito!. Espere sera redirigido</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `index.html`;
                }, 3000); 
        } else {
            loaderBody.innerHTML = ``;
            alert_message.innerHTML = `<p>ERROR! Algo salio mal, volver a intentar.</p>`
        }
    } catch (error) {
        loaderBody.innerHTML = ``;
        alert_message.innerHTML = `<p>ERROR! Algo salio mal, volver a intentar.</p>`
    }
}