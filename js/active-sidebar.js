const menu = document.querySelector('.menu-icon');
const navbar = document.querySelector('.navbar');


menu.addEventListener('click', () => {
    if (navbar.classList.contains('nav-active')) {
        navbar.classList.remove('nav-active');
    } else {
        navbar.classList.add('nav-active');
    }
});