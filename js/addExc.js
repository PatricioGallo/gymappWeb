const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    let myForm = document.getElementById("myForm");
    let excName, description = "";
    let userName = localStorage.getItem('gymapp_id');

    myForm.addEventListener("submit", async (event)=>{
        event.preventDefault();
        excName = document.getElementById("excName").value;
        description = document.getElementById("description").value;
        let alert_message = document.getElementById("alert_message");
        let loaderBody = document.getElementById("loaderBody");
        userName = parseInt(userName) + 1;
        loaderBody.innerHTML = `
        <div id="loading" class="loader-container">
            <div class="modern-spinner">
                <div></div>
                <div></div>
                <div></div>
                <div></div>
            </div>
            <p>Subiendo ejercicio nuevo...</p>
        </div>
        `
        let switch_resp = debugItem(excName.length,description.length);

        switch (switch_resp) {
            case 0:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>Nombre del ejercicio muy corto.</p>`
                break;
            case 1:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>Nombre del ejercicio muy largo.</p>`
                break;
            case 2:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>Descripcion del ejercicio muy corta.</p>`
                break;
            case 3:
                loaderBody.innerHTML = ``;
                alert_message.innerHTML = `<p>Descripcion del ejercicio muy larga.</p>`
                break;
            case 4:
                addExc(excName,description,userName);
                break;
            default:
            console.log("Error: sin coincidencias en el case");
        }

    })

    function debugItem(exc,des){
        if(exc < 5 ){
            return 0
        } else if (exc > 60){
            return 1
        } else if(des < 30){
            return 2
        } else if(des > 140){
            return 3
        } else{
            return 4
        }
    }

    async function addExc(excName,description,userName) {
        const newRutin = {
            name: excName,
            info: description,
            author: userName,
        };
        let loaderBody = document.getElementById("loaderBody");
        let alert_message = document.getElementById("alert_message");
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices', {
                method: 'POST', // Método POST para crear un nuevo recurso
                headers: {
                    'Content-Type': 'application/json' // El cuerpo será un JSON
                },
                body: JSON.stringify(newRutin) // Convertir el objeto a una cadena JSON
            });

            if (response.ok) {
                loaderBody.innerHTML = `
                    <div id="success-check" class="success-check-container">
                        <div class="success-icon">
                            <svg viewBox="0 0 52 52" class="success-svg">
                                <circle cx="26" cy="26" r="25" fill="none" class="success-circle" />
                                <path fill="none" d="M14 27l7 7 16-16" class="success-check" />
                            </svg>
                        </div>
                        <p>Ejercicio subido con exito!. Espere sera redirigido</p>
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

} else {
    window.location.href = `login.html`;
}