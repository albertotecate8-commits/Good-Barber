// Motor de animación de la experiencia pública. Vive aparte a propósito:
// aquí no hay una sola línea de lógica de reserva, ni de Supabase, ni de
// datos. Si este archivo falla o GSAP no carga, la app sigue funcionando y
// la baraja se ve igual — solo que quieta (las tres posiciones son CSS).
//
// Tres capas independientes, una línea de tiempo por capa, sin pisarse:
//   .gb-slot → posición en la baraja      (rotación automática y gesto)
//   .gb-card → deriva ambiental            (bucle infinito propio)
//   img      → Ken Burns                   (solo en la frontal)

const AUTOPLAY_MS = 5200;
const UMBRAL_SWIPE = 45;

// Las tres posiciones de profundidad, en el mismo orden que el CSS.
// slot 0 = frontal, 1 = media, 2 = fondo.
//
// Son EXACTAMENTE las del prototipo aprobado y no se tocan. La baraja puede
// tener ahora cualquier número de tarjetas, pero en pantalla solo hay estas
// tres posiciones: las que sobran esperan detrás de la del fondo, invisibles,
// y van entrando al girar. En cualquier instante la portada se ve igual.
const POSICIONES = [
  { x: 0,    y: 0,   z: 0,    rz: 0,  ry: 0,  s: 1,    o: 1,    blur: 0, zi: 3 },
  { x: null, y: 16,  z: -55,  rz: 7,  ry: 6,  s: 0.92, o: 0.5,  blur: 0, zi: 2 },
  { x: null, y: -24, z: -120, rz: -8, ry: -7, s: 0.86, o: 0.28, blur: 1, zi: 1 },
];

// La posición de espera: la misma del fondo, pero sin opacidad. Así una
// tarjeta que entra no aparece de golpe, sino que se revela al llegar al
// fondo, y no se añade ninguna profundidad nueva al diseño.
const ESPERA = { ...POSICIONES[POSICIONES.length - 1], o: 0, zi: 0 };

function posicionBase(ranura) {
  return ranura < POSICIONES.length ? POSICIONES[ranura] : ESPERA;
}

// Los desplazamientos laterales son los mismos clamp() del CSS, resueltos en
// JavaScript para que GSAP pueda interpolarlos y sigan adaptándose al ancho.
// Más allá de la tercera ranura se repite el del fondo: la tarjeta está
// invisible ahí, así que no introduce ninguna posición nueva.
function desplazamientos() {
  const vw = document.documentElement.clientWidth;
  return [0, Math.min(Math.max(52, vw * 0.15), 74), Math.max(Math.min(-54, -vw * 0.155), -76)];
}

function desplazamientoDe(ranura) {
  const d = desplazamientos();
  return ranura < d.length ? d[ranura] : d[d.length - 1];
}

export function initDeck(deck) {
  const gsap = window.gsap;
  const slots = [...deck.querySelectorAll(".gb-slot")];
  if (!slots.length) return null;

  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Sin GSAP no se monta nada: el CSS estático ya deja la baraja bien puesta.
  if (!gsap) return null;

  const cards = slots.map((s) => s.querySelector(".gb-card"));
  const imgs = slots.map((s) => s.querySelector("img"));

  // La ÚLTIMA tarjeta nace al frente, igual que siempre. Con tres tarjetas
  // esto vale 2, exactamente como antes; con una o dos no se sale de rango.
  let frontal = slots.length - 1;
  let temporizador = null;
  let kenBurns = null;
  let derivas = [];
  let arrastrando = false;
  let vivo = false;

  const suave = () => !menosMovimiento.matches;

  /* ---------- Colocación ---------- */
  function posicionDe(i) {
    const ranura = (i - frontal + slots.length) % slots.length;
    const base = posicionBase(ranura);
    return { ...base, x: base.x === null ? desplazamientoDe(ranura) : base.x, ranura };
  }

  function colocar(dur) {
    slots.forEach((slot, i) => {
      const p = posicionDe(i);
      slot.style.zIndex = p.zi;
      gsap.to(slot, {
        x: p.x, y: p.y, z: p.z, rotationZ: p.rz, rotationY: p.ry,
        scale: p.s, autoAlpha: p.o,
        filter: p.blur ? `blur(${p.blur}px)` : "blur(0px)",
        duration: suave() ? dur : 0,
        ease: "power3.inOut",
        overwrite: "auto",
      });
    });
  }

  /* ---------- Ken Burns: siempre sobre la tarjeta que ESTÁ al frente ---------- */
  // Una imagen marcada `data-estable` (el logotipo oficial) nunca se escala:
  // a escala 1 la tarjeta no recorta ni un píxel en horizontal, y cualquier
  // zoom se comería el wordmark por los lados. La TARJETA sigue girando en la
  // baraja con todos los demás; lo único quieto es la imagen.
  const estable = (img) => img.dataset.estable === "true";

  function reiniciarKenBurns() {
    if (kenBurns) kenBurns.kill();
    kenBurns = null;
    imgs.forEach((img, i) => {
      if (i !== frontal) gsap.set(img, { scale: estable(img) ? 1 : 1.03 });
    });
    const frente = imgs[frontal];
    if (estable(frente)) { gsap.set(frente, { scale: 1 }); return; }
    if (!suave()) return;
    kenBurns = gsap.fromTo(
      frente,
      { scale: 1.03 },
      { scale: 1.075, duration: 9, ease: "sine.inOut", repeat: -1, yoyo: true }
    );
  }

  /* ---------- Deriva ambiental: una por tarjeta, periodos distintos ---------- */
  function iniciarDerivas() {
    derivas.forEach((t) => t.kill());
    derivas = [];
    if (!suave()) return;
    const ajustes = [
      { y: -5, rz: 0.4, dur: 6.2 },
      { y: 4,  rz: -0.5, dur: 7.4 },
      { y: -6, rz: 0.35, dur: 8.1 },
    ];
    cards.forEach((card, i) => {
      const a = ajustes[i % ajustes.length];
      derivas.push(
        gsap.to(card, {
          y: a.y, rotationZ: a.rz,
          duration: a.dur, ease: "sine.inOut",
          repeat: -1, yoyo: true, delay: i * 0.7,
        })
      );
    });
  }

  /* ---------- Avance ---------- */
  function avanzar(dir = 1) {
    frontal = (frontal + dir + slots.length) % slots.length;
    colocar(0.82);
    reiniciarKenBurns();
  }

  /* ---------- Rotación automática: un único temporizador, nunca dos ---------- */
  function pararAutoplay() {
    if (temporizador) { clearInterval(temporizador); temporizador = null; }
  }
  function arrancarAutoplay() {
    pararAutoplay();
    if (!suave() || !vivo) return;
    temporizador = setInterval(() => { if (!arrastrando) avanzar(1); }, AUTOPLAY_MS);
  }

  /* ---------- Congelar TODO, no solo el temporizador ----------
     El Ken Burns y las tres derivas son bucles infinitos: parar el
     temporizador dejaba cuatro animaciones vivas componiendo fotogramas con
     la portada fuera de pantalla o la pestaña en segundo plano. Se pausan y
     se reanudan donde estaban, sin reiniciar el movimiento. */
  function congelar() {
    pararAutoplay();
    if (kenBurns) kenBurns.pause();
    derivas.forEach((t) => t.pause());
  }
  function descongelar() {
    if (kenBurns) kenBurns.resume();
    derivas.forEach((t) => t.resume());
    arrancarAutoplay();
  }

  /* ---------- Gesto ---------- */
  let x0 = 0, y0 = 0, decidido = null, idPuntero = null;

  deck.addEventListener("pointerdown", (e) => {
    if (idPuntero !== null) return;
    idPuntero = e.pointerId;
    x0 = e.clientX; y0 = e.clientY;
    decidido = null;
    arrastrando = true;
  });

  deck.addEventListener("pointermove", (e) => {
    if (e.pointerId !== idPuntero) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    // Hasta que el gesto no se define, no se toca nada: si resulta vertical,
    // la página desplaza con normalidad y este gesto se desentiende.
    if (decidido === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decidido = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (decidido === "v") { arrastrando = false; idPuntero = null; return; }
      deck.setPointerCapture(e.pointerId);
    }
    if (decidido !== "h" || !suave()) return;
    // Arrastre con resistencia: la tarjeta sigue al dedo sin irse de madre
    const p = posicionDe(frontal);
    gsap.set(slots[frontal], { x: p.x + dx * 0.38, rotationZ: dx * 0.012 });
  });

  function soltar(e) {
    if (e.pointerId !== idPuntero) return;
    const dx = e.clientX - x0;
    const eraH = decidido === "h";
    idPuntero = null; decidido = null; arrastrando = false;
    if (!eraH) return;
    if (Math.abs(dx) > UMBRAL_SWIPE) {
      avanzar(dx < 0 ? 1 : -1);
    } else {
      colocar(0.42);           // no llegó al umbral: vuelve a su sitio
    }
    arrancarAutoplay();        // un solo temporizador, reiniciado
  }
  deck.addEventListener("pointerup", soltar);
  deck.addEventListener("pointercancel", soltar);

  /* ---------- Entrada ---------- */
  function entrar() {
    deck.classList.add("is-live");
    colocar(0);
    reiniciarKenBurns();

    if (!suave()) { iniciarDerivas(); return; }

    // La entrada anima las tarjetas que de verdad se ven: la frontal, la
    // media y la del fondo. Si la baraja tiene más, las demás ya están
    // colocadas en espera e invisibles, así que no entran; y si tiene menos,
    // solo se anima lo que existe. El movimiento de cada una es el mismo.
    const ENTRADAS = [
      { y: 70, z: -150, rotationY: -9, scale: 0.84, autoAlpha: 0, duration: 1.1 },
      { x: 120, y: 20, z: -200, rotationZ: 12, autoAlpha: 0, duration: 1 },
      { x: -120, y: -30, z: -250, rotationZ: -12, autoAlpha: 0, duration: 1 },
    ];
    const SOLAPES = [undefined, "-=0.8", "-=0.85"];
    const visibles = Math.min(ENTRADAS.length, slots.length);
    const linea = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: iniciarDerivas });
    for (let ranura = 0; ranura < visibles; ranura += 1) {
      const slot = slots[(frontal + ranura) % slots.length];
      linea.from(slot, ENTRADAS[ranura], SOLAPES[ranura]);
    }
    linea
      // La copia entra con OPACIDAD, nunca con autoAlpha: `autoAlpha` aplica
      // visibility:hidden y durante la entrada el CTA dejaría de ser
      // enfocable y de existir para un lector de pantalla.
      .from(".gb-hero-copy > *", { y: 20, opacity: 0, stagger: 0.07, duration: 0.5, clearProps: "opacity,transform" }, "-=0.3");
  }

  /* ---------- Ciclo de vida: nada corre fuera de pantalla ni en segundo plano ---------- */
  const onVisibilidad = () => (document.hidden || !vivo ? congelar() : descongelar());
  document.addEventListener("visibilitychange", onVisibilidad);

  let arrancado = false;
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([e]) => {
        vivo = e.isIntersecting;
        if (vivo && !arrancado) { arrancado = true; entrar(); }
        if (vivo && !document.hidden) descongelar(); else congelar();
      },
      { threshold: 0.15 }
    );
    io.observe(deck);
  } else {
    vivo = true; arrancado = true; entrar(); arrancarAutoplay();
  }

  // Si cambia el ancho, los desplazamientos laterales se recalculan
  let resize;
  window.addEventListener("resize", () => {
    clearTimeout(resize);
    resize = setTimeout(() => colocar(0.3), 180);
  });

  return { avanzar, destruir: () => { pararAutoplay(); if (kenBurns) kenBurns.kill(); derivas.forEach((t) => t.kill()); } };
}

/* ===============================================================
   Barra inferior: marcador deslizante y respuesta táctil.
   Vive en este mismo módulo — no hay un segundo motor de animación.
   =============================================================== */
export function initNav(nav) {
  const gsap = window.gsap;
  const marker = nav.querySelector(".gb-tab-marker");
  const tabs = [...nav.querySelectorAll(".gb-tab")];
  const fab = nav.querySelector(".gb-fab");
  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Coloca el filete dorado bajo la pestaña activa. Es transform puro, así
  // que no provoca recálculo de diseño.
  function moverMarcador(instantaneo) {
    if (!marker) return;
    const activa = tabs.find((t) => t.classList.contains("active"));
    if (!activa) { marker.style.opacity = "0"; return; }
    const r = activa.getBoundingClientRect();
    const base = nav.getBoundingClientRect();
    // El bloque contenedor de un absoluto es la caja de RELLENO de la barra,
    // que empieza donde acaba el borde: el padding NO desplaza ese origen.
    const x = r.left - base.left + r.width / 2 - marker.offsetWidth / 2;
    if (instantaneo || menosMovimiento.matches) {
      marker.style.transition = "none";
      marker.style.transform = `translateX(${x}px)`;
      marker.style.opacity = "1";
      // Se fuerza el reflujo una sola vez para que la transición vuelva luego
      void marker.offsetWidth;
      marker.style.transition = "";
    } else {
      marker.style.transform = `translateX(${x}px)`;
      marker.style.opacity = "1";
    }
  }

  // El scroll-spy de cliente.js cambia la clase .active; aquí solo se observa.
  const observador = new MutationObserver(() => moverMarcador(false));
  tabs.forEach((t) => observador.observe(t, { attributes: true, attributeFilter: ["class"] }));
  requestAnimationFrame(() => moverMarcador(true));

  let recolocar;
  const onResize = () => { clearTimeout(recolocar); recolocar = setTimeout(() => moverMarcador(true), 160); };
  window.addEventListener("resize", onResize);

  // Compresión y recuperación del botón central. Corta y elegante: 90 ms de
  // bajada, 260 ms de vuelta con elasticidad mínima. Sin GSAP, el :active
  // del CSS ya da el mismo gesto.
  if (fab && gsap && !menosMovimiento.matches) {
    const reposo = -20;
    const anim = (y, escala, dur, ease) =>
      gsap.to(fab, { y, scale: escala, duration: dur, ease, overwrite: "auto" });
    gsap.set(fab, { y: reposo });
    fab.addEventListener("pointerdown", () => anim(reposo + 3, 0.955, 0.09, "power2.out"));
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      fab.addEventListener(ev, () => anim(reposo, 1, 0.26, "power3.out"))
    );
  }

  return { destruir: () => { observador.disconnect(); window.removeEventListener("resize", onResize); } };
}

/* ===============================================================
   Servicios: respuesta física al tocar una pieza.
   =============================================================== */
export function initServices(root) {
  const gsap = window.gsap;
  const piezas = [...root.querySelectorAll(".gb-svc")];
  if (!piezas.length) return null;
  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!gsap || menosMovimiento.matches) return null;

  const quitar = [];
  piezas.forEach((pieza) => {
    const abajo = () => gsap.to(pieza, { scale: 0.982, duration: 0.1, ease: "power2.out", overwrite: "auto" });
    const arriba = () => gsap.to(pieza, { scale: 1, duration: 0.3, ease: "power3.out", overwrite: "auto" });
    pieza.addEventListener("pointerdown", abajo);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => pieza.addEventListener(ev, arriba));
    quitar.push(() => {
      pieza.removeEventListener("pointerdown", abajo);
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => pieza.removeEventListener(ev, arriba));
      gsap.set(pieza, { clearProps: "transform" });
    });
  });
  return { destruir: () => quitar.forEach((f) => f()) };
}

/* ===============================================================
   Hoja de detalle: entra desde abajo y sale por donde vino.
   Devuelve promesas para que quien la cierra pueda esperar al final.
   =============================================================== */
export function sheetIn(host) {
  const gsap = window.gsap;
  const hoja = host.querySelector(".gb-sheet");
  const fondo = host.querySelector(".gb-sheet-backdrop");
  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!gsap || menosMovimiento.matches || !hoja) return;
  gsap.fromTo(fondo, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: "power2.out" });
  gsap.fromTo(hoja, { yPercent: 100 }, { yPercent: 0, duration: 0.52, ease: "power3.out" });
  gsap.fromTo(
    hoja.querySelectorAll(".gb-sheet-mark, .gb-sheet-shot, .gb-sheet-body > *, .gb-sheet-foot"),
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.42, stagger: 0.05, ease: "power3.out", delay: 0.12, clearProps: "opacity,transform" }
  );
}

export function sheetOut(host) {
  const gsap = window.gsap;
  const hoja = host.querySelector(".gb-sheet");
  const fondo = host.querySelector(".gb-sheet-backdrop");
  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!gsap || menosMovimiento.matches || !hoja) return Promise.resolve();
  return new Promise((listo) => {
    gsap.to(fondo, { opacity: 0, duration: 0.26, ease: "power2.in" });
    gsap.to(hoja, { yPercent: 100, duration: 0.34, ease: "power3.in", onComplete: listo });
  });
}

/* ===============================================================
   PASO 6 — Piezas que usa el flujo de reserva.
   Viven aquí, en el único motor de animación de la experiencia
   pública: /reservar/ no trae uno propio. Igual que el resto del
   archivo, sin GSAP o con "reduced motion" todas se vuelven un no-op
   y la interfaz queda quieta pero completa.
   =============================================================== */

function sinMovimiento() {
  return !window.gsap || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Entrada de un paso. `dir` es +1 al avanzar y -1 al retroceder, así que
// el contenido entra por el lado del que viene y el gesto se lee solo.
export function stepIn(zona, dir = 1) {
  if (!zona || sinMovimiento()) return;
  const gsap = window.gsap;
  const piezas = zona.querySelectorAll("[data-rv-in]");
  gsap.killTweensOf(zona);
  gsap.fromTo(
    zona,
    { x: 26 * dir, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.3, ease: "power3.out", clearProps: "opacity,transform" }
  );
  if (piezas.length) {
    gsap.killTweensOf(piezas);
    gsap.fromTo(
      piezas,
      { y: 14, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.36, stagger: 0.045, ease: "power3.out", delay: 0.06,
        // opacity, nunca autoAlpha: autoAlpha aplica visibility:hidden y
        // dejaría el contenido fuera del teclado y del lector de pantalla.
        clearProps: "opacity,transform",
      }
    );
  }
}

// Realimentación táctil inmediata para cualquier elemento seleccionable.
// Devuelve la función para soltar los escuchas cuando se repinta el paso.
export function press(raiz, selector = "[data-press]") {
  const gsap = window.gsap;
  const piezas = [...raiz.querySelectorAll(selector)];
  if (!piezas.length || sinMovimiento()) return null;
  const quitar = [];
  piezas.forEach((pieza) => {
    const abajo = () => gsap.to(pieza, { scale: 0.978, duration: 0.09, ease: "power2.out", overwrite: "auto" });
    const arriba = () => gsap.to(pieza, { scale: 1, duration: 0.28, ease: "power3.out", overwrite: "auto" });
    pieza.addEventListener("pointerdown", abajo);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => pieza.addEventListener(ev, arriba));
    quitar.push(() => {
      pieza.removeEventListener("pointerdown", abajo);
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => pieza.removeEventListener(ev, arriba));
      gsap.set(pieza, { clearProps: "transform" });
    });
  });
  return { destruir: () => quitar.forEach((f) => f()) };
}

// La barra de progreso viaja hasta el porcentaje pedido. Se anima scaleX y no
// width: width recalcula el diseño en cada fotograma, scaleX solo compone.
// Sin GSAP el CSS ya la deja en su sitio con una transición propia.
export function railTo(barra, pct) {
  if (!barra) return;
  const escala = Math.max(0, Math.min(1, pct / 100));
  if (sinMovimiento()) {
    barra.style.transform = `scaleX(${escala})`;
    return;
  }
  window.gsap.to(barra, { scaleX: escala, duration: 0.46, ease: "power3.out", overwrite: "auto" });
}

// Remate de la confirmación: la palomita aparece cuando la reserva ya
// existe de verdad, nunca antes.
export function confirmPop(zona) {
  if (!zona || sinMovimiento()) return;
  const gsap = window.gsap;
  const sello = zona.querySelector("[data-rv-seal]");
  if (sello) {
    gsap.fromTo(sello, { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.8)", clearProps: "opacity,transform" });
  }
  gsap.fromTo(
    zona.querySelectorAll("[data-rv-in]"),
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: "power3.out", delay: 0.14, clearProps: "opacity,transform" }
  );
}
