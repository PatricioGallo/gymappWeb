const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id == null){
    let myForm = document.getElementById("myForm");
    let mail, pass = ""
    myForm.addEventListener("submit", async (event)=>{
        event.preventDefault();
        mail = document.getElementById("mail").value;
        pass = document.getElementById("pass").value;
        let alert_message = document.getElementById("alert_message");
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
        let switch_resp = await fetchUsers(mail, pass);

        switch (switch_resp) {
            case 0:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>Usuario no existe. Por favor intente nuevamente.</p>`
                break;
            case 1:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>Contraseña incorrecta. Por favor intente nuevamente.</p>`
                break;
            case 2:
                loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <p>¡Bienvenido!</p>
                    </div>
                `;
                setTimeout(() => {
                    window.location.href = `profile.html`;
                }, 2000); 
                break;
            default:
            alert_message.innerHTML = `<p>ERROR! Volver a intentarlo.</p>`
        }
    })

    async function fetchUsers(mail,pass) {
        try {
            // Hacer la solicitud a la API
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            const users = await response.json();
            let user_status = false;
            let pass_status = false;

            users.forEach((user,index) => {
                if(user.mail == mail){
                    user_status = true;
                    if(user.contrasena == pass){
                        pass_status = true;
                        localStorage.setItem('gymapp_id',index);
                    }
                }
            });
            
            if(user_status == false){
                return 0
            } else if(user_status == true && pass_status== false){
                return 1
            }else if(user_status == true && pass_status== true){
                return 2
            }

        } catch (error) {
            console.error('Error al obtener los usuarios:', error);
        }
    }
} else {
    window.location.href = `profile.html`;
}