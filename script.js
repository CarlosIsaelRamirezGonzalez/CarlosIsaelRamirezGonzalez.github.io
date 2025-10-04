// Carrusel automático
class Carousel {
    constructor() {
        this.slides = document.querySelectorAll('.carousel-slide');
        this.dotsContainer = document.querySelector('.carousel-dots');
        this.currentSlide = 0;
        this.interval = null;
        this.init();
    }

    init() {
        // Crear dots
        this.slides.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = `dot ${index === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => this.goToSlide(index));
            this.dotsContainer.appendChild(dot);
        });

        this.startAutoPlay();
        this.addEventListeners();
    }

    goToSlide(index) {
        this.slides[this.currentSlide].classList.remove('active');
        this.dotsContainer.children[this.currentSlide].classList.remove('active');
        
        this.currentSlide = index;
        
        this.slides[this.currentSlide].classList.add('active');
        this.dotsContainer.children[this.currentSlide].classList.add('active');
    }

    nextSlide() {
        const next = (this.currentSlide + 1) % this.slides.length;
        this.goToSlide(next);
    }

    startAutoPlay() {
        this.interval = setInterval(() => {
            this.nextSlide();
        }, 5000);
    }

    addEventListeners() {
        // Pausar carrusel al hacer hover
        const carousel = document.querySelector('.carousel');
        carousel.addEventListener('mouseenter', () => {
            clearInterval(this.interval);
        });

        carousel.addEventListener('mouseleave', () => {
            this.startAutoPlay();
        });

        // Navegación móvil
        const navToggle = document.querySelector('.nav-toggle');
        const navLinks = document.querySelector('.nav-links');

        if (navToggle) {
            navToggle.addEventListener('click', () => {
                navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            });
        }

        // Smooth scroll para enlaces
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Efecto de navbar al hacer scroll
        window.addEventListener('scroll', () => {
            const navbar = document.querySelector('.navbar');
            if (window.scrollY > 100) {
                navbar.style.background = 'rgba(255, 255, 255, 0.98)';
                navbar.style.padding = '0.5rem 0';
            } else {
                navbar.style.background = 'rgba(255, 255, 255, 0.95)';
                navbar.style.padding = '1rem 0';
            }
        });
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new Carousel();
    
    // Animación de elementos al hacer scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = `fadeInUp 0.6s ease forwards`;
                entry.target.style.opacity = '0';
                entry.target.style.transform = 'translateY(30px)';
            }
        });
    }, observerOptions);

    // Observar elementos para animación
    document.querySelectorAll('.specialty-card, .about-content, .map-container').forEach(el => {
        observer.observe(el);
    });
});

// Efecto de escritura para títulos
class TypeWriter {
    constructor(element, text, speed = 100) {
        this.element = element;
        this.text = text;
        this.speed = speed;
        this.currentIndex = 0;
        this.type();
    }

    type() {
        if (this.currentIndex < this.text.length) {
            this.element.innerHTML += this.text.charAt(this.currentIndex);
            this.currentIndex++;
            setTimeout(() => this.type(), this.speed);
        }
    }
}




// Disclaimer Modal Functionality
class DisclaimerModal {
    constructor() {
        this.modal = document.getElementById('disclaimer-modal');
        this.acceptBtn = document.getElementById('accept-btn');
        this.rejectBtn = document.getElementById('reject-btn');
        this.hasInteracted = localStorage.getItem('disclaimerAccepted');
        this.init();
    }

    init() {
        // Mostrar modal solo si no ha interactuado antes
        if (!this.hasInteracted) {
            setTimeout(() => {
                this.showModal();
            }, 1000);
        }

        this.addEventListeners();
    }

    showModal() {
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevenir scroll
    }

    hideModal() {
        this.modal.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll
    }

    acceptDisclaimer() {
        localStorage.setItem('disclaimerAccepted', 'true');
        this.createConfettiEffect();
        setTimeout(() => {
            this.hideModal();
        }, 1500);
    }

    rejectDisclaimer() {
        // Efecto visual de rechazo
        this.modal.style.animation = 'shake 0.5s ease-in-out';
        
        setTimeout(() => {
            // Redirigir a página en blanco o mostrar mensaje
            document.body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 2rem;">
                    <div>
                        <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">⚠️ Contenido Eliminado</h1>
                        <p style="font-size: 1.2rem; margin-bottom: 2rem;">Has rechazado los términos. Esta página ha sido eliminada según lo establecido en el disclaimer.</p>
                        <button onclick="location.reload()" style="background: white; color: #667eea; border: none; padding: 1rem 2rem; border-radius: 10px; font-weight: bold; cursor: pointer;">
                            Volver a Intentar
                        </button>
                    </div>
                </div>
            `;
        }, 1000);
    }

    createConfettiEffect() {
        const colors = ['#2c5530', '#4a7c59', '#e74c3c', '#e9c46a', '#ff9a3c'];
        
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animation = `confettiFall ${Math.random() * 3 + 2}s linear forwards`;
            document.body.appendChild(confetti);

            // Remover confetti después de la animación
            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }
    }

    addEventListeners() {
        if (this.acceptBtn) {
            this.acceptBtn.addEventListener('click', () => {
                this.acceptDisclaimer();
            });
        }

        if (this.rejectBtn) {
            this.rejectBtn.addEventListener('click', () => {
                this.rejectDisclaimer();
            });
        }

        // Cerrar modal haciendo clic fuera del contenido
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                // No permitir cerrar haciendo clic fuera - forzar decisión
                this.modal.style.animation = 'shake 0.5s ease-in-out';
                setTimeout(() => {
                    this.modal.style.animation = '';
                }, 500);
            }
        });
    }
}

// Agregar animación de confeti al CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes confettiFall {
        0% {
            transform: translateY(-100px) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
        }
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
`;
document.head.appendChild(style);

// Inicializar el disclaimer cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new Carousel();
    new MobileMenu();
    new SmoothScroll();
    new ScrollEffect();
    new ScrollAnimations();
    new DisclaimerModal(); // <- ¡NUEVO!
});