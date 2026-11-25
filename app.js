/* mistletoe photobooth — vanilla JS, no build step */
(() => {
  "use strict";
  const C = window.BOOTH_CONFIG;
  const $ = (id) => document.getElementById(id);
  const MARK_MODE = new URLSearchParams(location.search).has("mark");

  // ---------- saved edits (this browser) override config.js ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("booth." + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("booth." + k, JSON.stringify(v)); } catch {} },
  };
  const savedLyrics = store.get("lyrics"), savedTimes = store.get("shotTimes");
  if (Array.isArray(savedLyrics)) C.lyrics = savedLyrics;
  if (savedTimes === "interval") C.shotTimes = null;
  else if (Array.isArray(savedTimes)) C.shotTimes = savedTimes;

  // ---------- filters (preview = CSS, capture = pixel pipeline so every browser matches) ----------
  const FILTERS = [
    { id: "classic", label: "classic b&w", css: "grayscale(1) contrast(1.25) brightness(1.02)", ops: { gray: 1, contrast: 1.25, bright: 1.02, grain: 14 } },
    { id: "soft",    label: "soft gray",   css: "grayscale(1) contrast(.92) brightness(1.06)",  ops: { gray: 1, contrast: 0.92, bright: 1.06, grain: 10 } },
    { id: "noir",    label: "flash noir",  css: "grayscale(1) contrast(1.6) brightness(1.08)",  ops: { gray: 1, contrast: 1.6, bright: 1.08, grain: 18, vignette: 0.35 } },
    { id: "sepia",   label: "sepia film",  css: "sepia(.85) contrast(1.1) brightness(1.03)",   ops: { sepia: 0.85, contrast: 1.1, bright: 1.03, grain: 16 } },
    { id: "color",   label: "color",       css: "saturate(1.1) contrast(1.05)",                ops: { saturate: 1.1, contrast: 1.05, grain: 8 } },
  ];
  let filter = FILTERS[0];

  // ---------- elements ----------
  const video = $("video"), squares = $("squares"), filtersEl = $("filters");
  const startBtn = $("startBtn");
  const countdownEl = $("countdown"), counterEl = $("counter"), flashEl = $("flash");
  const captionEl = $("caption"), barFill = $("barFill"), errorEl = $("error"), placeholder = $("placeholder");
  const boothScene = $("booth"), printScene = $("print"), stripsEl = $("strips"), led = $("led");
  const printActions = $("printActions"), radio = $("radio"), markEl = $("mark"), nowEl = $("nowPlaying");

  // ---------- state ----------
  let stream = null, photos = [], stripCanvases = [], times = [];
  let running = false, raf = 0, shotIdx = 0, musicOn = !!C.music.enabled;

  // ---------- build UI ----------
  for (let i = 0; i < C.shots; i++) squares.appendChild(document.createElement("li"));
  FILTERS.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "pill"; b.type = "button"; b.textContent = f.label;
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", i === 0 ? "true" : "false");
    b.onclick = () => {
      if (running) return;
      filter = f; video.style.filter = f.css;
      filtersEl.querySelectorAll(".pill").forEach((p) => p.setAttribute("aria-checked", String(p === b)));
    };
    filtersEl.appendChild(b);
  });
  video.style.filter = filter.css;
  video.style.transform = "scaleX(-1)";

  // ---------- clock: follows the music when it plays, otherwise a plain timer ----------
  const clock = {
    base: 0, at: 0, running: false,
    start(t = 0) { this.base = t; this.at = performance.now(); this.running = true; },
    pause() { if (this.running) { this.base = this.now(); this.running = false; } },
    resume() { if (!this.running) { this.at = performance.now(); this.running = true; } },
    set(t) { this.base = t; this.at = performance.now(); },
    now() { return this.running ? this.base + (performance.now() - this.at) / 1000 : this.base; },
  };

  // ---------- YouTube player ----------
  const player = {
    yt: null, ready: false, onPlaying: null,
    load() {
      if (!C.music.youtubeId) return;
      window.onYouTubeIframeAPIReady = () => {
        this.yt = new YT.Player("yt", {
          width: 200, height: 200, videoId: C.music.youtubeId,
          playerVars: { playsinline: 1, rel: 0, controls: 1, modestbranding: 1, start: Math.floor(C.music.startAt), end: Math.ceil(C.music.endAt || 0) || undefined },
          events: {
            onReady: () => { this.ready = true; this.yt.setVolume(C.music.volume); },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) { this.onPlaying && this.onPlaying(); clock.resume(); }
              else if (e.data === YT.PlayerState.BUFFERING || e.data === YT.PlayerState.PAUSED) { if (running && this.started) clock.pause(); }
            },
          },
        });
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api"; s.async = true;
      document.head.appendChild(s);
    },
    play() {
      if (!this.ready) return false;
      radio.hidden = false;
      this.started = false;
      this.yt.seekTo(C.music.startAt, true);
      this.yt.setVolume(C.music.volume);
      this.yt.playVideo();
      this.watchEnd();
      return true;
    },
    watchEnd() {
      clearInterval(this.endTimer);
      if (!C.music.endAt) return;
      const stopAfter = C.music.endAt - C.music.startAt;
      this.endTimer = setInterval(() => {
        const t = this.time();
        if (t != null && t >= stopAfter - 0.6) { clearInterval(this.endTimer); this.fadeOut(600); }
      }, 100);
    },
    time() { try { return this.yt.getCurrentTime() - C.music.startAt; } catch { return null; } },
    isPlaying() { try { return this.yt.getPlayerState() === YT.PlayerState.PLAYING; } catch { return false; } },
    pause() { try { this.yt && this.yt.pauseVideo(); } catch {} },
    fadeOut(ms = 1600) {
      if (!this.ready) return;
      const v0 = C.music.volume, t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        try { this.yt.setVolume(v0 * (1 - k)); } catch {}
        if (k < 1) requestAnimationFrame(step); else this.pause();
      };
      step();
    },
  };
  player.load();

  // ---------- camera ----------
  async function openCamera() {
    errorEl.hidden = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      return showError("This browser can't open the camera. Try Chrome or Safari, and make sure the page is on https.");
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      placeholder.hidden = true;
      return true;
    } catch (e) {
      const msg = {
        NotAllowedError: "Camera access was blocked. Click the camera icon in the address bar, allow it, then press start again.",
        NotFoundError: "No camera found on this device.",
        NotReadableError: "Your camera is being used by another app. Close it and press start again.",
      }[e.name] || "Couldn't open the camera (" + e.name + ").";
      showError(msg);
      return false;
    }
  }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

  // ---------- start ----------
  // camera turns on as soon as the page opens, so people can see themselves and pick a filter
  async function initCamera() {
    startBtn.disabled = true;
    const ok = await openCamera();
    startBtn.disabled = false;
    startBtn.textContent = ok ? "start" : "turn on camera";
    if (ok) captionEl.textContent = "pick a filter, then press start";
    else placeholder.textContent = "camera is off";
  }
  startBtn.onclick = () => {
    if (MARK_MODE) return startMark();
    if (running) return;
    if (!stream) return initCamera();
    startSession();
  };
  if (!MARK_MODE) initCamera(); else startBtn.disabled = false;

  function startSession() {
    running = true; shotIdx = 0; photos = [];
    times = Array.isArray(C.shotTimes) && C.shotTimes.length >= C.shots
      ? C.shotTimes.slice(0, C.shots)
      : Array.from({ length: C.shots }, (_, i) => +(C.interval * (i + 1)).toFixed(3));
    squares.querySelectorAll("li").forEach((li) => { li.classList.remove("on"); li.style.backgroundImage = ""; });
    setControls(false);
    errorEl.hidden = true;
    $("frameWrap").scrollIntoView({ behavior: "smooth", block: "center" });

    clock.base = 0; clock.running = false;
    let begun = false;
    const begin = (fromMusic) => {
      if (begun) return; begun = true;
      player.started = fromMusic;
      clock.start(fromMusic ? Math.max(0, player.time() || 0) : 0);
      loop();
    };
    if (musicOn && player.play()) {
      player.onPlaying = () => begin(true);
      setTimeout(() => {               // music blocked or slow (e.g. iOS) → carry on silently
        if (!begun) { begin(false); showError("Music didn't start. Tap the little player to add it."); }
      }, 2200);
    } else {
      begin(false);
    }
  }

  function loop() {
    if (!running) return;
    // keep the clock locked to the music
    if (player.started && player.isPlaying()) {
      const yt = player.time();
      if (yt != null && Math.abs(yt - clock.now()) > 0.25) clock.set(yt);
    }
    const t = clock.now();
    const target = times[shotIdx], prev = shotIdx === 0 ? 0 : times[shotIdx - 1];
    const left = target - t;
    const k = Math.max(0, Math.min(1, (t - prev) / (target - prev)));
    barFill.style.width = (k * 100).toFixed(1) + "%";
    barFill.classList.toggle("hot", left < 0.6);
    counterEl.textContent = `${shotIdx + 1}/${C.shots}`;
    if (player.started && C.nowPlaying) nowEl.textContent = "♪ " + C.nowPlaying;
    captionEl.textContent = (C.lyrics && C.lyrics[shotIdx]) || C.prompts[shotIdx] || "";
        // countdown before every photo (3-2-1, or 2-1 when shots are closer together)
    const maxCount = Math.max(1, Math.min(3, Math.floor(target - prev)));
    if (left > 0 && left <= maxCount) setCountdown(Math.ceil(left));
    if (left <= 0) {
      setCountdown("");
      capture(shotIdx);
      shotIdx++;
      if (shotIdx >= C.shots) return finish();
    }
    raf = requestAnimationFrame(loop);
  }

  let lastCount = null;
  function setCountdown(n) {
    if (n === lastCount) return; lastCount = n;
    countdownEl.textContent = n;
    countdownEl.classList.remove("pop"); void countdownEl.offsetWidth;
    if (n) countdownEl.classList.add("pop");
  }

  // ---------- capture ----------
  const CELL_W = 800, CELL_H = 1000; // 4:5, same as the frame opening
  function capture(i) {
    flashEl.classList.remove("go"); void flashEl.offsetWidth; flashEl.classList.add("go");
    const vw = video.videoWidth, vh = video.videoHeight;
    const c = document.createElement("canvas"); c.width = CELL_W; c.height = CELL_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (vw && vh) {
      const want = CELL_W / CELL_H;
      let sw = vw, sh = vw / want;
      if (sh > vh) { sh = vh; sw = vh * want; }
      const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
      if (C.mirrorPhotos) { ctx.translate(CELL_W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CELL_W, CELL_H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else { ctx.fillStyle = "#777"; ctx.fillRect(0, 0, CELL_W, CELL_H); }
    applyFilter(ctx, CELL_W, CELL_H, filter.ops);
    photos[i] = c;
    const li = squares.children[i];
    li.style.backgroundImage = `url(${c.toDataURL("image/jpeg", 0.5)})`;
    li.classList.add("on");
  }

  function applyFilter(ctx, w, h, o) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const con = o.contrast ?? 1, br = o.bright ?? 1, sat = o.saturate ?? 1, sep = o.sepia ?? 0, gray = o.gray ?? 0;
    const grain = o.grain ?? 0, vig = o.vignette ?? 0, cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
    for (let p = 0, n = 0; p < d.length; p += 4, n++) {
      let r = d[p], g = d[p + 1], b = d[p + 2];
      if (gray) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = r + (l - r) * gray; g = g + (l - g) * gray; b = b + (l - b) * gray; }
      if (sep) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r += (sr - r) * sep; g += (sg - g) * sep; b += (sb - b) * sep;
      }
      if (sat !== 1) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
      r *= br; g *= br; b *= br;
      r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128;
      if (vig) { const x = n % w, y = (n / w) | 0; const f = 1 - vig * Math.pow(Math.hypot(x - cx, y - cy) / maxR, 2); r *= f; g *= f; b *= f; }
      if (grain) { const z = (Math.random() - 0.5) * grain; r += z; g += z; b += z; }
      d[p] = r; d[p + 1] = g; d[p + 2] = b;   // Uint8ClampedArray clamps for us
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- strips ----------
  function renderStrip(list) {
    const W = 600, pad = 34, cw = W - pad * 2, ch = cw * CELL_H / CELL_W, gap = 16;
    const footer = C.stripFooter ? 96 : pad;
    const H = pad + list.length * ch + (list.length - 1) * gap + footer;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fdfdfb"; ctx.fillRect(0, 0, W, H);
    list.forEach((p, i) => ctx.drawImage(p, pad, pad + i * (ch + gap), cw, ch));
    if (C.stripFooter) {
      const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, ".");
      ctx.fillStyle = "#8d8780"; ctx.font = "500 24px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(C.stripFooter.replace("{date}", date), W / 2, H - footer / 2 + 6);
    }
    return c;
  }

  // ---------- finish → print ----------
  function finish() {
    running = false; cancelAnimationFrame(raf);
    barFill.style.width = "100%"; barFill.classList.remove("hot");
    captionEl.textContent = "developing…";
    const half = Math.ceil(C.shots / 2);
    stripCanvases = [renderStrip(photos.slice(0, half)), renderStrip(photos.slice(half))];
    setTimeout(() => { player.fadeOut(); showPrint(); }, 900);
  }

  function showPrint() {
    boothScene.hidden = true; printScene.hidden = false; radio.hidden = true;
    stripsEl.innerHTML = ""; printActions.classList.remove("show");
    window.scrollTo(0, 0);
    led.classList.add("on");
    const finalX = ["-108%", "8%"], tilt = [-2.5, 2];
    requestAnimationFrame(() => {
      const rackH = stripsEl.clientHeight;
      stripCanvases.forEach((c, i) => {
        const img = document.createElement("img");
        img.className = "strip"; img.alt = `Photo strip ${i + 1}`; img.src = c.toDataURL("image/png");
        img.style.setProperty("--ratio", c.width / c.height);
        img.style.transform = `translate(-50%, ${-rackH}px)`;
        img.onclick = () => openLightbox(img.src);
        stripsEl.appendChild(img);
        const sH = rackH * 0.92, emerge = -rackH + sH * 0.62;
        const delay = 400 + i * 3200;
        img.animate([
          { transform: `translate(-50%, ${-rackH}px)` },
          { transform: `translate(-50%, ${emerge}px)`, offset: 0.55, easing: "steps(18, end)" },
          { transform: `translate(-50%, ${emerge}px)`, offset: 0.68, easing: "cubic-bezier(.5,0,.9,.4)" },
          { transform: `translate(${finalX[i]}, 0) rotate(${tilt[i]}deg)`, offset: 0.9, easing: "ease-out" },
          { transform: `translate(${finalX[i]}, -10px) rotate(${tilt[i]}deg)`, offset: 0.95 },
          { transform: `translate(${finalX[i]}, 0) rotate(${tilt[i]}deg)` },
        ], { duration: 3400, delay, fill: "forwards" }).finished.then(() => {
          if (i === stripCanvases.length - 1) { led.classList.remove("on"); printActions.classList.add("show"); }
        });
      });
    });
  }

  function openLightbox(src) {
    const lb = document.createElement("div"); lb.className = "lightbox";
    lb.innerHTML = `<img src="${src}" alt="Photo strip">`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  }

  // ---------- save / share ----------
  $("downloadBtn").onclick = async () => {
    const [a, b] = stripCanvases, gap = 60, pad = 80;
    const c = document.createElement("canvas");
    c.width = a.width + b.width + gap + pad * 2; c.height = Math.max(a.height, b.height) + pad * 2;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#5e1415"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(a, pad, pad); ctx.drawImage(b, pad + a.width + gap, pad);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "mistletoe-strips.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: "mistletoe photobooth" }); return; } catch {}
    }
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  $("againBtn").onclick = () => {
    printScene.hidden = true; boothScene.hidden = false;
    resetBooth("start");
  };

  function resetBooth(btnLabel) {
    running = false; cancelAnimationFrame(raf);
    barFill.style.width = "0%"; barFill.classList.remove("hot");
    counterEl.textContent = ""; nowEl.textContent = ""; setCountdown(""); captionEl.innerHTML = "&nbsp;";
    squares.querySelectorAll("li").forEach((li) => { li.classList.remove("on"); li.style.backgroundImage = ""; });
    setControls(true); startBtn.textContent = btnLabel;
  }
  function setControls(on) {
    startBtn.disabled = !on;
    filtersEl.querySelectorAll(".pill").forEach((p) => (p.disabled = !on));
  }

  // tab hidden mid-session → stop cleanly
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running) {
      player.pause(); radio.hidden = true;
      resetBooth("start");
      showError("Paused because you left the tab. Press start to go again.");
    }
  });

  // ---------- ?mark : tap space on every half-line to get exact shot times ----------
  function startMark() {
    if (!player.ready) { markEl.hidden = false; markEl.textContent = "Music player still loading… try again in a second."; return; }
    const marks = [];
    markEl.hidden = false;
    markEl.textContent = "Press SPACE on every half-line (8 times).";
    player.play();
    player.onPlaying = () => {};
    document.onkeydown = (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      const t = player.time();
      if (t == null) return;
      marks.push(+t.toFixed(2));
      markEl.textContent = `${marks.length}/${C.shots}\nshotTimes: [${marks.join(", ")}]` +
        (marks.length >= C.shots ? "\n\nDone — paste that line into config.js" : "");
      if (marks.length >= C.shots) { player.fadeOut(800); document.onkeydown = null; }
    };
  }
  // ---------- edit panel ----------
  const editor = $("editor"), editorList = $("editorList"), timingStatus = $("timingStatus");
  const tapArea = $("tapArea"), tapBtn = $("tapBtn"), tapText = $("tapText");
  if (!Array.isArray(C.lyrics)) C.lyrics = [];
  for (let i = 0; i < C.shots; i++) {
    const li = document.createElement("li"), inp = document.createElement("input");
    inp.type = "text"; inp.placeholder = C.prompts[i] || `line ${i + 1}`; inp.value = C.lyrics[i] || "";
    inp.setAttribute("aria-label", `Line for photo ${i + 1}`);
    inp.oninput = () => { C.lyrics[i] = inp.value.trim(); store.set("lyrics", C.lyrics); };
    // pasting several lines into one box fills the next boxes too
    inp.onpaste = (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      e.preventDefault();
      const inputs = editorList.querySelectorAll("input");
      lines.forEach((l, j) => { if (inputs[i + j]) { inputs[i + j].value = l; C.lyrics[i + j] = l; } });
      store.set("lyrics", C.lyrics);
    };
    li.appendChild(inp); editorList.appendChild(li);
  }
  function showTiming() {
    timingStatus.textContent = Array.isArray(C.shotTimes) && C.shotTimes.length >= C.shots
      ? `Synced to the song: ${C.shotTimes.map((t) => t.toFixed(1) + "s").join(" · ")}`
      : `A photo every ${C.interval} seconds. Tap along to the song to land each flash on its line.`;
  }
  showTiming();
  // private: open with ?edit in the address
  if (new URLSearchParams(location.search).has("edit")) editor.hidden = false;
  $("copyConfig").onclick = async () => {
    const lines = Array.from({ length: C.shots }, (_, i) => C.lyrics[i] || "");
    const times = Array.isArray(C.shotTimes) ? `[${C.shotTimes.join(", ")}]` : "null";
    const text = `  lyrics: ${JSON.stringify(lines)},\n  shotTimes: ${times},`;
    try { await navigator.clipboard.writeText(text); timingStatus.textContent = "Copied. Paste it over the lyrics and shotTimes lines in config.js."; }
    catch { timingStatus.textContent = text; }
  };
  $("closeEditor").onclick = () => { stopTap(); editor.hidden = true; };
  $("resetTimesBtn").onclick = () => { stopTap(); C.shotTimes = null; store.set("shotTimes", "interval"); showTiming(); };

  let taps = null;
  function onTap() {
    if (!taps) return;
    const t = player.time();
    if (t == null || !player.isPlaying()) return;
    taps.push(+t.toFixed(2));
    tapBtn.textContent = `${taps.length}/${C.shots}`;
    const next = C.lyrics[taps.length] || C.prompts[taps.length] || "";
    tapText.textContent = taps.length < C.shots ? `Next: ${next}` : "Got all of them.";
    if (taps.length >= C.shots) {
      C.shotTimes = taps; store.set("shotTimes", taps); showTiming();
      taps = null; player.fadeOut(800);
      setTimeout(() => { tapArea.hidden = true; radio.hidden = true; }, 900);
    }
  }
  function stopTap() { if (taps) { taps = null; player.pause(); radio.hidden = true; } tapArea.hidden = true; }
  $("markBtn").onclick = () => {
    if (!player.ready) { timingStatus.textContent = "Music is still loading (or blocked). Try again in a few seconds."; return; }
    taps = []; tapBtn.textContent = "tap"; tapArea.hidden = false;
    tapText.textContent = `Tap the moment each line starts. First: ${C.lyrics[0] || C.prompts[0]}`;
    player.play();
  };
  tapBtn.onclick = onTap;
  document.addEventListener("keydown", (e) => { if (taps && e.code === "Space") { e.preventDefault(); onTap(); } });

  if (MARK_MODE) { startBtn.textContent = "start marking"; markEl.hidden = false; markEl.textContent = "Mark mode: press start, then SPACE on each half-line."; }
})();
