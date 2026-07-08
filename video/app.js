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
  selectedTimelineItemId: null,
  timelineZoom: 100,
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
    font: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    color: "#ffffff",
    outlineColor: "#15110a",
    outlineWidth: 7,
    shadowColor: "#00ff80",
    shadowBlur: 18,
    shadowX: 0,
    shadowY: 12,
    shadowOpacity: 0.42,
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

const editPreviewState = {
  playing: false,
  rafId: null,
  time: 0,
  token: 0,
  itemId: null,
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
  titleFont: document.querySelector("#titleFont"),
  titleColor: document.querySelector("#titleColor"),
  titleOutlineColor: document.querySelector("#titleOutlineColor"),
  titleOutlineWidth: document.querySelector("#titleOutlineWidth"),
  titleShadowColor: document.querySelector("#titleShadowColor"),
  titleShadowBlur: document.querySelector("#titleShadowBlur"),
  titleShadowX: document.querySelector("#titleShadowX"),
  titleShadowY: document.querySelector("#titleShadowY"),
  titleShadowOpacity: document.querySelector("#titleShadowOpacity"),
  fadeEnabled: document.querySelector("#fadeEnabled"),
  fadeDuration: document.querySelector("#fadeDuration"),
  editTimeline: document.querySelector("#editTimeline"),
  timelineDuration: document.querySelector("#timelineDuration"),
  timelineZoom: document.querySelector("#timelineZoom"),
  editPlayPause: document.querySelector("#editPlayPause"),
  editTimeDisplay: document.querySelector("#editTimeDisplay"),
  editSeekControl: document.querySelector("#editSeekControl"),
  selectedClipMeta: document.querySelector("#selectedClipMeta"),
  clipInspector: document.querySelector("#clipInspector"),
  stageWrap: document.querySelector("#stageWrap"),
  renderCanvas: document.querySelector("#renderCanvas"),
  titleOverlay: document.querySelector("#titleOverlay"),
  renderVideo: document.querySelector("#renderVideo"),
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
  state.timelineZoom = numberValue(saved.timelineZoom, state.timelineZoom);
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
  els.editPlayPause.addEventListener("click", toggleEditPreviewPlayback);
  els.editSeekControl.addEventListener("input", () => {
    const total = timelineDuration();
    const time = total > 0 ? (Number(els.editSeekControl.value) / 1000) * total : 0;
    seekEditPreview(time);
  });
  els.timelineZoom.addEventListener("input", () => {
    state.timelineZoom = numberValue(els.timelineZoom.value, 100);
    renderEditTimeline(state.selectedTimelineItemId);
  });

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

  [
    els.titleEnabled,
    els.titleText,
    els.titleDuration,
    els.titleSize,
    els.titleFont,
    els.titleColor,
    els.titleOutlineColor,
    els.titleOutlineWidth,
    els.titleShadowColor,
    els.titleShadowBlur,
    els.titleShadowX,
    els.titleShadowY,
    els.titleShadowOpacity,
  ].forEach((input) => {
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
      selectedTimelineItemId: state.selectedTimelineItemId,
      timelineZoom: state.timelineZoom,
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
  state.selectedTimelineItemId = snapshot.selectedTimelineItemId || state.editTimeline[0]?.id || null;
  state.timelineZoom = numberValue(snapshot.timelineZoom, state.timelineZoom || 100);
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
  els.titleFont.value = state.title.font;
  els.titleColor.value = state.title.color;
  els.titleOutlineColor.value = state.title.outlineColor;
  els.titleOutlineWidth.value = state.title.outlineWidth;
  els.titleShadowColor.value = state.title.shadowColor;
  els.titleShadowBlur.value = state.title.shadowBlur;
  els.titleShadowX.value = state.title.shadowX;
  els.titleShadowY.value = state.title.shadowY;
  els.titleShadowOpacity.value = state.title.shadowOpacity;
  els.fadeEnabled.checked = state.fade.enabled;
  els.fadeDuration.value = state.fade.duration;
  els.timelineZoom.value = state.timelineZoom;
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

function syncEditorControls(eventOrOptions = {}) {
  const redraw = eventOrOptions?.redraw !== false;
  state.title.enabled = els.titleEnabled.checked;
  state.title.text = els.titleText.value;
  state.title.duration = numberValue(els.titleDuration.value, 5.67);
  state.title.size = Math.round(numberValue(els.titleSize.value, 96));
  state.title.font = els.titleFont.value;
  state.title.color = els.titleColor.value || "#ffffff";
  state.title.outlineColor = els.titleOutlineColor.value || "#15110a";
  state.title.outlineWidth = numberValue(els.titleOutlineWidth.value, 7, true);
  state.title.shadowColor = els.titleShadowColor.value || "#00ff80";
  state.title.shadowBlur = numberValue(els.titleShadowBlur.value, 18, true);
  state.title.shadowX = Number.isFinite(Number(els.titleShadowX.value)) ? Number(els.titleShadowX.value) : 0;
  state.title.shadowY = Number.isFinite(Number(els.titleShadowY.value)) ? Number(els.titleShadowY.value) : 12;
  state.title.shadowOpacity = clamp(numberValue(els.titleShadowOpacity.value, 0.42, true), 0, 1);
  state.fade.enabled = els.fadeEnabled.checked;
  state.fade.duration = numberValue(els.fadeDuration.value, 5, true);
  saveSettings();
  updateEditorSummary();
  updateTitleOverlay();
  if (redraw) drawEditPreviewAt(editPreviewState.time);
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
      timelineZoom: state.timelineZoom,
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
  state.selectedTimelineItemId = state.editTimeline[0]?.id || null;
  editPreviewState.time = 0;
  state.title.text = state.title.text || defaultTitleText();
  syncInputsFromState();
  els.reviewScreen.hidden = true;
  els.editScreen.hidden = false;
  renderEditTimeline();
  updateEditorSummary();
  updateTitleOverlay();
  drawEditPreviewAt(0);
}

function showReviewScreen() {
  pauseEditPreview();
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
    renderClipInspector();
    return;
  }

  const selectedId = activeId || state.selectedTimelineItemId || state.editTimeline[0]?.id;
  state.selectedTimelineItemId = selectedId;
  els.editTimeline.style.minWidth = `${Math.max(320, timelineDuration() * state.timelineZoom)}px`;

  state.editTimeline.forEach((item, index) => {
    const clip = getClip(item.clipId);
    if (!clip) return;
    const category = getCategory(item.categoryId);
    const node = document.createElement("article");
    node.className = "timeline-item";
    if (item.id === selectedId) node.classList.add("selected");
    if (item.id === activeId) node.classList.add("dragging");
    node.dataset.itemId = item.id;
    node.style.flexBasis = `${Math.max(76, itemDuration(item) * state.timelineZoom)}px`;
    node.addEventListener("click", () => selectTimelineItem(item.id));

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      startTimelineReorder(event, item.id);
    });

    const title = document.createElement("div");
    title.className = "timeline-item-title";
    const strong = document.createElement("strong");
    strong.textContent = clip.name;
    const sub = document.createElement("span");
    sub.textContent = `${category?.name || "Clip"} | ${formatDuration(itemDuration(item))}`;
    title.append(strong, sub);

    const startHandle = document.createElement("span");
    startHandle.className = "trim-handle start";
    const endHandle = document.createElement("span");
    endHandle.className = "trim-handle end";
    startHandle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      startTrimDrag(event, item.id, "start");
    });
    endHandle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      startTrimDrag(event, item.id, "end");
    });

    const indexBadge = document.createElement("span");
    indexBadge.className = "timeline-index";
    indexBadge.textContent = String(index + 1);

    node.append(startHandle, handle, title, indexBadge, endHandle);
    els.editTimeline.append(node);
    updateTimelineItemDisplay(item.id);
  });

  const playhead = document.createElement("div");
  playhead.className = "timeline-playhead";
  playhead.style.left = `${editPreviewState.time * state.timelineZoom}px`;
  els.editTimeline.append(playhead);
  renderClipInspector();
}

function moveTimelineItem(from, to) {
  if (from === to || to < 0 || to >= state.editTimeline.length) return;
  pushUndoState("timeline order");
  const [item] = state.editTimeline.splice(from, 1);
  state.editTimeline.splice(to, 0, item);
  state.selectedTimelineItemId = item.id;
  renderEditTimeline(item.id);
  updateEditorSummary();
  drawEditPreviewAt(editPreviewState.time);
}

function startTimelineReorder(event, itemId) {
  event.preventDefault();
  selectTimelineItem(itemId);
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
  state.selectedTimelineItemId = itemId;
  renderEditTimeline(itemId);
  updateEditorSummary();
}

function startTrimDrag(event, itemId, edge) {
  event.preventDefault();
  const item = getTimelineItem(itemId);
  if (!item) return;
  selectTimelineItem(itemId);
  dragState.trim = {
    itemId,
    edge,
    startX: event.clientX,
    originalStart: item.start,
    originalEnd: item.end,
    sourceDuration: itemSourceDuration(item),
    zoom: state.timelineZoom,
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function onTrimMove(event) {
  const trim = dragState.trim;
  if (!trim) return;
  const item = getTimelineItem(trim.itemId);
  if (!item) return;
  const deltaSeconds = (event.clientX - trim.startX) / Math.max(1, trim.zoom);
  if (trim.edge === "start") {
    item.start = clamp(trim.originalStart + deltaSeconds, 0, item.end - 0.1);
  } else {
    item.end = clamp(trim.originalEnd + deltaSeconds, item.start + 0.1, trim.sourceDuration);
  }
  updateTimelineItemDisplay(item.id);
  updateEditorSummary();
  renderClipInspector();
  drawEditPreviewAt(editPreviewState.time);
}

function updateTimelineItemDisplay(itemId) {
  const item = getTimelineItem(itemId);
  const row = item ? els.editTimeline.querySelector(`[data-item-id="${cssEscape(itemId)}"]`) : null;
  if (!item || !row) return;
  const sub = row.querySelector(".timeline-item-title span");
  row.style.flexBasis = `${Math.max(76, itemDuration(item) * state.timelineZoom)}px`;
  if (sub) {
    const category = getCategory(item.categoryId);
    sub.textContent = `${category?.name || "Clip"} | ${formatPreciseTime(item.start)}-${formatPreciseTime(item.end)}`;
  }
}

function selectTimelineItem(itemId, seekToItem = false) {
  const item = getTimelineItem(itemId);
  if (!item) return;
  state.selectedTimelineItemId = itemId;
  els.editTimeline.querySelectorAll(".timeline-item").forEach((row) => {
    row.classList.toggle("selected", row.dataset.itemId === itemId);
  });
  renderClipInspector();
  if (seekToItem) {
    seekEditPreview(timelineItemStartTime(itemId));
  }
}

function renderClipInspector() {
  const item = getTimelineItem(state.selectedTimelineItemId);
  const clip = item ? getClip(item.clipId) : null;
  els.clipInspector.replaceChildren();
  if (!item || !clip) {
    els.selectedClipMeta.textContent = "None selected";
    const empty = document.createElement("div");
    empty.className = "clip-empty";
    empty.textContent = "Select a clip in the timeline";
    els.clipInspector.append(empty);
    return;
  }

  const category = getCategory(item.categoryId);
  els.selectedClipMeta.textContent = `${formatDuration(itemDuration(item))} selected`;

  const meta = document.createElement("div");
  meta.className = "inspector-meta";
  meta.innerHTML = `
    <strong></strong>
    <span></span>
  `;
  meta.querySelector("strong").textContent = clip.name;
  meta.querySelector("span").textContent = `${category?.name || "Clip"} | Source ${formatDuration(itemSourceDuration(item))}`;

  const grid = document.createElement("div");
  grid.className = "timeline-grid inspector-grid";
  const startLabel = makeInspectorNumber("Start", item.start, 0, item.end - 0.1, (value) => {
    item.start = clamp(value, 0, item.end - 0.1);
    renderEditTimeline(item.id);
    updateEditorSummary();
    drawEditPreviewAt(editPreviewState.time);
  });
  const endLabel = makeInspectorNumber("End", item.end, item.start + 0.1, itemSourceDuration(item), (value) => {
    item.end = clamp(value, item.start + 0.1, itemSourceDuration(item));
    renderEditTimeline(item.id);
    updateEditorSummary();
    drawEditPreviewAt(editPreviewState.time);
  });
  const durationLabel = document.createElement("label");
  durationLabel.innerHTML = `<span>Duration</span><input readonly />`;
  durationLabel.querySelector("input").value = formatPreciseTime(itemDuration(item));
  grid.append(startLabel, endLabel, durationLabel);

  const actions = document.createElement("div");
  actions.className = "inspector-actions";
  const index = state.editTimeline.findIndex((entry) => entry.id === item.id);
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "Prev";
  prev.disabled = index <= 0;
  prev.addEventListener("click", () => selectTimelineItem(state.editTimeline[index - 1].id, true));
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.disabled = index >= state.editTimeline.length - 1;
  next.addEventListener("click", () => selectTimelineItem(state.editTimeline[index + 1].id, true));
  const jump = document.createElement("button");
  jump.type = "button";
  jump.textContent = "Jump to Clip";
  jump.addEventListener("click", () => selectTimelineItem(item.id, true));
  actions.append(prev, next, jump);

  els.clipInspector.append(meta, grid, actions);
}

function makeInspectorNumber(label, value, min, max, onChange) {
  const wrapper = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.1";
  input.min = String(Math.max(0, min));
  input.max = String(Math.max(min, max));
  input.value = value.toFixed(1);
  input.addEventListener("change", () => onChange(Number(input.value)));
  wrapper.append(span, input);
  return wrapper;
}

function updateEditorSummary() {
  const clipCount = state.editTimeline.length;
  const duration = timelineDuration();
  els.timelineSummary.textContent = `${clipCount} clips | ${formatDuration(duration)}`;
  els.timelineDuration.textContent = formatDuration(duration);
  els.renderButton.disabled = state.isRendering || !clipCount;
  updateEditTransport();
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
  els.titleOverlay.style.fontFamily = state.title.font;
  els.titleOverlay.style.color = state.title.color;
  els.titleOverlay.style.webkitTextStroke = `${Math.max(0, state.title.outlineWidth / 18)}px ${state.title.outlineColor}`;
  els.titleOverlay.style.textShadow = `${state.title.shadowX}px ${state.title.shadowY}px ${state.title.shadowBlur}px ${hexToRgba(
    state.title.shadowColor,
    state.title.shadowOpacity,
  )}`;
  els.titleOverlay.style.setProperty("--title-size", `${state.title.size}px`);
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

async function drawEditPreviewAt(time) {
  const total = timelineDuration();
  editPreviewState.time = clamp(time, 0, Math.max(0, total));
  updateEditTransport();
  const located = timelineItemAtTime(editPreviewState.time);
  if (!located) {
    drawStagePreview();
    return;
  }

  const token = ++editPreviewState.token;
  const clip = getClip(located.item.clipId);
  if (!clip) return;
  selectTimelineItem(located.item.id, false);
  const video = els.renderVideo;
  if (video.dataset.itemId !== located.item.id) {
    video.pause();
    video.src = objectUrlForClip(clip);
    video.dataset.itemId = located.item.id;
    video.load();
  }
  await waitForVideoMetadata(video);
  if (token !== editPreviewState.token) return;
  await seekVideo(video, located.item.start + located.localTime);
  if (token !== editPreviewState.token) return;
  drawVideoFrame(els.renderCanvas.getContext("2d"), video, editPreviewState.time, total);
}

function seekEditPreview(time) {
  pauseEditPreview();
  drawEditPreviewAt(time);
}

function toggleEditPreviewPlayback() {
  if (editPreviewState.playing) {
    pauseEditPreview();
    return;
  }
  playEditPreview();
}

async function playEditPreview() {
  const total = timelineDuration();
  if (!state.editTimeline.length || total <= 0) return;
  editPreviewState.playing = true;
  els.editPlayPause.textContent = "Pause";
  if (editPreviewState.time >= total) editPreviewState.time = 0;

  try {
    while (editPreviewState.playing && editPreviewState.time < total) {
      const located = timelineItemAtTime(editPreviewState.time);
      if (!located) break;
      const clip = getClip(located.item.clipId);
      if (!clip) break;
      selectTimelineItem(located.item.id, false);

      const video = els.renderVideo;
      if (video.dataset.itemId !== located.item.id) {
        video.pause();
        video.src = objectUrlForClip(clip);
        video.dataset.itemId = located.item.id;
        video.load();
      }
      await waitForVideoMetadata(video);
      await seekVideo(video, located.item.start + located.localTime);
      video.volume = state.settings.previewVolume;
      await video.play();

      const itemGlobalStart = located.globalStart;
      const startedAt = performance.now();
      const startedLocal = located.localTime;
      while (editPreviewState.playing) {
        const elapsed = (performance.now() - startedAt) / 1000;
        const localTime = startedLocal + elapsed;
        const globalTime = itemGlobalStart + localTime;
        if (localTime >= itemDuration(located.item) || globalTime >= total) break;
        editPreviewState.time = globalTime;
        video.volume = state.settings.previewVolume * fadeGain(globalTime, total);
        drawVideoFrame(els.renderCanvas.getContext("2d"), video, globalTime, total);
        updateEditTransport();
        editPreviewState.rafId = requestAnimationFrame(() => {});
        await nextAnimationFrame();
      }
      video.pause();
      editPreviewState.time = Math.min(total, itemGlobalStart + itemDuration(located.item));
    }
  } catch (error) {
    toast(error.message || "Preview playback failed");
  } finally {
    if (editPreviewState.time >= total) editPreviewState.time = total;
    pauseEditPreview(false);
    updateEditTransport();
  }
}

function pauseEditPreview(redraw = false) {
  editPreviewState.playing = false;
  els.editPlayPause.textContent = "Play";
  if (editPreviewState.rafId) cancelAnimationFrame(editPreviewState.rafId);
  editPreviewState.rafId = null;
  els.renderVideo.pause();
  if (redraw) drawEditPreviewAt(editPreviewState.time);
}

function updateEditTransport() {
  const total = timelineDuration();
  editPreviewState.time = clamp(editPreviewState.time, 0, Math.max(0, total));
  els.editSeekControl.disabled = total <= 0;
  els.editSeekControl.value = total > 0 ? String(Math.round((editPreviewState.time / total) * 1000)) : "0";
  els.editTimeDisplay.textContent = `${formatDuration(editPreviewState.time)} / ${formatDuration(total)}`;
  const playhead = els.editTimeline.querySelector(".timeline-playhead");
  if (playhead) playhead.style.left = `${editPreviewState.time * state.timelineZoom}px`;
}

function timelineItemAtTime(time) {
  let cursor = 0;
  for (const item of state.editTimeline) {
    const duration = itemDuration(item);
    if (time <= cursor + duration || item === state.editTimeline[state.editTimeline.length - 1]) {
      return {
        item,
        localTime: clamp(time - cursor, 0, duration),
        globalStart: cursor,
      };
    }
    cursor += duration;
  }
  return null;
}

function timelineItemStartTime(itemId) {
  let cursor = 0;
  for (const item of state.editTimeline) {
    if (item.id === itemId) return cursor;
    cursor += itemDuration(item);
  }
  return 0;
}

async function renderComposition() {
  if (state.isRendering) return;
  pauseEditPreview();
  syncStateFromInputs();
  syncEditorControls({ redraw: false });
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
  ctx.font = `900 ${fontSize}px ${state.title.font}`;
  ctx.lineJoin = "round";
  ctx.shadowColor = hexToRgba(state.title.shadowColor, state.title.shadowOpacity);
  ctx.shadowBlur = state.title.shadowBlur * scale;
  ctx.shadowOffsetX = state.title.shadowX * scale;
  ctx.shadowOffsetY = state.title.shadowY * scale;
  lines.forEach((line, index) => {
    const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
    if (state.title.outlineWidth > 0) {
      ctx.strokeStyle = state.title.outlineColor;
      ctx.lineWidth = Math.max(0, state.title.outlineWidth * scale);
      ctx.strokeText(line, x, lineY);
    }
    ctx.fillStyle = state.title.color;
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

function hexToRgba(hex, alpha = 1) {
  const normalized = String(hex || "#000000").replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(Number(alpha) || 0, 0, 1)})`;
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
