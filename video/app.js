const STORAGE_KEY = "clipshuffle.webversion.settings.v1";

const COLORS = [
  "#0f766e",
  "#2563eb",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#4d7c0f",
  "#0369a1",
  "#a16207",
];

const VIDEO_EXTENSIONS = new Set([
  ".3gp",
  ".avi",
  ".m2t",
  ".m2ts",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mts",
  ".mxf",
  ".webm",
]);

const EXPORT_CATEGORIES = ["Rockoffs", "Tries", "Gameplay", "Handshakes", "Other"];
const DEFAULT_CATEGORIES = [...EXPORT_CATEGORIES, "Skipped"];
const TAG_HOTKEYS = {
  r: "Rockoffs",
  t: "Tries",
  g: "Gameplay",
  h: "Handshakes",
  o: "Other",
  s: "Skipped",
};
const TRY_PREROLL = 0.8;
const TRY_POSTROLL = 0.4;
const UNDO_LIMIT = 50;

const undoStack = [];

const state = {
  clips: [],
  categories: [],
  categoryOrder: [],
  selectedClipId: null,
  activeFilter: { type: "all", categoryId: null },
  orders: {},
  editTimeline: [],
  settings: {
    projectName: "Clip Shuffle Export",
    week: "",
    season: "",
    seed: "",
    frameRate: 30,
    width: 1080,
    height: 1920,
    defaultDuration: 5,
    previewVolume: 0.85,
    scrubStep: 3,
  },
  title: {
    enabled: true,
    text: "",
    duration: 5.67,
    size: 96,
    x: 0.5,
    y: 0.14,
  },
  fade: {
    enabled: true,
    duration: 5,
  },
  isRendering: false,
};

const previewState = {
  token: 0,
};

const dragState = {
  reorderId: null,
  trim: null,
  title: null,
};

const els = {
  reviewScreen: document.querySelector("#reviewScreen"),
  editScreen: document.querySelector("#editScreen"),
  folderPicker: document.querySelector("#folderPicker"),
  filePicker: document.querySelector("#filePicker"),
  selectFolder: document.querySelector("#selectFolder"),
  selectFiles: document.querySelector("#selectFiles"),
  clearFiles: document.querySelector("#clearFiles"),
  scanSummary: document.querySelector("#scanSummary"),
  projectName: document.querySelector("#projectName"),
  weekInput: document.querySelector("#weekInput"),
  seasonInput: document.querySelector("#seasonInput"),
  categoryList: document.querySelector("#categoryList"),
  addCategory: document.querySelector("#addCategory"),
  videoPlayer: document.querySelector("#videoPlayer"),
  previewMessage: document.querySelector("#previewMessage"),
  playPause: document.querySelector("#playPause"),
  seekControl: document.querySelector("#seekControl"),
  timeDisplay: document.querySelector("#timeDisplay"),
  currentName: document.querySelector("#currentName"),
  currentMeta: document.querySelector("#currentMeta"),
  clipViewCount: document.querySelector("#clipViewCount"),
  undoButton: document.querySelector("#undoButton"),
  prevClip: document.querySelector("#prevClip"),
  nextClip: document.querySelector("#nextClip"),
  toggleInclude: document.querySelector("#toggleInclude"),
  assignButtons: document.querySelector("#assignButtons"),
  clipList: document.querySelector("#clipList"),
  seedInput: document.querySelector("#seedInput"),
  orderTotals: document.querySelector("#orderTotals"),
  gameplayRequired: document.querySelector("#gameplayRequired"),
  shuffleButton: document.querySelector("#shuffleButton"),
  generateButton: document.querySelector("#generateButton"),
  frameRate: document.querySelector("#frameRate"),
  frameWidth: document.querySelector("#frameWidth"),
  frameHeight: document.querySelector("#frameHeight"),
  defaultDuration: document.querySelector("#defaultDuration"),
  scrubStep: document.querySelector("#scrubStep"),
  volumeControl: document.querySelector("#volumeControl"),
  backToReview: document.querySelector("#backToReview"),
  renderButton: document.querySelector("#renderButton"),
  timelineSummary: document.querySelector("#timelineSummary"),
  titleEnabled: document.querySelector("#titleEnabled"),
  titleText: document.querySelector("#titleText"),
  titleDuration: document.querySelector("#titleDuration"),
  titleSize: document.querySelector("#titleSize"),
  fadeEnabled: document.querySelector("#fadeEnabled"),
  fadeDuration: document.querySelector("#fadeDuration"),
  editTimeline: document.querySelector("#editTimeline"),
  timelineDuration: document.querySelector("#timelineDuration"),
  stageWrap: document.querySelector("#stageWrap"),
  renderCanvas: document.querySelector("#renderCanvas"),
  titleOverlay: document.querySelector("#titleOverlay"),
  renderProgressBar: document.querySelector("#renderProgressBar"),
  renderStatus: document.querySelector("#renderStatus"),
  outputPreview: document.querySelector("#outputPreview"),
  toast: document.querySelector("#toast"),
};

function init() {
  const saved = readJson(localStorage.getItem(STORAGE_KEY), {});
  state.categories = saved.categories || defaultCategories();
  state.categoryOrder = saved.categoryOrder || state.categories.map((category) => category.id);
  state.settings = { ...state.settings, ...(saved.settings || {}) };
  state.title = { ...state.title, ...(saved.title || {}) };
  state.fade = { ...state.fade, ...(saved.fade || {}) };
  normalizeCategories();
  bindEvents();
  syncInputsFromState();
  applyPreviewVolume();
  renderReview();
  updateTitleOverlay();
  drawStagePreview();
  registerServiceWorker();
}

function bindEvents() {
  document.addEventListener("keydown", handleUndoHotkey);
  document.addEventListener("keydown", handleTagHotkey);
  document.addEventListener("keydown", handleReviewHotkey);

  els.selectFolder.addEventListener("click", () => els.folderPicker.click());
  els.selectFiles.addEventListener("click", () => els.filePicker.click());
  els.clearFiles.addEventListener("click", clearFiles);
  els.folderPicker.addEventListener("change", (event) => loadFiles(event.currentTarget.files));
  els.filePicker.addEventListener("change", (event) => loadFiles(event.currentTarget.files));

  els.addCategory.addEventListener("click", () => {
    pushUndoState("add category");
    const category = makeCategory(`Category ${state.categories.length + 1}`);
    state.categories.push(category);
    state.categoryOrder.push(category.id);
    clearOrders();
    saveSettings();
    renderReview();
  });

  els.prevClip.addEventListener("click", () => selectAdjacent(-1));
  els.nextClip.addEventListener("click", () => selectAdjacent(1));
  els.undoButton.addEventListener("click", undoLastAction);
  els.toggleInclude.addEventListener("click", toggleCurrentIncluded);
  els.playPause.addEventListener("click", togglePlayback);
  els.seekControl.addEventListener("input", seekFromControl);
  els.shuffleButton.addEventListener("click", () => {
    pushUndoState("shuffle");
    computeOrders();
    renderOrderStats();
    toast("Order shuffled");
  });
  els.generateButton.addEventListener("click", openEditor);
  els.backToReview.addEventListener("click", showReviewScreen);
  els.renderButton.addEventListener("click", renderComposition);

  els.videoPlayer.addEventListener("loadedmetadata", onLoadedMetadata);
  els.videoPlayer.addEventListener("loadeddata", onPreviewReady);
  els.videoPlayer.addEventListener("canplay", onPreviewReady);
  els.videoPlayer.addEventListener("play", updateTransport);
  els.videoPlayer.addEventListener("pause", updateTransport);
  els.videoPlayer.addEventListener("ended", updateTransport);
  els.videoPlayer.addEventListener("timeupdate", updateTransport);
  els.videoPlayer.addEventListener("durationchange", updateTransport);
  els.videoPlayer.addEventListener("error", () => {
    showPreviewMessage("Preview unavailable");
    els.videoPlayer.classList.remove("has-frame");
    updateTransport();
  });

  [
    els.projectName,
    els.weekInput,
    els.seasonInput,
    els.seedInput,
    els.frameRate,
    els.frameWidth,
    els.frameHeight,
    els.defaultDuration,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      syncStateFromInputs();
      clearOrders();
      saveSettings();
      renderOrderStats();
    });
    input.addEventListener("change", () => {
      syncStateFromInputs();
      syncInputsFromState();
      clearOrders();
      saveSettings();
      renderOrderStats();
    });
  });

  els.scrubStep.addEventListener("input", () => {
    syncStateFromInputs();
    saveSettings();
  });
  els.volumeControl.addEventListener("input", () => {
    syncStateFromInputs();
    applyPreviewVolume();
    saveSettings();
  });

  [els.titleEnabled, els.titleText, els.titleDuration, els.titleSize].forEach((input) => {
    input.addEventListener("input", syncEditorControls);
    input.addEventListener("change", syncEditorControls);
  });
  [els.fadeEnabled, els.fadeDuration].forEach((input) => {
    input.addEventListener("input", syncEditorControls);
    input.addEventListener("change", syncEditorControls);
  });

  els.titleOverlay.addEventListener("pointerdown", startTitleDrag);
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

function loadFiles(fileList) {
  const files = Array.from(fileList || []).filter(isVideoFile);
  els.folderPicker.value = "";
  els.filePicker.value = "";
  if (!files.length) {
    toast("No video files selected");
    return;
  }

  revokeObjectUrls();
  state.clips = files.map(fileToClip).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  state.selectedClipId = state.clips[0]?.id || null;
  state.orders = {};
  state.editTimeline = [];
  clearUndoStack();
  renderReview();
  toast(`${state.clips.length} clips loaded`);
}

function clearFiles() {
  if (!state.clips.length) return;
  revokeObjectUrls();
  state.clips = [];
  state.selectedClipId = null;
  state.orders = {};
  state.editTimeline = [];
  clearUndoStack();
  renderReview();
  drawStagePreview();
  toast("Files cleared");
}

function fileToClip(file) {
  const relativePath = normalizeBrowserPath(file.webkitRelativePath || file.name);
  const id = `clip_${hashString(`${relativePath}|${file.size}|${file.lastModified}`).toString(16)}`;
  return {
    id,
    name: file.name,
    file,
    objectUrl: "",
    relativePath,
    extension: extensionForName(file.name),
    size: file.size,
    modified: file.lastModified ? file.lastModified / 1000 : null,
    duration: null,
    width: null,
    height: null,
    included: true,
    categoryId: null,
    marker: null,
    trimStart: null,
    trimEnd: null,
  };
}

function isVideoFile(file) {
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(extensionForName(file.name));
}

function extensionForName(name) {
  const match = String(name || "").toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function normalizeBrowserPath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
    .replace(/\/+/g, "/");
}

function objectUrlForClip(clip) {
  if (!clip.objectUrl) clip.objectUrl = URL.createObjectURL(clip.file);
  return clip.objectUrl;
}

function revokeObjectUrls() {
  state.clips.forEach((clip) => {
    if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl);
    clip.objectUrl = "";
  });
}

function defaultCategories() {
  return DEFAULT_CATEGORIES.map((name, index) =>
    makeCategory(name, COLORS[index % COLORS.length], normalizeCategoryName(name)),
  );
}

function normalizeCategories() {
  const repaired = [];
  const usedIds = new Set();
  const source = Array.isArray(state.categories) ? state.categories : [];

  source.forEach((category) => {
    if (!category || typeof category !== "object") return;
    const name = String(category.name || "").trim();
    if (!name) return;
    let id = String(category.id || "").trim();
    if (!id || usedIds.has(id)) id = makeCategoryId();
    usedIds.add(id);
    repaired.push({
      ...category,
      id,
      name,
      color: category.color || COLORS[repaired.length % COLORS.length],
    });
  });

  state.categories = repaired;
  const existingNames = new Set(
    state.categories.map((category) => normalizeCategoryName(category.name)),
  );
  DEFAULT_CATEGORIES.forEach((name, index) => {
    const normalized = normalizeCategoryName(name);
    if (existingNames.has(normalized)) return;
    const id = usedIds.has(normalized) ? makeCategoryId() : normalized;
    state.categories.push(makeCategory(name, COLORS[index % COLORS.length], id));
    existingNames.add(normalized);
  });

  const validIds = new Set(state.categories.map((category) => category.id));
  const nextOrder = [];
  const sourceOrder = Array.isArray(state.categoryOrder) ? state.categoryOrder : [];
  sourceOrder.forEach((id) => {
    if (validIds.has(id) && !nextOrder.includes(id)) nextOrder.push(id);
  });
  state.categories.forEach((category) => {
    if (!nextOrder.includes(category.id)) nextOrder.push(category.id);
  });
  state.categoryOrder = nextOrder;
}

function makeCategoryId() {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeCategory(name, color = null, id = null) {
  return {
    id: id || makeCategoryId(),
    name,
    color: color || COLORS[state.categories.length % COLORS.length],
  };
}

function pushUndoState(label) {
  const snapshot = createUndoSnapshot();
  const serialized = JSON.stringify(snapshot);
  const previous = undoStack[undoStack.length - 1];
  if (previous?.serialized === serialized) return;
  undoStack.push({ label, snapshot, serialized });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButton();
}

function createUndoSnapshot() {
  return JSON.parse(
    JSON.stringify({
      clips: state.clips.map(({ file, objectUrl, ...clip }) => clip),
      categories: state.categories,
      categoryOrder: state.categoryOrder,
      selectedClipId: state.selectedClipId,
      activeFilter: state.activeFilter,
      orders: state.orders,
      editTimeline: state.editTimeline,
      settings: state.settings,
      title: state.title,
      fade: state.fade,
    }),
  );
}

function restoreUndoSnapshot(snapshot) {
  const fileLookup = new Map(
    state.clips.map((clip) => [clip.id, { file: clip.file, objectUrl: clip.objectUrl }]),
  );
  state.clips = Array.isArray(snapshot.clips)
    ? snapshot.clips
        .map((clip) => ({ ...clip, ...(fileLookup.get(clip.id) || {}) }))
        .filter((clip) => clip.file)
    : [];
  state.categories = Array.isArray(snapshot.categories) ? snapshot.categories : defaultCategories();
  state.categoryOrder = Array.isArray(snapshot.categoryOrder)
    ? snapshot.categoryOrder
    : state.categories.map((category) => category.id);
  state.selectedClipId = snapshot.selectedClipId || null;
  state.activeFilter = normalizeFilter(snapshot.activeFilter);
  state.orders = snapshot.orders || {};
  state.editTimeline = Array.isArray(snapshot.editTimeline) ? snapshot.editTimeline : [];
  state.settings = { ...state.settings, ...(snapshot.settings || {}) };
  state.title = { ...state.title, ...(snapshot.title || {}) };
  state.fade = { ...state.fade, ...(snapshot.fade || {}) };
  normalizeCategories();
}

function undoLastAction() {
  const entry = undoStack.pop();
  if (!entry) {
    toast("Nothing to undo");
    updateUndoButton();
    return;
  }
  restoreUndoSnapshot(entry.snapshot);
  syncInputsFromState();
  applyPreviewVolume();
  renderReview();
  renderEditTimeline();
  updateEditorSummary();
  updateTitleOverlay();
  drawStagePreview();
  saveSettings();
  toast(`Undid ${entry.label}`);
}

function clearUndoStack() {
  undoStack.length = 0;
  updateUndoButton();
}

function updateUndoButton() {
  const entry = undoStack[undoStack.length - 1];
  els.undoButton.disabled = !entry;
  els.undoButton.title = entry ? `Undo ${entry.label}` : "Nothing to undo";
}

function syncInputsFromState() {
  els.projectName.value = state.settings.projectName;
  els.weekInput.value = state.settings.week;
  els.seasonInput.value = state.settings.season;
  els.seedInput.value = state.settings.seed;
  els.frameRate.value = state.settings.frameRate;
  els.frameWidth.value = state.settings.width;
  els.frameHeight.value = state.settings.height;
  els.defaultDuration.value = state.settings.defaultDuration;
  els.scrubStep.value = state.settings.scrubStep;
  els.volumeControl.value = state.settings.previewVolume;

  els.titleEnabled.checked = state.title.enabled;
  els.titleText.value = state.title.text || defaultTitleText();
  els.titleDuration.value = state.title.duration;
  els.titleSize.value = state.title.size;
  els.fadeEnabled.checked = state.fade.enabled;
  els.fadeDuration.value = state.fade.duration;
}

function syncStateFromInputs() {
  state.settings.projectName = els.projectName.value.trim() || generatedProjectName();
  state.settings.week = els.weekInput.value.trim();
  state.settings.season = els.seasonInput.value.trim();
  state.settings.seed = els.seedInput.value.trim();
  state.settings.frameRate = Math.round(numberValue(els.frameRate.value, 30));
  state.settings.width = Math.round(numberValue(els.frameWidth.value, 1080));
  state.settings.height = Math.round(numberValue(els.frameHeight.value, 1920));
  state.settings.defaultDuration = numberValue(els.defaultDuration.value, 5);
  state.settings.scrubStep = numberValue(els.scrubStep.value, 3);
  state.settings.previewVolume = numberValue(els.volumeControl.value, 0.85, true);
}

function syncEditorControls() {
  state.title.enabled = els.titleEnabled.checked;
  state.title.text = els.titleText.value;
  state.title.duration = numberValue(els.titleDuration.value, 5.67);
  state.title.size = Math.round(numberValue(els.titleSize.value, 96));
  state.fade.enabled = els.fadeEnabled.checked;
  state.fade.duration = numberValue(els.fadeDuration.value, 5, true);
  saveSettings();
  updateEditorSummary();
  updateTitleOverlay();
  drawStagePreview();
}

function saveSettings() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categories: state.categories,
      categoryOrder: state.categoryOrder,
      settings: state.settings,
      title: state.title,
      fade: state.fade,
    }),
  );
}

function renderReview() {
  normalizeCategories();
  normalizeActiveFilter();
  syncSelectedClipWithFilter();
  renderSummary();
  renderCategories();
  renderCurrentClip();
  renderAssignButtons();
  renderClipList();
  renderOrderStats();
  updateUndoButton();
}

function renderSummary() {
  const assigned = state.clips.filter((clip) => clip.categoryId && clip.included !== false).length;
  const included = state.clips.filter((clip) => clip.included !== false).length;
  els.scanSummary.textContent = state.clips.length
    ? `${state.clips.length} loaded, ${included} included, ${assigned} assigned`
    : "No clips loaded";
}

function renderCategories() {
  els.categoryList.replaceChildren();
  state.categoryOrder = state.categoryOrder.filter((id) =>
    state.categories.some((category) => category.id === id),
  );
  state.categories.forEach((category) => {
    if (!state.categoryOrder.includes(category.id)) state.categoryOrder.push(category.id);
  });

  state.categoryOrder.forEach((categoryId) => {
    const category = getCategory(categoryId);
    if (!category) return;
    const builtIn = isDefaultCategory(category);
    const row = document.createElement("div");
    row.className = "category-row";
    if (builtIn) row.classList.add("built-in");

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = category.color;

    const input = document.createElement("input");
    input.value = category.name;
    input.readOnly = builtIn;
    if (!builtIn) {
      input.addEventListener("input", () => {
        category.name = input.value.trim() || "Category";
        normalizeCategories();
        saveSettings();
        renderAssignButtons();
        renderClipList();
        renderOrderStats();
      });
    }

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(countClips(category.id));

    const up = document.createElement("button");
    up.type = "button";
    up.className = "small-button";
    up.textContent = "Up";
    up.addEventListener("click", () => moveCategory(category.id, -1));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "small-button";
    del.textContent = "Del";
    del.disabled = builtIn;
    if (!builtIn) del.addEventListener("click", () => deleteCategory(category.id));

    row.append(swatch, input, count, up, del);
    els.categoryList.append(row);
  });
}

function renderCurrentClip() {
  const clip = currentClip();
  const hasClip = Boolean(clip);
  els.prevClip.disabled = !hasClip;
  els.nextClip.disabled = !hasClip;
  els.toggleInclude.disabled = !hasClip;

  if (!clip) {
    els.currentName.textContent = "No clip selected";
    els.currentMeta.textContent = "";
    els.videoPlayer.pause();
    els.videoPlayer.removeAttribute("src");
    els.videoPlayer.classList.remove("has-frame");
    delete els.videoPlayer.dataset.clipId;
    els.videoPlayer.load();
    updateTransport();
    showPreviewMessage("No clip selected");
    return;
  }

  els.currentName.textContent = clip.name;
  els.currentMeta.textContent = clipMeta(clip);
  els.toggleInclude.textContent = clip.included === false ? "Include" : "Exclude";
  loadBrowserPreview(clip);
}

function loadBrowserPreview(clip) {
  if (els.videoPlayer.dataset.clipId === clip.id) return;
  nextPreviewToken();
  els.videoPlayer.dataset.clipId = clip.id;
  els.videoPlayer.classList.remove("has-frame");
  showPreviewMessage("Loading preview");
  els.videoPlayer.src = objectUrlForClip(clip);
  els.videoPlayer.load();
  updateTransport();
  attemptAutoplay();
}

function nextPreviewToken() {
  previewState.token += 1;
  return previewState.token;
}

function onLoadedMetadata() {
  const clip = currentClip();
  if (!clip || els.videoPlayer.dataset.clipId !== clip.id) return;
  const duration = els.videoPlayer.duration;
  if (Number.isFinite(duration) && duration > 0) {
    clip.duration = duration;
    if (!Number.isFinite(clip.trimStart)) clip.trimStart = 0;
    if (!Number.isFinite(clip.trimEnd)) clip.trimEnd = duration;
  }
  if (els.videoPlayer.videoWidth) clip.width = els.videoPlayer.videoWidth;
  if (els.videoPlayer.videoHeight) clip.height = els.videoPlayer.videoHeight;
  seekPreviewFrame();
  updateTransport();
  renderCurrentMeta();
  renderSummary();
  renderClipList();
}

function seekPreviewFrame() {
  const duration = els.videoPlayer.duration;
  if (!Number.isFinite(duration) || duration <= 1) return;
  const target = Math.min(Math.max(duration * 0.12, 0.75), 4);
  try {
    els.videoPlayer.currentTime = target;
  } catch {
    // Some codecs refuse programmatic seek until more data arrives.
  }
}

function onPreviewReady() {
  const clip = currentClip();
  if (!clip || els.videoPlayer.dataset.clipId !== clip.id) return;
  els.videoPlayer.classList.add("has-frame");
  hidePreviewMessage();
  updateTransport();
}

function renderCurrentMeta() {
  const clip = currentClip();
  els.currentMeta.textContent = clip ? clipMeta(clip) : "";
}

function togglePlayback() {
  if (!els.videoPlayer.src) return;
  if (els.videoPlayer.paused || els.videoPlayer.ended) {
    attemptAutoplay();
  } else {
    els.videoPlayer.pause();
  }
  updateTransport();
}

function seekFromControl() {
  const duration = els.videoPlayer.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  els.videoPlayer.currentTime = (Number(els.seekControl.value) / 1000) * duration;
  updateTransport();
}

function scrubPreview(deltaSeconds) {
  if (!els.videoPlayer.src) return;
  const current = Number.isFinite(els.videoPlayer.currentTime) ? els.videoPlayer.currentTime : 0;
  const duration = Number.isFinite(els.videoPlayer.duration) ? els.videoPlayer.duration : null;
  const target = Math.max(
    0,
    duration ? Math.min(duration, current + deltaSeconds) : current + deltaSeconds,
  );
  try {
    els.videoPlayer.currentTime = target;
  } catch {
    return;
  }
  updateTransport();
}

function updateTransport() {
  const duration = Number.isFinite(els.videoPlayer.duration) ? els.videoPlayer.duration : 0;
  const current = Number.isFinite(els.videoPlayer.currentTime) ? els.videoPlayer.currentTime : 0;
  els.playPause.textContent = els.videoPlayer.paused || els.videoPlayer.ended ? "Play" : "Pause";
  els.playPause.disabled = !els.videoPlayer.src;
  els.seekControl.disabled = !els.videoPlayer.src || duration <= 0;
  els.seekControl.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
  els.timeDisplay.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
}

function applyPreviewVolume() {
  els.videoPlayer.volume = Math.min(1, Math.max(0, state.settings.previewVolume));
}

function attemptAutoplay() {
  applyPreviewVolume();
  const playPromise = els.videoPlayer.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => showPreviewMessage("Press play to preview"));
  }
}

function renderAssignButtons() {
  els.assignButtons.replaceChildren();
  const clip = currentClip();
  state.categoryOrder.forEach((categoryId) => {
    const category = getCategory(categoryId);
    if (!category) return;

    const group = document.createElement("div");
    group.className = "assign-control";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "assign-button";
    if (clip?.categoryId === category.id) button.classList.add("active");
    button.disabled = !clip;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = category.color;
    const label = document.createElement("span");
    label.textContent = category.name;
    button.append(swatch, label);
    button.addEventListener("click", () => assignCurrent(category.id, currentPreviewTime()));

    const filter = document.createElement("button");
    filter.type = "button";
    filter.className = "filter-button";
    if (isActiveFilter("category", category.id)) filter.classList.add("active");
    filter.title = `Filter ${category.name}`;
    filter.setAttribute("aria-label", `Filter ${category.name}`);
    filter.append(makeFilterIcon());
    filter.addEventListener("click", () => setFilter({ type: "category", categoryId: category.id }));

    group.append(button, filter);
    els.assignButtons.append(group);
  });

  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Unassign";
  clear.disabled = !clip || !clip.categoryId;
  clear.addEventListener("click", () => assignCurrent(null, null));
  els.assignButtons.append(clear);

  const unassigned = document.createElement("button");
  unassigned.type = "button";
  unassigned.className = "filter-chip";
  if (isActiveFilter("unassigned")) unassigned.classList.add("active");
  unassigned.textContent = "Unassigned";
  unassigned.addEventListener("click", () => setFilter({ type: "unassigned", categoryId: null }));
  els.assignButtons.append(unassigned);

  const clearFilter = document.createElement("button");
  clearFilter.type = "button";
  clearFilter.className = "filter-chip";
  clearFilter.textContent = "Clear filter";
  clearFilter.disabled = isActiveFilter("all");
  clearFilter.addEventListener("click", () => setFilter({ type: "all", categoryId: null }));
  els.assignButtons.append(clearFilter);
}

function makeFilterIcon() {
  const icon = document.createElement("span");
  icon.className = "filter-icon";
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function renderClipList() {
  els.clipList.replaceChildren();
  const clips = filteredClips();
  renderClipViewCount(clips.length);
  if (!clips.length) {
    const empty = document.createElement("div");
    empty.className = "clip-empty";
    empty.textContent = emptyFilterMessage();
    els.clipList.append(empty);
    return;
  }

  clips.forEach((clip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "clip-item";
    const category = getCategory(clip.categoryId);
    if (category) button.classList.add("assigned");
    if (clip.id === state.selectedClipId) button.classList.add("selected");
    if (clip.included === false) button.classList.add("excluded");
    button.addEventListener("click", () => selectClip(clip.id));

    const text = document.createElement("div");
    text.className = "clip-text";
    const name = document.createElement("div");
    name.className = "clip-name";
    name.textContent = clip.name;
    const subline = document.createElement("div");
    subline.className = "clip-subline";
    subline.textContent = clip.relativePath;
    text.append(name, subline);

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = clip.included === false ? "Excluded" : category?.name || "Unassigned";

    button.append(text, pill);
    els.clipList.append(button);
  });
}

function renderClipViewCount(visibleCount = filteredClips().length) {
  els.clipViewCount.textContent = `${visibleCount} / ${state.clips.length} clips`;
}

function renderOrderStats() {
  els.orderTotals.replaceChildren();
  state.categoryOrder.forEach((categoryId) => {
    const category = getCategory(categoryId);
    if (!category) return;

    const item = document.createElement("span");
    item.className = "total-pill";
    item.textContent = `${category.name}: ${countClips(category.id)}`;
    els.orderTotals.append(item);
  });

  const tries = countClipsByName("Tries");
  const gameplay = countClipsByName("Gameplay");
  const required = Math.max(0, Math.ceil(tries / 3) - 1);
  let status = "perfect";
  if (gameplay < required) status = "short";
  if (gameplay > required) status = "surplus";

  els.gameplayRequired.className = `gameplay-required ${status}`;
  els.gameplayRequired.textContent = `Gameplay required: ${required}`;
}

function assignCurrent(categoryId, marker) {
  const clip = currentClip();
  if (!clip) return;
  const category = getCategory(categoryId);
  pushUndoState(category ? `tag ${category.name}` : "unassign");
  const oldIndex = state.clips.findIndex((item) => item.id === clip.id);
  clip.categoryId = categoryId;
  clip.marker = Number.isFinite(marker) ? marker : clip.marker;
  if (isExportCategoryId(categoryId) && Number.isFinite(marker)) {
    setClipTrimFromMarker(clip, marker);
  }
  if (!isExportCategoryId(categoryId)) {
    clip.trimStart = null;
    clip.trimEnd = null;
  }
  clearOrders();
  syncSelectedClipWithFilter(oldIndex);
  renderReview();
}

function setClipTrimFromMarker(clip, marker) {
  const sourceDuration = clipDuration(clip);
  const start = Math.max(0, marker - TRY_PREROLL);
  const end = Math.min(sourceDuration, marker + TRY_POSTROLL);
  clip.trimStart = Math.min(start, Math.max(0, sourceDuration - 0.1));
  clip.trimEnd = Math.max(clip.trimStart + 0.1, end);
}

function setFilter(filter) {
  state.activeFilter = normalizeFilter(filter);
  syncSelectedClipWithFilter();
  renderReview();
}

function handleTagHotkey(event) {
  if (event.repeat) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;

  const categoryName = TAG_HOTKEYS[String(event.key || "").toLowerCase()];
  if (!categoryName || !currentClip()) return;

  const category = state.categories.find(
    (item) => normalizeCategoryName(item.name) === normalizeCategoryName(categoryName),
  );
  if (!category) return;

  event.preventDefault();
  assignCurrent(category.id, currentPreviewTime());
}

function handleUndoHotkey(event) {
  const key = String(event.key || "").toLowerCase();
  if (key !== "z" || event.shiftKey || (!event.metaKey && !event.ctrlKey)) return;
  if (isTypingTarget(event.target)) return;

  event.preventDefault();
  undoLastAction();
}

function handleReviewHotkey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;

  const scrubStep = numberValue(els.scrubStep.value, state.settings.scrubStep || 3);
  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectAdjacent(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    selectAdjacent(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    scrubPreview(-scrubStep);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    scrubPreview(scrubStep);
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function toggleCurrentIncluded() {
  const clip = currentClip();
  if (!clip) return;
  pushUndoState(clip.included === false ? "include clip" : "exclude clip");
  clip.included = clip.included === false;
  clearOrders();
  renderReview();
}

function moveCategory(categoryId, delta) {
  const index = state.categoryOrder.indexOf(categoryId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= state.categoryOrder.length) return;
  pushUndoState("category order");
  const [item] = state.categoryOrder.splice(index, 1);
  state.categoryOrder.splice(next, 0, item);
  clearOrders();
  saveSettings();
  renderReview();
}

function deleteCategory(categoryId) {
  if (isDefaultCategory(getCategory(categoryId))) {
    toast("Built-in categories stay available");
    return;
  }
  pushUndoState("delete category");
  state.categories = state.categories.filter((category) => category.id !== categoryId);
  state.categoryOrder = state.categoryOrder.filter((id) => id !== categoryId);
  state.clips.forEach((clip) => {
    if (clip.categoryId === categoryId) clip.categoryId = null;
  });
  clearOrders();
  saveSettings();
  renderReview();
}

function selectClip(id) {
  state.selectedClipId = id;
  renderCurrentClip();
  renderAssignButtons();
  renderClipList();
}

function selectAdjacent(direction) {
  const clips = filteredClips();
  if (!clips.length) return;
  const currentIndex = Math.max(
    0,
    clips.findIndex((clip) => clip.id === state.selectedClipId),
  );
  const nextIndex = (currentIndex + direction + clips.length) % clips.length;
  selectClip(clips[nextIndex].id);
}

function computeOrders() {
  syncStateFromInputs();
  const seedBase = state.settings.seed || String(Date.now());
  state.orders = {};
  exportCategoryIds().forEach((categoryId) => {
    const clips = state.clips
      .filter((clip) => clip.included !== false && clip.categoryId === categoryId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const rng = mulberry32(hashString(`${seedBase}:${categoryId}`));
    state.orders[categoryId] = shuffle(clips.map((clip) => clip.id), rng);
  });
}

function orderedClipsFor(categoryId) {
  const clips = state.clips
    .filter((clip) => clip.included !== false && clip.categoryId === categoryId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const order = state.orders[categoryId] || [];
  if (!order.length) return clips;
  const lookup = new Map(clips.map((clip) => [clip.id, clip]));
  const ordered = order.map((id) => lookup.get(id)).filter(Boolean);
  const seen = new Set(ordered.map((clip) => clip.id));
  return ordered.concat(clips.filter((clip) => !seen.has(clip.id)));
}

function openEditor() {
  syncStateFromInputs();
  if (!state.clips.length) {
    toast("Load clips first");
    return;
  }
  const exportableIds = new Set(exportCategoryIds());
  const assigned = state.clips.some(
    (clip) => clip.included !== false && exportableIds.has(clip.categoryId),
  );
  if (!assigned) {
    toast("Assign at least one clip");
    return;
  }
  buildEditTimeline();
  state.title.text = state.title.text || defaultTitleText();
  syncInputsFromState();
  els.reviewScreen.hidden = true;
  els.editScreen.hidden = false;
  renderEditTimeline();
  updateEditorSummary();
  updateTitleOverlay();
  drawStagePreview();
}

function showReviewScreen() {
  els.editScreen.hidden = true;
  els.reviewScreen.hidden = false;
  renderReview();
}

function buildEditTimeline() {
  const timeline = [];
  exportCategoryIds().forEach((categoryId) => {
    orderedClipsFor(categoryId).forEach((clip) => {
      const sourceDuration = clipDuration(clip);
      const start = clamp(
        Number.isFinite(clip.trimStart) ? clip.trimStart : 0,
        0,
        Math.max(0, sourceDuration - 0.1),
      );
      const end = clamp(
        Number.isFinite(clip.trimEnd) ? clip.trimEnd : sourceDuration,
        start + 0.1,
        sourceDuration,
      );
      timeline.push({
        id: `item_${clip.id}_${timeline.length}`,
        clipId: clip.id,
        categoryId,
        start,
        end,
      });
    });
  });
  state.editTimeline = timeline;
}

function renderEditTimeline(activeId = null) {
  els.editTimeline.replaceChildren();
  if (!state.editTimeline.length) {
    const empty = document.createElement("div");
    empty.className = "clip-empty";
    empty.textContent = "No clips in the generated timeline";
    els.editTimeline.append(empty);
    return;
  }

  state.editTimeline.forEach((item, index) => {
    const clip = getClip(item.clipId);
    if (!clip) return;
    const category = getCategory(item.categoryId);
    const node = document.createElement("article");
    node.className = "timeline-item";
    if (item.id === activeId) node.classList.add("dragging");
    node.dataset.itemId = item.id;

    const header = document.createElement("div");
    header.className = "timeline-item-header";
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.addEventListener("pointerdown", (event) => startTimelineReorder(event, item.id));

    const title = document.createElement("div");
    title.className = "timeline-item-title";
    const strong = document.createElement("strong");
    strong.textContent = clip.name;
    const sub = document.createElement("span");
    sub.textContent = `${category?.name || "Clip"} | ${formatDuration(itemDuration(item))}`;
    title.append(strong, sub);

    const actions = document.createElement("div");
    actions.className = "timeline-item-actions";
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "Up";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveTimelineItem(index, index - 1));
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "Down";
    down.disabled = index === state.editTimeline.length - 1;
    down.addEventListener("click", () => moveTimelineItem(index, index + 1));
    actions.append(up, down);

    header.append(handle, title, actions);
    const trimArea = document.createElement("div");
    trimArea.className = "trim-area";
    const trimBar = document.createElement("div");
    trimBar.className = "trim-bar";
    trimBar.dataset.itemId = item.id;
    const selected = document.createElement("div");
    selected.className = "trim-selected";
    const startHandle = document.createElement("span");
    startHandle.className = "trim-handle start";
    const endHandle = document.createElement("span");
    endHandle.className = "trim-handle end";
    startHandle.addEventListener("pointerdown", (event) => startTrimDrag(event, item.id, "start"));
    endHandle.addEventListener("pointerdown", (event) => startTrimDrag(event, item.id, "end"));
    trimBar.append(selected, startHandle, endHandle);

    const times = document.createElement("div");
    times.className = "trim-times";
    times.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    trimArea.append(trimBar, times);
    node.append(header, trimArea);
    els.editTimeline.append(node);
    updateTimelineItemDisplay(item.id);
  });
}

function moveTimelineItem(from, to) {
  if (from === to || to < 0 || to >= state.editTimeline.length) return;
  pushUndoState("timeline order");
  const [item] = state.editTimeline.splice(from, 1);
  state.editTimeline.splice(to, 0, item);
  renderEditTimeline(item.id);
  updateEditorSummary();
  drawStagePreview();
}

function startTimelineReorder(event, itemId) {
  event.preventDefault();
  dragState.reorderId = itemId;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const row = event.currentTarget.closest(".timeline-item");
  row?.classList.add("dragging");
}

function onTimelineReorderMove(event) {
  const itemId = dragState.reorderId;
  if (!itemId) return;
  const targetRow = document.elementsFromPoint(event.clientX, event.clientY).find((node) =>
    node.classList?.contains("timeline-item"),
  );
  if (!targetRow) return;
  const targetId = targetRow.dataset.itemId;
  if (!targetId || targetId === itemId) return;
  const from = state.editTimeline.findIndex((item) => item.id === itemId);
  const to = state.editTimeline.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [item] = state.editTimeline.splice(from, 1);
  state.editTimeline.splice(to, 0, item);
  renderEditTimeline(itemId);
  updateEditorSummary();
}

function startTrimDrag(event, itemId, edge) {
  event.preventDefault();
  const bar = event.currentTarget.closest(".trim-bar");
  if (!bar) return;
  const item = getTimelineItem(itemId);
  if (!item) return;
  dragState.trim = {
    itemId,
    edge,
    rect: bar.getBoundingClientRect(),
    sourceDuration: itemSourceDuration(item),
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onTrimMove(event) {
  const trim = dragState.trim;
  if (!trim) return;
  const item = getTimelineItem(trim.itemId);
  if (!item) return;
  const ratio = clamp((event.clientX - trim.rect.left) / trim.rect.width, 0, 1);
  const value = ratio * trim.sourceDuration;
  if (trim.edge === "start") {
    item.start = clamp(value, 0, item.end - 0.1);
  } else {
    item.end = clamp(value, item.start + 0.1, trim.sourceDuration);
  }
  updateTimelineItemDisplay(item.id);
  updateEditorSummary();
  drawStagePreview();
}

function updateTimelineItemDisplay(itemId) {
  const item = getTimelineItem(itemId);
  const row = item ? els.editTimeline.querySelector(`[data-item-id="${cssEscape(itemId)}"]`) : null;
  if (!item || !row) return;
  const duration = itemSourceDuration(item);
  const startPct = duration > 0 ? (item.start / duration) * 100 : 0;
  const endPct = duration > 0 ? (item.end / duration) * 100 : 100;
  const selected = row.querySelector(".trim-selected");
  const startHandle = row.querySelector(".trim-handle.start");
  const endHandle = row.querySelector(".trim-handle.end");
  const times = row.querySelectorAll(".trim-times span");
  const sub = row.querySelector(".timeline-item-title span");
  selected.style.left = `${startPct}%`;
  selected.style.width = `${Math.max(0, endPct - startPct)}%`;
  startHandle.style.left = `${startPct}%`;
  endHandle.style.right = `${100 - endPct}%`;
  times[0].textContent = formatPreciseTime(item.start);
  times[1].textContent = formatDuration(itemDuration(item));
  times[2].textContent = formatPreciseTime(item.end);
  if (sub) {
    const category = getCategory(item.categoryId);
    sub.textContent = `${category?.name || "Clip"} | ${formatDuration(itemDuration(item))}`;
  }
}

function updateEditorSummary() {
  const clipCount = state.editTimeline.length;
  const duration = timelineDuration();
  els.timelineSummary.textContent = `${clipCount} clips | ${formatDuration(duration)}`;
  els.timelineDuration.textContent = formatDuration(duration);
  els.renderButton.disabled = state.isRendering || !clipCount;
}

function startTitleDrag(event) {
  if (!state.title.enabled) return;
  event.preventDefault();
  dragState.title = {
    rect: els.stageWrap.getBoundingClientRect(),
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onTitleMove(event) {
  const titleDrag = dragState.title;
  if (!titleDrag) return;
  const x = clamp((event.clientX - titleDrag.rect.left) / titleDrag.rect.width, 0.04, 0.96);
  const y = clamp((event.clientY - titleDrag.rect.top) / titleDrag.rect.height, 0.04, 0.96);
  state.title.x = x;
  state.title.y = y;
  updateTitleOverlay();
  drawStagePreview();
}

function onWindowPointerMove(event) {
  onTimelineReorderMove(event);
  onTrimMove(event);
  onTitleMove(event);
}

function onWindowPointerUp() {
  if (dragState.reorderId || dragState.trim || dragState.title) {
    saveSettings();
  }
  dragState.reorderId = null;
  dragState.trim = null;
  dragState.title = null;
}

function updateTitleOverlay() {
  const text = state.title.text || defaultTitleText();
  els.titleOverlay.hidden = !state.title.enabled || !text.trim();
  els.titleOverlay.textContent = text;
  els.titleOverlay.style.left = `${state.title.x * 100}%`;
  els.titleOverlay.style.top = `${state.title.y * 100}%`;
}

function drawStagePreview() {
  const canvas = els.renderCanvas;
  const ctx = canvas.getContext("2d");
  resizeCanvasToSettings();
  ctx.fillStyle = "#080a0d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#16202b";
  ctx.fillRect(canvas.width * 0.08, canvas.height * 0.2, canvas.width * 0.84, canvas.height * 0.56);
  ctx.fillStyle = "#263544";
  ctx.fillRect(canvas.width * 0.12, canvas.height * 0.24, canvas.width * 0.76, canvas.height * 0.48);
  drawTitle(ctx, 0, Math.max(timelineDuration(), state.title.duration || 0));
}

async function renderComposition() {
  if (state.isRendering) return;
  syncStateFromInputs();
  syncEditorControls();
  resizeCanvasToSettings();

  if (!state.editTimeline.length) {
    toast("No timeline clips to render");
    return;
  }
  if (!els.renderCanvas.captureStream || !window.MediaRecorder) {
    toast("This browser cannot render video from the canvas");
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    toast("This browser cannot mix audio for rendering");
    return;
  }

  const mimeType = chooseRecorderMimeType();
  if (!mimeType) {
    toast("This browser does not report a supported video recorder format");
    return;
  }

  state.isRendering = true;
  updateEditorSummary();
  setRenderProgress(0, "Preparing");
  els.outputPreview.hidden = true;

  const fps = Math.max(1, Math.round(state.settings.frameRate));
  const canvasStream = els.renderCanvas.captureStream(fps);
  const audioContext = new AudioCtx();
  const audioDestination = audioContext.createMediaStreamDestination();
  const renderVideo = document.createElement("video");
  renderVideo.playsInline = true;
  renderVideo.preload = "auto";
  renderVideo.style.display = "none";
  document.body.append(renderVideo);

  const source = audioContext.createMediaElementSource(renderVideo);
  const gain = audioContext.createGain();
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(audioDestination);

  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(outputStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));

  try {
    await audioContext.resume();
    recorder.start(1000);
    await renderTimelineClips(renderVideo, gain, timelineDuration());
    recorder.stop();
    await stopped;
    outputStream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
    renderVideo.remove();

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    els.outputPreview.src = url;
    els.outputPreview.hidden = false;
    downloadBlob(blob, `${slug(state.settings.projectName)}.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
    setRenderProgress(1, "Rendered");
    toast("Video rendered");
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    outputStream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => {});
    renderVideo.remove();
    setRenderProgress(0, "Render failed");
    toast(error.message || "Render failed");
  } finally {
    state.isRendering = false;
    updateEditorSummary();
  }
}

async function renderTimelineClips(renderVideo, gain, totalDuration) {
  let renderedSeconds = 0;
  const ctx = els.renderCanvas.getContext("2d");

  for (const item of state.editTimeline) {
    const clip = getClip(item.clipId);
    if (!clip) continue;
    const duration = itemDuration(item);
    if (duration <= 0) continue;

    setRenderProgress(renderedSeconds / totalDuration, `Loading ${clip.name}`);
    renderVideo.pause();
    renderVideo.src = objectUrlForClip(clip);
    await waitForVideoMetadata(renderVideo);
    await seekVideo(renderVideo, item.start);
    await renderVideo.play();

    const startedAt = performance.now();
    while (true) {
      const elapsed = (performance.now() - startedAt) / 1000;
      const globalTime = renderedSeconds + Math.min(elapsed, duration);
      if (elapsed >= duration || renderVideo.currentTime >= item.end - 0.02) break;
      drawVideoFrame(ctx, renderVideo, globalTime, totalDuration);
      gain.gain.value = fadeGain(globalTime, totalDuration);
      setRenderProgress(globalTime / totalDuration, `Rendering ${clip.name}`);
      await nextAnimationFrame();
    }

    renderVideo.pause();
    renderedSeconds += duration;
  }

  drawVideoFrame(ctx, renderVideo, totalDuration, totalDuration);
  setRenderProgress(1, "Finalizing");
  await wait(250);
}

function drawVideoFrame(ctx, video, globalTime, totalDuration) {
  const canvas = els.renderCanvas;
  ctx.fillStyle = "#080a0d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawContainedVideo(ctx, video, canvas.width, canvas.height);
  }
  drawTitle(ctx, globalTime, totalDuration);
  drawFade(ctx, globalTime, totalDuration);
}

function drawContainedVideo(ctx, video, width, height) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(video, x, y, drawWidth, drawHeight);
}

function drawTitle(ctx, globalTime, totalDuration) {
  const text = state.title.text || defaultTitleText();
  if (!state.title.enabled || !text.trim() || globalTime > state.title.duration) return;
  const canvas = els.renderCanvas;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return;
  const scale = canvas.width / 1080;
  const fontSize = Math.max(12, state.title.size * scale);
  const lineHeight = fontSize * 0.94;
  const x = state.title.x * canvas.width;
  const y = state.title.y * canvas.height;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px Impact, Haettenschweiler, Arial Narrow, sans-serif`;
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0, 255, 128, 0.42)";
  ctx.shadowBlur = 18 * scale;
  ctx.shadowOffsetY = 12 * scale;
  lines.forEach((line, index) => {
    const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
    ctx.strokeStyle = "#15110a";
    ctx.lineWidth = Math.max(4, 7 * scale);
    ctx.strokeText(line, x, lineY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, x, lineY);
  });
  ctx.restore();
}

function drawFade(ctx, globalTime, totalDuration) {
  if (!state.fade.enabled || state.fade.duration <= 0 || totalDuration <= 0) return;
  const fadeStart = Math.max(0, totalDuration - state.fade.duration);
  if (globalTime < fadeStart) return;
  const alpha = clamp((globalTime - fadeStart) / state.fade.duration, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, els.renderCanvas.width, els.renderCanvas.height);
  ctx.restore();
}

function fadeGain(globalTime, totalDuration) {
  if (!state.fade.enabled || state.fade.duration <= 0 || totalDuration <= 0) return 1;
  const fadeStart = Math.max(0, totalDuration - state.fade.duration);
  if (globalTime < fadeStart) return 1;
  return 1 - clamp((globalTime - fadeStart) / state.fade.duration, 0, 1);
}

function resizeCanvasToSettings() {
  const width = Math.max(1, Math.round(state.settings.width));
  const height = Math.max(1, Math.round(state.settings.height));
  if (els.renderCanvas.width !== width) els.renderCanvas.width = width;
  if (els.renderCanvas.height !== height) els.renderCanvas.height = height;
}

function chooseRecorderMimeType() {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function waitForVideoMetadata(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoad);
      video.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load a timeline clip"));
    };
    video.addEventListener("loadedmetadata", onLoad, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs((video.currentTime || 0) - time) < 0.03) {
      resolve();
      return;
    }
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 1200);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = time;
    } catch {
      cleanup();
      resolve();
    }
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setRenderProgress(value, message) {
  const percent = clamp(value, 0, 1) * 100;
  els.renderProgressBar.style.width = `${percent}%`;
  els.renderStatus.textContent = message;
}

function timelineDuration() {
  return state.editTimeline.reduce((total, item) => total + itemDuration(item), 0);
}

function itemDuration(item) {
  return Math.max(0, item.end - item.start);
}

function itemSourceDuration(item) {
  return clipDuration(getClip(item.clipId));
}

function clipDuration(clip) {
  return Math.max(0.1, Number(clip?.duration) || state.settings.defaultDuration || 5);
}

function currentClip() {
  return state.clips.find((clip) => clip.id === state.selectedClipId) || null;
}

function getClip(id) {
  return state.clips.find((clip) => clip.id === id) || null;
}

function getTimelineItem(id) {
  return state.editTimeline.find((item) => item.id === id) || null;
}

function filteredClips() {
  return state.clips.filter((clip) => clipMatchesFilter(clip));
}

function clipMatchesFilter(clip, filter = state.activeFilter) {
  const normalized = normalizeFilter(filter);
  if (normalized.type === "all") return true;
  if (normalized.type === "unassigned") return !clip.categoryId;
  return clip.categoryId === normalized.categoryId;
}

function syncSelectedClipWithFilter(startIndex = 0) {
  if (!state.clips.length) {
    state.selectedClipId = null;
    return;
  }
  const clip = currentClip();
  if (clip && clipMatchesFilter(clip)) return;
  const next = nextFilteredClip(startIndex);
  state.selectedClipId = next ? next.id : null;
}

function nextFilteredClip(startIndex = 0) {
  if (!state.clips.length) return null;
  const safeIndex = Math.min(Math.max(startIndex, 0), state.clips.length - 1);
  for (let offset = 0; offset < state.clips.length; offset += 1) {
    const clip = state.clips[(safeIndex + offset) % state.clips.length];
    if (clipMatchesFilter(clip)) return clip;
  }
  return null;
}

function normalizeActiveFilter() {
  state.activeFilter = normalizeFilter(state.activeFilter);
}

function normalizeFilter(filter) {
  if (!filter || typeof filter !== "object") return { type: "all", categoryId: null };
  if (filter.type === "unassigned") return { type: "unassigned", categoryId: null };
  if (filter.type === "category" && getCategory(filter.categoryId)) {
    return { type: "category", categoryId: filter.categoryId };
  }
  return { type: "all", categoryId: null };
}

function isActiveFilter(type, categoryId = null) {
  const filter = normalizeFilter(state.activeFilter);
  if (filter.type !== type) return false;
  return type !== "category" || filter.categoryId === categoryId;
}

function emptyFilterMessage() {
  if (!state.clips.length) return "No clips loaded";
  const filter = normalizeFilter(state.activeFilter);
  if (filter.type === "unassigned") return "No unassigned clips";
  if (filter.type === "category") return `No ${getCategory(filter.categoryId)?.name || "category"} clips`;
  return "No clips loaded";
}

function getCategory(categoryId) {
  return state.categories.find((category) => category.id === categoryId) || null;
}

function isDefaultCategory(category) {
  const name = normalizeCategoryName(category?.name);
  return DEFAULT_CATEGORIES.some((categoryName) => normalizeCategoryName(categoryName) === name);
}

function exportCategoryIds() {
  const byName = new Map(
    state.categories.map((category) => [normalizeCategoryName(category.name), category.id]),
  );
  const exportIds = EXPORT_CATEGORIES.map((name) => byName.get(normalizeCategoryName(name))).filter(Boolean);
  return exportIds.length
    ? exportIds
    : state.categoryOrder.filter((categoryId) => !isSkippedCategoryId(categoryId));
}

function isSkippedCategoryId(categoryId) {
  return normalizeCategoryName(getCategory(categoryId)?.name) === normalizeCategoryName("Skipped");
}

function isExportCategoryId(categoryId) {
  const name = normalizeCategoryName(getCategory(categoryId)?.name);
  return EXPORT_CATEGORIES.some((categoryName) => normalizeCategoryName(categoryName) === name);
}

function currentPreviewTime() {
  const clip = currentClip();
  if (!clip || els.videoPlayer.dataset.clipId !== clip.id) return null;
  const time = els.videoPlayer.currentTime;
  return Number.isFinite(time) && time >= 0 ? time : null;
}

function normalizeCategoryName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function countClips(categoryId) {
  return state.clips.filter(
    (clip) => clip.included !== false && clip.categoryId === categoryId,
  ).length;
}

function countClipsByName(name) {
  const categoryIds = state.categories
    .filter((category) => normalizeCategoryName(category.name) === normalizeCategoryName(name))
    .map((category) => category.id);
  if (!categoryIds.length) return 0;
  return state.clips.filter(
    (clip) => clip.included !== false && categoryIds.includes(clip.categoryId),
  ).length;
}

function clearOrders() {
  state.orders = {};
}

function clipMeta(clip) {
  const bits = [];
  if (clip.duration) bits.push(formatDuration(clip.duration));
  if (clip.width && clip.height) bits.push(`${clip.width}x${clip.height}`);
  if (Number.isFinite(clip.marker)) bits.push(`Mark ${formatPreciseTime(clip.marker)}`);
  bits.push(formatBytes(clip.size || 0));
  return bits.join(" | ");
}

function defaultTitleText() {
  const week = state.settings.week.trim();
  const season = state.settings.season.trim();
  const lines = [];
  if (week) lines.push(week.toLowerCase().startsWith("week ") ? week : `Week ${week}`);
  if (season) lines.push(season);
  return lines.join("\n");
}

function generatedProjectName() {
  const text = defaultTitleText().replace(/\n+/g, " ").trim();
  return text || "Clip Shuffle Export";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatPreciseTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function showPreviewMessage(message) {
  els.previewMessage.hidden = false;
  els.previewMessage.textContent = message;
}

function hidePreviewMessage() {
  els.previewMessage.hidden = true;
  els.previewMessage.textContent = "";
}

function shuffle(items, rng) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function mulberry32(seed) {
  return function next() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function numberValue(value, fallback, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return allowZero ? Math.max(0, number) : number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slug(value) {
  return (value || "clip-shuffle").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function readJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2800);
}

init();
