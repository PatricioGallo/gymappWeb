const gymapp_id = localStorage.getItem("gymapp_id")
if(gymapp_id != null){
    window.location.href = `profile.html`;
}