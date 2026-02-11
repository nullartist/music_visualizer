const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const moodEl = document.getElementById("mood");
const tempoEl = document.getElementById("tempo");
const energyEl = document.getElementById("energy");
const brightnessEl = document.getElementById("brightness");

const micBtn = document.getElementById("micBtn");
const fileInput = document.getElementById("fileInput");
const playBtn = document.getElementById("playBtn");

const ws = new WebSocket(`ws://${window.location.host}`);
let audioContext;
let analyser;
let sourceNode;
let audioElement;
let frequencyData;
let timeData;
let beatHistory = [];
let beatPulse = 0;
let bpmEstimate = 90;
let lastBeatAt = 0;

const particles = Array.from({ length: 260 }, () => ({
  x: Math.random(),
  y: Math.random(),
  vx: (Math.random() - 0.5) * 0.002,
  vy: (Math.random() - 0.5) * 0.002,
  size: Math.random() * 2 + 0.8
}));

function initAudioGraph() {
  if (audioContext) return;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.75;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Uint8Array(analyser.fftSize);
}

async function useMicrophone() {
  initAudioGraph();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (sourceNode) sourceNode.disconnect();
  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyser);
  if (audioContext.state !== "running") await audioContext.resume();
}

function loadFile(file) {
  initAudioGraph();
  if (audioElement) {
    audioElement.pause();
    audioElement.remove();
  }
  const url = URL.createObjectURL(file);
  audioElement = new Audio(url);
  audioElement.crossOrigin = "anonymous";

  if (sourceNode) sourceNode.disconnect();
  sourceNode = audioContext.createMediaElementSource(audioElement);
  sourceNode.connect(analyser);
  analyser.connect(audioContext.destination);

  playBtn.disabled = false;
}

function getBandEnergy(start, end) {
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += frequencyData[i] || 0;
  return sum / Math.max(1, end - start) / 255;
}

function featureExtraction() {
  analyser.getByteFrequencyData(frequencyData);
  analyser.getByteTimeDomainData(timeData);

  const low = getBandEnergy(0, 24);
  const mid = getBandEnergy(24, 120);
  const high = getBandEnergy(120, 360);
  const energy = (low * 1.25 + mid + high * 0.8) / 3;

  beatHistory.push(energy);
  if (beatHistory.length > 100) beatHistory.shift();
  const avgEnergy = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;
  const beatDetected = energy > avgEnergy * 1.35 && energy > 0.12;

  const now = performance.now();
  if (beatDetected) {
    beatPulse = 1;
    if (now - lastBeatAt > 200) {
      const intervalMs = now - lastBeatAt;
      if (intervalMs > 250 && intervalMs < 1200) {
        bpmEstimate = Math.round(60000 / intervalMs);
      }
      lastBeatAt = now;
    }
  }

  beatPulse *= 0.92;

  const centroid = (mid * 0.5 + high) / Math.max(0.001, low + mid + high);
  const warmth = low / Math.max(0.001, low + high);

  const mood = inferMood({ energy, low, mid, high, centroid, bpmEstimate });

  return {
    low,
    mid,
    high,
    energy,
    centroid,
    warmth,
    mood,
    beat: beatPulse,
    bpm: bpmEstimate
  };
}

function inferMood({ energy, low, high, centroid, bpmEstimate }) {
  if (energy < 0.08) return "ambient";
  if (bpmEstimate > 138 && high > low) return "euphoric";
  if (low > 0.36 && bpmEstimate > 105) return "driving";
  if (centroid > 0.6 && energy > 0.2) return "tense";
  if (bpmEstimate < 90 && energy < 0.19) return "melancholic";
  return "uplifting";
}

function moodPalette(mood, beat) {
  const palettes = {
    ambient: [200, 70, 35],
    euphoric: [45, 90, 58],
    driving: [14, 92, 50],
    tense: [330, 84, 50],
    melancholic: [245, 42, 35],
    uplifting: [170, 78, 52]
  };

  const [h, s, l] = palettes[mood] || palettes.uplifting;
  return {
    glow: `hsla(${h}deg ${s}% ${Math.min(80, l + beat * 20)}% / 0.5)`,
    core: `hsl(${h}deg ${s}% ${l}%)`,
    hue: h / 360
  };
}

function draw(features) {
  const { mood, beat, energy, low, high } = features;
  const palette = moodPalette(mood, beat);

  ctx.fillStyle = "rgba(5, 5, 10, 0.22)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const radius = Math.max(canvas.width, canvas.height) * (0.24 + energy * 0.52 + beat * 0.08);
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;

  const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
  gradient.addColorStop(0, palette.glow);
  gradient.addColorStop(0.65, "rgba(10, 10, 30, 0.1)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  particles.forEach((p) => {
    p.x += p.vx * (1 + beat * 4 + high * 1.5);
    p.y += p.vy * (1 + beat * 4 + low * 1.5);

    if (p.x < 0 || p.x > 1) p.vx *= -1;
    if (p.y < 0 || p.y > 1) p.vy *= -1;

    const px = p.x * canvas.width;
    const py = p.y * canvas.height;
    const size = p.size * (1 + beat * 1.2);

    ctx.fillStyle = palette.core;
    ctx.globalAlpha = 0.18 + energy * 0.4;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const bars = 48;
  const barWidth = canvas.width / bars;
  for (let i = 0; i < bars; i += 1) {
    const idx = Math.floor((i / bars) * frequencyData.length * 0.7);
    const v = (frequencyData[idx] || 0) / 255;
    const h = v * canvas.height * 0.35;

    ctx.fillStyle = `hsla(${palette.hue * 360 + i * 2}deg 100% 60% / ${0.2 + v * 0.5})`;
    ctx.fillRect(i * barWidth, canvas.height - h, barWidth - 2, h);
  }

  moodEl.textContent = mood;
  tempoEl.textContent = String(features.bpm);
  energyEl.textContent = energy.toFixed(3);
  brightnessEl.textContent = Math.min(1, energy + beat * 0.4).toFixed(3);

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "control_frame",
        payload: {
          mood,
          intensity: Math.min(1, energy + beat * 0.35),
          beat,
          hue: palette.hue,
          warmth: features.warmth
        }
      })
    );
  }
}

function loop() {
  if (analyser) {
    const features = featureExtraction();
    draw(features);
  } else {
    ctx.fillStyle = "#0b0b16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#9cb3ff";
    ctx.font = "30px Trebuchet MS";
    ctx.fillText("Connect mic or upload audio to start.", 40, 90);
  }
  requestAnimationFrame(loop);
}

micBtn.addEventListener("click", async () => {
  try {
    await useMicrophone();
  } catch (err) {
    alert(`Microphone error: ${err.message}`);
  }
});

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files;
  if (file) loadFile(file);
});

playBtn.addEventListener("click", async () => {
  if (!audioElement) return;
  if (audioContext.state !== "running") await audioContext.resume();
  audioElement.play();
});

loop();
