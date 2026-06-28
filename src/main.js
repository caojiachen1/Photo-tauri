import { invoke, listen, convertFileSrc, formatFileSize, formatTime, getFileExtension, getFileName, getDirectory, isImageFile, isVideoFile, isSupportedFile, debounce } from './utils.js';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    createIcons,
    SavePlus, Copy, RotateCw, Trash2, MoreHorizontal,
    FolderOpen, Settings, ChevronLeft, ChevronRight,
    Play, Pause, SkipBack, SkipForward,
    Volume2, VolumeX, Repeat,
    LayoutGrid, List, Info,
    Maximize2, Minimize, Maximize,
    ZoomIn, ZoomOut, ChevronUp, X,
    Image, HardDrive, Minus, Square
} from 'lucide';

createIcons({
    icons: {
        SavePlus, Copy, RotateCw, Trash2, MoreHorizontal,
        FolderOpen, Settings, ChevronLeft, ChevronRight,
        Play, Pause, SkipBack, SkipForward,
        Volume2, VolumeX, Repeat,
        LayoutGrid, List, Info,
        Maximize2, Minimize, Maximize,
        ZoomIn, ZoomOut, ChevronUp, X,
        Image, HardDrive, Minus, Square
    }
});

// ===== State =====
const state = {
    currentFile: null,
    folderFiles: [],
    currentIndex: -1,
    imageMetadata: null,
    isImageLoaded: false,
    isVideo: false,
    isFullScreen: false,
    isThumbnailBarVisible: false,
    isFileInfoPanelVisible: false,
    zoom: 1.0,
    minZoom: 0.1,
    maxZoom: 10.0,
    fitZoom: 1.0,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    panX: 0,
    panY: 0,
    settings: {
        confirm_before_delete: true,
        show_faces: true,
        use_hardware_acceleration: true,
    },
    thumbnailItems: [],
    thumbnailCache: new Map(),
    playbackHistory: {},
    videoRepeat: false,
};

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const elements = {};

function cacheElements() {
    elements.topToolbar = $('#topToolbar');
    elements.bottomStatusBar = $('#bottomStatusBar');
    elements.contentArea = $('#contentArea');
    elements.fileNameText = $('#fileNameText');
    elements.btnSaveAs = $('#btnSaveAs');
    elements.btnCopy = $('#btnCopy');
    elements.btnRotate = $('#btnRotate');
    elements.btnDelete = $('#btnDelete');
    elements.btnMore = $('#btnMore');
    elements.moreMenu = $('#moreMenu');
    elements.btnOpenFile = $('#btnOpenFile');
    elements.btnOpenExplorer = $('#btnOpenExplorer');
    elements.btnSettings = $('#btnSettings');
    elements.btnPrevious = $('#btnPrevious');
    elements.btnNext = $('#btnNext');
    elements.imageContainer = $('#imageContainer');
    elements.imageWrapper = $('#imageWrapper');
    elements.mainImage = $('#mainImage');
    elements.faceOverlayCanvas = $('#faceOverlayCanvas');
    elements.videoContainer = $('#videoContainer');
    elements.videoPlayer = $('#videoPlayer');
    elements.videoControls = $('#videoControls');
    elements.btnPlayPause = $('#btnPlayPause');
    elements.iconPlay = $('#iconPlay');
    elements.iconPause = $('#iconPause');
    elements.btnRewind = $('#btnRewind');
    elements.btnForward = $('#btnForward');
    elements.videoSeekBar = $('#videoSeekBar');
    elements.videoCurrentTime = $('#videoCurrentTime');
    elements.videoTotalTime = $('#videoTotalTime');
    elements.btnMute = $('#btnMute');
    elements.iconVolume = $('#iconVolume');
    elements.iconMuted = $('#iconMuted');
    elements.volumeSlider = $('#volumeSlider');
    elements.btnRepeat = $('#btnRepeat');
    elements.placeholderPanel = $('#placeholderPanel');
    elements.thumbnailBar = $('#thumbnailBar');
    elements.thumbnailList = $('#thumbnailList');
    elements.btnThumbnailToggle = $('#btnThumbnailToggle');
    elements.iconThumbnailShow = $('#iconThumbnailShow');
    elements.iconThumbnailHide = $('#iconThumbnailHide');
    elements.btnFileInfo = $('#btnFileInfo');
    elements.imageDimensions = $('#imageDimensions');
    elements.fileSize = $('#fileSize');
    elements.btnRotateBottom = $('#btnRotateBottom');
    elements.btnFitToWindow = $('#btnFitToWindow');
    elements.btnActualSize = $('#btnActualSize');
    elements.btnZoomDropdown = $('#btnZoomDropdown');
    elements.zoomPercentText = $('#zoomPercentText');
    elements.zoomMenu = $('#zoomMenu');
    elements.btnZoomOut = $('#btnZoomOut');
    elements.zoomSlider = $('#zoomSlider');
    elements.btnZoomIn = $('#btnZoomIn');
    elements.btnFullScreen = $('#btnFullScreen');
    elements.iconFullScreen = $('#iconFullScreen');
    elements.iconExitFullScreen = $('#iconExitFullScreen');
    elements.fileInfoPanel = $('#fileInfoPanel');
    elements.settingsDialog = $('#settingsDialog');
    elements.btnCloseSettings = $('#btnCloseSettings');
    elements.btnCancelSettings = $('#btnCancelSettings');
    elements.btnSaveSettings = $('#btnSaveSettings');
    elements.settingConfirmDelete = $('#settingConfirmDelete');
    elements.settingShowFaces = $('#settingShowFaces');
    elements.settingHardwareAccel = $('#settingHardwareAccel');
    elements.confirmDialog = $('#confirmDialog');
    elements.confirmMessage = $('#confirmMessage');
    elements.btnConfirmCancel = $('#btnConfirmCancel');
    elements.btnConfirmOk = $('#btnConfirmOk');
    elements.errorDialog = $('#errorDialog');
    elements.errorTitle = $('#errorTitle');
    elements.errorMessage = $('#errorMessage');
    elements.btnErrorOk = $('#btnErrorOk');

    // Window controls
    elements.btnMinimize = $('#btnMinimize');
    elements.btnMaximize = $('#btnMaximize');
    elements.btnClose = $('#btnClose');
    elements.iconMaximize = $('#iconMaximize');
    elements.iconRestore = $('#iconRestore');
}

// ===== Initialization =====
async function init() {
    cacheElements();

    // 动态创建右侧导航按钮
    const btnNext = document.createElement('button');
    btnNext.id = 'btnNext';
    btnNext.title = '下一张';
    btnNext.style.cssText = 'position:fixed;top:48px;right:0;width:60px;height:calc(100vh - 96px);background:transparent;z-index:10;border:none;color:rgba(255,255,255,0.6);cursor:pointer;display:none;align-items:center;justify-content:center;transition:color 0.2s;';
    btnNext.onmouseenter = () => btnNext.style.color = 'rgba(255,255,255,0.95)';
    btnNext.onmouseleave = () => btnNext.style.color = 'rgba(255,255,255,0.6)';
    btnNext.onclick = () => navigate(1);
    btnNext.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
    document.body.appendChild(btnNext);
    elements.btnNext = btnNext;

    await loadSettings();
    setupEventListeners();
    await setupDragDrop();
    setupKeyboard();
    await setupFileWatcher();
    updateMaximizeIcon();

    // Open file passed via command-line args (e.g. from "Open with")
    await listen('open-file-from-arg', async (event) => {
        await loadImage(event.payload);
    });
}

// ===== Settings =====
async function loadSettings() {
    try {
        state.settings = await invoke('get_settings');
        elements.settingConfirmDelete.checked = state.settings.confirm_before_delete;
        elements.settingShowFaces.checked = state.settings.show_faces;
        elements.settingHardwareAccel.checked = state.settings.use_hardware_acceleration;
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

async function saveSettings() {
    try {
        state.settings.confirm_before_delete = elements.settingConfirmDelete.checked;
        state.settings.show_faces = elements.settingShowFaces.checked;
        state.settings.use_hardware_acceleration = elements.settingHardwareAccel.checked;
        await invoke('save_settings', { settings: state.settings });
        updateFaceOverlay();
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Toolbar buttons
    elements.btnSaveAs.addEventListener('click', handleSaveAs);
    elements.btnCopy.addEventListener('click', handleCopy);
    elements.btnRotate.addEventListener('click', handleRotate);
    elements.btnDelete.addEventListener('click', handleDelete);
    elements.btnMore.addEventListener('click', toggleMoreMenu);
    elements.btnOpenFile.addEventListener('click', handleOpenFile);
    elements.btnOpenExplorer.addEventListener('click', handleOpenExplorer);
    elements.btnSettings.addEventListener('click', openSettingsDialog);

    // Navigation
    elements.btnPrevious.addEventListener('click', () => navigate(-1));
    elements.btnNext.addEventListener('click', () => navigate(1));

    // Image zoom/pan
    elements.imageContainer.addEventListener('wheel', handleWheel, { passive: false });
    elements.imageContainer.addEventListener('pointerdown', handlePointerDown);
    elements.imageContainer.addEventListener('pointermove', handlePointerMove);
    elements.imageContainer.addEventListener('pointerup', handlePointerUp);
    elements.imageContainer.addEventListener('pointerleave', handlePointerLeave);

    // Video controls
    elements.btnPlayPause.addEventListener('click', togglePlayPause);
    elements.btnRewind.addEventListener('click', () => seekRelative(-10000));
    elements.btnForward.addEventListener('click', () => seekRelative(10000));
    elements.videoSeekBar.addEventListener('input', handleSeek);
    elements.btnMute.addEventListener('click', toggleMute);
    elements.volumeSlider.addEventListener('input', handleVolumeChange);
    elements.btnRepeat.addEventListener('click', toggleRepeat);

    // Video player events
    elements.videoPlayer.addEventListener('timeupdate', updateTimeDisplay);
    elements.videoPlayer.addEventListener('loadedmetadata', onVideoMetadataLoaded);
    elements.videoPlayer.addEventListener('ended', onVideoEnded);
    elements.videoPlayer.addEventListener('play', updatePlayPauseIcon);
    elements.videoPlayer.addEventListener('pause', updatePlayPauseIcon);
    elements.videoPlayer.addEventListener('error', onVideoError);

    // Bottom bar
    elements.btnThumbnailToggle.addEventListener('click', toggleThumbnailBar);
    elements.btnFileInfo.addEventListener('click', toggleFileInfoPanel);
    elements.btnRotateBottom.addEventListener('click', handleRotate);
    elements.btnFitToWindow.addEventListener('click', fitToWindow);
    elements.btnActualSize.addEventListener('click', () => setZoom(1.0));
    elements.btnZoomDropdown.addEventListener('click', toggleZoomMenu);
    elements.btnZoomOut.addEventListener('click', zoomOut);
    elements.zoomSlider.addEventListener('input', handleZoomSlider);
    elements.btnZoomIn.addEventListener('click', zoomIn);
    elements.btnFullScreen.addEventListener('click', toggleFullScreen);

    // Window controls
    elements.btnMinimize.addEventListener('click', handleMinimize);
    elements.btnMaximize.addEventListener('click', handleToggleMaximize);
    elements.btnClose.addEventListener('click', handleClose);
    window.addEventListener('resize', debounce(updateMaximizeIcon, 100));

    // Titlebar double-click to toggle maximize
    elements.topToolbar.addEventListener('dblclick', async (e) => {
        if (e.target.closest('.toolbar-btn') || e.target.closest('.window-btn')) return;
        await handleToggleMaximize();
    });

    // Zoom menu
    elements.zoomMenu.addEventListener('click', handleZoomMenuClick);

    // File info panel

    // Settings dialog
    elements.btnCloseSettings.addEventListener('click', closeSettingsDialog);
    elements.btnCancelSettings.addEventListener('click', closeSettingsDialog);
    elements.btnSaveSettings.addEventListener('click', async () => {
        await saveSettings();
        closeSettingsDialog();
        updateFaceOverlay();
    });

    // Confirm dialog
    elements.btnConfirmCancel.addEventListener('click', () => hideDialog('confirmDialog'));
    elements.btnConfirmOk.addEventListener('click', () => {
        elements.confirmDialog._resolve(true);
        hideDialog('confirmDialog');
    });

    // Error dialog
    elements.btnErrorOk.addEventListener('click', () => hideDialog('errorDialog'));

    // Close menus on outside click
    document.addEventListener('click', (e) => {
        if (!elements.btnMore.contains(e.target) && !elements.moreMenu.contains(e.target)) {
            elements.moreMenu.classList.add('hidden');
        }
        if (!elements.btnZoomDropdown.contains(e.target) && !elements.zoomMenu.contains(e.target)) {
            elements.zoomMenu.classList.add('hidden');
        }
    });

    // Navigation buttons hover effect
    setupNavButtonHover();
}

function setupNavButtonHover() {
    // Nav buttons use CSS :hover for visibility
    // They are hidden by default (.hidden class) and shown by updateNavigationButtons
    // When shown, CSS handles the hover animation
}

// ===== Drag & Drop =====
async function setupDragDrop() {
    await getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === 'drop') {
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
                const path = paths[0];
                if (isSupportedFile(getFileExtension(path))) {
                    await loadImage(path);
                }
            }
        }
    });

    // Prevent default browser drag-drop behavior
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });

    // Prevent image drag ghost
    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
        }
    });
}

// ===== Keyboard =====
function setupKeyboard() {
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
            if (state.isFullScreen) {
                toggleFullScreen();
                return;
            }
            if (!elements.settingsDialog.classList.contains('hidden')) {
                closeSettingsDialog();
                return;
            }
            if (!elements.errorDialog.classList.contains('hidden')) {
                hideDialog('errorDialog');
                return;
            }
            if (!elements.confirmDialog.classList.contains('hidden')) {
                hideDialog('confirmDialog');
                return;
            }
        }

        if (!state.isImageLoaded) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            await navigate(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            await navigate(1);
        } else if (e.key === 'Delete') {
            e.preventDefault();
            await handleDelete();
        }
    });
}

// ===== File Watcher =====
async function setupFileWatcher() {
    await listen('files-changed', debounce(async () => {
        if (state.currentFile) {
            await updateFileList();
            updateNavigationButtons();
        }
    }, 200));
}

// ===== Image Loading =====
async function loadImage(path) {
    try {
        if (state.isVideo && elements.videoPlayer) {
            elements.videoPlayer.pause();
            elements.videoPlayer.src = '';
        }

        const metadata = await invoke('load_image', { path });
        state.currentFile = path;
        state.imageMetadata = metadata;
        state.isImageLoaded = true;
        state.isVideo = metadata.is_video;

        elements.fileNameText.textContent = metadata.file_name;
        document.title = `${metadata.file_name} - Photo`;
        elements.imageDimensions.textContent = `${metadata.width} x ${metadata.height}`;
        elements.fileSize.textContent = formatFileSize(metadata.file_size);

        if (metadata.is_video) {
            showVideo(metadata);
        } else {
            showImage(metadata);
        }

        updateFileInfo(metadata);
        updateToolbarState(true);

        await updateFileList();
        updateNavigationButtons();
        updateThumbnailSelection();

        const dir = getDirectory(path);
        try {
            await invoke('start_file_watcher', { path: dir });
        } catch (e) {
            console.error('Failed to start file watcher:', e);
        }
    } catch (e) {
        showError('无法打开文件', String(e));
    }
}

async function showImage(metadata) {
    elements.videoContainer.classList.add('hidden');
    elements.placeholderPanel.classList.add('hidden');

    // 移除之前的独立图片
    document.querySelectorAll('#__viewer_img').forEach(el => el.remove());

    // 使用原有 mainImage 元素
    const img = elements.mainImage;
    img.removeAttribute('style');
    img.classList.remove('hidden');

    // 从 Rust 端获取 base64 data URL
    const dataUrl = await invoke('get_image_as_base64', { path: metadata.file_path });

    img.onload = () => {
        updateFaceOverlay();
        requestAnimationFrame(() => fitToWindow());
    };
    img.onerror = () => {
        showError('图片加载失败', metadata.file_path);
    };
    img.src = dataUrl;
}

async function showVideo(metadata) {
    elements.mainImage.classList.add('hidden');
    document.querySelectorAll('#__viewer_img').forEach(el => el.remove());
    elements.videoContainer.classList.remove('hidden');
    elements.placeholderPanel.classList.add('hidden');

    elements.videoSeekBar.value = 0;
    elements.videoCurrentTime.textContent = '00:00:00';
    elements.videoTotalTime.textContent = '00:00:00';
    updatePlayPauseIcon();

    elements.videoPlayer.src = convertFileSrc(metadata.file_path.replace(/\\/g, '/'));
    elements.videoPlayer.load();
}


// ===== Video Controls =====
function togglePlayPause() {
    if (elements.videoPlayer.paused) {
        elements.videoPlayer.play();
    } else {
        elements.videoPlayer.pause();
    }
}

function seekRelative(ms) {
    elements.videoPlayer.currentTime += ms / 1000;
}

function handleSeek() {
    const value = parseInt(elements.videoSeekBar.value);
    const duration = elements.videoPlayer.duration;
    if (duration) {
        elements.videoPlayer.currentTime = (value / 1000) * duration;
    }
}

function toggleMute() {
    elements.videoPlayer.muted = !elements.videoPlayer.muted;
    updateMuteIcon();
}

function handleVolumeChange() {
    const value = parseInt(elements.volumeSlider.value);
    elements.videoPlayer.volume = value / 100;
    if (value === 0) {
        elements.videoPlayer.muted = true;
    } else if (elements.videoPlayer.muted) {
        elements.videoPlayer.muted = false;
    }
    updateMuteIcon();
}

function toggleRepeat() {
    state.videoRepeat = !state.videoRepeat;
    elements.videoPlayer.loop = state.videoRepeat;
    elements.btnRepeat.style.opacity = state.videoRepeat ? '1' : '0.5';
}

function updateTimeDisplay() {
    const current = elements.videoPlayer.currentTime * 1000;
    const duration = elements.videoPlayer.duration * 1000;
    elements.videoCurrentTime.textContent = formatTime(current);
    if (duration) {
        elements.videoSeekBar.value = (current / duration) * 1000;
    }
}

function onVideoMetadataLoaded() {
    const duration = elements.videoPlayer.duration * 1000;
    elements.videoTotalTime.textContent = formatTime(duration);
    elements.imageDimensions.textContent = `${elements.videoPlayer.videoWidth} x ${elements.videoPlayer.videoHeight}`;
}

function onVideoEnded() {
    if (!state.videoRepeat) {
        updatePlayPauseIcon();
    }
}

function onVideoError() {
    const error = elements.videoPlayer.error;
    if (error) {
        showError('视频播放错误', `无法播放视频: ${error.message || '未知错误'}`);
    }
}

function updatePlayPauseIcon() {
    const isPlaying = !elements.videoPlayer.paused;
    elements.iconPlay.classList.toggle('hidden', isPlaying);
    elements.iconPause.classList.toggle('hidden', !isPlaying);
}

function updateMuteIcon() {
    const isMuted = elements.videoPlayer.muted;
    elements.iconVolume.classList.toggle('hidden', isMuted);
    elements.iconMuted.classList.toggle('hidden', !isMuted);
}

// ===== Image Zoom/Pan =====
function handleWheel(e) {
    if (!state.isImageLoaded || state.isVideo) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom * delta));

    if (Math.abs(newZoom - state.zoom) < 0.001) return;

    const rect = elements.imageContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate the point in the image that the mouse is over
    const imgRect = elements.mainImage.getBoundingClientRect();
    const imgX = (e.clientX - imgRect.left) / imgRect.width;
    const imgY = (e.clientY - imgRect.top) / imgRect.height;

    state.zoom = newZoom;
    applyZoom();

    // Adjust scroll to keep the point under the mouse
    const newImgRect = elements.mainImage.getBoundingClientRect();
    const container = elements.imageContainer;
    const newScrollX = (imgX * newImgRect.width + newImgRect.left - rect.left) - mouseX;
    const newScrollY = (imgY * newImgRect.height + newImgRect.top - rect.top) - mouseY;
    container.scrollLeft = newScrollX;
    container.scrollTop = newScrollY;

    updateZoomDisplay();
}

function applyZoom() {
    const img = elements.mainImage;
    if (!img.naturalWidth) return;

    const container = elements.imageContainer;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    state.fitZoom = Math.min(scaleX, scaleY, 1.0);
    state.minZoom = 0.1;

    const displayWidth = imgWidth * state.zoom;
    const displayHeight = imgHeight * state.zoom;

    img.style.width = `${displayWidth}px`;
    img.style.height = `${displayHeight}px`;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.transform = `translate(${state.panX}px, ${state.panY}px)`;

    container.style.cursor = state.isDragging ? 'grabbing' : 'grab';
    updateFaceOverlay();
}

function fitToWindow() {
    if (!state.isImageLoaded || state.isVideo) return;
    const img = elements.mainImage;
    if (!img.naturalWidth) return;

    const container = elements.imageContainer;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = containerWidth / img.naturalWidth;
    const scaleY = containerHeight / img.naturalHeight;
    state.zoom = Math.min(scaleX, scaleY, 1.0);
    state.fitZoom = state.zoom;
    state.minZoom = 0.1;

    // Reset pan
    state.panX = 0;
    state.panY = 0;

    applyZoom();
    updateZoomDisplay();
}

function setZoom(zoom) {
    if (!state.isImageLoaded || state.isVideo) return;
    state.zoom = Math.max(state.minZoom, Math.min(state.maxZoom, zoom));
    applyZoom();
    updateZoomDisplay();
}

function zoomIn() {
    setZoom(state.zoom * 1.25);
}

function zoomOut() {
    setZoom(state.zoom * 0.8);
}

function updateZoomDisplay() {
    const percent = Math.round(state.zoom * 100);
    elements.zoomPercentText.textContent = `${percent}%`;
    elements.zoomSlider.value = Math.max(10, Math.min(1000, percent));
}

function handleZoomSlider() {
    const value = parseInt(elements.zoomSlider.value);
    setZoom(value / 100);
}

function handlePointerDown(e) {
    if (!state.isImageLoaded || state.isVideo) return;
    e.preventDefault();

    if (e.button === 0 || e.button === 1) {
        state.isDragging = true;
        state.dragStart = { x: e.clientX, y: e.clientY };
        elements.imageContainer.setPointerCapture(e.pointerId);
        elements.imageContainer.style.cursor = 'grabbing';
    }
}

function handlePointerMove(e) {
    if (!state.isDragging) return;
    e.preventDefault();

    state.panX += e.movementX;
    state.panY += e.movementY;

    elements.mainImage.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
}

function handlePointerUp(e) {
    if (state.isDragging) {
        state.isDragging = false;
        elements.imageContainer.releasePointerCapture(e.pointerId);
        elements.imageContainer.style.cursor = 'grab';
    }
}

function handlePointerLeave() {
    if (state.isDragging) {
        state.isDragging = false;
        elements.imageContainer.style.cursor = 'grab';
    }
}

// ===== Face Overlay =====
function updateFaceOverlay() {
    // 清除现有人脸覆盖元素
    elements.imageWrapper.querySelectorAll('.face-box, .face-hit-area').forEach(el => el.remove());

    if (!state.settings.show_faces || !state.imageMetadata || state.isVideo) return;

    const regions = state.imageMetadata.face_regions || [];
    console.log('[updateFaceOverlay] regions:', regions.length, regions);

    if (regions.length === 0) return;

    const img = elements.mainImage;
    if (!img.naturalWidth || !img.clientWidth) return;

    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    const imgLeft = img.offsetLeft;
    const imgTop = img.offsetTop;

    // 根据分辨率确定基础参数
    const origWidth = state.imageMetadata.width;
    const origHeight = state.imageMetadata.height;
    let baseFontSize, baseBorderThickness, minBorderThickness, baseTextOffset;

    if (origWidth >= 3000 || origHeight >= 3000) {
        baseFontSize = 8; baseBorderThickness = 0.9; minBorderThickness = 0.5; baseTextOffset = 14;
    } else if (origWidth >= 2000 || origHeight >= 2000) {
        baseFontSize = 7; baseBorderThickness = 0.7; minBorderThickness = 0.4; baseTextOffset = 12;
    } else if (origWidth >= 1000 || origHeight >= 1000) {
        baseFontSize = 6.5; baseBorderThickness = 0.6; minBorderThickness = 0.3; baseTextOffset = 11;
    } else {
        baseFontSize = 6; baseBorderThickness = 0.5; minBorderThickness = 0.3; baseTextOffset = 10;
    }

    const zoomFactor = state.zoom;
    const fontSize = Math.max(baseFontSize / zoomFactor, 7);
    const borderThickness = Math.max(baseBorderThickness / zoomFactor, minBorderThickness);
    const textOffset = baseTextOffset / zoomFactor;

    regions.forEach((region, index) => {
        const x = region.x * displayW + imgLeft;
        const y = region.y * displayH + imgTop;
        const w = region.width * displayW;
        const h = region.height * displayH;

        // 创建人脸框（白色边框，透明背景，默认隐藏）
        const faceBox = document.createElement('div');
        faceBox.className = 'face-box';
        faceBox.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${w}px;
            height: ${h}px;
            border: ${borderThickness}px solid white;
            background: transparent;
            opacity: 0;
            pointer-events: none;
            z-index: 10;
        `;

        // 创建标签（深灰背景，白边，圆角5，贴在框下方）
        if (region.name) {
            const label = document.createElement('div');
            label.className = 'face-label';
            label.style.cssText = `
                position: absolute;
                left: 0;
                bottom: -${textOffset + fontSize / 2}px;
                background: rgba(64, 64, 64, 0.9);
                border: ${Math.max(borderThickness * 0.5, 0.4)}px solid white;
                border-radius: 4px;
                padding: 1px ${fontSize * 0.35}px;
                color: white;
                font-size: ${fontSize}px;
                font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
                white-space: nowrap;
                line-height: 1.3;
            `;
            label.textContent = region.name;
            faceBox.appendChild(label);
        }

        // 创建悬停检测区域（比人脸框大20px）
        const padding = 20;
        const hitArea = document.createElement('div');
        hitArea.className = 'face-hit-area';
        hitArea.style.cssText = `
            position: absolute;
            left: ${x - padding}px;
            top: ${y - padding}px;
            width: ${w + padding * 2}px;
            height: ${h + padding * 2}px;
            background: transparent;
            cursor: pointer;
            z-index: 11;
        `;

        // 悬停事件：进入显示，离开隐藏（与母项目一致）
        hitArea.addEventListener('mouseenter', () => {
            console.log('[FaceHover] mouseenter', region.name);
            faceBox.style.opacity = '1';
        });
        hitArea.addEventListener('mouseleave', () => {
            console.log('[FaceHover] mouseleave', region.name);
            faceBox.style.opacity = '0';
        });

        // 添加到图片容器（先hitArea后faceBox，确保z-order正确）
        elements.imageWrapper.appendChild(hitArea);
        elements.imageWrapper.appendChild(faceBox);
        console.log('[updateFaceOverlay] created face box at', {x, y, w, h}, 'name:', region.name);
    });
}

// ===== File Info Panel =====
function updateFileInfo(metadata) {
    const setInfo = (id, value, groupId) => {
        const el = $(`#${id}`);
        const group = $(`#${groupId}`);
        if (el) el.textContent = value || '';
        if (group) group.classList.toggle('hidden', !value);
    };

    $('#infoFileName').textContent = metadata.file_name;
    $('#infoFilePath').textContent = getDirectory(metadata.file_path);
    $('#infoFileType').textContent = metadata.is_video
        ? `${metadata.file_type.replace('.', '').toUpperCase()} 视频`
        : `${metadata.file_type.replace('.', '').toUpperCase()} 图片`;
    $('#infoDimensions').textContent = metadata.is_video && metadata.duration_ms > 0
        ? `${metadata.width} x ${metadata.height} (${formatTime(metadata.duration_ms)})`
        : `${metadata.width} x ${metadata.height} 像素`;
    $('#infoFileSize').textContent = formatFileSize(metadata.file_size);
    $('#infoCreatedDate').textContent = metadata.created_date;
    $('#infoModifiedDate').textContent = metadata.modified_date;

    setInfo('infoDateTimeOriginal', metadata.date_time_original, 'infoDateTimeOriginalGroup');
    setInfo('infoCameraModel', metadata.camera_model, 'infoCameraModelGroup');
    setInfo('infoFNumber', metadata.f_number, 'infoShootingParamsGroup');
    setInfo('infoExposureTime', metadata.exposure_time, 'infoShootingParamsGroup');
    setInfo('infoISO', metadata.iso, 'infoShootingParamsGroup');
    setInfo('infoFocalLength', metadata.focal_length, 'infoShootingParamsGroup');
    setInfo('infoKeywords', metadata.keywords?.join(', '), 'infoKeywordsGroup');
    setInfo('infoPeople', metadata.people?.join(', '), 'infoPeopleGroup');
}

function updateFileInfoPanelVisibility() {
    elements.fileInfoPanel.classList.toggle('hidden', !state.isFileInfoPanelVisible);
}

// ===== Navigation =====
async function updateFileList() {
    if (!state.currentFile) return;

    try {
        const files = await invoke('get_folder_files', { path: state.currentFile });
        state.folderFiles = files;
        state.currentIndex = files.indexOf(state.currentFile);

        // Update thumbnails
        updateThumbnails();
    } catch (e) {
        console.error('Failed to get folder files:', e);
    }
}

function updateNavigationButtons() {
    const hasMultiple = state.folderFiles.length > 1;
    const isFirst = state.currentIndex <= 0;
    const isLast = state.currentIndex >= state.folderFiles.length - 1;

    // 显示/隐藏导航按钮
    if (!hasMultiple || isFirst) {
        elements.btnPrevious.style.display = 'none';
    } else {
        elements.btnPrevious.style.display = 'flex';
    }
    if (!hasMultiple || isLast) {
        elements.btnNext.style.display = 'none';
    } else {
        elements.btnNext.style.display = 'flex';
    }
}

async function navigate(direction) {
    if (state.folderFiles.length <= 1) return;

    const newIndex = state.currentIndex + direction;
    if (newIndex < 0 || newIndex >= state.folderFiles.length) return;

    const nextFile = state.folderFiles[newIndex];
    await loadImage(nextFile);
}

// ===== Thumbnails (Virtualized) =====
const THUMB_SIZE = 80;
const THUMB_GAP = 4;
const THUMB_STRIDE = THUMB_SIZE + THUMB_GAP;
const THUMB_OVERSCAN = 5; // extra items on each side

function updateThumbnails() {
    // Remove old scroll listener
    if (state._thumbScrollHandler) {
        elements.thumbnailList.removeEventListener('scroll', state._thumbScrollHandler);
    }

    elements.thumbnailList.innerHTML = '';
    state.thumbnailItems = new Array(state.folderFiles.length).fill(null);
    state._thumbRenderedRange = { start: -1, end: -1 };
    state._thumbLoadQueue = [];
    state._thumbLoading = false;

    // Set container to allow absolute positioning
    elements.thumbnailList.style.position = 'relative';
    elements.thumbnailList.style.display = 'block';

    // Spacer for correct scroll width
    const spacer = document.createElement('div');
    spacer.style.width = `${state.folderFiles.length * THUMB_STRIDE}px`;
    spacer.style.height = '1px';
    spacer.style.pointerEvents = 'none';
    spacer.className = 'thumb-spacer';
    elements.thumbnailList.appendChild(spacer);

    renderVisibleThumbnails();

    state._thumbScrollHandler = () => renderVisibleThumbnails();
    elements.thumbnailList.addEventListener('scroll', state._thumbScrollHandler);

    // 滚轮横向滚动缩略图
    elements.thumbnailList.addEventListener('wheel', (e) => {
        e.preventDefault();
        elements.thumbnailList.scrollLeft += e.deltaY || e.deltaX;
    }, { passive: false });
}

function renderVisibleThumbnails() {
    const scrollLeft = elements.thumbnailList.scrollLeft;
    const viewWidth = elements.thumbnailList.clientWidth;

    const start = Math.max(0, Math.floor(scrollLeft / THUMB_STRIDE) - THUMB_OVERSCAN);
    const end = Math.min(state.folderFiles.length, Math.ceil((scrollLeft + viewWidth) / THUMB_STRIDE) + THUMB_OVERSCAN);

    const range = state._thumbRenderedRange;

    // If range hasn't changed, skip
    if (start === range.start && end === range.end) return;

    // Remove items outside new range
    for (let i = range.start; i < range.end; i++) {
        if (i < start || i >= end) {
            if (state.thumbnailItems[i]) {
                state.thumbnailItems[i].element.remove();
                state.thumbnailItems[i] = null;
            }
        }
    }

    // Create items in new range
    const toLoad = [];
    for (let i = start; i < end; i++) {
        if (!state.thumbnailItems[i]) {
            createThumbElement(i);
            if (!state.thumbnailItems[i].loaded) {
                toLoad.push(i);
            }
        }
    }

    state._thumbRenderedRange = { start, end };

    // Queue thumbnail loads (priority: near current)
    if (toLoad.length > 0) {
        toLoad.sort((a, b) => Math.abs(a - state.currentIndex) - Math.abs(b - state.currentIndex));
        state._thumbLoadQueue.push(...toLoad);
        drainThumbQueue();
    }
}

function createThumbElement(index) {
    const file = state.folderFiles[index];
    const el = document.createElement('div');
    el.className = 'thumbnail-item' + (file === state.currentFile ? ' selected' : '');
    el.style.position = 'absolute';
    el.style.left = `${index * THUMB_STRIDE}px`;
    el.style.width = `${THUMB_SIZE}px`;
    el.style.height = `${THUMB_SIZE}px`;

    const spinner = document.createElement('div');
    spinner.className = 'thumbnail-loading';
    el.appendChild(spinner);

    el.addEventListener('click', () => {
        if (file !== state.currentFile) loadImage(file);
    });

    // Insert before spacer
    elements.thumbnailList.insertBefore(el, elements.thumbnailList.lastElementChild);
    state.thumbnailItems[index] = { element: el, path: file, loaded: false };
}

function drainThumbQueue() {
    if (state._thumbLoading) return;
    state._thumbLoading = true;
    _processThumbQueue();
}

async function _processThumbQueue() {
    const CONCURRENCY = 3;
    while (state._thumbLoadQueue.length > 0) {
        const batch = state._thumbLoadQueue.splice(0, CONCURRENCY);
        await Promise.all(batch.map(async (idx) => {
            const item = state.thumbnailItems[idx];
            if (!item || item.loaded) return;
            try {
                // 检查缓存
                let b64 = state.thumbnailCache.get(item.path);
                if (!b64) {
                    b64 = await invoke('get_thumbnail', { path: item.path, size: THUMB_SIZE });
                    state.thumbnailCache.set(item.path, b64);
                }
                if (state.thumbnailItems[idx] && state.thumbnailItems[idx].element) {
                    const img = document.createElement('img');
                    img.src = b64;
                    img.draggable = false;
                    item.element.innerHTML = '';
                    item.element.appendChild(img);
                    item.loaded = true;
                }
            } catch (e) {
                if (state.thumbnailItems[idx]) {
                    item.element.innerHTML = '';
                    item.loaded = true;
                }
            }
        }));
    }
    state._thumbLoading = false;
}

function updateThumbnailSelection() {
    // Update selection for rendered items
    state.thumbnailItems.forEach(item => {
        if (item && item.element) {
            item.element.classList.toggle('selected', item.path === state.currentFile);
        }
    });

    // Scroll to selected
    const selected = elements.thumbnailList.querySelector('.thumbnail-item.selected');
    if (selected) {
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

// ===== Toolbar State =====
function updateToolbarState(loaded) {
    const buttons = [
        elements.btnSaveAs, elements.btnCopy, elements.btnRotate,
        elements.btnDelete, elements.btnMore, elements.btnFileInfo,
        elements.btnRotateBottom, elements.btnFitToWindow,
        elements.btnActualSize, elements.btnZoomDropdown,
        elements.btnZoomOut, elements.btnZoomIn,
    ];
    buttons.forEach(btn => btn.disabled = !loaded);
    elements.zoomSlider.disabled = !loaded;
}

// ===== Toggle Functions =====
function toggleMoreMenu() {
    elements.moreMenu.classList.toggle('hidden');
    if (!elements.moreMenu.classList.contains('hidden')) {
        const rect = elements.btnMore.getBoundingClientRect();
        elements.moreMenu.style.top = `${rect.bottom + 4}px`;
        elements.moreMenu.style.left = `${rect.left}px`;
    }
}

function toggleZoomMenu() {
    elements.zoomMenu.classList.toggle('hidden');
    if (!elements.zoomMenu.classList.contains('hidden')) {
        const rect = elements.btnZoomDropdown.getBoundingClientRect();
        elements.zoomMenu.style.top = `${rect.top - elements.zoomMenu.offsetHeight - 4}px`;
        elements.zoomMenu.style.left = `${rect.left}px`;
    }
}

function handleZoomMenuClick(e) {
    const action = e.target.dataset.action;
    if (!action) return;

    switch (action) {
        case 'fitToWindow': fitToWindow(); break;
        case 'actualSize': setZoom(1.0); break;
        case 'zoom25': setZoom(0.25); break;
        case 'zoom50': setZoom(0.5); break;
        case 'zoom100': setZoom(1.0); break;
        case 'zoom200': setZoom(2.0); break;
        case 'zoom400': setZoom(4.0); break;
    }
    elements.zoomMenu.classList.add('hidden');
}

function toggleThumbnailBar() {
    state.isThumbnailBarVisible = !state.isThumbnailBarVisible;
    elements.thumbnailBar.classList.toggle('hidden', !state.isThumbnailBarVisible);
    elements.iconThumbnailShow.classList.toggle('hidden', state.isThumbnailBarVisible);
    elements.iconThumbnailHide.classList.toggle('hidden', !state.isThumbnailBarVisible);
    elements.btnThumbnailToggle.title = state.isThumbnailBarVisible ? '隐藏缩略图' : '显示缩略图';

    // 调整内容区和导航按钮的底部位置
    const bottom = state.isThumbnailBarVisible ? '136px' : '48px';
    elements.contentArea.style.bottom = bottom;
    elements.btnPrevious.style.bottom = bottom;
    elements.btnNext.style.bottom = bottom;

    if (state.isThumbnailBarVisible) {
        updateThumbnailSelection();
    }

    // Re-fit image after layout change
    if (state.isImageLoaded && !state.isVideo) {
        requestAnimationFrame(() => fitToWindow());
    }
}

function toggleFileInfoPanel() {
    if (!state.isImageLoaded) return;
    state.isFileInfoPanelVisible = !state.isFileInfoPanelVisible;
    updateFileInfoPanelVisibility();
}

function toggleFullScreen() {
    state.isFullScreen = !state.isFullScreen;
    elements.topToolbar.classList.toggle('hidden', state.isFullScreen);
    elements.bottomStatusBar.classList.toggle('hidden', state.isFullScreen);
    elements.iconFullScreen.classList.toggle('hidden', state.isFullScreen);
    elements.iconExitFullScreen.classList.toggle('hidden', !state.isFullScreen);
    elements.btnFullScreen.title = state.isFullScreen ? '退出全屏' : '全屏';

    const top = state.isFullScreen ? '0' : '48px';
    const bottom = state.isFullScreen ? '0' : (state.isThumbnailBarVisible ? '136px' : '48px');
    elements.contentArea.style.top = top;
    elements.contentArea.style.bottom = bottom;
    elements.btnPrevious.style.top = top;
    elements.btnPrevious.style.bottom = bottom;
    elements.btnNext.style.top = top;
    elements.btnNext.style.bottom = bottom;

    if (state.isImageLoaded && !state.isVideo) {
        requestAnimationFrame(() => fitToWindow());
    }
}

// ===== Window Controls =====
async function handleMinimize() {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
}

async function handleToggleMaximize() {
    const appWindow = getCurrentWindow();
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
        await appWindow.unmaximize();
    } else {
        await appWindow.maximize();
    }
    updateMaximizeIcon();
}

async function handleClose() {
    const appWindow = getCurrentWindow();
    await appWindow.close();
}

async function updateMaximizeIcon() {
    const appWindow = getCurrentWindow();
    const isMaximized = await appWindow.isMaximized();
    elements.iconMaximize.classList.toggle('hidden', isMaximized);
    elements.iconRestore.classList.toggle('hidden', !isMaximized);
    elements.btnMaximize.title = isMaximized ? '还原' : '最大化';
}

// ===== File Operations =====
async function handleSaveAs() {
    if (!state.currentFile) return;
    try {
        const fileName = getFileName(state.currentFile);
        const result = await invoke('save_file_dialog', { defaultName: fileName });
        if (result) {
            await invoke('save_as', { source: state.currentFile, destination: result });
        }
    } catch (e) {
        showError('无法保存文件', String(e));
    }
}

async function handleCopy() {
    if (!state.currentFile || state.isVideo) return;
    try {
        const img = elements.mainImage;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
    } catch (e) {
        showError('无法复制', String(e));
    }
}

async function handleRotate() {
    if (!state.currentFile || state.isVideo) return;
    try {
        await invoke('rotate_image', { path: state.currentFile });
        await loadImage(state.currentFile);
    } catch (e) {
        showError('无法旋转图片', String(e));
    }
}

async function handleDelete() {
    if (!state.currentFile) return;

    if (state.settings.confirm_before_delete) {
        const confirmed = await showConfirm(
            '删除文件',
            `确定要将 "${getFileName(state.currentFile)}" 移至回收站吗？`
        );
        if (!confirmed) return;
    }

    try {
        // Find next file to show
        let targetFile = null;
        if (state.folderFiles.length > 1) {
            if (state.currentIndex < state.folderFiles.length - 1) {
                targetFile = state.folderFiles[state.currentIndex + 1];
            } else if (state.currentIndex > 0) {
                targetFile = state.folderFiles[state.currentIndex - 1];
            }
        }

        await invoke('delete_file', { path: state.currentFile });

        if (targetFile) {
            await loadImage(targetFile);
        } else {
            resetUI();
        }
    } catch (e) {
        showError('无法删除文件', String(e));
    }
}

async function handleOpenExplorer() {
    if (!state.currentFile) return;
    try {
        await invoke('open_in_explorer', { path: state.currentFile });
    } catch (e) {
        showError('无法打开资源管理器', String(e));
    }
    elements.moreMenu.classList.add('hidden');
}

async function handleOpenFile() {
    try {
        const filePath = await invoke('open_file_dialog');
        if (filePath) {
            await loadImage(filePath);
        }
    } catch (e) {
        showError('无法打开文件', String(e));
    }
    elements.moreMenu.classList.add('hidden');
}

function resetUI() {
    state.currentFile = null;
    state.imageMetadata = null;
    state.isImageLoaded = false;
    state.isVideo = false;
    state.folderFiles = [];
    state.currentIndex = -1;

    // Stop video playback
    elements.videoPlayer.pause();
    elements.videoPlayer.src = '';

    elements.mainImage.classList.add('hidden');
    elements.videoContainer.classList.add('hidden');
    elements.placeholderPanel.classList.remove('hidden');
    elements.mainImage.src = '';
    elements.fileNameText.textContent = '';
    document.title = 'Photo';
    elements.imageDimensions.textContent = '';
    elements.fileSize.textContent = '';
    elements.zoomPercentText.textContent = '100%';

    updateToolbarState(false);
    updateNavigationButtons();
    elements.thumbnailList.innerHTML = '';
    state.thumbnailItems = [];
    updateFileInfoPanelVisibility();
}

// ===== Dialogs =====
function openSettingsDialog() {
    elements.settingsDialog.classList.remove('hidden');
    elements.moreMenu.classList.add('hidden');
}

function closeSettingsDialog() {
    elements.settingsDialog.classList.add('hidden');
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        elements.confirmMessage.textContent = message;
        elements.confirmDialog.classList.remove('hidden');
        elements.confirmDialog._resolve = resolve;
        elements.btnConfirmCancel.onclick = () => {
            resolve(false);
            hideDialog('confirmDialog');
        };
    });
}

function showError(title, message) {
    elements.errorTitle.textContent = title;
    elements.errorMessage.textContent = message;
    elements.errorDialog.classList.remove('hidden');
}

function hideDialog(id) {
    $(`#${id}`).classList.add('hidden');
}

// ===== Window Events =====
window.addEventListener('resize', debounce(() => {
    if (state.isImageLoaded && !state.isVideo) {
        fitToWindow();
    }
}, 100));

// Initialize
document.addEventListener('DOMContentLoaded', init);
