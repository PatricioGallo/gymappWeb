const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    const params = new URLSearchParams(window.location.search);
    const userCardsContainer = document.getElementById('user-cards');

    // Acceder a un parámetro específico
    const user_id = params.get('id');
    let exc_id = 0
    let exc_api_array = [];
    let data;
    let dates = [];
    let weights = [];
    let trainedExc = [];
    let users;

    function printExc(user){
        const configBody = document.createElement('div');
        configBody.classList.add("configBody");
        let main_body;
        main_body = `
            <div class="form_body">
                        <div class="header_form">
                            <h1>${user.nombre} elige el ejercicio</h1>
                        </div>
            <div class="form">
                        <form id="myForm">
                            <br><label for="name">Selecciona el ejercicio que desea realizar un seguimiento</label></br></br>
                            <select id="exc_id" name="exc_id" required autocomplete="off" autocorrect="off" autocapitalize="none">
            `
            makeTrainedArray(user.historial);

            trainedExc.forEach((exc) => {
            main_body += `
                <option value="${exc.id}">${exc.name} (by: ${exc.author})</option>
            `
        })
        main_body +=`
                                
                            </select><br>
                            <button type="submit">Ver Ejercicio</button>
                        </form>
                    </div>
                </div>
            `
        configBody.innerHTML = main_body;
        userCardsContainer.appendChild(configBody);

        document.getElementById('myForm').addEventListener('submit', (event) =>{
            event.preventDefault();
            exc_id = document.getElementById("exc_id").value;
            let exc_name = return_exc_name(exc_id);
            main_body = `
                <div class="configFace">
                    <div class="configHeader">
                        <h1>Datos del ejercicio "${exc_name}"</h1>
                    </div>
                    <div class="configForm">
                        <canvas id="exerciseChart"></canvas>
                    </div>
                    <div class="configPlus">
                        <div class="configPlusContent">
                            <h1>Otros datos interesantes<h1>
                            <h3>Peso Maximo: ${maxWeight(user.historial,exc_id)} Kg<h3>
                            <h3>Peso Minimo: ${minWeight(user.historial,exc_id)} Kg<h3>
                            <h3>Peso Promedio: ${aveWeight(user.historial,exc_id)} Kg<h3>
                            <h3>Cantidad de ejercicios realizados: ${allExc(user.historial,exc_id)} ejercicios<h3>
                        </div>
                    </div>
                </div>
                `;
            configBody.innerHTML = main_body;

            generateArrrays(user.historial,exc_id);

            data = {
                labels: dates, // Fechas
                datasets: [{
                    label: 'Progreso del Ejercicio',
                    data: weights, // Pesos
                    borderColor: 'rgba(75, 192, 192, 1)', // Color de la línea
                    backgroundColor: 'rgba(75, 192, 192, 0.2)', // Color del área bajo la línea
                    borderWidth: 2, // Grosor de la línea
                    tension: 0.3 // Suavidad de la línea
                }]
            };

            const config = {
                type: 'line', // Tipo de gráfica
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Permitir ajuste dinámico de proporciones
                    plugins: {
                        legend: {
                            position: 'top', // Posición de la leyenda
                        },
                        title: {
                            display: true,
                            text: 'Progreso del Ejercicio'
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Fecha'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Peso (kg)'
                            },
                            beginAtZero: false, // Ignorar el inicio en 0
                            min: minWeight(user.historial,exc_id)-10, // Define el valor mínimo del eje Y
                            ticks: {
                                stepSize: 1 // Define que el peso aumente de 5 en 5
                            }
                        }
                    }
                }
            };
            
            const ctx = document.getElementById('exerciseChart').getContext('2d');
            new Chart(ctx, config);

            //Functions
            function arraysCount(arrays){
                let count = 0;
                arrays.forEach( () => {
                    count++;
                })
                return count
            }

            function generateArrrays(historial,excID){
                historial.forEach((exc) =>{
                    if(exc.id_exc == excID){
                        weights.push(exc.peso);
                        dates.push(exc.fecha);
                    }
                })
            }
            
            function return_exc_name(id){
                let name;
                exc_api_array.forEach((exc)=>{
                    if(exc.id == id){
                        name = exc.name;
                    }
                })
                return name
            }

            function maxWeight(historial,excID){
                let max = 0;
                historial.forEach((exc) =>{
                    if(exc.id_exc == excID){
                        if(exc.peso > max){
                            max = exc.peso;
                        }
                    }
                })
                return max
            }
            function minWeight(historial,excID){
                let min = 0;
                historial.forEach((exc) =>{
                    if(exc.id_exc == excID){
                        if(min != 0){
                            if(exc.peso < min){
                                min = exc.peso;
                            }
                        } else{
                            min = exc.peso;
                        }
                    }
                })
                return min
            }
            function aveWeight(historial,excID){
                let ave = 0;
                let count = 0;
                historial.forEach((exc) =>{
                    if(exc.id_exc == excID){
                        ave = ave + exc.peso;
                        count++;
                    }
                })
                return parseInt(ave/count)
            }
            function allExc(historial,excID){
                let count = 0;
                historial.forEach((exc) =>{
                    if(exc.id_exc == excID){
                        count++;
                    }
                })
                return parseInt(count)
            }
        
        });//End submit

        function makeTrainedArray(historial){
            let trainedHist = [];
            historial.forEach((exc) => {
                if (!trainedHist.some(item => item.id_exc === exc.id_exc)) {
                    let obj = {
                        peso: exc.peso,
                        fecha: exc.fecha,
                        id_exc: exc.id_exc
                    };
                    trainedHist.push(obj);
                }
            });    
            exc_api_array.forEach((exc) => {
                if (trainedHist.some(item => item.id_exc == exc.id)) {
                    let obj = {
                        id: exc.id,
                        name: exc.name,
                        info: exc.info,
                        author: exc.author
                    };
                    trainedExc.push(obj);
                }
            })
        }
    }

    // Función para cargar la página una vez que ambas promesas se completen
    async function loadPage() {
        try {
            // Esperar a que ambas funciones se completen
            await Promise.all([fetchUsers(), fetchExc()]);
            printExc(users[user_id]);

        } catch (error) {
            console.error("Error al cargar los datos:", error);
        }
    }

    // Función para obtener los usuarios desde la API
    async function fetchUsers() {
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/users');
            users = await response.json();
        } catch (error) {
            console.error("Error al obtener los usuarios:", error);
        }
    }

    // Función para obtener los ejercicios desde la API
    async function fetchExc() {
        try {
            const response = await fetch('https://66ec441f2b6cf2b89c5de52a.mockapi.io/gymApy/excersices');
            const exc = await response.json();
            exc_api_array = exc;
            exc_api_array.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error("Error al obtener los ejercicios:", error);
        }
    }

    // Llamar a la función principal para cargar la página
    loadPage();

} else {
    window.location.href = `login.html`;
}