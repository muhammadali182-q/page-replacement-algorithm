// Enhanced Page Replacement Visualizer with step controls and animations.

(() => {
  // DOM
  const pagesInput = document.getElementById("pages");
  const framesInput = document.getElementById("frames");
  const algoSelect = document.getElementById("algorithm");
  const simulateBtn = document.getElementById("simulateBtn");
  const stepBackBtn = document.getElementById("stepBackBtn");
  const stepForwardBtn = document.getElementById("stepForwardBtn");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const resetBtn = document.getElementById("resetBtn");
  const clearBtn = document.getElementById("clearBtn");
  const speedInput = document.getElementById("speed");
  const speedLabel = document.getElementById("speedLabel");
  const preset = document.getElementById("preset");

  const framesArea = document.getElementById("framesArea");
  const incomingTile = document.getElementById("incomingTile");
  const timeline = document.getElementById("timeline");
  const totalStepsEl = document.getElementById("totalSteps");
  const faultsCountEl = document.getElementById("faultsCount");
  const hitsCountEl = document.getElementById("hitsCount");

  // State
  let steps = []; // computed timeline
  let current = -1;
  let playing = false;
  let timer = null;
  let animationLayer = null;

  // Helpers
  function parsePages(input) {
    if (!input) return [];
    // split on spaces, commas, semicolons
    return input.trim().split(/[\s,;]+/).map(s => {
      const n = Number(s);
      return Number.isNaN(n) ? s : n;
    });
  }

  function clampFrames(val) {
    const n = Math.floor(Number(val) || 0);
    return Math.max(1, n);
  }

  // Algorithm implementations: produce step objects
  function computeSteps(pages, frameCount, algo) {
    const memory = []; // holds page values
    const meta = {}; // for LRU timestamps, FIFO queue, etc.
    meta.fifoQueue = [];
    meta.lastUsed = new Map(); // page -> lastSeenIndex
    const result = [];
    let faults = 0, hits = 0;

    pages.forEach((page, i) => {
      const cloneMemory = () => memory.slice();
      const inMem = memory.includes(page);
      if (inMem) {
        hits++;
        meta.lastUsed.set(page, i);
        result.push({
          index: i,
          page,
          memory: cloneMemory(),
          hit: true,
          replacedIndex: -1,
          info: `Hit`
        });
        return;
      }
      // Page fault
      faults++;
      // if there is empty slot
      if (memory.length < frameCount) {
        memory.push(page);
        meta.fifoQueue.push(page);
        meta.lastUsed.set(page, i);
        result.push({
          index: i,
          page,
          memory: cloneMemory(),
          hit: false,
          replacedIndex: memory.length - 1,
          info: `Placed into free slot`
        });
        return;
      }

      // Need replacement
      let replaceIndex = 0;
      if (algo === "fifo") {
        // FIFO: remove oldest enqueued page
        const old = meta.fifoQueue.shift();
        replaceIndex = memory.indexOf(old);
        // replace at index
        memory.splice(replaceIndex, 1, page);
        meta.fifoQueue.push(page);
        meta.lastUsed.set(page, i);
        meta.lastUsed.delete(old);
        result.push({
          index: i,
          page,
          memory: cloneMemory(),
          hit: false,
          replacedIndex: replaceIndex,
          info: `FIFO replaced ${old}`
        });
      } else if (algo === "lru") {
        // find page with smallest lastUsed (oldest)
        let oldestPage = null, oldestIndex = Infinity;
        for (const p of memory) {
          const last = meta.lastUsed.has(p) ? meta.lastUsed.get(p) : -1;
          if (last < oldestIndex) {
            oldestIndex = last;
            oldestPage = p;
          }
        }
        replaceIndex = memory.indexOf(oldestPage);
        memory.splice(replaceIndex, 1, page);
        meta.lastUsed.delete(oldestPage);
        meta.lastUsed.set(page, i);
        // update FIFO queue to preserve order for FIFO mode if switched later
        const qidx = meta.fifoQueue.indexOf(oldestPage);
        if (qidx !== -1) meta.fifoQueue.splice(qidx, 1, page);
        result.push({
          index: i,
          page,
          memory: cloneMemory(),
          hit: false,
          replacedIndex: replaceIndex,
          info: `LRU replaced ${oldestPage}`
        });
      } else if (algo === "optimal") {
        // For each page in memory, look ahead to next occurrence
        const future = pages.slice(i + 1);
        let farthest = -1, victim = null;
        memory.forEach(m => {
          const nextUse = future.indexOf(m);
          if (nextUse === -1) {
            // not used again -> best victim
            victim = m;
            farthest = Infinity;
            return;
          }
          if (nextUse > farthest) {
            farthest = nextUse;
            victim = m;
          }
        });
        replaceIndex = memory.indexOf(victim);
        memory.splice(replaceIndex, 1, page);
        // update meta structures
        meta.lastUsed.delete(victim);
        meta.lastUsed.set(page, i);
        const qidx = meta.fifoQueue.indexOf(victim);
        if (qidx !== -1) meta.fifoQueue.splice(qidx, 1, page);
        result.push({
          index: i,
          page,
          memory: cloneMemory(),
          hit: false,
          replacedIndex: replaceIndex,
          info: `Optimal replaced ${victim}`
        });
      }
    });

    // annotate totals (optional)
    return { steps: result, totals: { faults, hits: hits } };
  }

  // Rendering / UI wiring
  function clearVisualization() {
    framesArea.innerHTML = "";
    timeline.innerHTML = "";
    incomingTile.classList.add("hidden");
    totalStepsEl.innerText = "0";
    faultsCountEl.innerText = "0";
    hitsCountEl.innerText = "0";
    steps = [];
    current = -1;
    stopPlaying();
  }

  function buildFrameSlots(n) {
    framesArea.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.className = "slot";
      s.dataset.index = i;
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.innerText = "—";
      s.appendChild(ph);
      framesArea.appendChild(s);
    }
  }

  function renderTimeline(stepsArr) {
    timeline.innerHTML = "";
    stepsArr.forEach((st, idx) => {
      const card = document.createElement("div");
      card.className = "stepCard";
      card.dataset.step = idx;
      const top = document.createElement("div");
      top.className = "stepRow";
      const label = document.createElement("div");
      label.innerHTML = `<strong>#${st.index}</strong> page ${st.page}`;
      const badge = document.createElement("div");
      badge.className = "badge " + (st.hit ? "hit" : "fault");
      badge.innerText = st.hit ? "HIT" : "FAULT";
      top.appendChild(label);
      top.appendChild(badge);

      const framesSmall = document.createElement("div");
      framesSmall.className = "smallFrames";
      st.memory.forEach(m => {
        const b = document.createElement("div");
        b.style.padding = "6px 8px";
        b.style.borderRadius = "6px";
        b.style.background = "#f1f5f9";
        b.style.fontWeight = "700";
        b.innerText = m;
        framesSmall.appendChild(b);
      });

      const info = document.createElement("div");
      info.style.color = "#6b7280";
      info.style.fontSize = "12px";
      info.innerText = st.info || "";

      card.appendChild(top);
      card.appendChild(framesSmall);
      card.appendChild(info);

      card.addEventListener("click", () => {
        goToStep(idx);
      });

      timeline.appendChild(card);
    });
  }

  // Animations: create a drop tile that moves to a target slot
  function animateDropToSlot(value, slotEl, isHit, replacedIndex, callback) {
    // position global animationLayer relative to document
    if (!animationLayer) {
      animationLayer = document.createElement("div");
      animationLayer.style.position = "fixed";
      animationLayer.style.left = 0;
      animationLayer.style.top = 0;
      animationLayer.style.width = "100%";
      animationLayer.style.height = "100%";
      animationLayer.style.pointerEvents = "none";
      document.body.appendChild(animationLayer);
    }

    // get starting position from incomingTile
    const fromRect = incomingTile.getBoundingClientRect();
    const toRect = slotEl.getBoundingClientRect();

    const tile = document.createElement("div");
    tile.className = "drop";
    tile.innerText = value;
    tile.style.left = (fromRect.left + fromRect.width / 2 - 32) + "px";
    tile.style.top = (fromRect.top + fromRect.height / 2 - 32) + "px";
    animationLayer.appendChild(tile);

    // force layout to ensure transitions
    tile.getBoundingClientRect();

    // target transform
    const deltaX = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
    const deltaY = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);

    tile.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1)`;
    tile.style.transition = `transform ${speedInput.value}ms cubic-bezier(.2,.9,.3,1), opacity 120ms linear`;

    // apply highlight to slot
    slotEl.classList.remove("hit", "fault", "replaced");
    if (isHit) slotEl.classList.add("hit");
    else slotEl.classList.add("fault");

    // after animation completes, set final value in slot
    setTimeout(() => {
      // cleanup drop tile
      tile.style.opacity = "0";
      setTimeout(() => {
        tile.remove();
        if (replacedIndex !== -1) {
          // animate replacement pulse
          slotEl.classList.add("replaced");
          setTimeout(() => slotEl.classList.remove("replaced"), 800);
        }
        callback && callback();
      }, 150);
    }, Number(speedInput.value) + 40);
  }

  // Apply step: animate and update DOM
  function applyStep(idx, animated = true) {
    if (idx < 0 || idx >= steps.length) return;
    const st = steps[idx];
    current = idx;

    // update stats
    totalStepsEl.innerText = steps.length;
    const faults = steps.slice(0, idx + 1).filter(s => !s.hit).length;
    const hits = (idx + 1) - faults;
    faultsCountEl.innerText = faults;
    hitsCountEl.innerText = hits;

    // update incoming tile
    incomingTile.innerText = st.page;
    incomingTile.classList.remove("hidden");

    // ensure frame slots exist for the configured count
    const slotEls = Array.from(framesArea.querySelectorAll(".slot"));

    // if animated -> find the slot to drop into
    const targetIdx = st.replacedIndex !== -1 ? st.replacedIndex : (st.memory.length - 1);
    const slotEl = slotEls[targetIdx];

    // create callback to update slot contents after animation
    const finish = () => {
      // update all slots to match memory (after animation)
      slotEls.forEach((slot, i) => {
        slot.classList.remove("hit", "fault");
        slot.innerHTML = "";
        if (i < st.memory.length) {
          const v = st.memory[i];
          const vdiv = document.createElement("div");
          vdiv.className = "value";
          vdiv.innerText = v;
          slot.appendChild(vdiv);
        } else {
          const ph = document.createElement("div");
          ph.className = "placeholder";
          ph.innerText = "—";
          slot.appendChild(ph);
        }
      });

      // highlight the timeline card
      Array.from(timeline.children).forEach((c, cc) => {
        c.style.outline = "";
        c.style.transform = "";
      });
      const card = timeline.children[idx];
      if (card) {
        card.style.outline = "2px solid rgba(34,37,41,0.06)";
        card.style.transform = "translateY(-4px)";
        // scroll timeline into view
        card.scrollIntoView({behavior: "smooth", inline: "center"});
      }
    };

    if (animated && slotEl) {
      animateDropToSlot(st.page, slotEl, st.hit, st.replacedIndex, finish);
    } else {
      finish();
    }
  }

  // step controls
  function goToStep(i) {
    if (i < 0) i = 0;
    if (i >= steps.length) i = steps.length - 1;
    applyStep(i, true);
  }

  function nextStep() {
    if (current < steps.length - 1) {
      goToStep(current + 1);
    } else {
      stopPlaying();
    }
  }
  function prevStep() {
    if (current > 0) {
      goToStep(current - 1);
    }
  }

  function playToggle() {
    if (playing) stopPlaying();
    else startPlaying();
  }
  function startPlaying() {
    if (!steps.length) return;
    playing = true;
    playPauseBtn.innerText = "Pause";
    timer = setInterval(() => {
      const prev = current;
      nextStep();
      // if stuck (no progress), stop
      if (current === prev) stopPlaying();
    }, Math.max(120, Number(speedInput.value)));
  }
  function stopPlaying() {
    playing = false;
    playPauseBtn.innerText = "Play";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function resetToInitial() {
    if (!steps.length) return;
    current = -1;
    // clear frames visuals
    Array.from(framesArea.querySelectorAll(".slot")).forEach((s) => {
      s.classList.remove("hit","fault","replaced");
      s.innerHTML = "";
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.innerText = "—";
      s.appendChild(ph);
    });
    incomingTile.classList.add("hidden");
    faultsCountEl.innerText = "0";
    hitsCountEl.innerText = "0";
    stopPlaying();
  }

  // Wiring events
  simulateBtn.addEventListener("click", () => {
    stopPlaying();
    const pages = parsePages(pagesInput.value);
    if (!pages.length) {
      alert("Please enter a series of pages (e.g. 7 0 1 2 0 3 0 4)");
      return;
    }
    const frameCount = clampFrames(framesInput.value);
    framesInput.value = frameCount;
    buildFrameSlots(frameCount);
    const algo = algoSelect.value;
    const res = computeSteps(pages, frameCount, algo);
    steps = res.steps;
    renderTimeline(steps);
    totalStepsEl.innerText = steps.length;
    faultsCountEl.innerText = 0;
    hitsCountEl.innerText = 0;
    current = -1;
    // apply first step automatically (animated)
    if (steps.length) {
      goToStep(0);
    }
  });

  stepForwardBtn.addEventListener("click", () => {
    stopPlaying();
    nextStep();
  });

  stepBackBtn.addEventListener("click", () => {
    stopPlaying();
    prevStep();
  });

  playPauseBtn.addEventListener("click", () => {
    playToggle();
  });

  resetBtn.addEventListener("click", () => {
    stopPlaying();
    resetToInitial();
  });

  clearBtn.addEventListener("click", () => {
    stopPlaying();
    pagesInput.value = "";
    framesInput.value = 3;
    algoSelect.value = "fifo";
    clearVisualization();
    buildFrameSlots(3);
  });

  speedInput.addEventListener("input", () => {
    speedLabel.innerText = `${speedInput.value}ms`;
  });

  preset.addEventListener("change", () => {
    const v = preset.value;
    if (!v) return;
    const [p, f] = v.split("|");
    pagesInput.value = p;
    framesInput.value = f || framesInput.value;
  });

  // initialize
  (function init() {
    speedLabel.innerText = `${speedInput.value}ms`;
    buildFrameSlots(clampFrames(framesInput.value || 3));
    // small helpful default
    pagesInput.placeholder = "e.g. 7 0 1 2 0 3 0 4";
  })();

  // expose some functions for debugging (global)
  window.prVisualizer = {
    computeSteps, goToStep, applyStep, stopPlaying, startPlaying, resetToInitial
  };
})();
