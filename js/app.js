// Toggle mobile menu
const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.querySelector(".nav-links");

menuToggle.addEventListener("click", () => {
  navLinks.classList.toggle("active");
});

// FAQ Accordion
const faqQuestions = document.querySelectorAll(".faq-question");

faqQuestions.forEach((question) => {
  question.addEventListener("click", () => {
    const answer = question.nextElementSibling;
    const isActive = question.classList.contains("active");

    // Close all answers
    document.querySelectorAll(".faq-answer").forEach((ans) => {
      ans.classList.remove("show");
    });

    // Remove active class from all questions
    document.querySelectorAll(".faq-question").forEach((q) => {
      q.classList.remove("active");
    });

    // If this question wasn't active, open it
    if (!isActive) {
      question.classList.add("active");
      answer.classList.add("show");
    }
  });
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();

    const targetId = this.getAttribute("href");
    const targetElement = document.querySelector(targetId);

    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 70,
        behavior: "smooth",
      });

      // Close mobile menu if open
      if (navLinks.classList.contains("active")) {
        navLinks.classList.remove("active");
      }
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    submitButton.disabled = true;
    const originalText = submitButton.innerText;
    submitButton.innerText = "Enviando...";

    const formData = new FormData(form);

    fetch("https://formsubmit.co/brunisdan6@gmail.com", {
      method: "POST",
      body: formData
    })
    .then(response => {
      if (response.ok) {
        swal("¡Correo enviado!", "Te responderemos lo antes posible.", "success");
        form.reset();
      } else {
        throw new Error("Algo falló");
      }
    })
    .catch(error => {
      swal("Error", "No se pudo enviar el formulario. Inténtalo más tarde.", "error");
      console.error(error);
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.innerText = originalText;
    });
  });
});
