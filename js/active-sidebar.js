const menu = document.querySelector('.menu-icon');
const navbar = document.querySelector('.navbar');
const lines = document.querySelectorAll('.line');

menu.addEventListener('click', () => {
    if (navbar.classList.contains('nav-active')) {
        navbar.classList.remove('nav-active');
    } else {
        navbar.classList.add('nav-active');
    }
    lines.forEach(line => {
        if(line.classList.contains('active-lines')) {
            line.classList.remove('active-lines');
        } else {
            line.classList.add('active-lines');
        }
    });
});
