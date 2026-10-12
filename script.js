
"use strict";

const STORAGE_KEY = "focusGardenData";
const SETTINGS_DEFAULTS = {
  focusDuration: 25,
  shortDuration: 5,
  longDuration: 15,
  dailyGoal: 4
};

const STAGES = [
  { name: "Little Sprout", emoji: "🌱", minutes: 0 },
  { name: "Growing Seedling", emoji: "🌿", minutes: 25 },
  { name: "Happy Plant", emoji: "🪴", minutes: 60 },
  { name: "Blooming Beauty", emoji: "🌷", minutes: 120 },
  { name: "Garden Superstar", emoji: "🌳", minutes: 240 }
];

const PLANT_EMOJIS = ["🌱", "🌿", "🪴", "🌷", "🌻", "🌵", "🌳", "🌼"];
const CIRCLE_LENGTH = 2 * Math.PI * 126;

const $ = (id) => document.getElementById(id);

const ui = {
  modeHeading: $("mode-heading"),
  timerStatus: $("timer-status"),
  timerProgress: $("timer-progress"),
  timerPlant: $("timer-plant"),
  timeDisplay: $("time-display"),
  timerCaption: $("timer-caption"),
  timerHint: $("timer-hint"),
  startButton: $("start-button"),
  startIcon: $("start-icon"),
  startLabel: $("start-label"),
  resetButton: $("reset-button"),
  modeTabs: document.querySelectorAll(".mode-tab"),
  soundToggle: $("sound-toggle"),
  settingsToggle: $("settings-toggle"),
  settingsClose: $("settings-close"),
  settingsPanel: $("settings-panel"),
  settingsForm: $("settings-form"),
  focusDuration: $("focus-duration"),
  shortDuration: $("short-duration"),
  longDuration: $("long-duration"),
  dailyGoal: $("daily-goal"),
  settingsMessage: $("settings-message"),
  plantName: $("plant-name"),
  plantLevel: $("plant-level"),
  plantEmoji: $("plant-emoji"),
  plantArt: $("plant-art"),
  plantFocusTime: $("plant-focus-time"),
  plantMood: $("plant-mood"),
  growthPercentage: $("growth-percentage"),
  growthTrack: $("growth-track"),
  growthFill: $("growth-fill"),
  growthCaption: $("growth-caption"),
  goalProgress: $("goal-progress"),
  goalFill: $("goal-fill"),
  totalSessions: $("total-sessions"),
  totalFocusMinutes: $("total-focus-minutes"),
  totalPlants: $("total-plants"),
  todaySessions: $("today-sessions"),
  gardenGrid: $("garden-grid"),
  emptyGarden: $("empty-garden"),
  gardenCount: $("garden-count"),
  toast: $("toast"),
  completionOverlay: $("completion-overlay"),
  completionPlant: $("completion-plant"),
  completionTitle: $("completion-title"),
  completionMessage: $("completion-message"),
  completionClose: $("completion-close")
};

function defaultData() {
  return {
    settings: { ...SETTINGS_DEFAULTS },
    totalSessions: 0,
    totalFocusMinutes: 0,
    garden: [],
    dailySessions: {},
    nextPlantId: 1,
    soundEnabled: true
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validNumber(value, min, max) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
}

function loadData() {
  const defaults = defaultData();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return defaults;

    const saved = JSON.parse(raw);

    if (!isObject(saved)) return defaults;

    const settings = { ...SETTINGS_DEFAULTS };

    if (isObject(saved.settings)) {
      for (const key of Object.keys(SETTINGS_DEFAULTS)) {
        const maximum = key === "focusDuration" ? 180 :
          key === "shortDuration" ? 60 :
          key === "longDuration" ? 120 : 24;

        if (validNumber(saved.settings[key], 1, maximum)) {
          settings[key] = Math.floor(saved.settings[key]);
        }
      }
    }

    const garden = Array.isArray(saved.garden)
      ? saved.garden.filter((plant) =>
          isObject(plant) &&
          Number.isSafeInteger(plant.id) &&
          plant.id > 0 &&
          typeof plant.name === "string" &&
          typeof plant.emoji === "string" &&
          validNumber(plant.minutes, 1, 180) &&
          typeof plant.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(plant.date) &&
          typeof plant.createdAt === "string" &&
          Number.isFinite(Date.parse(plant.createdAt))
        ).slice(-500).map((plant) => ({
          id: plant.id,
          name: plant.name.slice(0, 80),
          emoji: plant.emoji.slice(0, 20),
          minutes: Math.floor(plant.minutes),
          date: plant.date,
          createdAt: plant.createdAt
        }))
      : [];

    const dailySessions = {};

    if (isObject(saved.dailySessions)) {
      for (const [date, count] of Object.entries(saved.dailySessions)) {
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          Number.isSafeInteger(count) &&
          count >= 0 &&
          count <= 1000000
        ) {
          dailySessions[date] = count;
        }
      }
    }

    const dates = Object.keys(dailySessions).sort();

    while (dates.length > 90) {
      delete dailySessions[dates.shift()];
    }

    const highestId = garden.reduce(
      (highest, plant) => Math.max(highest, plant.id),
      0
    );

    return {
      settings,
      totalSessions: validNumber(saved.totalSessions, 0, 1000000)
        ? Math.floor(saved.totalSessions) : 0,
      totalFocusMinutes: validNumber(saved.totalFocusMinutes, 0, 100000000)
        ? Math.floor(saved.totalFocusMinutes) : 0,
      garden,
      dailySessions,
      nextPlantId: Math.max(
        Number.isSafeInteger(saved.nextPlantId) && saved.nextPlantId > 0
          ? saved.nextPlantId : 1,
        highestId + 1
      ),
      soundEnabled: typeof saved.soundEnabled === "boolean"
        ? saved.soundEnabled : true
    };
  } catch (error) {
    console.warn("Unable to load saved data:", error);
    return defaults;
  }
}

let data = loadData();
let mode = "focus";
let timerState = "idle";
let remainingMs = data.settings.focusDuration * 60000;
let deadline = null;
let intervalId = null;
let toastTimeout = null;
let audioContext = null;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn("Unable to save data:", error);
    return false;
  }
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function durationForMode(selectedMode = mode) {
  if (selectedMode === "short") return data.settings.shortDuration;
  if (selectedMode === "long") return data.settings.longDuration;
  return data.settings.focusDuration;
}

function getRemainingMs() {
  if (timerState === "running" && deadline !== null) {
    return Math.max(0, deadline - Date.now());
  }

  return Math.max(0, remainingMs);
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function updateTimerDisplay() {
  const remaining = getRemainingMs();
  const total = durationForMode() * 60000;
  const elapsedFraction = total > 0
    ? Math.max(0, Math.min(1, 1 - remaining / total))
    : 0;

  ui.timeDisplay.textContent = formatTime(remaining);
  ui.timeDisplay.setAttribute(
    "aria-label",
    `${Math.ceil(remaining / 60000)} minutes remaining`
  );

  ui.timerProgress.style.strokeDasharray = CIRCLE_LENGTH;
  ui.timerProgress.style.strokeDashoffset = CIRCLE_LENGTH * elapsedFraction;

  document.title = timerState === "running"
    ? `${formatTime(remaining)} — Focus Garden`
    : "Focus Garden";
}

function renderTimerState() {
  const running = timerState === "running";
  const paused = timerState === "paused";

  ui.startIcon.textContent = running ? "Ⅱ" : "▶";
  ui.startLabel.textContent = running ? "Pause" : paused ? "Resume" :
    mode === "focus" ? "Start focusing" : "Start break";

  ui.timerStatus.textContent = running ? "Growing in progress" :
    paused ? "Taking a tiny pause" : "Ready when you are";

  document.querySelector(".live-dot").classList.toggle("is-running", running);

  ui.timerHint.textContent = running
    ? "One moment at a time. You've got this."
    : paused
      ? "Your progress is safe. Resume when you're ready."
      : mode === "focus"
        ? "Put your phone away. Let's grow something."
        : "Take a breath and enjoy your break.";

  updateTimerDisplay();
}

function startTimer() {
  if (timerState === "running") return;

  if (remainingMs <= 0) {
    remainingMs = durationForMode() * 60000;
  }

  deadline = Date.now() + remainingMs;
  timerState = "running";

  stopInterval();

  intervalId = setInterval(() => {
    remainingMs = getRemainingMs();
    updateTimerDisplay();

    if (remainingMs <= 0) {
      finishTimer();
    }
  }, 250);

  renderTimerState();
  requestNotifications();
}

function pauseTimer() {
  if (timerState !== "running") return;

  remainingMs = getRemainingMs();
  deadline = null;
  timerState = "paused";

  stopInterval();
  renderTimerState();
}

function resetTimer(showMessage = false) {
  stopInterval();

  timerState = "idle";
  deadline = null;
  remainingMs = durationForMode() * 60000;

  renderTimerState();

  if (showMessage) {
    showToast("Timer reset. Ready for a fresh start? 🌱");
  }
}

function switchMode(nextMode) {
  if (!["focus", "short", "long"].includes(nextMode)) return;
  if (nextMode === mode) return;

  mode = nextMode;
  resetTimer();

  const headings = {
    focus: "Time to focus",
    short: "Take a breather",
    long: "Rest and recharge"
  };

  const captions = {
    focus: "A little progress goes a long way.",
    short: "Stretch, sip water, breathe.",
    long: "You've earned a proper rest."
  };

  ui.modeHeading.textContent = headings[mode];
  ui.timerCaption.textContent = captions[mode];

  ui.timerPlant.textContent = mode === "focus"
    ? STAGES[getStage(data.totalFocusMinutes)].emoji
    : mode === "short" ? "☕" : "🌼";

  ui.modeTabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  });

  renderTimerState();
}

function finishTimer() {
  stopInterval();

  remainingMs = 0;
  deadline = null;
  timerState = "idle";

  updateTimerDisplay();
  renderTimerState();
  playSound();

  if (mode === "focus") {
    completeFocusSession();
  } else {
    showCompletion(
      mode === "short" ? "Break complete!" : "Rest complete!",
      "You're refreshed. Your garden will be waiting when you're ready.",
      "🌼"
    );

    sendNotification("Break complete!", "Ready to focus again whenever you are.");
  }
}

function completeFocusSession() {
  const minutes = data.settings.focusDuration;
  const today = todayKey();

  data.totalSessions += 1;
  data.totalFocusMinutes += minutes;
  data.dailySessions[today] = (data.dailySessions[today] || 0) + 1;

  const plant = {
    id: data.nextPlantId++,
    name: `Plant ${data.totalSessions}`,
    emoji: PLANT_EMOJIS[(data.totalSessions - 1) % PLANT_EMOJIS.length],
    minutes,
    date: today,
    createdAt: new Date().toISOString()
  };

  data.garden.push(plant);

  if (data.garden.length > 500) {
    data.garden = data.garden.slice(-500);
  }

  saveData();
  renderAll();

  showCompletion(
    "You did it!",
    `You focused for ${minutes} minutes. Your little garden just grew another plant!`,
    plant.emoji
  );

  sendNotification(
    "Focus session complete! 🌱",
    `Amazing work! You focused for ${minutes} minutes.`
  );
}

function showCompletion(title, message, emoji) {
  ui.completionTitle.textContent = title;
  ui.completionMessage.textContent = message;
  ui.completionPlant.textContent = emoji;
  ui.completionOverlay.hidden = false;
  ui.completionClose.focus();
}

function closeCompletion() {
  ui.completionOverlay.hidden = true;
}

function getStage(totalMinutes) {
  let stageIndex = 0;

  STAGES.forEach((stage, index) => {
    if (totalMinutes >= stage.minutes) {
      stageIndex = index;
    }
  });

  return stageIndex;
}

function renderPlant() {
  const minutes = data.totalFocusMinutes;
  const stageIndex = getStage(minutes);
  const stage = STAGES[stageIndex];
  const nextStage = STAGES[stageIndex + 1];

  let percentage = 100;
  let remaining = 0;

  if (nextStage) {
    const stageLength = nextStage.minutes - stage.minutes;
    percentage = Math.floor(((minutes - stage.minutes) / stageLength) * 100);
    remaining = nextStage.minutes - minutes;
  }

  const moods = [
    "Just getting started 🌱",
    "Growing stronger 🌿",
    "Looking lovely 🪴",
    "Ready to bloom 🌷",
    "A little forest star 🌳"
  ];

  ui.plantName.textContent = stage.name;
  ui.plantLevel.textContent = `Stage ${stageIndex + 1} / 5`;
  ui.plantEmoji.textContent = stage.emoji;
  ui.plantArt.setAttribute("aria-label", stage.name);
  ui.plantFocusTime.textContent = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  ui.plantMood.textContent = moods[stageIndex];
  ui.growthPercentage.textContent = `${percentage}%`;
  ui.growthFill.style.width = `${percentage}%`;
  ui.growthTrack.setAttribute("aria-valuenow", String(percentage));
  ui.growthCaption.textContent = nextStage
    ? `${remaining} more focus minutes until the next stage.`
    : "Your plant is fully grown. Keep nurturing your garden!";

  if (mode === "focus") {
    ui.timerPlant.textContent = stage.emoji;
  }
}

function renderStatistics() {
  const todayCount = data.dailySessions[todayKey()] || 0;
  const goal = data.settings.dailyGoal;
  const percentage = Math.min(100, (todayCount / goal) * 100);

  ui.totalSessions.textContent = data.totalSessions.toLocaleString();
  ui.totalFocusMinutes.textContent = data.totalFocusMinutes.toLocaleString();
  ui.totalPlants.textContent = data.garden.length.toLocaleString();
  ui.todaySessions.textContent = todayCount.toLocaleString();
  ui.goalProgress.textContent = `${todayCount} / ${goal} focus sessions`;
  ui.goalFill.style.width = `${percentage}%`;
}

function renderGarden() {
  ui.gardenGrid.replaceChildren();

  const plants = [...data.garden].reverse();

  ui.gardenCount.textContent =
    `${plants.length} ${plants.length === 1 ? "plant" : "plants"}`;

  if (plants.length === 0) {
    ui.emptyGarden.hidden = false;
    ui.gardenGrid.appendChild(ui.emptyGarden);
    return;
  }

  ui.emptyGarden.hidden = true;

  plants.forEach((plant) => {
    const card = document.createElement("article");
    card.className = "garden-plant-card";

    const artwork = document.createElement("div");
    artwork.className = "garden-plant-art";

    const emoji = document.createElement("span");
    emoji.className = "garden-emoji";
    emoji.textContent = plant.emoji;
    emoji.setAttribute("aria-hidden", "true");

    artwork.appendChild(emoji);

    const details = document.createElement("div");
    details.className = "garden-plant-details";

    const title = document.createElement("h3");
    title.textContent = plant.name;

    const description = document.createElement("p");
    description.textContent = `${plant.minutes} focus minutes · ${plant.date}`;

    const badge = document.createElement("span");
    badge.className = "garden-plant-badge";
    badge.textContent = "✦ Focus grown";

    details.append(title, description, badge);
    card.append(artwork, details);
    ui.gardenGrid.appendChild(card);
  });
}

function renderSettings() {
  ui.focusDuration.value = data.settings.focusDuration;
  ui.shortDuration.value = data.settings.shortDuration;
  ui.longDuration.value = data.settings.longDuration;
  ui.dailyGoal.value = data.settings.dailyGoal;
}

function saveSettings(event) {
  event.preventDefault();

  const settings = {
    focusDuration: Number(ui.focusDuration.value),
    shortDuration: Number(ui.shortDuration.value),
    longDuration: Number(ui.longDuration.value),
    dailyGoal: Number(ui.dailyGoal.value)
  };

  const limits = {
    focusDuration: 180,
    shortDuration: 60,
    longDuration: 120,
    dailyGoal: 24
  };

  const valid = Object.entries(settings).every(([key, value]) =>
    Number.isInteger(value) && value >= 1 && value <= limits[key]
  );

  if (!valid) {
    ui.settingsMessage.textContent = "Enter valid whole numbers within the allowed ranges.";
    return;
  }

  data.settings = settings;
  resetTimer();
  saveData();
  renderSettings();
  renderStatistics();

  ui.modeHeading.textContent = {
    focus: "Time to focus",
    short: "Take a breather",
    long: "Rest and recharge"
  }[mode];

  ui.timerCaption.textContent = {
    focus: "A little progress goes a long way.",
    short: "Stretch, sip water, breathe.",
    long: "You've earned a proper rest."
  }[mode];

  ui.settingsMessage.textContent = "Settings saved successfully! 🌱";
  showToast("Your settings have been saved.");
}

function playSound() {
  if (!data.soundEnabled) return;

  try {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioClass) return;

    if (!audioContext) audioContext = new AudioClass();

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const start = audioContext.currentTime;

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const time = start + index * 0.18;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.12, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.32);
    });
  } catch (error) {
    console.warn("Unable to play sound:", error);
  }
}

function toggleSound() {
  data.soundEnabled = !data.soundEnabled;

  ui.soundToggle.textContent = data.soundEnabled ? "🔔" : "🔕";
  ui.soundToggle.setAttribute("aria-pressed", String(data.soundEnabled));
  ui.soundToggle.setAttribute(
    "aria-label",
    data.soundEnabled ? "Turn sounds off" : "Turn sounds on"
  );

  saveData();
  showToast(data.soundEnabled ? "Sounds turned on." : "Sounds turned off.");
}

function requestNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  try {
    const result = Notification.requestPermission();
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch (error) {
    console.warn("Notification permission unavailable:", error);
  }
}

function sendNotification(title, message) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body: message,
      tag: "focus-garden-session"
    });
  } catch (error) {
    console.warn("Unable to show notification:", error);
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;

  if (toastTimeout !== null) clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    ui.toast.hidden = true;
    toastTimeout = null;
  }, 2600);
}

function toggleSettings() {
  const opening = ui.settingsPanel.hidden;
  ui.settingsPanel.hidden = !opening;

  if (opening) {
    renderSettings();
    ui.settingsPanel.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
    ui.focusDuration.focus();
  }
}

function closeSettings() {
  ui.settingsPanel.hidden = true;
  ui.settingsToggle.focus();
}

function renderAll() {
  renderTimerState();
  renderPlant();
  renderStatistics();
  renderGarden();
}

ui.startButton.addEventListener("click", () => {
  if (timerState === "running") {
    pauseTimer();
  } else {
    startTimer();
  }
});

ui.resetButton.addEventListener("click", () => resetTimer(true));

ui.modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

ui.soundToggle.addEventListener("click", toggleSound);
ui.settingsToggle.addEventListener("click", toggleSettings);
ui.settingsClose.addEventListener("click", closeSettings);
ui.settingsForm.addEventListener("submit", saveSettings);
ui.completionClose.addEventListener("click", closeCompletion);

ui.completionOverlay.addEventListener("click", (event) => {
  if (event.target === ui.completionOverlay) closeCompletion();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!ui.completionOverlay.hidden) {
      closeCompletion();
    } else if (!ui.settingsPanel.hidden) {
      closeSettings();
    }
  }
});

document.addEventListener("visibilitychange", () => {
  if (timerState !== "running") return;

  remainingMs = getRemainingMs();
  updateTimerDisplay();

  if (remainingMs <= 0) finishTimer();
});

window.addEventListener("focus", renderStatistics);

function initializeApp() {
  ui.settingsPanel.hidden = true;
  ui.completionOverlay.hidden = true;
  ui.soundToggle.textContent = data.soundEnabled ? "🔔" : "🔕";
  ui.soundToggle.setAttribute("aria-pressed", String(data.soundEnabled));

  renderSettings();
  renderAll();

  if (!saveData()) {
    showToast("Storage is unavailable. Progress might not persist after closing the page.");
  }
}

initializeApp();