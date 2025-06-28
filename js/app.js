// Mobile Menu
const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.querySelector(".nav-links");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("active");
  });
}

// FAQ Accordion
function initFAQAccordion() {
  const faqQuestions = document.querySelectorAll(".faq-question");
  
  faqQuestions.forEach(question => {
    if (!question.dataset.listenerAdded) {
      question.addEventListener("click", function() {
        const answer = this.nextElementSibling;
        const isActive = this.classList.contains("active");
        
        document.querySelectorAll(".faq-answer").forEach(ans => {
          ans.classList.remove("show");
        });
        
        document.querySelectorAll(".faq-question").forEach(q => {
          q.classList.remove("active");
        });
        
        if (!isActive) {
          this.classList.add("active");
          answer.classList.add("show");
        }
      });
      question.dataset.listenerAdded = "true";
    }
  });
}

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function(e) {
    e.preventDefault();
    const targetId = this.getAttribute("href");
    const targetElement = document.querySelector(targetId);

    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 70,
        behavior: "smooth"
      });

      if (navLinks && navLinks.classList.contains("active")) {
        navLinks.classList.remove("active");
      }
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const forms = document.querySelectorAll(".contact-formulario");

  forms.forEach(form => {
    const submitButton = form.querySelector("button[type='submit']");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submitButton.disabled = true;
      const originalText = submitButton.innerText;
      submitButton.innerText = "Enviando...";

      const formData = new FormData(form);
      const actionURL = form.getAttribute("action"); 
      
      fetch(actionURL, {
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

  // Inicializaciones
  initFAQAccordion();
});
