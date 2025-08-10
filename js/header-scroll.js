window.addEventListener("scroll", () => {
  const header = document.querySelector("header");
  if (window.scrollY > 100) {
    header.style.backgroundColor = "rgba(44, 36, 22, 0.98)";
    header.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
  } else {
    header.style.backgroundColor = "rgba(44, 36, 22, 0.95)";
    header.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";
  }
});
