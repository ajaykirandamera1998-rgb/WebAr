/* ==========================================================================
   dialogue-animator.js
   --------------------------------------------------------------------------
   Turns a caption string into individually-animated "comic caption" words
   floating above the AR video, instead of one static text block.

   Each word:
     - is drawn onto its own canvas (bold comic font, thick outline) and
       used as a Three.js texture on a small plane
     - "punches in" with an elastic overshoot scale + a slight random
       rotation that settles to level (classic comic-panel pop)
     - staggers in word-by-word rather than all appearing at once
     - gently bobs while visible so it doesn't sit dead-static
     - punches back out fast when the target is lost

   Usage from your page:
     window.playDialogue("Some caption text");
     window.hideDialogue();
   ========================================================================== */

(function () {
  const ANCHOR_SELECTOR = '#dialogue-anchor';
  const FONT = '700 160px KalamBold, sans-serif';
  const TEXT_COLOR = '#241A14';
  const STROKE_COLOR = '#F7EFD9';
  const WORD_GAP = 0.045;      // spacing between word planes, in meters
  const WORD_SCALE = 0.011;    // canvas px -> AR meters
  const POP_STAGGER = 0.09;    // seconds between each word popping in
  const POP_DURATION = 0.45;

  let currentWords = [];       // active a-entity elements
  let sceneEl = null;
  let anchorEl = null;
  let fontReady = false;

  // Wait for the custom font to actually finish loading before we ever
  // draw canvas text with it (see index.html's #font-preload trick).
  if (document.fonts && document.fonts.load) {
    document.fonts.load(FONT).then(() => { fontReady = true; }).catch(() => {
      fontReady = true; // fall back silently rather than block forever
    });
  } else {
    fontReady = true;
  }

  function getAnchor() {
    if (!anchorEl) anchorEl = document.querySelector(ANCHOR_SELECTOR);
    return anchorEl;
  }

  // ------------------------------------------------------------------------
  // Build a single word into a canvas -> texture -> a-entity plane
  // ------------------------------------------------------------------------
  function buildWordEntity(word) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = FONT;

    const metrics = ctx.measureText(word);
    const paddingX = 40;
    const paddingY = 50;
    canvas.width = Math.ceil(metrics.width) + paddingX * 2;
    canvas.height = 200;

    // re-set font after resize (canvas resize clears context state)
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // thick outline + fill, comic-caption style
    ctx.lineWidth = 14;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.strokeText(word, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(word, canvas.width / 2, canvas.height / 2);

    const texture = new AFRAME.THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const planeWidth = canvas.width * WORD_SCALE;
    const planeHeight = canvas.height * WORD_SCALE;

    const entity = document.createElement('a-entity');
    entity.setAttribute('geometry', {
      primitive: 'plane',
      width: planeWidth,
      height: planeHeight
    });
    entity.setAttribute('material', {
      shader: 'flat',
      transparent: true,
      side: 'double',
      depthTest: false
    });

    // Wait for the mesh to exist, then attach our canvas texture directly
    // (a-frame's material component fights with raw THREE textures
    // otherwise).
    entity.addEventListener('loaded', () => {
      const mesh = entity.getObject3D('mesh');
      if (mesh) {
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
        mesh.renderOrder = 1000;
      }
    });

    return { entity, width: planeWidth };
  }

  // ------------------------------------------------------------------------
  // Public: play a caption, word by word
  // ------------------------------------------------------------------------
  window.playDialogue = function (caption) {
    const anchor = getAnchor();
    if (!anchor || !caption) return;

    window.hideDialogue(true); // clear any previous words instantly

    const words = caption.trim().split(/\s+/);

    const build = () => {
      // First pass: create entities and measure total row width so we can
      // center the whole caption, not just left-align it.
      const built = words.map(buildWordEntity);
      const totalWidth =
        built.reduce((sum, w) => sum + w.width, 0) +
        WORD_GAP * (built.length - 1);

      let cursorX = -totalWidth / 2;

      built.forEach(({ entity, width }) => {
        const centerX = cursorX + width / 2;
        cursorX += width + WORD_GAP;

        entity.setAttribute('position', `${centerX} 0 0`);
        anchor.appendChild(entity);
        currentWords.push(entity);

        // Start invisible/collapsed
        entity.object3D.scale.set(0.001, 0.001, 0.001);
        entity.object3D.rotation.z = (Math.random() - 0.5) * 0.6; // slight tilt
      });

      // Second pass: animate each word in, staggered.
      built.forEach(({ entity }, i) => {
        gsap.to(entity.object3D.scale, {
          x: 1,
          y: 1,
          z: 1,
          duration: POP_DURATION,
          delay: i * POP_STAGGER,
          ease: 'elastic.out(1, 0.55)'
        });
        gsap.to(entity.object3D.rotation, {
          z: 0,
          duration: POP_DURATION + 0.15,
          delay: i * POP_STAGGER,
          ease: 'elastic.out(1, 0.6)'
        });

        // gentle idle bob so it never looks frozen once settled
        gsap.to(entity.object3D.position, {
          y: '+=0.025',
          duration: 1.1 + Math.random() * 0.4,
          delay: i * POP_STAGGER + POP_DURATION,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      });
    };

    if (fontReady) {
      build();
    } else {
      // safety fallback: don't wait forever on a slow font load
      setTimeout(build, 150);
    }
  };

  // ------------------------------------------------------------------------
  // Public: hide/clear current caption
  // ------------------------------------------------------------------------
  window.hideDialogue = function (instant) {
    if (!currentWords.length) return;

    if (instant) {
      currentWords.forEach((el) => el.remove());
      currentWords = [];
      return;
    }

    const toRemove = currentWords;
    currentWords = [];

    toRemove.forEach((entity, i) => {
      gsap.to(entity.object3D.scale, {
        x: 0.001,
        y: 0.001,
        z: 0.001,
        duration: 0.2,
        delay: i * 0.03,
        ease: 'back.in(2)',
        onComplete: () => entity.remove()
      });
    });
  };
})();
