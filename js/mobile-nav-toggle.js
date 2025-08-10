const mobileToggle = document.querySelector(".mobile-toggle");
const navMenu = document.querySelector("nav ul");

mobileToggle.addEventListener("click", () => {
  navMenu.classList.toggle("active");
  mobileToggle.querySelector("i").classList.toggle("fa-bars");
  mobileToggle.querySelector("i").classList.toggle("fa-times");
});

// * Close mobile menu when clicking on a link
document.querySelectorAll("nav ul li a").forEach((link) => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("active");
    mobileToggle.querySelector("i").classList.add("fa-bars");
    mobileToggle.querySelector("i").classList.remove("fa-times");
  });
});

