window.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("hero-video");
  const canvas = document.getElementById("hero-raster");
  const mediaFrame = document.querySelector(".hero-media-frame");
  const hero = document.querySelector(".hero");
  const heroTitle = document.getElementById("hero-title");
  const heroTitleMain = heroTitle?.querySelector(".hero-title__main");
  const contactOverlay = document.getElementById("contact-overlay");
  const contactOpeners = Array.from(document.querySelectorAll("[data-contact-open]"));
  const contactClosers = Array.from(document.querySelectorAll("[data-contact-close]"));
  const copyButtons = Array.from(document.querySelectorAll("[data-copy-email]"));
  const hasHeroMedia = Boolean(video && canvas && mediaFrame && hero && heroTitle && heroTitleMain);
  const context = canvas?.getContext("2d") || null;
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = hasHeroMedia
    ? sampleCanvas.getContext("2d", {
        willReadFrequently: true,
      })
    : null;

  const state = {
    columns: 46,
    gap: 1,
    roundness: 1,
    barAspect: 2.08,
    background: "#090909",
  };

  let isReady = false;
  let rafId = 0;
  let frameCallbackId = 0;
  let useVideoFrameCallback = false;
  let hasDrawnFrame = false;
  let fallbackApplied = false;
  let parallaxTicking = false;
  let interactionFrameId = 0;
  let interactionColumns = 0;
  let interactionRows = 0;
  let interactionValues = new Float32Array(0);
  let lastFrameTime = performance.now();

  const pointer = {
    active: false,
    x: 0,
    y: 0,
    releaseAt: 0,
  };

  const scramblePrimaryCharacters = ["·", ",", ".", "~", "-", "'"];
  const scrambleSecondaryCharacters = ["¢", "≠", "‘", "@", "≈", "ß", "œ", "∑"];
  const scrambleAccentColors = ["#E6B900", "#0059C0"];
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrambleObservers = [];
  const scrambleBlankCharacter = "\u00A0";
  const isFirefox = /firefox/i.test(navigator.userAgent);

  if (isFirefox) {
    document.documentElement.classList.add("is-firefox");
  }

  function openContactOverlay() {
    if (!contactOverlay) {
      return;
    }

    contactOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeContactOverlay() {
    if (!contactOverlay) {
      return;
    }

    contactOverlay.hidden = true;
    document.body.style.overflow = "";
  }

  async function copyEmail(button) {
    const email = button.dataset.email || "";

    if (!email) {
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      button.classList.add("contact-item--copied");
      window.setTimeout(() => {
        button.classList.remove("contact-item--copied");
      }, 1200);
    } catch {
      // Ignore clipboard errors silently.
    }
  }

  contactOpeners.forEach((button) => {
    button.addEventListener("click", openContactOverlay);
  });

  contactClosers.forEach((button) => {
    button.addEventListener("click", closeContactOverlay);
  });

  copyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      copyEmail(button);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContactOverlay();
    }
  });

  if (heroTitle && heroTitleMain) {
    buildTitleCharacters();
    updateTitleParallax();
    startTitleAnimation();
    window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
    window.addEventListener("resize", requestParallaxUpdate);
  }

  setupScrambleReveal();

  if (!hasHeroMedia || !context || !sampleContext) {
    return;
  }

  function buildTitleCharacters() {
    const sourceText = heroTitleMain.textContent || "";
    const fragment = document.createDocumentFragment();
    const leadingPad = document.createElement("span");
    const trailingPad = document.createElement("span");

    heroTitle.setAttribute("aria-label", sourceText.trim());
    heroTitleMain.setAttribute("aria-hidden", "true");
    heroTitleMain.textContent = "";
    leadingPad.className = "hero-title__edgepad";
    leadingPad.textContent = "\u00A0";
    trailingPad.className = "hero-title__edgepad";
    trailingPad.textContent = "\u00A0";

    fragment.appendChild(leadingPad);

    Array.from(sourceText).forEach((character, index) => {
      const span = document.createElement("span");
      span.className = "hero-title__char";
      span.style.setProperty("--char-index", String(index));

      if (character === " ") {
        span.classList.add("hero-title__char--space");
        span.textContent = "\u00A0";
      } else {
        span.textContent = character;
      }

      fragment.appendChild(span);
    });

    fragment.appendChild(trailingPad);

    heroTitleMain.appendChild(fragment);
  }

  function startTitleAnimation() {
    heroTitle.classList.add("is-title-ready");
    heroTitle.classList.remove("is-char-animating");
    void heroTitle.offsetWidth;

    window.requestAnimationFrame(() => {
      heroTitle.classList.add("is-char-animating");
    });
  }

  function easeOutQuart(value) {
    return 1 - (1 - value) ** 4;
  }

  function randomCharacter(pool) {
    return pool[Math.floor(Math.random() * pool.length)] || "·";
  }

  function randomScrambleColor() {
    return scrambleAccentColors[Math.floor(Math.random() * scrambleAccentColors.length)] || "#0059C0";
  }

  function escapeHtml(character) {
    return character
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createScrambleState(element) {
    const rawText = element.textContent || "";
    const finalText = element.matches("li") ? `• ${rawText}` : rawText;
    const thresholdBase = finalText.length > 1 ? 0.58 / (finalText.length - 1) : 0;
    const thresholds = Array.from(finalText, (character, index) => {
      if (/\s/u.test(character)) {
        return -1;
      }

      const organicOffset = (Math.sin(index * 1.71) + 1) * 0.028;
      return 0.16 + index * thresholdBase + organicOffset;
    });

    return {
      element,
      finalText,
      thresholds,
      groupDelayIndex: 0,
      rafId: 0,
      started: false,
      completed: false,
    };
  }

  function renderScrambleFrame(state, progress) {
    const eased = easeOutQuart(progress);
    const characterPool =
      eased < 0.22
        ? []
        : eased < 0.56
          ? scramblePrimaryCharacters
          : scramblePrimaryCharacters.concat(scrambleSecondaryCharacters);

    let output = "";

    for (let index = 0; index < state.finalText.length; index += 1) {
      const finalCharacter = state.finalText[index];
      const revealThreshold = state.thresholds[index];

      if (revealThreshold < 0) {
        output += finalCharacter;
        continue;
      }

      if (eased >= revealThreshold) {
        output += escapeHtml(finalCharacter);
        continue;
      }

      if (characterPool.length === 0) {
        output += scrambleBlankCharacter;
        continue;
      }

      const scrambleCharacter = randomCharacter(characterPool);
      output += `<span style="color:${randomScrambleColor()}">${escapeHtml(scrambleCharacter)}</span>`;
    }

    state.element.innerHTML = output;
  }

  function completeScramble(state) {
    state.completed = true;
    state.element.textContent = state.finalText;
  }

  function runScramble(state, duration) {
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      renderScrambleFrame(state, progress);

      if (progress < 1) {
        state.rafId = window.requestAnimationFrame(step);
        return;
      }

      completeScramble(state);
    };

    state.rafId = window.requestAnimationFrame(step);
  }

  function triggerScrambleSection(section) {
    const states = section._scrambleStates || [];

    states.forEach((state, index) => {
      if (state.started) {
        return;
      }

      state.started = true;
      const delayIndex =
        typeof state.groupDelayIndex === "number" ? state.groupDelayIndex : index;

      window.setTimeout(() => {
        if (reducedMotionQuery.matches) {
          completeScramble(state);
          return;
        }

        const duration = 1580 + index * 42;
        runScramble(state, duration);
      }, delayIndex * 130);
    });
  }

  function setupScrambleReveal() {
    const sections = Array.from(document.querySelectorAll(".glow-section"));

    sections.forEach((section) => {
      const lineElements = Array.from(
        section.querySelectorAll("h1, h2, h3, p, li, .table-row span"),
      ).filter((element) => {
        const text = element.textContent || "";
        return text.trim().length > 0;
      });

      const states = lineElements.map(createScrambleState);
      const delayGroups = new Map();
      let nextDelayGroupIndex = 0;

      states.forEach((state) => {
        const row = state.element.closest(".table-row");
        const groupKey = row || state.element;

        if (!delayGroups.has(groupKey)) {
          delayGroups.set(groupKey, nextDelayGroupIndex);
          nextDelayGroupIndex += 1;
        }

        state.groupDelayIndex = delayGroups.get(groupKey) || 0;
      });

      section._scrambleStates = states;

      if (reducedMotionQuery.matches) {
        states.forEach(completeScramble);
        return;
      }

      states.forEach((state) => {
        renderScrambleFrame(state, 0);
      });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            triggerScrambleSection(section);
            observer.unobserve(entry.target);
          });
        },
        {
          threshold: 0.12,
          rootMargin: "0px 0px -6% 0px",
        },
      );

      observer.observe(section);
      scrambleObservers.push(observer);
    });
  }

  function resizeCanvas() {
    const width = Math.round(canvas.clientWidth || 450);
    const height = Math.round(canvas.clientHeight || 450);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
    }
  }

  function fitCover(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;

    let drawWidth;
    let drawHeight;
    let offsetX;
    let offsetY;

    if (sourceRatio > targetRatio) {
      drawHeight = targetHeight;
      drawWidth = drawHeight * sourceRatio;
      offsetX = (targetWidth - drawWidth) / 2;
      offsetY = 0;
    } else {
      drawWidth = targetWidth;
      drawHeight = drawWidth / sourceRatio;
      offsetX = 0;
      offsetY = (targetHeight - drawHeight) / 2;
    }

    return { drawWidth, drawHeight, offsetX, offsetY };
  }

  function roundedRect(x, y, width, height, radius, fill) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  }

  function ensureInteractionGrid(columns, rows) {
    if (interactionColumns === columns && interactionRows === rows) {
      return;
    }

    interactionColumns = columns;
    interactionRows = rows;
    interactionValues = new Float32Array(columns * rows);
  }

  function updateInteractionValues(columns, rows, offsetX, offsetY, cellWidth, cellHeight, gap, deltaTime) {
    ensureInteractionGrid(columns, rows);

    const now = performance.now();
    const releaseHold = now < pointer.releaseAt;
    const radius = Math.max(cellWidth, cellHeight) * 3;
    const radiusSquared = radius * radius;
    const darkenRise = Math.min(1, deltaTime * 11);
    const darkenFade = Math.min(1, deltaTime * 2.6);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const tileX = offsetX + column * (cellWidth + gap);
        const tileY = offsetY + row * (cellHeight + gap);
        const centerX = tileX + cellWidth / 2;
        const centerY = tileY + cellHeight / 2;

        let target = 0;

        if (pointer.active || releaseHold) {
          const dx = pointer.x - centerX;
          const dy = pointer.y - centerY;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < radiusSquared) {
            const normalized = 1 - distanceSquared / radiusSquared;
            target = normalized * normalized;
          }
        }

        const current = interactionValues[index];
        const easing = target > current ? darkenRise : darkenFade;
        interactionValues[index] = current + (target - current) * easing;
      }
    }
  }

  function drawFrame() {
    if (!isReady || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return;
    }

    if (fallbackApplied) {
      mediaFrame.classList.remove("has-video-fallback");
      fallbackApplied = false;
    }

    const width = canvas.clientWidth || 450;
    const height = canvas.clientHeight || 450;
    const columns = width < 360 ? 28 : state.columns;
    const gap = width < 360 ? 2.5 : state.gap;
    const usableWidth = width - gap * (columns - 1);
    const cellWidth = usableWidth / columns;
    const cellHeight = cellWidth * state.barAspect;
    const rows = Math.max(1, Math.floor((height + gap) / (cellHeight + gap)));
    const contentWidth = columns * cellWidth + (columns - 1) * gap;
    const contentHeight = rows * cellHeight + (rows - 1) * gap;
    const offsetX = (width - contentWidth) / 2;
    const offsetY = (height - contentHeight) / 2;
    const now = performance.now();
    const deltaTime = Math.min(0.05, (now - lastFrameTime) / 1000 || 0.016);
    lastFrameTime = now;
    context.clearRect(0, 0, width, height);
    context.fillStyle = state.background;
    context.fillRect(0, 0, width, height);

    sampleCanvas.width = columns;
    sampleCanvas.height = rows;
    sampleContext.clearRect(0, 0, columns, rows);
    const fit = fitCover(video.videoWidth, video.videoHeight, columns, rows);
    sampleContext.drawImage(
      video,
      fit.offsetX,
      fit.offsetY,
      fit.drawWidth,
      fit.drawHeight,
    );

    const pixels = sampleContext.getImageData(0, 0, columns, rows).data;
    updateInteractionValues(columns, rows, offsetX, offsetY, cellWidth, cellHeight, gap, deltaTime);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = (row * columns + column) * 4;
        const interactionIndex = row * columns + column;
        const shrinkAmount = Math.min(0.72, interactionValues[interactionIndex] * 0.72);
        const scale = 1 - shrinkAmount;
        const scaledWidth = cellWidth * scale;
        const scaledHeight = cellHeight * scale;
        const insetX = (cellWidth - scaledWidth) / 2;
        const insetY = (cellHeight - scaledHeight) / 2;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3] / 255;
        const x = offsetX + column * (cellWidth + gap) + insetX;
        const y = offsetY + row * (cellHeight + gap) + insetY;

        roundedRect(
          x,
          y,
          scaledWidth,
          scaledHeight,
          Math.max(0.5, state.roundness * scale),
          `rgba(${red}, ${green}, ${blue}, ${Math.max(alpha, 1)})`,
        );
      }
    }

    hasDrawnFrame = true;
  }

  function applyVideoFallback() {
    if (fallbackApplied) {
      return;
    }

    fallbackApplied = true;
    mediaFrame.classList.add("has-video-fallback");
  }

  function updateTitleParallax() {
    const rect = hero.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const centerOffset = rect.top + rect.height / 2 - viewportHeight / 2;
    const limitedOffset = Math.max(-viewportHeight, Math.min(viewportHeight, centerOffset));
    const translateY = limitedOffset * -0.12;
    heroTitle.style.setProperty("--title-parallax", `${translateY.toFixed(2)}px`);
    parallaxTicking = false;
  }

  function requestParallaxUpdate() {
    if (parallaxTicking) {
      return;
    }

    parallaxTicking = true;
    window.requestAnimationFrame(updateTitleParallax);
  }

  function queueInteractionFrame() {
    if (interactionFrameId) {
      return;
    }

    interactionFrameId = window.requestAnimationFrame(() => {
      interactionFrameId = 0;
      drawFrame();
      if (pointer.active || performance.now() < pointer.releaseAt + 900) {
        queueInteractionFrame();
      }
    });
  }

  function updatePointerPosition(event) {
    const rect = canvas.getBoundingClientRect();

    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
    pointer.releaseAt = 0;
    queueInteractionFrame();
  }

  function releasePointer() {
    pointer.active = false;
    pointer.releaseAt = performance.now() + 140;
    queueInteractionFrame();
  }

  function renderLoop() {
    drawFrame();
    rafId = window.requestAnimationFrame(renderLoop);
  }

  function stopRendering() {
    window.cancelAnimationFrame(rafId);
    rafId = 0;

    if (useVideoFrameCallback && frameCallbackId) {
      video.cancelVideoFrameCallback(frameCallbackId);
      frameCallbackId = 0;
    }
  }

  function queueVideoFrame() {
    if (!useVideoFrameCallback) {
      return;
    }

    frameCallbackId = video.requestVideoFrameCallback(() => {
      drawFrame();
      queueVideoFrame();
    });
  }

  function startRendering() {
    stopRendering();

    if (useVideoFrameCallback) {
      drawFrame();
      queueVideoFrame();
      return;
    }

    renderLoop();
  }

  function startEffect() {
    if (!video.videoWidth || !video.videoHeight) {
      return;
    }

    isReady = true;
    resizeCanvas();
    drawFrame();
    startRendering();
  }

  function primeFirstFrame() {
    if (!video.duration || !Number.isFinite(video.duration)) {
      return;
    }

    if (video.currentTime === 0) {
      try {
        video.currentTime = Math.min(0.001, video.duration);
      } catch {
        // Ignore seek failures and let normal playback continue.
      }
    }
  }

  async function bootVideo() {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.load();

    try {
      await video.play();
    } catch {
      primeFirstFrame();
      startEffect();
    }
  }

  function handlePlaybackState() {
    startEffect();

    if (video.paused || video.ended) {
      stopRendering();
      drawFrame();
      return;
    }

    startRendering();
  }

  useVideoFrameCallback =
    typeof video.requestVideoFrameCallback === "function" &&
    typeof video.cancelVideoFrameCallback === "function";

  video.addEventListener("loadedmetadata", startEffect);
  video.addEventListener("loadeddata", () => {
    primeFirstFrame();
    startEffect();
  });
  video.addEventListener("canplay", startEffect);
  video.addEventListener("canplaythrough", startEffect);
  video.addEventListener("play", handlePlaybackState);
  video.addEventListener("playing", handlePlaybackState);
  video.addEventListener("timeupdate", drawFrame);
  video.addEventListener("seeked", drawFrame);
  video.addEventListener("pause", handlePlaybackState);
  video.addEventListener("ended", handlePlaybackState);
  video.addEventListener("stalled", startEffect);
  video.addEventListener("suspend", startEffect);
  mediaFrame.addEventListener("pointermove", updatePointerPosition);
  mediaFrame.addEventListener("pointerenter", updatePointerPosition);
  mediaFrame.addEventListener("pointerleave", releasePointer);
  window.addEventListener("resize", startEffect);
  resizeCanvas();
  bootVideo();

  if (video.readyState >= 2) {
    startEffect();
  }

  window.setTimeout(() => {
    if (!hasDrawnFrame) {
      applyVideoFallback();
    }
  }, 2200);
});
