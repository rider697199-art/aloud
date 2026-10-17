"use strict";

// =========================================================
// ELEMENTS
// =========================================================
const $ = (id) => document.getElementById(id);

const textInput     = $("text");
const voicesSelect  = $("voices");
const rate          = $("rate");
const pitch         = $("pitch");
const volume        = $("volume");
const seekSlider    = $("seekSlider");

const pitchValue    = $("pitchValue");
const volumeValue   = $("volumeValue");
const volumeIcon    = $("volumeIcon");
const volumeMuteBtn = $("volumeMuteBtn");
const volumeResetBtn = $("volumeResetBtn");
const volumePresets = document.querySelectorAll("[data-volume]");
let lastAudibleVolume = 1;
const rateBtns      = document.querySelectorAll("[data-rate]");
const pitchBtns     = document.querySelectorAll("[data-pitch]");

const sentlite = $("sentlite");
const scrollSwitch    = $("scrollSwitch");
const naturalSwitch   = $("naturalSwitch");
const autoLangSwitch  = $("autoLangSwitch");
const naturalBtn      = $("naturalBtn");

const toggleBtn     = $("toggleBtn");
const backBtn       = $("backBtn");
const clearBtn      = $("clearBtn");
const blurBtn       = $("blurBtn");
const pasteBtn      = $("pasteBtn");
const openBtn       = $("openBtn");
const saveBtn       = $("saveBtn");
const newBtn        = $("newBtn");
const fileInput     = $("fileInput");
const dropZone      = $("dropZone");
const prevBtn       = $("prevBtn");
const nextBtn       = $("nextBtn");
const themeBtn      = $("themeBtn");
const toastEl       = $("toast");
const langSelect    = $("lang");
const recordBtn     = $("recordBtn");
const recordLabel   = $("recordLabel");
const mp3Btn        = $("mp3Btn");
const mp3Label      = $("mp3Label");
const exportMenuBtn = $("exportMenuBtn");
const exportMenu    = $("exportMenu");
const avatarBtn     = $("avatarBtn");
const avatarText    = $("avatarText");
const speedBtn      = $("speedBtn");
const speedBtnLabel = $("speedBtnLabel");
const findBtn       = $("findBtn");
const shareBtn      = $("shareBtn");

const elapsedTime   = $("elapsedTime");
const totalTime     = $("totalTime");

const statusEl      = $("status");
const statusText    = $("statusText");

// =========================================================
// STORAGE
// =========================================================
const TEXT_KEY     = "tts_last_text";
const POS_KEY      = "tts_last_position";
const SETTINGS_KEY = "tts_settings";
const THEME_KEY    = "tts_theme";
const LIB_KEY      = "tts_library";
const DOC_KEY      = "tts_doc_id";

const store = {
    get(k)    { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

let saved = {};
try { saved = JSON.parse(store.get(SETTINGS_KEY) || "{}") || {}; } catch { saved = {}; }

// =========================================================
// STATE
// =========================================================
const synth = window.speechSynthesis;
const BASE_WPM = 180;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let voices = [];
let utterance = null;
let isSpeaking = false;

let lastCharIndex = 0;       // end of the last spoken word
let currentCursorPos = 0;    // start of the word being spoken

let userScrolling = false;
let scrollResumeTimer = null;

let animationFrameId = null;
let startTimestamp = 0;
let fullDuration = 0;
let elapsedBase = 0;
let seeking = false;
let isPaused = false;
let currentLang = "";

let hlMode = saved.hlMode ?? (saved.highlight === false ? "none" : "both");   // both | sentence | word | none
const hlWord = () => hlMode === "both" || hlMode === "word";
const hlSent = () => hlMode === "both" || hlMode === "sentence";
let autoScrollEnabled = saved.autoScroll ?? true;
let naturalOnly = saved.natural ?? false;
let autoLang = saved.autoLang ?? false;
let fontFamily = saved.font ?? "sans";
let fontSize = saved.fontSize ?? null;       // null = stylesheet default
let hlColor = saved.hlColor ?? "yellow";
let textSpacing = saved.spacing ?? "default";
let skipUrls = saved.skipUrls ?? false;
let skipRefs = saved.skipRefs ?? false;
let skipParens = saved.skipParens ?? false;
let hotkeysOn = saved.hotkeys ?? true;
let sleepEnd = null;                          // timestamp, not saved
let currentDocId = null;

// =========================================================
// HELPERS
// =========================================================
function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateDuration(text, rateVal) {
    return (countWords(text) / (BASE_WPM * rateVal)) * 60;
}

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

function humanDuration(sec) {
    if (sec < 60) return "under a minute";
    const totalMin = Math.round(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

function plural(n, word) {
    return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function wordEnd(text, start) {
    const re = /\s/g;
    re.lastIndex = start;
    const m = re.exec(text);
    return m ? m.index : text.length;
}

function snapToWordStart(text, pos) {
    while (pos > 0 && !/\s/.test(text[pos - 1])) pos--;
    return pos;
}

function setFill(input) {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--fill", `${pct}%`);
}

function setSeek(pct) {
    seekSlider.value = pct;
    setFill(seekSlider);
}

function setStatus(state, label) {
    statusEl.dataset.state = state;
    statusText.textContent = label;
}

function persistSettings() {
    store.set(SETTINGS_KEY, JSON.stringify({
        voiceURI: voices[voicesSelect.value]?.voiceURI ?? null,
        lang: langSelect.value,
        rate: parseFloat(rate.value),
        pitch: parseFloat(pitch.value),
        volume: parseFloat(volume.value),
        hlMode,
        autoScroll: autoScrollEnabled,
        natural: naturalOnly,
        autoLang,
        font: fontFamily,
        fontSize,
        hlColor,
        spacing: textSpacing,
        skipUrls, skipRefs, skipParens,
        hotkeys: hotkeysOn,
    }));
}

// =========================================================
// STATS + ESTIMATE
// =========================================================
function refreshStats() {
    const text = textInput.value;
    const words = countWords(text);
    if (!isSpeaking) {
        fullDuration = words ? estimateDuration(text, parseFloat(rate.value)) : 0;
        totalTime.textContent = formatTime(fullDuration);
    }
}

// =========================================================
// VOICES
// =========================================================
let langNames = null;
const NATURAL = /natural|neural|online|premium|enhanced|siri|google/i;
const primaryLang = (lang) => (lang || "").toLowerCase().split(/[-_]/)[0];

function langLabel(code) {
    try {
        langNames ??= new Intl.DisplayNames([navigator.language || "en"], { type: "language" });
        return langNames.of(code) || code;
    } catch {
        return code;
    }
}

function renderVoices(preferredURI) {
    const lang = langSelect.value || "all";
    const nav = (navigator.language || "en").toLowerCase();
    voicesSelect.innerHTML = "";

    const shown = [];
    voices.forEach((v, i) => {
        if (lang !== "all" && primaryLang(v.lang) !== lang) return;
        if (naturalOnly && !NATURAL.test(v.name)) return;
        voicesSelect.add(new Option(`${v.name} (${v.lang})`, i));
        shown.push(i);
    });
    if (!shown.length) {
        if (naturalOnly) {
            naturalOnly = false;
            updateSwitches();
            persistSettings();
            toast("No natural voices were found on this device, so all voices are shown.");
            renderVoices(preferredURI);
        }
        return;
    }

    let idx = shown.find((i) => voices[i].voiceURI === preferredURI);
    if (idx === undefined) idx = shown.find((i) => voices[i].lang.toLowerCase() === nav);
    if (idx === undefined) idx = shown.find((i) => voices[i].default);
    if (idx === undefined) idx = shown[0];
    voicesSelect.value = idx;
    updateAvatar();
}

function loadVoices() {
    if (!synth) return;

    const previousURI = voices[voicesSelect.value]?.voiceURI ?? saved.voiceURI;
    voices = synth.getVoices();

    langSelect.innerHTML = "";
    langSelect.add(new Option("All languages", "all"));

    if (!voices.length) {
        voicesSelect.innerHTML = "";
        voicesSelect.add(new Option("System default voice", ""));
        return;
    }

    const codes = [...new Set(voices.map((v) => primaryLang(v.lang)).filter(Boolean))]
        .sort((x, y) => langLabel(x).localeCompare(langLabel(y)));
    codes.forEach((c) => langSelect.add(new Option(langLabel(c), c)));

    const wanted = currentLang || saved.lang || primaryLang(navigator.language);
    langSelect.value = wanted === "all" || codes.includes(wanted) ? wanted : "all";
    currentLang = langSelect.value;

    renderVoices(previousURI);
}

// =========================================================
// CONTROL UI
// =========================================================
function updateSpeedUI() {
    const r = parseFloat(rate.value);
    rate.setAttribute("aria-valuetext", `${+r.toFixed(2)}x, ${Math.round(BASE_WPM * r)} words per minute`);
    speedBtnLabel.textContent = `${+r.toFixed(2)}x`;
    setFill(rate);
    rateBtns.forEach((b) =>
        b.setAttribute("aria-pressed", String(Math.abs(parseFloat(b.dataset.rate) - r) < 0.001)));
    refreshStats();
}

function updatePitchUI() {
    const p = parseFloat(pitch.value);
    pitchValue.textContent = p.toFixed(1);
    const pitchName = $("pitchName");
    if (pitchName) {
        pitchName.textContent = p <= 0.2 ? "Very deep" : p <= 0.7 ? "Deep" : p < 0.9 ? "Slightly low" : p <= 1.1 ? "Natural" : p <= 1.4 ? "Slightly bright" : p <= 1.7 ? "Bright" : "Very high";
    }
    pitch.setAttribute("aria-valuetext", `${p.toFixed(1)}, ${pitchName ? pitchName.textContent.toLowerCase() : "pitch"}`);
    setFill(pitch);
    pitchBtns.forEach((b) =>
        b.setAttribute("aria-pressed", String(Math.abs(parseFloat(b.dataset.pitch) - p) < 0.001)));
}

function updateVolumeUI() {
    const v = parseFloat(volume.value);
    if (v > 0) lastAudibleVolume = v;
    volumeValue.textContent = `${Math.round(v * 100)}%`;
    volumeIcon.dataset.level = v === 0 ? "mute" : v < 0.5 ? "low" : "high";
    volumeMuteBtn.textContent = v === 0 ? "Unmute" : "Mute";
    volumeMuteBtn.setAttribute("aria-pressed", String(v === 0));
    volumePresets.forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(parseFloat(b.dataset.volume) - v) < 0.001)));
    setFill(volume);
}

function applyVolume(value) {
    volume.value = String(Math.max(0, Math.min(1, value)));
    updateVolumeUI();
    persistSettings();
    restartIfSpeaking();
}

function updateSwitches() {
    scrollSwitch.setAttribute("aria-checked", String(autoScrollEnabled));
    naturalSwitch.setAttribute("aria-checked", String(naturalOnly));
    naturalBtn.classList.toggle("on", naturalOnly);
    autoLangSwitch.setAttribute("aria-checked", String(autoLang));
}

function setPausedUI() {
    const state = !isSpeaking ? "idle" : isPaused ? "paused" : "playing";
    toggleBtn.dataset.state = state;
    toggleBtn.setAttribute("aria-label", state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Play");
    if (isSpeaking) setStatus(isPaused ? "paused" : "speaking", isPaused ? "Paused" : "Reading aloud");
}

function setSpeakingUI(on) {
    if (!on) backBtn.classList.add("hidden");
    else updateJumpButtonVisibility();
    setStatus(on ? "speaking" : "idle", on ? "Reading aloud" : "Ready");
    setPausedUI();
}

// =========================================================
// AUTO SCROLL (mirror element measures the caret position)
// =========================================================
const mirror = document.createElement("div");
let mirrorPadBottom = 0;
let lastVisualLine = -1;
let scrollQueued = false;
let pendingIndex = 0;
let pendingForce = false;

function syncMirror() {
    const s = getComputedStyle(textInput);
    Object.assign(mirror.style, {
        position: "absolute",
        top: "0",
        left: "-9999px",
        visibility: "hidden",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordWrap: "break-word",
        boxSizing: "border-box",
        border: "0",
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontStyle: s.fontStyle,
        letterSpacing: s.letterSpacing,
        wordSpacing: s.wordSpacing,
        lineHeight: s.lineHeight,
        paddingTop: s.paddingTop,
        paddingRight: s.paddingRight,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        width: `${textInput.clientWidth}px`,
    });
    mirrorPadBottom = parseFloat(s.paddingBottom) || 0;
    if (!mirror.parentNode) document.body.appendChild(mirror);
}

// Show the jump control only when the current word has drifted away from
// the central reading area (the middle 60% of the textarea viewport).
function updateJumpButtonVisibility() {
    if (!isSpeaking) {
        backBtn.classList.add("hidden");
        return;
    }
    syncMirror();
    mirror.textContent = textInput.value.slice(0, currentCursorPos) + "\u200b";
    const caretY = mirror.scrollHeight - mirrorPadBottom;
    const lineHeight = parseFloat(getComputedStyle(textInput).lineHeight) || 32;
    const visibleY = caretY - textInput.scrollTop;
    const top = textInput.clientHeight * 0.2;
    const bottom = textInput.clientHeight * 0.8;
    const mid = visibleY + lineHeight / 2;
    let inCenter = mid >= top && mid <= bottom;
    // At the very start or end of the text the view cannot scroll any further,
    // so the word can never reach the centre. If it is on screen, don't offer a jump.
    const maxScroll = textInput.scrollHeight - textInput.clientHeight;
    const atTop = textInput.scrollTop <= 1;
    const atBottom = textInput.scrollTop >= maxScroll - 1;
    const onScreen = mid >= 0 && mid <= textInput.clientHeight;
    if (!inCenter && onScreen) {
        if (atTop && mid < top) inCenter = true;
        else if (atBottom && mid > bottom) inCenter = true;
    }
    backBtn.classList.toggle("hidden", inCenter);
}

function scrollToIndex(index, force = false) {
    const ta = textInput;
    syncMirror();
    mirror.textContent = ta.value.slice(0, index) + "\u200b";
    const caretY = mirror.scrollHeight - mirrorPadBottom;

    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 32;
    const visualLine = Math.round(caretY / lineHeight);
    if (!force && visualLine === lastVisualLine) return;
    lastVisualLine = visualLine;

    const maxScroll = ta.scrollHeight - ta.clientHeight;
    const target = Math.max(0, Math.min(caretY - lineHeight / 2 - ta.clientHeight / 2, maxScroll));
    ta.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
}

function queueScroll(index, force = false) {
    pendingIndex = index;
    pendingForce = pendingForce || force;
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
        scrollQueued = false;
        const f = pendingForce;
        pendingForce = false;
        scrollToIndex(pendingIndex, f);
    });
}

// Pause auto-scroll briefly when the person scrolls or clicks in the text
function markUserScroll() {
    if (!isSpeaking) return;
    userScrolling = true;
    clearTimeout(scrollResumeTimer);
    scrollResumeTimer = setTimeout(() => (userScrolling = false), 1500);
}
["wheel", "touchmove", "pointerdown"].forEach((ev) =>
    textInput.addEventListener(ev, markUserScroll, { passive: true }));

// =========================================================
// TIMER
// =========================================================
function updateTimer() {
    if (!isSpeaking) return;
    const elapsed = Math.min(fullDuration, elapsedBase + (performance.now() - startTimestamp) / 1000);
    elapsedTime.textContent = formatTime(elapsed);
    if (!seeking && fullDuration > 0) setSeek((elapsed / fullDuration) * 100);
    animationFrameId = requestAnimationFrame(updateTimer);
}

// =========================================================
// SPEECH
// =========================================================
function stopSpeech() {
    const wasPaused = isPaused;
    utterance = null;                      // late events from the old utterance are ignored
    isPaused = false;
    if (synth) {
        synth.cancel();
        if (wasPaused) synth.resume();     // some browsers keep the paused state after cancel
    }
    cancelAnimationFrame(animationFrameId);
}

function togglePause() {
    if (!isSpeaking || !synth) return;
    if (!isPaused) {
        synth.pause();
        isPaused = true;
        elapsedBase = Math.min(fullDuration, elapsedBase + (performance.now() - startTimestamp) / 1000);
        cancelAnimationFrame(animationFrameId);
    } else {
        synth.resume();
        isPaused = false;
        startTimestamp = performance.now();
        updateTimer();
    }
    setPausedUI();
}

function endPlayback() {
    clearSentence();
    if (recMode === "mp3") stopRecording();   // MP3 ends with the reading; a manual Record keeps going
    stopSpeech();
    isSpeaking = false;
    setSpeakingUI(false);
}

function finishSpeech(completed) {
    endPlayback();
    clearSentence();

    if (completed) {
        lastCharIndex = 0;
        currentCursorPos = 0;
        lastVisualLine = -1;
        store.remove(POS_KEY);
        textInput.setSelectionRange(0, 0);
        elapsedTime.textContent = formatTime(0);
        setSeek(0);
    } else if (!hlWord()) {
        // keep the caret where reading stopped so Play resumes from here
        textInput.setSelectionRange(currentCursorPos, currentCursorPos);
    }
}

// Blank out the parts the reader asked to skip. Same length, so every
// character offset (highlight, position, progress) stays aligned.
function skipMask(text) {
    const blank = (m) => m.replace(/[^\n]/g, " ");
    if (skipUrls)   text = text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, blank);
    if (skipRefs)   text = text.replace(/\[\d+(?:\s*[,\u2013-]\s*\d+)*\]/g, blank);
    if (skipParens) text = text.replace(/\([^()\n]*\)/g, blank);
    return text;
}

function startSpeakingFrom(pos) {
    if (!synth) return;

    const text = textInput.value;
    if (!text.trim()) return;
    if (pos >= text.length) pos = 0;

    const spoken = skipMask(text);
    if (!spoken.slice(pos).trim()) { finishSpeech(true); return; }

    stopSpeech();

    const u = new SpeechSynthesisUtterance(spoken.slice(pos));
    utterance = u;
    u.voice  = voices[voicesSelect.value] || null;
    u.rate   = parseFloat(rate.value);
    u.pitch  = parseFloat(pitch.value);
    u.volume = parseFloat(volume.value);

    fullDuration = estimateDuration(text, u.rate);
    totalTime.textContent = formatTime(fullDuration);
    elapsedBase = (countWords(text.slice(0, pos)) / countWords(text)) * fullDuration;
    startTimestamp = performance.now();

    currentCursorPos = pos;
    lastCharIndex = pos;
    lastVisualLine = -1;     // always re-centre on the first word of a new run
    userScrolling = false;

    u.onboundary = (e) => {
        if (e.name !== "word" || u !== utterance) return;

        const start = pos + e.charIndex;
        const end = e.charLength ? start + e.charLength : wordEnd(text, start);
        currentCursorPos = start;
        lastCharIndex = end;
        store.set(POS_KEY, start);

        if (hlWord()) {
            if (document.activeElement !== textInput) textInput.focus({ preventScroll: true });
            textInput.setSelectionRange(start, end);
        }
        if (hlSent()) showSentence(text, start);
        else clearSentence();
        if (autoScrollEnabled && !userScrolling) queueScroll(start);
        updateJumpButtonVisibility();
    };

    u.onend = () => { if (u === utterance) finishSpeech(true); };
    u.onerror = (e) => {
        if (u !== utterance) return;
        if (e.error === "canceled" || e.error === "interrupted") return;
        finishSpeech(false);
    };

    synth.speak(u);
    isSpeaking = true;
    setSpeakingUI(true);
    updateTimer();
}

function restartIfSpeaking() {
    if (isSpeaking) startSpeakingFrom(currentCursorPos);
}

// =========================================================
// EVENTS: TEXT
// =========================================================
textInput.addEventListener("input", () => {
    if (!findBar.classList.contains("hidden")) renderHighlights(-1);
    store.set(TEXT_KEY, textInput.value);
    if (isSpeaking) endPlayback();        // text changed, so the old positions no longer apply
    lastVisualLine = -1;
    refreshStats();
    if (autoLang && !isSpeaking) {
        clearTimeout(autoLangTimer);
        autoLangTimer = setTimeout(() => {
            const text = textInput.value.trim();
            if (text) selectDetectedLanguage(text, false);
        }, 700);
    }
});

// Hover a sentence to preview it; click that sentence to start reading there.
// A temporary text mirror lets us map pointer coordinates to textarea character offsets.
let hoveredSentenceStart = -1;
let sentenceHoverTimer = 0;
function textOffsetAtPointer(event) {
    const value = textInput.value;
    if (!value) return 0;
    const rect = textInput.getBoundingClientRect();
    const mirror = document.createElement("div");
    const cs = getComputedStyle(textInput);
    Object.assign(mirror.style, {
        position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`, boxSizing: cs.boxSizing,
        padding: cs.padding, border: cs.border, font: cs.font,
        lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
        wordSpacing: cs.wordSpacing, whiteSpace: "pre-wrap", overflowWrap: "break-word",
        wordBreak: cs.wordBreak, overflow: "hidden", visibility: "hidden",
        pointerEvents: "none"
    });
    mirror.textContent = value;
    document.body.appendChild(mirror);
    mirror.scrollTop = textInput.scrollTop;
    mirror.scrollLeft = textInput.scrollLeft;
    let offset = value.length;
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (caret?.offsetNode && mirror.contains(caret.offsetNode)) {
        offset = caret.offset;
    } else {
        const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
        if (range?.startContainer && mirror.contains(range.startContainer)) offset = range.startOffset;
    }
    mirror.remove();
    return Math.max(0, Math.min(value.length, offset));
}
textInput.addEventListener("mousemove", (event) => {
    if (!textInput.value || event.buttons) return;
    const pos = textOffsetAtPointer(event);
    const [start, end] = sentenceRange(textInput.value, pos);
    if (start === hoveredSentenceStart) return;
    hoveredSentenceStart = start;
    clearTimeout(sentenceHoverTimer);
    sentenceHoverTimer = setTimeout(() => showSentence(textInput.value, Math.min(start, textInput.value.length)), 20);
    textInput.style.cursor = "pointer";
});
textInput.addEventListener("mouseleave", () => {
    hoveredSentenceStart = -1;
    clearTimeout(sentenceHoverTimer);
    if (isSpeaking && hlSent()) showSentence(textInput.value, currentCursorPos);
    else clearSentence();
    textInput.style.cursor = "text";
});
// A single click only positions the caret; it must not start or restart reading.
textInput.addEventListener("click", () => {
    // Intentionally do nothing. Use Play or double-click a word to start reading.
});

// Double-click a word to start reading from there
textInput.addEventListener("dblclick", () => {
    if (textInput.selectionStart >= textInput.value.length) return;
    startSpeakingFrom(textInput.selectionStart);
});

blurBtn.addEventListener("click", () => {
    const blurred = dropZone.classList.toggle("blurred");
    blurBtn.setAttribute("aria-pressed", String(blurred));
    blurBtn.title = blurred ? "Show the text" : "Blur the text";
    blurBtn.querySelector("span").textContent = blurred ? "Unblur" : "Blur";
});

clearBtn.addEventListener("click", () => {
    setText("");
    textInput.focus();
});

textInput.addEventListener("scroll", updateJumpButtonVisibility, { passive: true });

backBtn.addEventListener("click", () => {
    if (!isSpeaking) return;
    userScrolling = false;
    clearTimeout(scrollResumeTimer);
    textInput.focus({ preventScroll: true });
    textInput.setSelectionRange(currentCursorPos, lastCharIndex);
    scrollToIndex(currentCursorPos, true);
    requestAnimationFrame(updateJumpButtonVisibility);
});

// =========================================================
// EVENTS: VOICE / SPEED / PITCH / VOLUME
// =========================================================
voicesSelect.addEventListener("change", () => {
    persistSettings();
    restartIfSpeaking();
});

langSelect.addEventListener("change", () => {
    currentLang = langSelect.value;
    renderVoices(null);
    persistSettings();
    restartIfSpeaking();
});

// =========================================================
// LANGUAGE DETECTION
// =========================================================
let detectRun = 0;      // lets a slower detection lose to a newer one
let autoLangTimer = 0;

// Non-Latin scripts identify their language directly.
const SCRIPT_LANGS = [
    [/\p{Script=Hangul}/gu, "ko"],
    [/\p{Script=Arabic}/gu, "ar"],
    [/\p{Script=Hebrew}/gu, "he"],
    [/\p{Script=Greek}/gu, "el"],
    [/\p{Script=Thai}/gu, "th"],
    [/\p{Script=Devanagari}/gu, "hi"],
    [/\p{Script=Bengali}/gu, "bn"],
    [/\p{Script=Tamil}/gu, "ta"],
    [/\p{Script=Cyrillic}/gu, "ru"],
];

// Common words for Latin-script languages.
const LATIN_WORDS = {
    en: ["the", "and", "is", "of", "to", "in", "that", "it", "with", "for", "you", "are", "this", "was", "be", "not", "have", "they", "hello", "what", "how", "please", "thank", "we", "your", "can"],
    es: ["el", "la", "de", "que", "y", "en", "los", "las", "por", "con", "para", "una", "es", "del", "se", "lo", "pero", "hola", "gracias"],
    fr: ["le", "les", "et", "est", "des", "une", "que", "qui", "dans", "pour", "pas", "sur", "avec", "du", "vous", "je", "il", "ce", "bonjour", "merci"],
    de: ["der", "die", "und", "ist", "nicht", "ein", "eine", "zu", "den", "mit", "das", "sich", "auf", "dem", "auch", "für", "ich", "sie", "hallo", "danke"],
    it: ["il", "di", "che", "per", "un", "non", "sono", "con", "della", "gli", "anche", "ma", "questo", "come", "ciao", "grazie"],
    pt: ["de", "que", "não", "uma", "para", "com", "os", "em", "do", "da", "dos", "as", "é", "mais", "você", "olá", "obrigado"],
    nl: ["het", "een", "van", "is", "dat", "niet", "op", "te", "zijn", "met", "voor", "ook", "die", "ik", "hallo", "dank"],
    sv: ["och", "att", "det", "som", "är", "för", "på", "med", "inte", "jag", "han", "den", "till", "av", "hej", "tack"],
    pl: ["i", "w", "nie", "się", "na", "jest", "z", "że", "do", "to", "jak", "co", "dzień"],
    tr: ["ve", "bir", "bu", "için", "ile", "da", "çok", "ne", "ben", "olarak", "değil", "merhaba"],
    id: ["yang", "dan", "di", "ini", "itu", "dengan", "untuk", "dari", "tidak", "saya", "adalah", "halo"],
};

// Letters that mostly belong to one language; each occurrence is a strong hint.
const LATIN_MARKS = { es: "ñ¿¡", pt: "ãõ", de: "ß", fr: "çœ", pl: "łżąęśćźń", tr: "ğşı", sv: "åö" };

const countMatches = (text, re) => (text.match(re) || []).length;

function guessFromScript(text) {
    const letters = countMatches(text, /\p{L}/gu);
    if (!letters) return null;
    const enough = (n) => n >= letters * 0.3;

    const kana = countMatches(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
    const han = countMatches(text, /\p{Script=Han}/gu);
    if (kana && enough(kana + han)) return "ja";
    if (enough(han)) return "zh";

    for (const [re, code] of SCRIPT_LANGS) {
        if (enough(countMatches(text, re))) {
            return code === "ru" && countMatches(text, /[іїєґ]/giu) ? "uk" : code;
        }
    }
    return null; // mostly Latin script, so the word check decides
}

function guessFromWords(text) {
    const lower = text.toLowerCase();
    const words = lower.split(/[^\p{L}]+/u).filter(Boolean);
    let best = null;
    let bestScore = 0;
    let secondScore = 0;

    for (const [code, list] of Object.entries(LATIN_WORDS)) {
        let score = words.reduce((n, w) => n + (list.includes(w) ? 1 : 0), 0);
        for (const ch of LATIN_MARKS[code] ?? "") score += lower.split(ch).length - 1;
        if (score > bestScore) {
            secondScore = bestScore;
            bestScore = score;
            best = code;
        } else if (score > secondScore) {
            secondScore = score;
        }
    }
    return bestScore >= 2 && bestScore > secondScore ? best : null;
}

// Uses the browser's built-in detector when it exists, otherwise a local heuristic.
async function detectLanguageCode(text) {
    const sample = text.slice(0, 2000);

    if ("LanguageDetector" in window) {
        try {
            const status = await LanguageDetector.availability();
            if (status !== "unavailable") {
                const detector = await LanguageDetector.create();
                const [top] = await detector.detect(sample);
                if (top && top.detectedLanguage !== "und" && top.confidence >= 0.5) {
                    return primaryLang(top.detectedLanguage);
                }
            }
        } catch { /* fall back to the local heuristic */ }
    }

    return guessFromScript(sample) ?? guessFromWords(sample);
}

// Detects the language of `text` and selects it in the list.
// `notify` shows a message when detection fails; automatic runs stay quiet.
async function selectDetectedLanguage(text, notify) {
    const run = ++detectRun;
    const code = await detectLanguageCode(text);
    if (run !== detectRun) return false;          // a newer detection has started

    const available = code && [...langSelect.options].some((o) => o.value === code);
    if (!available) {
        if (notify) {
            toast(code
                ? `No ${langLabel(code)} voice is installed on this device.`
                : "Couldn't tell the language. Try a longer passage.");
        }
        return false;
    }

    if (langSelect.value !== code) {
        langSelect.value = code;
        langSelect.dispatchEvent(new Event("change"));   // refreshes voices and restarts speech if playing
        if (notify) toast(`Language set to ${langLabel(code)}.`);
    }
    return true;
}

autoLangSwitch.addEventListener("click", async () => {
    autoLang = !autoLang;
    updateSwitches();
    persistSettings();
    if (autoLang) {
        const text = textInput.value.trim();
        if (text) await selectDetectedLanguage(text, true);
    }
});

rate.addEventListener("input", updateSpeedUI);
rate.addEventListener("change", () => { persistSettings(); restartIfSpeaking(); });
rateBtns.forEach((b) => b.addEventListener("click", () => {
    rate.value = b.dataset.rate;
    updateSpeedUI();
    persistSettings();
    restartIfSpeaking();
}));

pitch.addEventListener("input", updatePitchUI);
pitch.addEventListener("change", () => { persistSettings(); restartIfSpeaking(); });
pitchBtns.forEach((b) => b.addEventListener("click", () => {
    pitch.value = b.dataset.pitch;
    updatePitchUI();
    persistSettings();
    restartIfSpeaking();
}));

volume.addEventListener("input", updateVolumeUI);
volume.addEventListener("change", () => { persistSettings(); restartIfSpeaking(); });
volumePresets.forEach((b) => b.addEventListener("click", () => applyVolume(parseFloat(b.dataset.volume))));
volumeMuteBtn.addEventListener("click", () => {
    if (parseFloat(volume.value) === 0) applyVolume(lastAudibleVolume || 1);
    else {
        lastAudibleVolume = parseFloat(volume.value);
        applyVolume(0);
    }
});
volumeResetBtn.addEventListener("click", () => applyVolume(1));

scrollSwitch.addEventListener("click", () => {
    autoScrollEnabled = !autoScrollEnabled;
    updateSwitches();
    persistSettings();
});

// =========================================================
// EVENTS: SEEK
// =========================================================
seekSlider.addEventListener("input", () => {
    seeking = true;
    setFill(seekSlider);

    const text = textInput.value;
    if (!text) return;

    const pct = parseFloat(seekSlider.value) / 100;
    const pos = snapToWordStart(text, Math.floor(pct * text.length));

    lastCharIndex = currentCursorPos = pos;
    store.set(POS_KEY, pos);
    elapsedTime.textContent = formatTime(pct * fullDuration);
    textInput.setSelectionRange(pos, pos);
    queueScroll(pos, true);
});

seekSlider.addEventListener("change", () => {
    seeking = false;
    if (isSpeaking) startSpeakingFrom(currentCursorPos);
});

// =========================================================
// EVENTS: PLAY / STOP
// =========================================================
toggleBtn.addEventListener("click", async () => {
    if (isSpeaking) { togglePause(); return; }
    // Make sure the language matches the text before speaking
    if (autoLang) await selectDetectedLanguage(textInput.value.trim(), false);
    // Starts from the selection or caret (which is also where the last session stopped)
    startSpeakingFrom(textInput.selectionStart);
});

document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        toggleBtn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openFind();
    } else if (e.key === "Escape") {
        if (!findBar.classList.contains("hidden")) closeFind();
        else if (panelEls.some((p) => !p.classList.contains("hidden"))) closePanels();
        else if (isSpeaking) finishSpeech(false);
    }
});

window.addEventListener("resize", () => { lastVisualLine = -1; });

// =========================================================
// TOAST
// =========================================================
let toastTimer = null;
function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4000);
}

// =========================================================
// TEXT HELPERS: replace, paste, open, save
// =========================================================
function syncProgress(pos) {
    const text = textInput.value;
    const total = countWords(text);
    const progress = total ? countWords(text.slice(0, pos)) / total : 0;
    elapsedTime.textContent = formatTime(progress * fullDuration);
    setSeek(progress * 100);
}

function setText(text) {
    endPlayback();
    currentDocId = null;
    store.remove(DOC_KEY);
    textInput.value = text;
    if (text) store.set(TEXT_KEY, text); else store.remove(TEXT_KEY);
    store.remove(POS_KEY);

    lastCharIndex = 0;
    currentCursorPos = 0;
    elapsedBase = 0;
    lastVisualLine = -1;
    textInput.setSelectionRange(0, 0);
    textInput.scrollTop = 0;
    refreshStats();
    elapsedTime.textContent = formatTime(0);
    setSeek(0);
}

pasteBtn.addEventListener("click", async () => {
    try {
        const clip = await navigator.clipboard.readText();
        if (!clip) { toast("The clipboard is empty."); return; }
        const wasEmpty = !textInput.value;
        textInput.focus();
        textInput.setRangeText(clip, textInput.selectionStart, textInput.selectionEnd, "end");
        if (wasEmpty) textInput.setSelectionRange(0, 0);
        textInput.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
        toast("Clipboard access was blocked. Click in the text and press Ctrl+V instead.");
        textInput.focus();
    }
});

const TEXT_FILE = /\.(txt|md|markdown|text|csv|log)$/i;

// Libraries are loaded only when a file needs them
const LIBS = {
    pdf:   "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    docx:  "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
    zip:   "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    lame:  "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
};
const libPromises = {};

function loadLib(key) {
    if (!libPromises[key]) {
        libPromises[key] = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = LIBS[key];
            s.onload = resolve;
            s.onerror = () => { delete libPromises[key]; reject(new Error(`Could not load ${key}`)); };
            document.head.appendChild(s);
        });
    }
    return libPromises[key];
}

function tidyText(text) {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/-\n(?=[a-z])/g, "")          // join words hyphenated at line ends
        .replace(/[ \t]+/g, " ")
        .replace(/([^\n])\n(?!\n)/g, "$1 ")    // single line breaks inside a paragraph
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function readPdf(file) {
    await loadLib("pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
        if (n === 1 || n % 10 === 0) toast(`Reading PDF, page ${n} of ${pdf.numPages}…`);
        const content = await (await pdf.getPage(n)).getTextContent();
        let out = "";
        for (const item of content.items) out += item.str + (item.hasEOL ? "\n" : " ");
        pages.push(out);
    }
    return tidyText(pages.join("\n\n"));
}

async function readDocx(file) {
    await loadLib("docx");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value.replace(/\n{3,}/g, "\n\n").trim();
}

async function readEpub(file) {
    await loadLib("zip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const parse = (str, type) => new DOMParser().parseFromString(str, type);

    const container = parse(await zip.file("META-INF/container.xml").async("string"), "application/xml");
    const opfPath = container.querySelector("rootfile").getAttribute("full-path");
    const opf = parse(await zip.file(opfPath).async("string"), "application/xml");
    const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

    const manifest = {};
    opf.querySelectorAll("manifest > item").forEach((i) => { manifest[i.getAttribute("id")] = i.getAttribute("href"); });
    const spine = [...opf.querySelectorAll("spine > itemref")]
        .map((r) => manifest[r.getAttribute("idref")])
        .filter(Boolean);

    const chapters = [];
    for (const href of spine) {
        const path = decodeURIComponent(new URL(href, `http://x/${base}`).pathname.slice(1));
        const entry = zip.file(path);
        if (!entry) continue;
        const doc = parse(await entry.async("string"), "text/html");
        doc.querySelectorAll("script, style").forEach((el) => el.remove());
        doc.body.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, tr, br").forEach((el) => el.append("\n"));
        const text = doc.body.textContent.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();
        if (text) chapters.push(text);
    }
    return chapters.join("\n\n");
}

async function extractFileText(file) {
    if (!file) return null;
    const name = file.name.toLowerCase();
    const isBinaryDoc = /\.(pdf|docx|epub)$/.test(name);
    const isText = file.type.startsWith("text/") || TEXT_FILE.test(name);

    if (!isBinaryDoc && !isText) {
        toast(name.endsWith(".doc")
            ? "Old .doc files are not supported. Save it as .docx and try again."
            : "That file type is not supported. Use PDF, DOCX, EPUB, TXT or MD.");
        return null;
    }
    if (file.size > (isBinaryDoc ? 50 : 5) * 1024 * 1024) {
        toast(`That file is over ${isBinaryDoc ? 50 : 5} MB. Try a smaller one.`);
        return null;
    }

    try {
        let text;
        if (name.endsWith(".pdf")) text = await readPdf(file);
        else if (name.endsWith(".docx")) text = await readDocx(file);
        else if (name.endsWith(".epub")) text = await readEpub(file);
        else text = await file.text();

        if (!text.trim()) {
            toast("No readable text was found. Scanned PDFs and image-only files need OCR, which is not supported.");
            return null;
        }
        return text;
    } catch (err) {
        console.error(err);
        toast(isBinaryDoc
            ? "That file could not be read. Check your internet connection (the reader loads on demand) and try again."
            : "That file could not be read.");
        return null;
    }
}

async function loadFile(file) {
    const text = await extractFileText(file);
    if (text === null) return;
    setText(text);
    toast(`Opened ${file.name}`);
}

openBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    loadFile(fileInput.files[0]);
    fileInput.value = "";
});

["dragenter", "dragover"].forEach((ev) => dropZone.addEventListener(ev, (e) => {
    if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dropZone.classList.add("dragging");
    }
}));
["dragleave", "drop"].forEach((ev) => dropZone.addEventListener(ev, () => dropZone.classList.remove("dragging")));
dropZone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) {
        e.preventDefault();
        loadFile(e.dataTransfer.files[0]);
    }
});

saveBtn.addEventListener("click", () => saveToLibrary());

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =========================================================
// RECORD AUDIO (captures this tab's audio)
// MP3:    reads the whole text from the start, then saves one MP3 when it finishes.
// Record: captures whatever plays until Record is pressed again.
// =========================================================
let recorder = null;
let recStream = null;
let recMode = null;          // null | "mp3" | "record" | "busy" (converting)
let recStarting = false;     // true while the screen-share prompt is open

function setRecordingUI(mode) {
    recMode = mode;
    const busy = mode === "busy";
    mp3Btn.dataset.state = mode === "mp3" ? "recording" : "idle";
    mp3Btn.disabled = busy;
    mp3Label.textContent = mode === "mp3" ? "Rec…" : busy ? "…" : "MP3";
}

function stopRecording(delay = 700) {
    const r = recorder;
    if (!r || r.state === "inactive") return;
    recorder = null;
    setTimeout(() => { if (r.state !== "inactive") r.stop(); }, delay);   // let the last word finish
}

// Asks for this tab's audio, then starts a MediaRecorder. mode: "mp3" | "record"
async function startRecording(mode) {
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast("Recording is not supported in this browser. Try Chrome or Edge on a computer.");
        return false;
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
            preferCurrentTab: true,
            selfBrowserSurface: "include",
            systemAudio: "include",
        });
    } catch {
        toast("Recording was cancelled.");
        return false;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
        stream.getTracks().forEach((t) => t.stop());
        toast("No audio was shared. Choose This tab and turn on Share tab audio.");
        return false;
    }

    const mime = ["audio/webm;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const chunks = [];
    const r = new MediaRecorder(new MediaStream(audioTracks), mime ? { mimeType: mime } : undefined);

    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!chunks.length) {
            setRecordingUI(null);
            toast("Nothing was captured. Check that Share tab audio is turned on.");
            return;
        }
        const raw = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        setRecordingUI("busy");
        toast("Converting to MP3…");
        let blob = raw, ext = "webm";
        try { blob = await toMp3(raw); ext = "mp3"; }
        catch (err) {
            if (err instanceof SilentCapture) {
                setRecordingUI(null);
                toast("No sound was captured, so nothing was saved. Try again and choose Entire screen with Share system audio on.");
                return;
            }
            console.error(err);
            toast("MP3 conversion failed, so the audio was saved as WebM.");
        }
        setRecordingUI(null);
        const base = docTitle(textInput.value).replace(/[^\w\- ]+/g, "").trim() || "aloud";
        const name = `${mode === "record" ? `${base} recording` : base}.${ext}`;
        await saveRecording({ id: Date.now().toString(36), name, type: blob.type, blob, created: Date.now() });
        downloadBlob(blob, name);
        toast(`Saved ${name} to Audio`);
    };
    // Person clicked the browser's "Stop sharing" button
    audioTracks[0].onended = () => { if (r.state !== "inactive") r.stop(); endPlayback(); };

    recorder = r;
    recStream = stream;
    r.start();
    setRecordingUI(mode);
    return true;
}

// Export menu: text/document exports are generated locally in the browser.
function exportBaseName() {
    return (docTitle(textInput.value) || "aloud").replace(/[\\/:*?"<>|]+/g, "_").trim() || "aloud";
}
function closeExportMenu() {
    exportMenu.classList.add("hidden");
    exportMenuBtn.setAttribute("aria-expanded", "false");
}
function exportTextFile() {
    const text = textInput.value;
    if (!text.trim()) { toast("Add some text first."); return; }
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${exportBaseName()}.txt`);
    toast("Text file downloaded.");
}
function exportWordDocument() {
    const text = textInput.value;
    if (!text.trim()) { toast("Add some text first."); return; }
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${exportBaseName()}</title></head><body><pre style="font-family:Calibri,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:break-word">${escaped}</pre></body></html>`;
    downloadBlob(new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" }), `${exportBaseName()}.doc`);
    toast("Word document downloaded.");
}
// PDF: built in the browser and downloaded straight away (no print dialog).
// Latin text is written as real, selectable PDF text. Other scripts (Hindi, Arabic,
// Chinese, etc.) are drawn with the browser's own fonts so they display correctly.
async function exportPdf() {
    const text = textInput.value.replace(/\r\n?/g, "\n");
    if (!text.trim()) { toast("Add some text first."); return; }
    toast("Creating PDF…");
    try {
        await loadLib("jspdf");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const margin = 56;
        const title = exportBaseName();
        doc.setProperties({ title });

        const latinOnly = /^[\u0009\u000a\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]*$/.test(text);

        if (latinOnly) {
            const size = 12, lead = size * 1.5;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(size);
            let y = margin + size;
            for (const para of text.split("\n")) {
                const lines = para.trim() === "" ? [""] : doc.splitTextToSize(para, W - margin * 2);
                for (const line of lines) {
                    if (y > H - margin) { doc.addPage(); y = margin + size; }
                    if (line) doc.text(line, margin, y);
                    y += lead;
                }
            }
        } else {
            // Canvas path for any script
            const scale = 2, size = 12, lead = size * 1.6;
            const rtl = /[\u0590-\u08ff]/.test(text);
            const cw = Math.round(W * scale), ch = Math.round(H * scale);
            const canvas = document.createElement("canvas");
            canvas.width = cw; canvas.height = ch;
            const ctx = canvas.getContext("2d");
            const setup = () => {
                ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
                ctx.fillStyle = "#111";
                ctx.font = `${size * scale}px Inter, "Noto Sans", "Segoe UI", Arial, sans-serif`;
                ctx.textBaseline = "alphabetic";
                ctx.direction = rtl ? "rtl" : "ltr";
                ctx.textAlign = rtl ? "right" : "left";
            };
            const maxW = (W - margin * 2) * scale;
            const x = (rtl ? W - margin : margin) * scale;
            const wrap = (para) => {
                if (!para.trim()) return [""];
                const lines = []; let cur = "";
                // Break on spaces; also allow breaks between characters for scripts without spaces
                const tokens = para.split(/(\s+)|(?=[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef])/u).filter(t => t !== undefined && t !== "");
                for (const t of tokens) {
                    const test = cur + t;
                    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur.trimEnd()); cur = t.trimStart(); }
                    else cur = test;
                }
                if (cur) lines.push(cur.trimEnd());
                return lines;
            };
            const flush = (first) => {
                if (!first) doc.addPage();
                doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H, undefined, "FAST");
            };
            setup();
            let y = (margin + size) * scale, first = true;
            for (const para of text.split("\n")) {
                for (const line of wrap(para)) {
                    if (y > (H - margin) * scale) { flush(first); first = false; setup(); y = (margin + size) * scale; }
                    if (line) ctx.fillText(line, x, y);
                    y += lead * scale;
                }
            }
            flush(first);
        }

        doc.save(`${title}.pdf`);
        toast("PDF saved.");
    } catch (err) {
        console.error(err);
        toast("Could not create the PDF. Check your connection and try again.");
    }
}
function uploadTextToDrive() {
    const text = textInput.value;
    if (!text.trim()) { toast("Add some text first."); return; }
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${exportBaseName()}.txt`);
    window.open("https://drive.google.com/drive/my-drive", "_blank", "noopener");
    toast("Text downloaded. In Google Drive, click New → File upload to upload it.");
}
exportMenuBtn.addEventListener("click", () => {
    const opening = exportMenu.classList.contains("hidden");
    exportMenu.classList.toggle("hidden", !opening);
    exportMenuBtn.setAttribute("aria-expanded", String(opening));
});
exportMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-export]");
    if (!option) return;
    closeExportMenu();
    switch (option.dataset.export) {
        case "drive": uploadTextToDrive(); break;
        case "file": exportTextFile(); break;
        case "word": exportWordDocument(); break;
        case "pdf": exportPdf(); break;
        case "mp3": mp3Btn.click(); break;
    }
});
document.addEventListener("click", (event) => {
    if (!exportMenu.contains(event.target) && !exportMenuBtn.contains(event.target)) closeExportMenu();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeExportMenu(); });

// MP3: read everything from the beginning. Pressing again stops early and keeps what was captured.
mp3Btn.addEventListener("click", async () => {
    if (recMode === "mp3") { endPlayback(); return; }
    if (recMode || recStarting) { toast("Stop the current recording first."); return; }
    if (!textInput.value.trim()) { toast("Add some text first."); return; }
    if (isSpeaking) endPlayback();
    recStarting = true;
    let ok = false;
    try { ok = await startRecording("mp3"); } finally { recStarting = false; }
    if (!ok) return;
    setTimeout(() => startSpeakingFrom(0), 400);
});



// =========================================================
// PAUSE + SENTENCE NAVIGATION
// =========================================================

function sentenceStarts(text) {
    const starts = [0];
    const re = /[.!?\u2026]+["'\u201d)\]]*\s+|\n+/g;
    let m;
    while ((m = re.exec(text))) starts.push(m.index + m[0].length);
    return starts;
}

function jumpSentence(direction) {
    const text = textInput.value;
    if (!text.trim()) return;

    const ref = isSpeaking ? currentCursorPos : textInput.selectionStart;
    const starts = sentenceStarts(text);
    let target;

    if (direction > 0) {
        target = starts.find((s) => s > ref);
        if (target === undefined || target >= text.length) return;
    } else {
        const before = starts.filter((s) => s < ref - 1);
        target = before.length ? before[before.length - 1] : 0;
    }

    if (isSpeaking) {
        startSpeakingFrom(target);
    } else {
        lastCharIndex = currentCursorPos = target;
        store.set(POS_KEY, target);
        textInput.setSelectionRange(target, target);
        syncProgress(target);
        queueScroll(target, true);
    }
}

prevBtn.addEventListener("click", () => jumpSentence(-1));
nextBtn.addEventListener("click", () => jumpSentence(1));

// =========================================================
// THEME
// =========================================================
const themeMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (themeMeta) themeMeta.content = theme === "dark" ? "#1a222d" : "#ffffff";
    const next = theme === "dark" ? "light" : "dark";
    themeBtn.setAttribute("aria-label", `Switch to ${next} theme`);
    themeBtn.title = `Switch to ${next} theme`;
}

themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    store.set(THEME_KEY, next);
    applyTheme(next);
});

applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");

// =========================================================
// PANELS
// =========================================================
const panelEls  = [...document.querySelectorAll(".panel")];
const panelBtns = document.querySelectorAll("[data-panel]");

function closePanels() {
    panelEls.forEach((p) => p.classList.add("hidden"));
    panelBtns.forEach((b) => b.classList.remove("on"));
}

function openPanel(id) {
    const el = $(id);
    const wasOpen = !el.classList.contains("hidden");
    closePanels();
    if (wasOpen) return;
    el.classList.remove("hidden");
    if (el.classList.contains("anchor") && !window.matchMedia("(max-width: 820px)").matches) {
        // sit the popover above the button that opened it
        const b = document.querySelector(`[data-panel="${id}"]`).getBoundingClientRect();
        const a = document.querySelector(".app").getBoundingClientRect();
        const left = Math.max(12, Math.min(b.left + b.width / 2 - a.left - el.offsetWidth / 2, a.width - el.offsetWidth - 12));
        el.style.left = `${left}px`;
        el.style.right = "auto";
    }
    document.querySelectorAll(`[data-panel="${id}"]`).forEach((b) => b.classList.add("on"));
    if (id === "panel-library") renderLibrary();
    if (id === "panel-audio") renderAudio();
    if (id === "panel-account") renderAccount();
    if (id === "panel-share") buildShareLink();
    if (id === "panel-settings") showView("root");
}


panelBtns.forEach((b) => b.addEventListener("click", () => openPanel(b.dataset.panel)));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanels));
document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".panel, [data-panel], #naturalBtn")) closePanels();
});


// =========================================================
// SETTINGS MENU
// =========================================================
const settingsPanel = $("panel-settings");
const HL_COLORS = {
    red:    ["#ff9d97", "#330300"],
    orange: ["#ffc27a", "#2b1500"],
    yellow: null,
    green:  ["#8fe3b0", "#00230f"],
    blue:   ["#9fd2ff", "#001a33"],
    indigo: ["#b3b1ff", "#0d0b3d"],
    purple: ["#dfb2f5", "#26023a"],
};
const HL_MODES = { both: "Sentence & Word", sentence: "Sentence Only", word: "Word Only", none: "None" };
if (hlColor === "pink") hlColor = "red";
if (!(hlColor in HL_COLORS)) hlColor = "yellow";
if (!(hlMode in HL_MODES)) hlMode = "both";
const FONT_STACKS = {
    sans: null,
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    dyslexia: '"OpenDyslexic", "OpenDyslexic3", "Lexend", "Atkinson Hyperlegible", "Comic Sans MS", "Comic Neue", Verdana, sans-serif',
};
const SPACINGS = {
    default: null,
    relaxed: ["0.02em", "0.08em", "1.9"],
    wide:    ["0.05em", "0.16em", "2.2"],
};
if (!(fontFamily in FONT_STACKS)) fontFamily = "sans";
if (!(textSpacing in SPACINGS)) textSpacing = "default";
const cap = (w) => w[0].toUpperCase() + w.slice(1);

function showView(name) {
    settingsPanel.querySelectorAll(".sview").forEach((v) => v.classList.toggle("hidden", v.dataset.view !== name));
    settingsPanel.scrollTop = 0;
    if (name === "tune") { updatePitchUI(); updateVolumeUI(); }
    if (name === "timer") updateSleepUI();
}
settingsPanel.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { showView(go.dataset.go); return; }
    const row = e.target.closest(".srow.static");
    if (row && !e.target.closest(".switch")) row.querySelector(".switch").click();
});

function applyFont() {
    const root = document.documentElement.style;
    const stack = FONT_STACKS[fontFamily];
    if (stack) root.setProperty("--read-font", stack); else root.removeProperty("--read-font");
    if (fontSize) root.setProperty("--read-size", `${fontSize}px`); else root.removeProperty("--read-size");
    const sp = SPACINGS[textSpacing];
    if (sp) { root.setProperty("--read-ls", sp[0]); root.setProperty("--read-ws", sp[1]); root.setProperty("--read-lh", sp[2]); }
    else { root.removeProperty("--read-ls"); root.removeProperty("--read-ws"); root.removeProperty("--read-lh"); }
    lastVisualLine = -1;
    if (typeof syncHilite === "function" && (hilite.innerHTML || sentlite.innerHTML)) syncHilite();
}
function applyHighlightColor() {
    const root = document.documentElement.style;
    const c = HL_COLORS[hlColor];
    if (c) { root.setProperty("--mark", c[0]); root.setProperty("--mark-ink", c[1]); }
    else { root.removeProperty("--mark"); root.removeProperty("--mark-ink"); }
}

function updateSleepUI() {
    const left = sleepEnd ? Math.max(0, sleepEnd - Date.now()) : 0;
    $("sleepLeft").textContent = sleepEnd ? formatTime(Math.ceil(left / 1000)) : "Off";
    $("val-timer").textContent = sleepEnd ? formatTime(Math.ceil(left / 1000)) : "Off";
    const mins = sleepEnd ? Math.round((sleepEnd - sleepStart) / 60000) : 0;
    settingsPanel.querySelectorAll("[data-sleep]").forEach((b) =>
        b.setAttribute("aria-pressed", String(parseInt(b.dataset.sleep, 10) === mins)));
}
let sleepStart = 0, sleepTick = null;
function setSleep(mins) {
    clearInterval(sleepTick);
    sleepEnd = null;
    if (mins > 0) {
        sleepStart = Date.now();
        sleepEnd = sleepStart + mins * 60000;
        sleepTick = setInterval(() => {
            if (Date.now() >= sleepEnd) {
                clearInterval(sleepTick);
                sleepEnd = null;
                if (isSpeaking) finishSpeech(false);
                toast("Timer finished. Reading stopped.");
            }
            updateSleepUI();
        }, 1000);
        toast(`Reading will stop in ${mins >= 60 ? mins / 60 + " h" : mins + " min"}.`);
    }
    updateSleepUI();
}

function updateSettingsMenu() {
    // switches
    $("skipUrlSwitch").setAttribute("aria-checked", String(skipUrls));
    $("skipRefSwitch").setAttribute("aria-checked", String(skipRefs));
    $("skipParenSwitch").setAttribute("aria-checked", String(skipParens));
    $("hotkeysSwitch").setAttribute("aria-checked", String(hotkeysOn));
    // font
    settingsPanel.querySelectorAll("[data-font]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.font === fontFamily)));
    const size = fontSize ?? 18;
    $("fontSize").value = size; setFill($("fontSize"));
    $("fontSizeValue").textContent = `${size} px`;
    settingsPanel.querySelectorAll("[data-spacing]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.spacing === textSpacing)));
    // highlight colour
    settingsPanel.querySelectorAll("[data-hl]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hl === hlColor)));
    // row summaries
    const nSkip = [skipUrls, skipRefs, skipParens].filter(Boolean).length;
    $("val-font").textContent = `${cap(fontFamily)}${fontSize ? " · " + fontSize : ""}`;
    $("val-skip").textContent = nSkip ? `${nSkip} on` : "Off";
    $("val-highlight").textContent = hlMode === "none" ? "Off" : cap(hlColor);
    $("val-hlmode").textContent = HL_MODES[hlMode];
    settingsPanel.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === hlMode)));
    $("val-hotkeys").textContent = hotkeysOn ? "On" : "Off";
    $("val-tune").textContent = "";
    updateSleepUI();
}

settingsPanel.querySelectorAll("[data-font]").forEach((b) => b.addEventListener("click", () => {
    fontFamily = b.dataset.font; applyFont(); updateSettingsMenu(); persistSettings();
}));
settingsPanel.querySelectorAll("[data-spacing]").forEach((b) => b.addEventListener("click", () => {
    textSpacing = b.dataset.spacing; applyFont(); updateSettingsMenu(); persistSettings();
}));
$("fontSize").addEventListener("input", (e) => {
    fontSize = parseInt(e.target.value, 10); applyFont(); updateSettingsMenu(); persistSettings();
});
settingsPanel.querySelectorAll("[data-hl]").forEach((b) => b.addEventListener("click", () => {
    hlColor = b.dataset.hl; applyHighlightColor(); updateSettingsMenu(); persistSettings();
}));
settingsPanel.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    hlMode = b.dataset.mode;
    if (!hlSent()) clearSentence();
    if (!hlWord() && isSpeaking) textInput.setSelectionRange(currentCursorPos, currentCursorPos);
    updateSettingsMenu(); persistSettings();
}));
settingsPanel.querySelectorAll("[data-sleep]").forEach((b) => b.addEventListener("click", () => setSleep(parseInt(b.dataset.sleep, 10))));
[["skipUrlSwitch", () => (skipUrls = !skipUrls)], ["skipRefSwitch", () => (skipRefs = !skipRefs)],
 ["skipParenSwitch", () => (skipParens = !skipParens)], ["hotkeysSwitch", () => (hotkeysOn = !hotkeysOn)]]
    .forEach(([id, flip]) => $(id).addEventListener("click", () => {
        flip(); updateSettingsMenu(); persistSettings();
        if (id.startsWith("skip")) restartIfSpeaking();
    }));
// the existing handlers own these two; refresh the menu summaries after them
scrollSwitch.addEventListener("click", updateSettingsMenu);

document.addEventListener("keydown", (e) => {
    if (!hotkeysOn || !e.altKey || e.ctrlKey || e.metaKey) return;
    const act = { ArrowLeft: () => prevBtn.click(), ArrowRight: () => nextBtn.click(),
                  ArrowUp: () => $("faster").click(), ArrowDown: () => $("slower").click(),
                  Space: () => toggleBtn.click() }[e.code];
    if (act) { e.preventDefault(); act(); }
});

// =========================================================
// VOICE: avatar + natural voices
// =========================================================
function updateAvatar() {
    const v = voices[voicesSelect.value];
    const name = (v?.name || "Voice").replace(/^(Microsoft|Google)\s+/i, "");
    avatarText.textContent = name.slice(0, 2);
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    avatarBtn.style.setProperty("--h", h);
    avatarBtn.title = v ? `Voice: ${v.name}` : "Choose a voice";
}
voicesSelect.addEventListener("change", updateAvatar);

function setNatural(on) {
    naturalOnly = on;
    updateSwitches();
    persistSettings();
    renderVoices(voices[voicesSelect.value]?.voiceURI ?? null);
    restartIfSpeaking();
}
naturalSwitch.addEventListener("click", () => setNatural(!naturalOnly));
naturalBtn.addEventListener("click", () => {
    closePanels();
    if (!naturalOnly) setNatural(true);
    openPanel("panel-voice");
});

// Minus and plus nudge the speed by 0.25x
function nudgeSpeed(d) {
    rate.value = Math.min(5, Math.max(0.25, Math.round((parseFloat(rate.value) + d) * 100) / 100));
    updateSpeedUI();
    persistSettings();
    restartIfSpeaking();
}
$("slower").addEventListener("click", () => nudgeSpeed(-0.25));
$("faster").addEventListener("click", () => nudgeSpeed(0.25));

// =========================================================
// LIBRARY
// =========================================================
let library = [];
try { library = JSON.parse(store.get(LIB_KEY) || "[]") || []; } catch { library = []; }
currentDocId = store.get(DOC_KEY);
if (!library.some((d) => d.id === currentDocId)) currentDocId = null;

const libList  = $("libList");
const persistLib = () => store.set(LIB_KEY, JSON.stringify(library));
const docTitle = (t) => (t.split("\n").find((l) => l.trim()) || "Untitled").trim().slice(0, 60);
const fileSafe = (t) => t.replace(/[^\w\- ]+/g, "").trim() || "aloud";
const esc = (str) => str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateStr = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const iconBtn = (act, icon, label, id) =>
    `<button class="btn-icon sm" type="button" data-act="${act}" data-id="${id}" aria-label="${label}" title="${label}"><svg class="icon"><use href="#i-${icon}"/></svg></button>`;

function saveToLibrary(silent = false) {
    const text = textInput.value;
    if (!text.trim()) { if (!silent) toast("There is no text to save yet."); return; }
    let d = library.find((x) => x.id === currentDocId);
    if (d) { d.text = text; d.title = docTitle(text); d.updated = Date.now(); }
    else {
        d = { id: Date.now().toString(36), title: docTitle(text), text, updated: Date.now() };
        library.unshift(d);
        currentDocId = d.id;
        store.set(DOC_KEY, d.id);
    }
    persistLib();
    renderLibrary();
    toast(`Saved “${d.title}” to your Library.`);
}

function renderLibrary() {
    libList.innerHTML = library.length
        ? library.map((d) => `<li class="item"><div class="item-main"><strong>${esc(d.title)}</strong><small>${plural(countWords(d.text), "word")} · ${dateStr(d.updated)}</small></div><div class="item-actions">${iconBtn("open", "file", "Open", d.id)}${iconBtn("dl", "download", "Download .txt", d.id)}${iconBtn("del", "trash", "Delete", d.id)}</div></li>`).join("")
        : `<li class="empty">Nothing here yet. Press Save to keep a text in your Library.</li>`;
}

// Pages other than Read (Dictate, Transcribe) register a function here so a Library file opens on the page you are on
const pageOpeners = {};
function activePageOpener() {
    const m = document.querySelector(".main");
    if (m.classList.contains("dictate-active")) return pageOpeners.dictate;
    if (m.classList.contains("transcribe-active")) return pageOpeners.transcribe;
    return null;
}

libList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    const d = b && library.find((x) => x.id === b.dataset.id);
    if (!d) return;
    if (b.dataset.act === "open") {
        const openOnPage = activePageOpener();
        if (openOnPage) { openOnPage(d); closePanels(); return; }
        if (textInput.value.trim() && textInput.value !== d.text) saveToLibrary();
        setText(d.text);
        currentDocId = d.id;
        store.set(DOC_KEY, d.id);
        closePanels();
    } else if (b.dataset.act === "dl") {
        downloadBlob(new Blob([d.text], { type: "text/plain;charset=utf-8" }), `${fileSafe(d.title)}.txt`);
    } else {
        library = library.filter((x) => x !== d);
        if (currentDocId === d.id) { currentDocId = null; store.remove(DOC_KEY); }
        persistLib();
        renderLibrary();
    }
});
$("libSave").addEventListener("click", () => saveToLibrary());

newBtn.addEventListener("click", () => {
    if (textInput.value.trim()) saveToLibrary();
    setText("");
    closePanels();
    textInput.focus();
});

// =========================================================
// AUDIO: recordings kept in IndexedDB, MP3 encoding
// =========================================================
function idb(mode, fn) {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open("aloud", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("rec", { keyPath: "id" });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const tx = open.result.transaction("rec", mode);
            const req = fn(tx.objectStore("rec"));
            tx.oncomplete = () => { open.result.close(); resolve(req?.result); };
            tx.onerror = tx.onabort = () => reject(tx.error);
        };
    });
}
const saveRecording   = (r) => idb("readwrite", (st) => st.put(r)).catch(() => toast("The recording could not be kept in Audio."));
const listRecordings  = () => idb("readonly", (st) => st.getAll()).then((x) => x || []).catch(() => []);
const deleteRecording = (id) => idb("readwrite", (st) => st.delete(id)).catch(() => {});

// ---------------------------------------------------------
// VOICE CLEAN-UP: removes steady background noise (hiss, hum, fans, room tone) from a recording.
// Spectral gating: learn the noise from the quietest moments, subtract it from every frame, then
// close the gate between phrases. Runs on this device. Used for microphone recordings.
// ---------------------------------------------------------
function makeFft(N) {
    const levels = Math.log2(N), rev = new Uint32Array(N), cos = new Float64Array(N / 2), sin = new Float64Array(N / 2);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b); rev[i] = r; }
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / N); sin[i] = Math.sin((2 * Math.PI * i) / N); }
    return (re, im, inverse) => {
        for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
        for (let size = 2; size <= N; size <<= 1) {
            const half = size >> 1, step = N / size;
            for (let start = 0; start < N; start += size) {
                for (let k = 0, t = 0; k < half; k++, t += step) {
                    const wr = cos[t], wi = inverse ? sin[t] : -sin[t];
                    const a = start + k, b = a + half;
                    const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
                }
            }
        }
    };
}

async function cleanVoice(input, sampleRate, tune = {}) {
    const N = 1024, H = N / 2, B = N / 2 + 1, len = input.length;
    const fft = makeFft(N);
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = Math.sin((Math.PI * i) / N);       // sqrt-Hann: analysis * synthesis = Hann, which sums to 1 at 50% overlap

    // 1) Remove rumble below ~70 Hz (second-order high-pass)
    const w0 = (2 * Math.PI * (tune.hp || 70)) / sampleRate, al = Math.sin(w0) / (2 * 0.7071), c = Math.cos(w0);
    const b0 = (1 + c) / 2 / (1 + al), b1 = -(1 + c) / (1 + al), b2 = b0, a1 = (-2 * c) / (1 + al), a2 = (1 - al) / (1 + al);
    const nFrames = Math.ceil(len / H) + 2;
    const x = new Float64Array((nFrames - 1) * H + N);                      // signal sits at offset H so every sample gets two overlapping frames
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
        const v = input[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = v; y2 = y1; y1 = y; x[H + i] = y;
    }

    // 2) Learn the noise: average the spectrum of the quietest frames
    const energy = new Float64Array(nFrames);
    for (let f = 0; f < nFrames; f++) { let s = 0; for (let i = f * H; i < f * H + N; i += 2) s += x[i] * x[i]; energy[f] = s; }
    const order = Array.from(energy.keys()).sort((p, q) => energy[p] - energy[q]);
    const quietCount = Math.max(8, Math.min(600, Math.floor(nFrames * 0.1)));
    const quiet = order.slice(0, Math.min(quietCount, nFrames));
    const medianE = energy[order[Math.floor(nFrames / 2)]] || 1e-12;
    const clearSilence = energy[quiet[quiet.length - 1]] < medianE * 0.3;    // are there real pauses to learn from?
    const alpha = tune.alpha ?? (clearSilence ? 2.0 : 1.0);                  // gentler when the speaker never pauses
    const floorG = tune.floor ?? (clearSilence ? 0.1 : 0.3);
    const re = new Float64Array(N), im = new Float64Array(N);
    const noise = new Float64Array(B);
    for (const f of quiet) {
        for (let i = 0; i < N; i++) { re[i] = x[f * H + i] * win[i]; im[i] = 0; }
        fft(re, im, false);
        for (let k = 0; k < B; k++) noise[k] += Math.hypot(re[k], im[k]) / quiet.length;
    }
    const noiseP = new Float64Array(B);                                      // smoothed noise power per bin
    let noiseE = 0;
    for (let k = 0; k < B; k++) {
        const m = (noise[Math.max(0, k - 1)] + noise[k] * 2 + noise[Math.min(B - 1, k + 1)]) / 4;
        noiseP[k] = m * m; noiseE += noiseP[k];
    }

    // 3) Clean every frame
    const out = new Float64Array(x.length);
    const prevG = new Float64Array(B).fill(1), g = new Float64Array(B);
    let gate = 1;
    for (let f = 0; f < nFrames; f++) {
        const o = f * H;
        for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
        fft(re, im, false);
        let e = 0;
        for (let k = 0; k < B; k++) {
            const p = re[k] * re[k] + im[k] * im[k];
            e += p;
            g[k] = Math.sqrt(Math.max(floorG * floorG, 1 - (alpha * noiseP[k]) / (p + 1e-18)));
        }
        const sm = new Float64Array(B);                                       // smooth across frequency, then across time
        for (let k = 0; k < B; k++) {
            const s = (g[Math.max(0, k - 1)] + 2 * g[k] + g[Math.min(B - 1, k + 1)]) / 4;
            sm[k] = s >= prevG[k] ? s : 0.6 * prevG[k] + 0.4 * s;             // let word endings fade out instead of cutting
            prevG[k] = sm[k];
        }
        const target = e < noiseE * 1.8 ? 0.3 : 1;                            // between phrases: close the gate
        gate = target >= gate ? target : gate * 0.8 + target * 0.2;
        for (let k = 0; k < B; k++) {
            const gg = sm[k] * gate;
            re[k] *= gg; im[k] *= gg;
            if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
        }
        fft(re, im, true);
        for (let i = 0; i < N; i++) out[o + i] += (re[i] / N) * win[i];
        if (f % 150 === 149) await new Promise((r) => setTimeout(r));         // keep the page responsive
    }

    // 4) Level the result: peak at about -1 dBFS (never boosts more than 18 dB)
    const res = new Float32Array(len);
    let peak = 0;
    for (let i = 0; i < len; i++) { const v = out[H + i]; res[i] = v; const a = Math.abs(v); if (a > peak) peak = a; }
    const gain = peak > 1e-4 ? Math.min(8, 0.89 / peak) : 1;
    for (let i = 0; i < len; i++) res[i] *= gain;
    return res;
}

class SilentCapture extends Error {}

async function toMp3(blob, clean = false) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();

    // Tab capture can deliver silence (for example when speech is not routed through the tab).
    // Check the decoded audio so an empty file is never saved.
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i += 16) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak < 0.002) throw new SilentCapture("No sound in the captured audio");

    await loadLib("lame");
    let cleaned = null;
    if (clean) {                                    // microphone recordings: remove background noise first
        const mono = new Float32Array(buf.length);
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < mono.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
        try { cleaned = await cleanVoice(mono, buf.sampleRate); } catch (err) { console.error(err); }   // fall back to the untouched audio
    }
    const ch = cleaned ? 1 : buf.numberOfChannels > 1 ? 2 : 1;
    const enc = new lamejs.Mp3Encoder(ch, buf.sampleRate, 128);
    const to16 = (f) => {
        const o = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
        return o;
    };
    const L = to16(cleaned || buf.getChannelData(0));
    const R = ch > 1 ? to16(buf.getChannelData(1)) : null;
    const parts = [];
    for (let i = 0; i < L.length; i += 1152) {
        const d = ch > 1 ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : enc.encodeBuffer(L.subarray(i, i + 1152));
        if (d.length) parts.push(d);
    }
    const end = enc.flush();
    if (end.length) parts.push(end);
    return new Blob(parts, { type: "audio/mpeg" });
}

const audList = $("audList");
let audioUrls = [];
async function renderAudio() {
    audioUrls.forEach((u) => URL.revokeObjectURL(u));
    audioUrls = [];
    const recs = (await listRecordings()).sort((a, b) => b.created - a.created);
    audList.innerHTML = recs.length
        ? recs.map((r) => {
            const url = URL.createObjectURL(r.blob);
            audioUrls.push(url);
            return `<li class="item col"><div class="item-row"><div class="item-main"><strong>${esc(r.name)}</strong><small>${(r.blob.size / 1048576).toFixed(1)} MB · ${dateStr(r.created)}</small></div><div class="item-actions">${iconBtn("dl", "download", "Download", r.id)}${iconBtn("del", "trash", "Delete", r.id)}</div></div><audio controls preload="none" src="${url}"></audio></li>`;
        }).join("")
        : `<li class="empty">No recordings yet. Press MP3 to save the whole text as an MP3, or Record to capture a reading you start yourself.</li>`;
}
audList.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "del") { await deleteRecording(b.dataset.id); renderAudio(); return; }
    const r = (await listRecordings()).find((x) => x.id === b.dataset.id);
    if (r) downloadBlob(r.blob, r.name);
});

// =========================================================
// ACCOUNT (data stored on this device)
// =========================================================
async function renderAccount() {
    const n = (await listRecordings()).length;
    $("acctStats").innerHTML = `<li><span>Saved texts</span><b>${library.length}</b></li><li><span>Recordings</span><b>${n}</b></li>`;
}
$("resetBtn").addEventListener("click", () => { store.remove(SETTINGS_KEY); location.reload(); });
$("wipeBtn").addEventListener("click", async () => {
    if (!confirm("Delete all saved texts, recordings and settings from this browser?")) return;
    [LIB_KEY, DOC_KEY, TEXT_KEY, POS_KEY, SETTINGS_KEY].forEach((k) => store.remove(k));
    await idb("readwrite", (st) => st.clear()).catch(() => {});
    location.reload();
});

// =========================================================
// FIND + SHARE
// =========================================================
const findBar   = $("findBar");
const findInput = $("findInput");
const findCount = $("findCount");

// Every match gets a highlight; the current one is stronger
const hilite = $("hilite");
function syncHilite() {
    const w = `${textInput.clientWidth}px`;
    hilite.style.width = w;  hilite.scrollTop = textInput.scrollTop;
    sentlite.style.width = w; sentlite.scrollTop = textInput.scrollTop;
}

// Sentence being read, drawn behind the text like the find highlights
function sentenceRange(text, pos) {
    let s = pos;
    while (s > 0) {
        const ch = text[s - 1];
        if (ch === "\n") break;
        if (/[.!?]/.test(ch) && /\s/.test(text[s] ?? " ")) break;
        s--;
    }
    while (s < pos && /\s/.test(text[s])) s++;
    let e = pos;
    while (e < text.length) {
        const ch = text[e++];
        if (ch === "\n") { e--; break; }
        if (/[.!?]/.test(ch) && (e >= text.length || /\s/.test(text[e]))) break;
    }
    return [s, Math.max(e, s)];
}
let sentKey = "";
function showSentence(text, pos) {
    const [s, e] = sentenceRange(text, pos);
    const key = `${s}:${e}:${hlMode}`;
    if (key === sentKey) return;
    sentKey = key;
    sentlite.classList.toggle("solo", hlMode === "sentence");
    sentlite.innerHTML = `${esc(text.slice(0, s))}<mark>${esc(text.slice(s, e))}</mark>${esc(text.slice(e))}\n`;
    syncHilite();
}
function clearSentence() {
    sentKey = "";
    sentlite.innerHTML = "";
}
function renderHighlights(current) {
    const q = findInput.value.toLowerCase();
    if (findBar.classList.contains("hidden") || !q) { hilite.innerHTML = ""; return; }
    const text = textInput.value, t = text.toLowerCase();
    let html = "", last = 0, i;
    while ((i = t.indexOf(q, last)) !== -1) {
        html += esc(text.slice(last, i)) + `<mark${i === current ? ' class="cur"' : ""}>${esc(text.slice(i, i + q.length))}</mark>`;
        last = i + q.length;
    }
    hilite.innerHTML = esc(text.slice(last)) ? html + esc(text.slice(last)) + "\n" : html + "\n";
    syncHilite();
}
textInput.addEventListener("scroll", () => { hilite.scrollTop = textInput.scrollTop; sentlite.scrollTop = textInput.scrollTop; });
window.addEventListener("resize", () => { if (hilite.innerHTML || sentlite.innerHTML) syncHilite(); });

function openFind() {
    findBar.classList.remove("hidden");
    renderHighlights(-1);
    findBtn.classList.add("on");
    findInput.focus();
    findInput.select();
}
function closeFind() {
    findBar.classList.add("hidden");
    hilite.innerHTML = "";
    findBtn.classList.remove("on");
    textInput.focus();
}

function findStep(dir = 1, keep = false) {
    const q = findInput.value.toLowerCase();
    if (!q) { findCount.textContent = ""; renderHighlights(-1); return; }
    const t = textInput.value.toLowerCase();
    let total = 0, i = -1;
    while ((i = t.indexOf(q, i + 1)) !== -1) total++;
    if (!total) { findCount.textContent = "No results"; renderHighlights(-1); return; }

    let idx = dir > 0
        ? t.indexOf(q, keep ? textInput.selectionStart : textInput.selectionEnd)
        : (textInput.selectionStart > 0 ? t.lastIndexOf(q, textInput.selectionStart - 1) : -1);
    if (idx === -1) idx = dir > 0 ? t.indexOf(q) : t.lastIndexOf(q);

    textInput.setSelectionRange(idx, idx + q.length);
    let n = 0;
    i = -1;
    while ((i = t.indexOf(q, i + 1)) !== -1 && i <= idx) n++;
    findCount.textContent = `${n} of ${total}`;
    renderHighlights(idx);
    textInput.focus({ preventScroll: true });
    findInput.focus();
    scrollToIndex(idx, true);
}

findBtn.addEventListener("click", () => (findBar.classList.contains("hidden") ? openFind() : closeFind()));
$("findClose").addEventListener("click", closeFind);
$("findNext").addEventListener("click", () => findStep(1));
$("findPrev").addEventListener("click", () => findStep(-1));
findInput.addEventListener("input", () => findStep(1, true));
findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
});


updateSwitches();
renderLibrary();

// =========================================================
// OFFLINE / INSTALLABLE APP
// =========================================================
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// =========================================================
// INIT
// =========================================================
rate.value   = saved.rate   ?? 1;
pitch.value  = saved.pitch  ?? 1;
volume.value = saved.volume ?? 1;

updateSpeedUI();
updatePitchUI();
updateVolumeUI();
updateSwitches();
applyFont();
applyHighlightColor();
updateSettingsMenu();
setFill(seekSlider);

if (!synth) {
    toggleBtn.disabled = true;
    setStatus("unsupported", "Speech not supported in this browser");
    toast("Speech is not supported in this browser. Try Chrome, Edge or Safari.");
} else {
    synth.onvoiceschanged = loadVoices;
    loadVoices();
}

// Restore the last text and reading position
const savedText = store.get(TEXT_KEY);
const savedPos = parseInt(store.get(POS_KEY), 10);

if (savedText) {
    textInput.value = savedText;
    refreshStats();

    if (!isNaN(savedPos) && savedPos > 0 && savedPos < savedText.length) {
        lastCharIndex = currentCursorPos = savedPos;
        textInput.setSelectionRange(savedPos, savedPos);

        syncProgress(savedPos);

        (document.fonts?.ready ?? Promise.resolve()).then(() => queueScroll(savedPos, true));
    }
}
refreshStats();

// =========================================================
// SHARE LINK: the text travels inside the link (nothing is uploaded)
// =========================================================
const shareLink = $("shareLink");
const copyLink  = $("copyLink");
const shareNote = $("shareNote");

const toB64Url = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (str) => {
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
async function pipeBytes(bytes, stream) {
    const w = stream.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
async function encodeShare(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.CompressionStream) return "z" + toB64Url(await pipeBytes(bytes, new CompressionStream("deflate-raw")));
    return "p" + toB64Url(bytes);
}
async function decodeShare(code) {
    const bytes = fromB64Url(code.slice(1));
    const raw = code[0] === "z" ? await pipeBytes(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return new TextDecoder().decode(raw);
}

async function buildShareLink() {
    const text = textInput.value;
    copyLink.textContent = "Copy link";
    copyLink.disabled = !text.trim();
    shareLink.value = "";
    shareNote.textContent = text.trim() ? "" : "Type or paste some text first.";
    if (!text.trim()) return;
    try {
        const base = location.href.split("#")[0].split("?")[0];
        const url = `${base}#s=${await encodeShare(text)}`;
        shareLink.value = url;
        shareNote.textContent = url.length > 6000
            ? "This text is long, so the link is very long and may not work in some apps."
            : "The text is stored inside the link. Nothing is uploaded.";
    } catch (err) {
        console.error(err);
        shareNote.textContent = "Could not create a link for this text.";
        copyLink.disabled = true;
    }
}

shareLink.addEventListener("focus", () => shareLink.select());
copyLink.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(shareLink.value); }
    catch { shareLink.select(); document.execCommand("copy"); }
    copyLink.textContent = "Copied!";
    setTimeout(() => { copyLink.textContent = "Copy link"; }, 1800);
});

// Opening a shared link loads its text, ready to play
(async function openSharedLink() {
    const m = location.hash.match(/^#s=([zp][\w-]+)$/);
    if (!m) return;
    try {
        const text = await decodeShare(m[1]);
        history.replaceState(null, "", location.href.split("#")[0]);
        if (!text.trim()) return;
        const hadText = textInput.value.trim() && textInput.value !== text;
        if (hadText) saveToLibrary();
        setText(text);
        toast(hadText ? "Shared text opened. Your previous text is in the Library." : "Shared text opened. Press play to listen.");
    } catch (err) {
        console.error(err);
        toast("That shared link could not be opened.");
    }
})();


// =========================================================
// DICTATE PAGE (speech-to-text)
// =========================================================
(() => {
    const navBtn = $("dictateNavBtn");
    const readNavBtn = $("readNavBtn");
    const page = $("dictatePage");
    const dictateText = $("dictateText");
    const lang = $("dictateLang");
    const startBtn = $("dictateStartBtn");
    const status = $("dictateStatus");
    const count = $("dictateCount");
    const clearBtn = $("dictateClearBtn");
    const copyBtn = $("dictateCopyBtn");
    const useBtn = $("dictateUseBtn");
    const main = document.querySelector(".main");
    if (!navBtn || !page) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let listening = false;
    let prefix = "";       // text before the spot where speech is inserted (grows as phrases finalise)
    let suffix = "";       // text after the insertion point (only used with "Insert at cursor")
    let wantListening = false;
    let fatalError = false;
    let pendingInterim = "";   // words heard but not yet final (the "buffer")
    let flushRestart = false;  // restart the microphone after Enter moved the buffer into the text

    // ---------- settings ----------
    const DSET_KEY = "tts_dictate_settings";
    const DSET_DEFAULT = { keep: true, interim: true, cursor: false, commands: true, capitalize: true, spell: true, autosave: false, size: "m" };
    const SIZES = { s: 15, m: 17, l: 20, xl: 24 };
    let dset = { ...DSET_DEFAULT };
    try { dset = { ...DSET_DEFAULT, ...(JSON.parse(store.get(DSET_KEY) || "{}") || {}) }; } catch { /* use defaults */ }
    const SWITCHES = { dsKeep: "keep", dsInterim: "interim", dsCursor: "cursor", dsCommands: "commands", dsCapitalize: "capitalize", dsSpell: "spell", dsAutosave: "autosave" };

    function applyDictateSettings() {
        Object.entries(SWITCHES).forEach(([id, key]) => $(id).setAttribute("aria-checked", String(!!dset[key])));
        // Medium follows the Read page's text size; other sizes override it.
        if (dset.size === "m" || !SIZES[dset.size]) dictateText.style.fontSize = "";
        else dictateText.style.fontSize = `${SIZES[dset.size]}px`;
        const px = Math.round(parseFloat(getComputedStyle(dictateText).fontSize)) || SIZES.m;
        dictateText.spellcheck = !!dset.spell;
        $("dsSizeValue").textContent = `${px} px`;
        document.querySelectorAll("[data-dsize]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dsize === dset.size)));
    }
    function saveDictateSettings() { store.set(DSET_KEY, JSON.stringify(dset)); applyDictateSettings(); }

    // ---------- text helpers ----------
    const isEnglish = () => /^en/i.test(lang.value);
    const trimSpaces = (t) => t.replace(/^[ \t]+|[ \t]+$/g, "");

    function applyVoiceCommands(text) {
        if (!dset.commands || !isEnglish()) return text;
        return text
            .replace(/\s*\bnew paragraph\b[,.]?\s*/gi, "\n\n")
            .replace(/\s*\b(?:new line|next line)\b[,.]?\s*/gi, "\n")
            .replace(/\s*\b(?:period|full stop)\b\s*/gi, ". ")
            .replace(/\s*\bcomma\b\s*/gi, ", ")
            .replace(/\s*\bquestion mark\b\s*/gi, "? ")
            .replace(/\s*\bexclamation (?:mark|point)\b\s*/gi, "! ")
            .replace(/\s*\bsemi[\s-]?colon\b\s*/gi, "; ")
            .replace(/\s*\bcolon\b\s*/gi, ": ")
            .replace(/\s*\b(?:dash|hyphen)\b\s*/gi, "-")
            .replace(/\s*\bopen parenthes[ie]s\b\s*/gi, " (")
            .replace(/\s*\bclose parenthes[ie]s\b\s*/gi, ") ")
            .replace(/\s*\bsmiley(?: face)?\b\s*/gi, " :-) ")
            .replace(/\s*\bsad face\b\s*/gi, " :-( ");
    }
    function capitalizePiece(piece, base) {
        if (!dset.capitalize || !isEnglish()) return piece;
        let out = piece.replace(/\bi\b/g, "I").replace(/([.!?]\s+|\n\s*)([a-z])/g, (m, a, b) => a + b.toUpperCase());
        if (!base.trim() || /[.!?]\s*$/.test(base) || /\n\s*$/.test(base)) out = out.replace(/^(\s*)([a-z])/, (m, a, b) => a + b.toUpperCase());
        return out;
    }
    function joinText(base, piece) {
        if (!piece) return base;
        if (!base) return piece;
        if (/^(?!:-[()])[\n.,?!:;)\-]/.test(piece)) return base.replace(/[ \t]+$/, "") + piece;
        if (/(?:(?<!:-)\(|-)$/.test(base)) return base + piece;   // no space after "(" or "-" (but ":-(" is a smiley)
        return base + (/\s$/.test(base) ? "" : " ") + piece;
    }

    function syncFromTextarea() {
        const v = dictateText.value;
        if (dset.cursor) {
            const a = dictateText.selectionStart ?? v.length;
            const b = dictateText.selectionEnd ?? a;
            prefix = v.slice(0, a); suffix = v.slice(b);
        } else { prefix = v; suffix = ""; }
    }
    function render(interim = "") {
        const live = dset.interim && interim ? joinText(prefix, trimSpaces(interim)) : prefix;
        dictateText.value = live + suffix;
        if (dset.cursor) dictateText.setSelectionRange(live.length, live.length);
        else dictateText.scrollTop = dictateText.scrollHeight;
        updateCount();
    }
    function stopNow() {
        wantListening = false;
        if (recognition) { try { recognition.stop(); } catch { /* already stopped */ } }
    }

    function updateCount() {
        const words = dictateText.value.trim().split(/\s+/).filter(Boolean).length;
        count.textContent = `${words} ${words === 1 ? "word" : "words"}`;
        scheduleAutosave();
    }
    function setStatus(message, active = false) {
        status.lastChild.textContent = ` ${message}`;
        page.dataset.listening = active ? "true" : "false";
        startBtn.querySelector("span").textContent = active ? "Stop dictating" : "Start dictating";
        startBtn.setAttribute("aria-pressed", active ? "true" : "false");
        listening = active;
    }
    function showPage() {
        closePanels();
        main.classList.add("dictate-active");
        page.classList.remove("hidden");
        page.setAttribute("aria-hidden", "false");
        navBtn.classList.add("on");
        navBtn.setAttribute("aria-pressed", "true");
        if (readNavBtn) {
            readNavBtn.classList.remove("on");
            readNavBtn.setAttribute("aria-pressed", "false");
        }
    }
    function hidePage() {
        stopNow();
        closePanels();
        main.classList.remove("dictate-active");
        page.classList.add("hidden");
        page.setAttribute("aria-hidden", "true");
        navBtn.classList.remove("on");
        navBtn.setAttribute("aria-pressed", "false");
        if (readNavBtn) {
            readNavBtn.classList.add("on");
            readNavBtn.setAttribute("aria-pressed", "true");
        }
    }
    function begin() {
        recognition = new Recognition();
        recognition.lang = lang.value;
        recognition.continuous = true;
        recognition.interimResults = !!dset.interim;
        recognition.onstart = () => setStatus("Listening… speak now", true);
        recognition.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    const piece = capitalizePiece(trimSpaces(applyVoiceCommands(transcript)), prefix);
                    prefix = joinText(prefix, piece);
                } else interim += transcript;
            }
            pendingInterim = interim;
            render(interim);
        };
        recognition.onerror = (event) => {
            if (event.error === "no-speech" || event.error === "aborted") return;
            fatalError = true;
            setStatus(event.error === "not-allowed" || event.error === "service-not-allowed" ? "Microphone permission denied" : `Recognition error: ${event.error}`);
        };
        recognition.onend = () => {
            recognition = null;
            pendingInterim = "";
            const restart = flushRestart; flushRestart = false;
            if (wantListening && (dset.keep || restart) && !fatalError) { setTimeout(() => { if (wantListening && !recognition) begin(); }, 200); return; }
            wantListening = false;
            syncFromTextarea();
            if (!fatalError) setStatus("Ready to dictate");
            else setStatus(status.lastChild.textContent.trim(), false);
        };
        try { recognition.start(); }
        catch (err) { wantListening = false; setStatus("Could not start microphone"); toast("Could not start dictation. Please try again."); }
    }
    // Enter while dictating: move whatever is still in the buffer into the text editor right away
    function commitBuffer() {
        const raw = pendingInterim.trim();
        if (!raw || !recognition) return false;
        pendingInterim = "";
        flushRestart = true;
        recognition.onresult = null;       // the old session must not deliver these words a second time
        try { recognition.abort(); } catch { /* already stopped */ }
        prefix = joinText(prefix, capitalizePiece(trimSpaces(applyVoiceCommands(raw)), prefix));
        render("");
        return true;
    }
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return;
        if (page.classList.contains("hidden") || !listening) return;
        if (commitBuffer()) e.preventDefault();
    }, true);
    function startDictation() {
        if (!Recognition) {
            setStatus("Speech recognition is not supported in this browser.");
            toast("Dictation is not supported here. Try Chrome or Edge over HTTPS.");
            return;
        }
        if (listening) {
            stopNow();
            setStatus("Finishing…");
            return;
        }
        fatalError = false;
        wantListening = true;
        syncFromTextarea();
        begin();
    }

    navBtn.addEventListener("click", () => page.classList.contains("hidden") ? showPage() : hidePage());
    if (readNavBtn) readNavBtn.addEventListener("click", hidePage);
    startBtn.addEventListener("click", startDictation);
    dictateText.addEventListener("input", () => { syncFromTextarea(); updateCount(); });
    lang.addEventListener("change", () => {
        if (listening && recognition) { stopNow(); setStatus("Language changed. Press Start dictating to continue."); }
    });
    clearBtn.addEventListener("click", () => {
        stopNow();
        dictateText.value = ""; syncFromTextarea(); updateCount(); setStatus("Ready to dictate"); dictateText.focus();
    });
    copyBtn.addEventListener("click", async () => {
        if (!dictateText.value.trim()) { toast("There is no dictated text to copy."); return; }
        try { await navigator.clipboard.writeText(dictateText.value); toast("Dictated text copied."); }
        catch { dictateText.focus(); dictateText.select(); try { document.execCommand("copy"); toast("Dictated text copied."); } catch { toast("Copy failed. Select the text and copy it manually."); } }
    });
    useBtn.addEventListener("click", () => {
        if (!dictateText.value.trim()) { toast("Dictate or type some text first."); return; }
        stopNow();
        setText(dictateText.value);
        hidePage();
        toast("Dictated text added to Aloud.");
    });
    const openBtn2 = $("dictateOpenBtn");
    const saveBtn2 = $("dictateSaveBtn");
    const fileInput2 = $("dictateFileInput");
    let dictateDocId = null;
    openBtn2.addEventListener("click", () => fileInput2.click());
    fileInput2.addEventListener("change", async () => {
        const file = fileInput2.files[0];
        fileInput2.value = "";
        const text = await extractFileText(file);
        if (text === null) return;
        stopNow();
        dictateText.value = text; syncFromTextarea(); updateCount();
        toast(`Opened ${file.name}`);
    });
    function saveToLibrary(silent) {
        const text = dictateText.value;
        if (!text.trim()) { if (!silent) toast("There is no text to save yet."); return; }
        let d = library.find((x) => x.id === dictateDocId);
        if (d) { d.text = text; d.title = docTitle(text); d.updated = Date.now(); }
        else {
            d = { id: Date.now().toString(36), title: docTitle(text), text, updated: Date.now() };
            library.unshift(d);
            dictateDocId = d.id;
        }
        persistLib();
        renderLibrary();
        if (!silent) toast(`Saved “${d.title}” to your Library.`);
    }
    saveBtn2.addEventListener("click", () => saveToLibrary(false));
    // Autosave: saves to the Library shortly after the text stops changing.
    let autosaveTimer = null;
    let lastAutosaved = null;
    function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        if (!dset.autosave) return;
        autosaveTimer = setTimeout(() => {
            const text = dictateText.value;
            if (!text.trim() || text === lastAutosaved) return;
            saveToLibrary(true);
            lastAutosaved = text;
        }, 1500);
    }
    window.addEventListener("pagehide", () => {
        if (dset.autosave && dictateText.value.trim() && dictateText.value !== lastAutosaved) { clearTimeout(autosaveTimer); saveToLibrary(true); lastAutosaved = dictateText.value; }
    });
    // ---------- settings panel wiring ----------
    Object.entries(SWITCHES).forEach(([id, key]) => {
        $(id).addEventListener("click", () => {
            dset[key] = !dset[key];
            saveDictateSettings();
            if (key === "cursor" && !listening) syncFromTextarea();
            if (key === "autosave") { if (dset.autosave) { scheduleAutosave(); toast("Autosave on. Dictated text is saved to your Library."); } else clearTimeout(autosaveTimer); }
        });
    });
    $("panel-dictate-settings").addEventListener("click", (e) => {
        const row = e.target.closest(".option");
        if (row && !e.target.closest(".switch")) row.querySelector(".switch")?.click();
        const sz = e.target.closest("[data-dsize]");
        if (sz) { dset.size = sz.dataset.dsize; saveDictateSettings(); }
    });
    $("dsReset").addEventListener("click", () => { dset = { ...DSET_DEFAULT }; saveDictateSettings(); toast("Dictation settings reset."); });
    applyDictateSettings();
    // Leaving the editor through New returns to the regular text-to-speech page.
    newBtn.addEventListener("click", hidePage);
    // Opening a Library file while on the Dictate page loads it here instead of on the Read page.
    pageOpeners.dictate = (d) => {
        wantListening = false;
        if (recognition) { recognition.onresult = null; try { recognition.abort(); } catch { /* already stopped */ } }
        clearTimeout(autosaveTimer);
        const current = dictateText.value;
        if (current.trim() && (dictateDocId === d.id || current !== d.text)) saveToLibrary(true);   // keep unsaved work
        if (dictateDocId !== d.id) {
            dictateDocId = d.id;
            dictateText.value = d.text;
        }
        lastAutosaved = dictateText.value;
        syncFromTextarea(); updateCount();
        setStatus("Ready to dictate");
        toast(`Opened “${d.title}” in Dictate.`);
        dictateText.focus();
    };
    // New on the Dictate page starts a fresh dictation session; it never touches the Read page's text.
    $("dictateNewBtn").addEventListener("click", () => {
        wantListening = false;
        if (recognition) {                       // drop any words still on their way from the old session
            recognition.onresult = null;
            try { recognition.abort(); } catch { /* already stopped */ }
        }
        clearTimeout(autosaveTimer);
        let saved = null;
        if (dictateText.value.trim()) { saveToLibrary(true); saved = library.find((x) => x.id === dictateDocId); }
        dictateDocId = null;
        lastAutosaved = null;
        dictateText.value = "";
        syncFromTextarea(); updateCount();
        setStatus("Ready to dictate");
        toast(saved ? `Saved “${saved.title}” to your Library. New dictation started.` : "New dictation started.");
        dictateText.focus();
    });
    updateCount();
})();


// =========================================================
// TRANSCRIBE PAGE (audio file or recording -> text, Whisper running in the browser)
// =========================================================
(() => {
    const navBtn = $("transcribeNavBtn");
    const page = $("transcribePage");
    if (!navBtn || !page) return;
    const readNavBtn = $("readNavBtn");
    const dictNavBtn = $("dictateNavBtn");
    const dictPage = $("dictatePage");
    const main = document.querySelector(".main");
    const card = $("transcribeCard");
    const out = $("transcribeText");
    const startBtn = $("transcribeStartBtn");
    const statusEl2 = $("transcribeStatus");
    const countEl = $("transcribeCount");
    const langSel = $("transcribeLang");
    const fileInput3 = $("transcribeFileInput");
    const recordBtn3 = $("transcribeRecordBtn");
    const progress = $("transcribeProgress");

    // ---------- settings ----------
    const TSET_KEY = "tts_transcribe_settings";
    const TSET_DEFAULT = { model: "tiny", stamps: false };
    const MODELS = {
        tiny: { id: "Xenova/whisper-tiny", size: "≈40 MB" },
        base: { id: "Xenova/whisper-base", size: "≈75 MB" },
    };
    let tset = { ...TSET_DEFAULT };
    try { tset = { ...TSET_DEFAULT, ...(JSON.parse(store.get(TSET_KEY) || "{}") || {}) }; } catch { /* use defaults */ }
    if (!MODELS[tset.model]) tset.model = "tiny";
    function applySettings() {
        $("tsStamps").setAttribute("aria-checked", String(!!tset.stamps));
        $("tsModelValue").textContent = MODELS[tset.model].size;
        document.querySelectorAll("[data-tmodel]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tmodel === tset.model)));
    }
    function saveSettings() { store.set(TSET_KEY, JSON.stringify(tset)); applySettings(); }

    // ---------- state + small helpers ----------
    let busy = false;
    let cancelled = false;
    let rec = null, recStream = null, recChunks = [];
    let docId = null;

    function setStatus(message, active = false) {
        statusEl2.lastChild.textContent = ` ${message}`;
        page.dataset.listening = active ? "true" : "false";
    }
    function setProgress(frac) {            // null = hidden, -1 = indeterminate, 0..1 = determinate
        if (frac === null) { progress.hidden = true; progress.classList.remove("indeterminate"); return; }
        progress.hidden = false;
        progress.classList.toggle("indeterminate", frac < 0);
        progress.firstElementChild.style.width = frac < 0 ? "" : `${Math.round(frac * 100)}%`;
    }
    function updateCount() {
        const words = out.value.trim().split(/\s+/).filter(Boolean).length;
        countEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
    }
    function setBusy(on) {
        busy = on;
        startBtn.querySelector("span").textContent = on ? "Stop" : "Choose audio file";
        startBtn.querySelector("use").setAttribute("href", on ? "#i-x" : "#i-file");
        recordBtn3.disabled = on && !rec;
    }
    const stamp = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };

    // ---------- speech model (loaded on first use) ----------
    const TF_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
    let tfPromise = null;
    const pipes = {};
    let onModelProgress = () => {};
    async function getPipe(key) {
        if (pipes[key]) return pipes[key];
        const files = {};
        const handler = (p) => {
            if (p.status === "progress" && p.total) {
                files[p.file] = { loaded: p.loaded, total: p.total };
                let l = 0, t = 0;
                Object.values(files).forEach((f) => { l += f.loaded; t += f.total; });
                onModelProgress(t ? l / t : 0);
            }
        };
        pipes[key] = (async () => {
            if (!tfPromise) tfPromise = import(TF_URL).catch((e) => { tfPromise = null; throw e; });
            const tf = await tfPromise;
            tf.env.allowLocalModels = false;
            try { tf.env.backends.onnx.wasm.proxy = true; } catch { /* keep default threading */ }
            return tf.pipeline("automatic-speech-recognition", MODELS[key].id, { progress_callback: handler });
        })().catch((e) => { delete pipes[key]; throw e; });
        return pipes[key];
    }

    // ---------- audio decoding: any audio/video file -> 16 kHz mono samples ----------
    async function toSamples(blob) {
        const buf = await blob.arrayBuffer();
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        let decoded;
        try { decoded = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); }); }
        finally { try { ctx.close(); } catch { /* ignore */ } }
        const rate = 16000;
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const off = new OAC(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
        const src = off.createBufferSource();
        src.buffer = decoded; src.connect(off.destination); src.start();
        const rendered = await off.startRendering();
        return rendered.getChannelData(0);
    }

    // ---------- the transcription run ----------
    const NON_SPEECH = /^\s*[\[(][^\])]*[\])]\s*$/;   // e.g. [BLANK_AUDIO], (music)
    async function transcribeBlob(blob, label) {
        if (busy) return;
        cancelled = false;
        setBusy(true);
        const key = tset.model;
        const lang = langSel.value;
        try {
            setStatus("Preparing audio…", true); setProgress(-1);
            let samples;
            try { samples = await toSamples(blob); }
            catch { throw new Error("decode"); }
            if (!samples.length) throw new Error("decode");

            setStatus(pipes[key] ? "Starting…" : `Loading speech model (${MODELS[key].size})…`, true);
            onModelProgress = (f) => { setStatus(`Downloading speech model… ${Math.round(f * 100)}%`, true); setProgress(f); };
            const pipe = await getPipe(key);
            onModelProgress = () => {};
            if (cancelled) throw new Error("cancelled");

            const SR = 16000, STEP = 30 * SR;
            const total = Math.ceil(samples.length / STEP);
            const existing = out.value.replace(/\s+$/, "");
            const base = existing ? existing + "\n\n" : "";
            const pieces = [];
            for (let n = 0; n < total; n++) {
                if (cancelled) break;
                setStatus(total > 1 ? `Transcribing… ${n + 1} of ${total}` : "Transcribing…", true);
                setProgress(n / total);
                const start = n * STEP;
                const slice = samples.slice(start, Math.min(start + STEP, samples.length));
                if (slice.length < SR * 0.4) continue;
                const opts = { task: "transcribe", return_timestamps: true };
                if (lang !== "auto") opts.language = lang;
                const res = await pipe(slice, opts);
                const offset = start / SR;
                if (tset.stamps && Array.isArray(res.chunks) && res.chunks.length) {
                    res.chunks.forEach((c) => {
                        const t = (c.text || "").trim();
                        if (t && !NON_SPEECH.test(t)) pieces.push(`[${stamp(offset + (c.timestamp?.[0] || 0))}] ${t}`);
                    });
                    out.value = base + pieces.join("\n");
                } else {
                    const t = (res.text || "").trim();
                    if (t && !NON_SPEECH.test(t)) pieces.push(t);
                    out.value = base + pieces.join(" ");
                }
                out.scrollTop = out.scrollHeight;
                updateCount();
            }
            if (cancelled) { setStatus(pieces.length ? "Stopped. Kept what was transcribed" : "Stopped"); }
            else if (!pieces.length) { setStatus("No speech found"); toast("No speech was found in that audio."); }
            else { setStatus("Done"); toast(`Transcribed ${label}.`); }
        } catch (err) {
            if (err && err.message === "cancelled") setStatus("Stopped");
            else if (err && err.message === "decode") { setStatus("Could not read that audio"); toast("That file could not be decoded. Try MP3, WAV, M4A or OGG."); }
            else { setStatus("Could not load the speech model"); toast("The speech model could not be loaded. Check your internet connection and try again."); }
        } finally {
            onModelProgress = () => {};
            setProgress(null);
            setBusy(false);
            updateCount();
        }
    }

    // ---------- file + recording input ----------
    startBtn.addEventListener("click", () => {
        if (busy) { cancelled = true; setStatus("Stopping…"); return; }
        if (rec) { rec.stop(); return; }
        fileInput3.click();
    });
    fileInput3.addEventListener("change", () => {
        const file = fileInput3.files[0];
        fileInput3.value = "";
        if (file) transcribeBlob(file, file.name);
    });
    ["dragenter", "dragover"].forEach((ev) => card.addEventListener(ev, (e) => {
        if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); card.classList.add("dragover"); }
    }));
    ["dragleave", "drop"].forEach((ev) => card.addEventListener(ev, () => card.classList.remove("dragover")));
    card.addEventListener("drop", (e) => {
        const file = e.dataTransfer && e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|wav|m4a|ogg|opus|webm|flac|aac|mp4|mov|mkv)$/i.test(file.name)) { toast("Drop an audio or video file."); return; }
        transcribeBlob(file, file.name);
    });

    async function toggleRecord() {
        if (rec) { rec.stop(); return; }
        if (busy) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
            toast("Recording is not supported in this browser."); return;
        }
        try { recStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                noiseSuppression: { ideal: true },
                echoCancellation: { ideal: true },
                autoGainControl: { ideal: true },
                channelCount: { ideal: 1 }
            }
        }); }
        catch { setStatus("Microphone permission denied"); toast("Allow microphone access to record."); return; }
        recChunks = [];
        const r = new MediaRecorder(recStream);
        rec = r;
        r.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
        r.onstop = () => {
            recStream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(recChunks, { type: r.mimeType || "audio/webm" });
            rec = null;
            page.dataset.recording = "false";
            recordBtn3.querySelector("span").textContent = "Record";
            startBtn.disabled = false;
            if (blob.size) transcribeBlob(blob, "your recording"); else setStatus("Ready to transcribe");
        };
        r.start();
        page.dataset.recording = "true";
        recordBtn3.querySelector("span").textContent = "Stop";
        startBtn.disabled = true;
        setStatus("Recording… press Stop when finished", true);
    }
    recordBtn3.addEventListener("click", toggleRecord);

    // ---------- text actions ----------
    out.addEventListener("input", updateCount);
    $("transcribeClearBtn").addEventListener("click", () => {
        out.value = ""; docId = null; updateCount();
        if (!busy) setStatus("Ready to transcribe");
        out.focus();
    });
    $("transcribeCopyBtn").addEventListener("click", async () => {
        if (!out.value.trim()) { toast("There is no transcript to copy."); return; }
        try { await navigator.clipboard.writeText(out.value); toast("Transcript copied."); }
        catch { out.focus(); out.select(); try { document.execCommand("copy"); toast("Transcript copied."); } catch { toast("Copy failed. Select the text and copy it manually."); } }
    });
    $("transcribeDownloadBtn").addEventListener("click", () => {
        if (!out.value.trim()) { toast("There is no transcript to download."); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([out.value], { type: "text/plain;charset=utf-8" }));
        a.download = `${(docTitle(out.value) || "transcript").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 40) || "transcript"}.txt`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    function saveToLib() {
        const t = out.value;
        if (!t.trim()) return null;
        let d = library.find((x) => x.id === docId);
        if (d) { d.text = t; d.title = docTitle(t); d.updated = Date.now(); }
        else { d = { id: Date.now().toString(36), title: docTitle(t), text: t, updated: Date.now() }; library.unshift(d); docId = d.id; }
        persistLib(); renderLibrary();
        return d;
    }
    $("transcribeSaveBtn").addEventListener("click", () => {
        const d = saveToLib();
        toast(d ? `Saved “${d.title}” to your Library.` : "There is no transcript to save yet.");
    });
    $("transcribeUseBtn").addEventListener("click", () => {
        if (!out.value.trim()) { toast("Transcribe or type some text first."); return; }
        setText(out.value);
        if (readNavBtn) readNavBtn.click();
        toast("Transcript added to Aloud.");
    });
    // Opening a Library file while on the Transcribe page loads it here instead of on the Read page.
    pageOpeners.transcribe = (d) => {
        if (busy) { toast("Press Stop first, then open a file."); return; }
        const current = out.value;
        if (current.trim() && (docId === d.id || current !== d.text)) saveToLib();   // keep unsaved work
        if (docId !== d.id) { docId = d.id; out.value = d.text; }
        updateCount();
        setStatus("Ready to transcribe");
        toast(`Opened “${d.title}” in Transcribe.`);
        out.focus();
    };
    $("transcribeNewBtn").addEventListener("click", () => {
        if (busy) { toast("Press Stop first, then start a new transcript."); return; }
        if (out.value.trim()) saveToLib();
        out.value = ""; docId = null; updateCount(); setStatus("Ready to transcribe");
        out.focus();
    });

    // ---------- settings panel ----------
    $("tsStamps").addEventListener("click", () => { tset.stamps = !tset.stamps; saveSettings(); });
    $("panel-transcribe-settings").addEventListener("click", (e) => {
        const row = e.target.closest(".option");
        if (row && !e.target.closest(".switch")) row.querySelector(".switch")?.click();
        const m = e.target.closest("[data-tmodel]");
        if (m) { tset.model = m.dataset.tmodel; saveSettings(); }
    });
    $("tsReset").addEventListener("click", () => { tset = { ...TSET_DEFAULT }; saveSettings(); toast("Transcription settings reset."); });
    applySettings();

    // ---------- page switching ----------
    function showPage() {
        closePanels();
        if (dictPage && !dictPage.classList.contains("hidden") && readNavBtn) readNavBtn.click();
        main.classList.add("transcribe-active");
        page.classList.remove("hidden");
        page.setAttribute("aria-hidden", "false");
        navBtn.classList.add("on"); navBtn.setAttribute("aria-pressed", "true");
        if (readNavBtn) { readNavBtn.classList.remove("on"); readNavBtn.setAttribute("aria-pressed", "false"); }
        if (dictNavBtn) { dictNavBtn.classList.remove("on"); dictNavBtn.setAttribute("aria-pressed", "false"); }
    }
    function hidePage() {
        if (page.classList.contains("hidden")) return;
        if (rec) rec.stop();               // transcription of a finished run keeps going in the background
        closePanels();
        main.classList.remove("transcribe-active");
        page.classList.add("hidden");
        page.setAttribute("aria-hidden", "true");
        navBtn.classList.remove("on"); navBtn.setAttribute("aria-pressed", "false");
        if (readNavBtn && (!dictPage || dictPage.classList.contains("hidden"))) {
            readNavBtn.classList.add("on"); readNavBtn.setAttribute("aria-pressed", "true");
        }
    }
    navBtn.addEventListener("click", () => (page.classList.contains("hidden") ? showPage() : hidePage()));
    if (readNavBtn) readNavBtn.addEventListener("click", hidePage);
    if (dictNavBtn) dictNavBtn.addEventListener("click", hidePage);
    newBtn.addEventListener("click", hidePage);
    updateCount();
})();
