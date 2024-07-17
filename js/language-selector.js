document.addEventListener('DOMContentLoaded', function() {
    const currentLang = document.documentElement.lang;
    if (currentLang == 'es') {
        document.getElementById('nav-esp').classList.add('active');
        console.log("Activado");
    }
    else {
        document.getElementById('nav-eng').classList.add('active');
    }
});