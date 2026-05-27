const API_BASE = "http://127.0.0.1:5000";

const form = document.getElementById("predictionForm");
const scoreDisplay = document.getElementById("scoreDisplay");
const confidenceDisplay = document.getElementById("confidenceDisplay");
const progressBar = document.getElementById("progressBar");
const loader = document.getElementById("loader");
const toast = document.getElementById("toast");
const historyList = document.getElementById("historyList");
const typeLine = document.getElementById("typeLine");
const chatLog = document.getElementById("chatLog");

const featureImportance = [
  { label: "Study Hours", value: 0.29 },
  { label: "Class Attendance", value: 0.22 },
  { label: "Sleep Hours", value: 0.14 },
  { label: "Sleep Quality", value: 0.12 },
  { label: "Study Method", value: 0.11 },
  { label: "Facility Rating", value: 0.12 }
];

function showToast(msg) {
  toast.textContent = msg;
  toast.style.opacity = "1";
  setTimeout(() => (toast.style.opacity = "0"), 2200);
}

function animateScore(target) {
  const start = 0;
  const duration = 1000;
  const t0 = performance.now();

  function tick(t) {
    const p = Math.min(1, (t - t0) / duration);
    const val = start + (target - start) * p;
    scoreDisplay.textContent = val.toFixed(1);
    progressBar.style.width = `${Math.min(100, Math.max(0, val))}%`;
    if (p < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("predictionHistory") || "[]");
  historyList.innerHTML = history
    .slice()
    .reverse()
    .map((h) => `<li>${h.time}: score ${h.score}</li>`)
    .join("");
}

function saveHistory(score) {
  const history = JSON.parse(localStorage.getItem("predictionHistory") || "[]");
  history.push({ time: new Date().toLocaleString(), score });
  localStorage.setItem("predictionHistory", JSON.stringify(history.slice(-12)));
  renderHistory();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loader.classList.remove("hidden");

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.study_hours = Number(payload.study_hours);
  payload.class_attendance = Number(payload.class_attendance);
  payload.sleep_hours = Number(payload.sleep_hours);

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Prediction failed");

    animateScore(data.predicted_score);
    confidenceDisplay.textContent = `AI Confidence: ${data.confidence}%`;
    saveHistory(data.predicted_score);
    if (data.warnings?.length) showToast(data.warnings[0]);
    else showToast("Prediction completed");
  } catch (err) {
    showToast(err.message);
  } finally {
    loader.classList.add("hidden");
  }
});

document.getElementById("downloadReport").addEventListener("click", () => {
  const report = `AI Exam Score Report\nDate: ${new Date().toLocaleString()}\nPredicted Score: ${scoreDisplay.textContent}\n${confidenceDisplay.textContent}`;
  const blob = new Blob([report], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "exam_score_report.txt";
  a.click();
});

document.querySelectorAll("[data-scroll]").forEach((btn) => {
  btn.addEventListener("click", () => document.querySelector(btn.dataset.scroll).scrollIntoView({ behavior: "smooth" }));
});

document.getElementById("themeToggle").addEventListener("click", () => {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === "dark" ? "light" : "dark";
});

function initVoiceInput() {
  const btn = document.getElementById("voiceFill");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.disabled = true;
    btn.title = "Voice input not supported";
    return;
  }

  const rec = new SR();
  rec.lang = "en-US";
  btn.addEventListener("click", () => rec.start());

  rec.onresult = (event) => {
    const text = event.results[0][0].transcript.toLowerCase();
    const match = text.match(/study\s*hours\s*(\d+(\.\d+)?)/);
    if (match) {
      form.study_hours.value = match[1];
      showToast("Study hours filled from voice");
    } else {
      showToast("Say: study hours 5");
    }
  };
}

function initCharts() {
  const featureCtx = document.getElementById("featureChart");
  new Chart(featureCtx, {
    type: "bar",
    data: {
      labels: featureImportance.map((f) => f.label),
      datasets: [{ label: "Importance", data: featureImportance.map((f) => f.value), backgroundColor: "rgba(0,229,255,0.65)" }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  const perfCtx = document.getElementById("performanceChart");
  new Chart(perfCtx, {
    type: "line",
    data: { labels: ["Prev 1", "Prev 2", "Prev 3", "Prev 4", "Current"], datasets: [{ data: [72, 78, 81, 84, 0], borderColor: "#00ffa3", tension: 0.4 }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

function initParticles() {
  const canvas = document.getElementById("particles");
  const ctx = canvas.getContext("2d");
  const dots = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 2 + 1, vx: (Math.random() - 0.5) * 0.001, vy: (Math.random() - 0.5) * 0.001 }));

  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener("resize", resize); resize();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(140,235,255,0.7)";
    dots.forEach((d) => {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > 1) d.vx *= -1;
      if (d.y < 0 || d.y > 1) d.vy *= -1;
      ctx.beginPath();
      ctx.arc(d.x * canvas.width, d.y * canvas.height, d.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

function initChatbot() {
  const chatInput = document.getElementById("chatInput");
  const chatSend = document.getElementById("chatSend");

  const reply = (msg) => {
    const q = msg.toLowerCase();
    if (q.includes("encoder")) return "label_encoders.pkl ensures categorical values are converted exactly like training.";
    if (q.includes("feature")) return "Main features: study_hours, class_attendance, sleep_hours, sleep_quality, study_method, facility_rating.";
    if (q.includes("xgboost")) return "XGBoost combines many decision trees to improve tabular prediction accuracy.";
    return "Ask me about model features, encoders, or prediction workflow.";
  };

  const send = () => {
    if (!chatInput.value.trim()) return;
    const userText = chatInput.value.trim();
    chatLog.innerHTML += `<p><strong>You:</strong> ${userText}</p>`;
    chatLog.innerHTML += `<p><strong>AI:</strong> ${reply(userText)}</p>`;
    chatInput.value = "";
    chatLog.scrollTop = chatLog.scrollHeight;
  };

  chatSend.addEventListener("click", send);
  chatInput.addEventListener("keydown", (e) => e.key === "Enter" && send());
}

function initGSAP() {
  if (!window.gsap) return;
  gsap.from(".hero-content", { y: 20, opacity: 0, duration: 1 });
  gsap.from(".card", { y: 24, opacity: 0, duration: 0.8, stagger: 0.08, scrollTrigger: undefined });
}

function typewriter() {
  const text = "Predict performance in real-time with AI-powered intelligence.";
  let i = 0;
  const timer = setInterval(() => {
    typeLine.textContent = text.slice(0, i++);
    if (i > text.length) clearInterval(timer);
  }, 30);
}

renderHistory();
initVoiceInput();
initCharts();
initParticles();
initChatbot();
initGSAP();
typewriter();
