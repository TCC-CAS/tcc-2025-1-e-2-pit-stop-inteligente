// home.js — Comportamentos da landing page (Index).
//   - Smooth scroll para âncoras
//   - Header que muda ao rolar
//   - Reveal on scroll (.animate-on-scroll)
//   - Counters numéricos animados (data-counter)
//   - Menu mobile (hamburger)

document.addEventListener("DOMContentLoaded", () => {
    configurarScrollSuave();
    configurarHeaderSticky();
    configurarRevealOnScroll();
    configurarCounters();
    configurarMenuMobile();
});


function configurarScrollSuave() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener("click", (e) => {
            const id = link.getAttribute("href");
            if (id === "#" || id === "#mainContent") return;
            const alvo = document.querySelector(id);
            if (!alvo) return;
            e.preventDefault();
            const offset = document.getElementById("mainHeader")?.offsetHeight || 80;
            window.scrollTo({
                top: alvo.offsetTop - offset + 1,
                behavior: "smooth",
            });
        });
    });
}


function configurarHeaderSticky() {
    const header = document.getElementById("mainHeader");
    if (!header) return;
    const aplicar = () => {
        header.classList.toggle("scrolled", window.scrollY > 16);
    };
    aplicar();
    window.addEventListener("scroll", aplicar, { passive: true });
}


function configurarRevealOnScroll() {
    const elementos = document.querySelectorAll(".animate-on-scroll");
    if (!elementos.length) return;

    if ("IntersectionObserver" in window) {
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        obs.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
        );
        elementos.forEach((el) => obs.observe(el));
    } else {
        // Fallback: anima tudo de uma vez
        elementos.forEach((el) => el.classList.add("visible"));
    }
}


function configurarCounters() {
    const counters = document.querySelectorAll("[data-counter]");
    if (!counters.length) return;

    const animar = (el) => {
        const target = parseInt(el.dataset.counter, 10) || 0;
        const sufixo = el.dataset.suffix || "";
        const duracao = 1200;
        const inicio = performance.now();

        const tick = (agora) => {
            const t = Math.min((agora - inicio) / duracao, 1);
            const valor = Math.floor(t * target);
            el.textContent = `${valor}${sufixo}`;
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = `${target}${sufixo}`;
        };
        requestAnimationFrame(tick);
    };

    if ("IntersectionObserver" in window) {
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        animar(entry.target);
                        obs.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.4 },
        );
        counters.forEach((el) => obs.observe(el));
    } else {
        counters.forEach(animar);
    }
}


function configurarMenuMobile() {
    const toggle = document.getElementById("menuToggle");
    const header = document.getElementById("mainHeader");
    if (!toggle || !header) return;

    toggle.addEventListener("click", () => {
        const aberto = header.classList.toggle("menu-open");
        toggle.setAttribute("aria-expanded", aberto ? "true" : "false");
        toggle.querySelector("i").className = aberto ? "fas fa-times" : "fas fa-bars";
    });

    // Fecha o menu ao clicar em um link
    header.querySelectorAll(".nav-menu a").forEach((a) =>
        a.addEventListener("click", () => {
            header.classList.remove("menu-open");
            toggle.setAttribute("aria-expanded", "false");
            toggle.querySelector("i").className = "fas fa-bars";
        }),
    );
}
