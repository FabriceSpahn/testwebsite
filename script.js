window.addEventListener("DOMContentLoaded", () => {
  const isEmbedded = window.self !== window.top;

  if (isEmbedded) {
    document.documentElement.classList.add("is-embedded");
    document.body.classList.add("is-embedded");
  }

  const navigation = document.querySelector(".site-nav");
  const viewButtons = Array.from(document.querySelectorAll("[data-view]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  const video = document.getElementById("hero-video");
  const canvas = document.getElementById("hero-raster");
  const mediaFrame = document.querySelector(".hero-media-frame");
  const context = canvas?.getContext("2d");
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const cursorPill = document.querySelector("[data-cursor-pill]");
  const cursorExpression = document.querySelector("[data-cursor-expression]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let activeView = "home";
  let isReady = false;
  let hasDrawnFrame = false;
  let fallbackApplied = false;
  let frameCallbackId = 0;
  let animationFrameId = 0;
  let cursorPillFrameId = 0;
  let cursorPillLastTime = 0;
  let cursorPillExpressionTimeoutId = 0;
  let ripples = [];
  const cursorPillPosition = {
    currentX: -120,
    currentY: -120,
    targetX: -120,
    targetY: -120,
    active: false,
    initialized: false,
  };

  function animateCursorPill(time) {
    cursorPillFrameId = 0;

    if (!cursorPill) {
      return;
    }

    const deltaTime = cursorPillLastTime ? Math.min(64, time - cursorPillLastTime) : 16;
    const easing = prefersReducedMotion.matches
      ? 1
      : 1 - Math.pow(0.0008, deltaTime / 1000);
    cursorPillLastTime = time;
    cursorPillPosition.currentX +=
      (cursorPillPosition.targetX - cursorPillPosition.currentX) * easing;
    cursorPillPosition.currentY +=
      (cursorPillPosition.targetY - cursorPillPosition.currentY) * easing;
    cursorPill.style.transform = `translate3d(${cursorPillPosition.currentX}px, ${cursorPillPosition.currentY}px, 0)`;

    const remainingDistance = Math.hypot(
      cursorPillPosition.targetX - cursorPillPosition.currentX,
      cursorPillPosition.targetY - cursorPillPosition.currentY,
    );

    if (cursorPillPosition.active && remainingDistance > 0.1) {
      cursorPillFrameId = window.requestAnimationFrame(animateCursorPill);
    }
  }

  function moveCursorPill(event) {
    if (!cursorPill || activeView !== "home") {
      return;
    }

    const offset = 18;
    const pillWidth = cursorPill.offsetWidth;
    const pillHeight = cursorPill.offsetHeight;
    cursorPillPosition.targetX =
      event.clientX + offset + pillWidth > window.innerWidth
        ? event.clientX - pillWidth - offset
        : event.clientX + offset;
    cursorPillPosition.targetY =
      event.clientY + offset + pillHeight > window.innerHeight
        ? event.clientY - pillHeight - offset
        : event.clientY + offset;

    if (!cursorPillPosition.initialized) {
      cursorPillPosition.currentX = cursorPillPosition.targetX;
      cursorPillPosition.currentY = cursorPillPosition.targetY;
      cursorPillPosition.initialized = true;
    }

    cursorPillPosition.active = true;
    cursorPill.classList.add("is-visible");

    if (!cursorPillFrameId) {
      cursorPillFrameId = window.requestAnimationFrame(animateCursorPill);
    }
  }

  function hideCursorPill() {
    cursorPillPosition.active = false;
    cursorPill?.classList.remove("is-visible");
  }

  function toggleCursorExpression() {
    if (!cursorExpression || activeView !== "home") {
      return;
    }

    window.clearTimeout(cursorPillExpressionTimeoutId);
    cursorExpression.textContent = ":-D";
    cursorPillExpressionTimeoutId = window.setTimeout(() => {
      cursorExpression.textContent = ":-)";
    }, 620);
  }

  function resetPanelScroll(panel) {
    panel.querySelectorAll(".content-panel__scroller").forEach((scroller) => {
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    });

    const frame = panel.querySelector(".legal-frame");

    if (frame?.contentWindow) {
      try {
        frame.contentWindow.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch {
        // The embedded page is same-origin, but keep panel switching resilient.
      }
    }
  }

  function setView(nextView) {
    activeView = nextView;
    document.body.classList.toggle("is-panel-open", nextView !== "home");

    if (nextView !== "home") {
      hideCursorPill();
    }

    viewButtons.forEach((button) => {
      const isActive = button.dataset.view === nextView;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    panels.forEach((panel) => {
      const isVisible = panel.dataset.panel === nextView;

      if (isVisible) {
        panel.hidden = false;
        resetPanelScroll(panel);
        window.requestAnimationFrame(() => panel.classList.add("is-visible"));
      } else {
        panel.classList.remove("is-visible");
        window.setTimeout(() => {
          if (!panel.classList.contains("is-visible")) {
            panel.hidden = true;
          }
        }, 430);
      }
    });
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view || "home"));
  });

  const copyEmailButtons = Array.from(document.querySelectorAll("[data-copy-email]"));

  async function copyEmail(address) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(address);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = address;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Copying the email address failed.");
    }
  }

  copyEmailButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const address = button.dataset.email;
      const feedback = button.querySelector("[data-copy-feedback]");

      if (!address) {
        return;
      }

      try {
        await copyEmail(address);

        if (feedback) {
          const originalLabel = feedback.textContent;
          feedback.textContent = "Copied";
          window.setTimeout(() => {
            feedback.textContent = originalLabel;
          }, 1800);
        }
      } catch {
        if (feedback) {
          feedback.textContent = "Copy failed";
        }
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeView !== "home") {
      setView("home");
      navigation?.querySelector('[data-view="home"]')?.focus();
    }
  });

  if (!video || !canvas || !mediaFrame || !context || !sampleContext) {
    return;
  }

  function resizeCanvas() {
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const outputWidth = Math.round(width * dpr);
    const outputHeight = Math.round(height * dpr);

    if (canvas.width === outputWidth && canvas.height === outputHeight) {
      return;
    }

    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fitCover(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;

    if (sourceRatio > targetRatio) {
      const drawHeight = targetHeight;
      const drawWidth = drawHeight * sourceRatio;
      return {
        drawWidth,
        drawHeight,
        offsetX: (targetWidth - drawWidth) / 2,
        offsetY: 0,
      };
    }

    const drawWidth = targetWidth;
    const drawHeight = drawWidth / sourceRatio;
    return {
      drawWidth,
      drawHeight,
      offsetX: 0,
      offsetY: (targetHeight - drawHeight) / 2,
    };
  }

  function roundedRect(x, y, width, height, radius, fill) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.roundRect(x, y, width, height, safeRadius);
    context.fillStyle = fill;
    context.fill();
  }

  function smoothstep(edgeStart, edgeEnd, value) {
    const progress = Math.min(1, Math.max(0, (value - edgeStart) / (edgeEnd - edgeStart)));
    return progress * progress * (3 - 2 * progress);
  }

  function drawFrame() {
    if (!isReady || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const targetCellWidth = width < 680 ? 9 : 11;
    const columns = Math.min(180, Math.max(46, Math.ceil(width / targetCellWidth)));
    const gap = 1;
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const cellHeight = cellWidth * 2.08;
    const rows = Math.max(1, Math.ceil((height + gap) / (cellHeight + gap)));
    const now = performance.now();
    const rippleDuration = 1600;

    ripples = ripples.filter((ripple) => now - ripple.startedAt < rippleDuration);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);

    sampleCanvas.width = columns;
    sampleCanvas.height = rows;
    const fit = fitCover(video.videoWidth, video.videoHeight, columns, rows);
    sampleContext.drawImage(video, fit.offsetX, fit.offsetY, fit.drawWidth, fit.drawHeight);
    const pixels = sampleContext.getImageData(0, 0, columns, rows).data;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const pixelIndex = (row * columns + column) * 4;
        const tileX = column * (cellWidth + gap);
        const tileY = row * (cellHeight + gap);
        const red = pixels[pixelIndex];
        const green = pixels[pixelIndex + 1];
        const blue = pixels[pixelIndex + 2];
        const centerX = tileX + cellWidth / 2;
        const centerY = tileY + cellHeight / 2;
        let rippleStrength = 0;

        ripples.forEach((ripple) => {
          const progress = Math.min(1, (now - ripple.startedAt) / rippleDuration);
          const waveProgress = 1 - Math.pow(1 - progress, 2);
          const farthestX = Math.max(ripple.x, width - ripple.x);
          const farthestY = Math.max(ripple.y, height - ripple.y);
          const maxRadius = Math.hypot(farthestX, farthestY);
          const waveRadius = waveProgress * maxRadius;
          const bandWidth = Math.max(38, Math.min(width, height) * 0.06);
          const distance = Math.hypot(centerX - ripple.x, centerY - ripple.y);
          const primaryRing = smoothstep(
            0,
            1,
            Math.max(0, 1 - Math.abs(distance - waveRadius) / bandWidth),
          );
          const secondaryRadius = Math.max(0, waveRadius - bandWidth * 1.8);
          const secondaryRing = smoothstep(
            0,
            1,
            Math.max(0, 1 - Math.abs(distance - secondaryRadius) / (bandWidth * 0.8)),
          );
          const decay = 1 - progress;
          const strength = Math.min(1, (primaryRing * 0.75 + secondaryRing * 0.28) * decay);

          rippleStrength = 1 - (1 - rippleStrength) * (1 - strength);
        });

        const scale = 1 - rippleStrength * 0.78;
        const renderedWidth = cellWidth * scale;
        const renderedHeight = cellHeight * scale;
        const renderedX = centerX - renderedWidth / 2;
        const renderedY = centerY - renderedHeight / 2;

        roundedRect(
          renderedX,
          renderedY,
          renderedWidth,
          renderedHeight,
          1,
          `rgb(${red} ${green} ${blue})`,
        );
      }
    }

    if (fallbackApplied) {
      mediaFrame.classList.remove("has-video-fallback");
      fallbackApplied = false;
    }

    hasDrawnFrame = true;
  }

  function queueVideoFrame() {
    if (typeof video.requestVideoFrameCallback === "function") {
      frameCallbackId = video.requestVideoFrameCallback(() => {
        drawFrame();
        queueVideoFrame();
      });
      return;
    }

    animationFrameId = window.requestAnimationFrame(() => {
      drawFrame();
      queueVideoFrame();
    });
  }

  function startEffect() {
    if (!video.videoWidth || !video.videoHeight) {
      return;
    }

    isReady = true;
    resizeCanvas();
    drawFrame();
  }

  function createRipple(event) {
    if (prefersReducedMotion.matches) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    ripples.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      startedAt: performance.now(),
    });

    if (ripples.length > 5) {
      ripples.shift();
    }

    drawFrame();
  }

  async function bootVideo() {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    try {
      await video.play();
    } catch {
      startEffect();
    }
  }

  video.addEventListener("loadedmetadata", startEffect);
  video.addEventListener("loadeddata", startEffect);
  video.addEventListener("canplay", startEffect);
  video.addEventListener("playing", startEffect);
  video.addEventListener("timeupdate", drawFrame);
  mediaFrame.addEventListener("pointerdown", createRipple);
  mediaFrame.addEventListener("pointerdown", toggleCursorExpression);
  mediaFrame.addEventListener("pointermove", moveCursorPill);
  mediaFrame.addEventListener("pointerenter", moveCursorPill);
  mediaFrame.addEventListener("pointerleave", hideCursorPill);
  window.addEventListener("blur", hideCursorPill);
  window.addEventListener("resize", () => {
    resizeCanvas();
    drawFrame();
  });

  resizeCanvas();
  bootVideo();
  queueVideoFrame();

  window.setTimeout(() => {
    if (!hasDrawnFrame) {
      fallbackApplied = true;
      mediaFrame.classList.add("has-video-fallback");
    }
  }, 2200);

  window.addEventListener("pagehide", () => {
    if (frameCallbackId && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(frameCallbackId);
    }

    window.cancelAnimationFrame(animationFrameId);
    window.cancelAnimationFrame(cursorPillFrameId);
    window.clearTimeout(cursorPillExpressionTimeoutId);
  });
});
