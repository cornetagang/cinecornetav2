// ===========================================================
// CINE CORNETA - SCRIPT PRINCIPAL (MODULAR)
// Versión: 3.0.0 (Optimizada)
// ===========================================================

// ===========================================================
// 🆕 CARGADOR DE MÓDULOS (Code Splitting)
// ===========================================================
let playerModule = null;
let profileModule = null;
let rouletteModule = null;

async function getPlayerModule() {
    if (playerModule) return playerModule;
    const module = await import('./player.js');
    module.initPlayer({
        appState, DOM, ErrorHandler, auth, db,
        addToHistoryIfLoggedIn, closeAllModals, openDetailsModal
    });
    playerModule = module;
    return playerModule;
}

async function getProfileModule() {
    if (profileModule) return profileModule;
    const module = await import('./profile.js');
    module.initProfile({
        appState, DOM, auth, db, switchView
    });
    profileModule = module;
    // Llama a la configuración del menú desplegable tan pronto como se cargue el módulo
    module.setupUserDropdown();
    return module;
}

async function getRouletteModule() {
    if (rouletteModule) return rouletteModule;
    const module = await import('./roulette.js');
    module.initRoulette({
        appState, DOM, createMovieCardElement, openDetailsModal
    });
    rouletteModule = module;
    return module;
}

// ===========================================================
// 🆕 NUEVOS SISTEMAS - GESTIÓN DE ERRORES
// ===========================================================
const ErrorHandler = {
    types: {
        NETWORK: 'network',
        AUTH: 'auth',
        DATABASE: 'database',
        CONTENT: 'content',
        UNKNOWN: 'unknown'
    },

    messages: {
        network: 'No se pudo conectar al servidor. Verifica tu conexión.',
        auth: 'Error de autenticación. Intenta iniciar sesión nuevamente.',
        database: 'Error al guardar datos. Tus cambios podrían no haberse guardado.',
        content: 'No se pudo cargar el contenido. Intenta refrescar la página.',
        unknown: 'Ocurrió un error inesperado. Intenta nuevamente.'
    },

    show(type, customMessage = null, duration = 5000) {
        const message = customMessage || this.messages[type];
        
        let notification = document.getElementById('error-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'error-notification';
            notification.className = 'error-notification';
            document.body.appendChild(notification);
        }

        const icons = {
            network: 'fa-wifi',
            auth: 'fa-user-lock',
            database: 'fa-database',
            content: 'fa-film',
            unknown: 'fa-exclamation-triangle'
        };

        notification.innerHTML = `
            <i class="fas ${icons[type] || icons.unknown}"></i>
            <span>${message}</span>
            <button class="close-notification">&times;</button>
        `;

        notification.classList.add('show', `type-${type}`);

        const timeoutId = setTimeout(() => this.hide(), duration);

        notification.querySelector('.close-notification').onclick = () => {
            clearTimeout(timeoutId);
            this.hide();
        };

        console.error(`[${type.toUpperCase()}]`, message);
    },

    hide() {
        const notification = document.getElementById('error-notification');
        if (notification) notification.classList.remove('show');
    },

    async firebaseOperation(operation, type = this.types.DATABASE) {
        try {
            return await operation();
        } catch (error) {
            console.error('Firebase Error:', error);
            
            if (error.code === 'PERMISSION_DENIED') {
                this.show(this.types.AUTH, 'No tienes permiso para realizar esta acción.');
            } else if (error.code === 'NETWORK_ERROR') {
                this.show(this.types.NETWORK);
            } else {
                this.show(type);
            }
            
            throw error;
        }
    },

    async fetchOperation(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Fetch Error:', error);
            if (error.name === 'TypeError') {
                this.show(this.types.NETWORK);
            } else {
                this.show(this.types.CONTENT);
            }
            throw error;
        }
    }
};

// Inyectar estilos de notificaciones
if (!document.getElementById('error-notification-styles')) {
    const errorStyles = document.createElement('style');
    errorStyles.id = 'error-notification-styles';
    errorStyles.textContent = `
        .error-notification {
            position: fixed; top: 80px; right: 20px;
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            color: white; padding: 18px 24px; border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            display: flex; align-items: center; gap: 15px; z-index: 10000;
            min-width: 320px; max-width: 450px;
            transform: translateX(500px); opacity: 0;
            transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            border-left: 4px solid var(--primary-red);
        }
        .error-notification.show { transform: translateX(0); opacity: 1; }
        .error-notification i { font-size: 1.5rem; color: var(--primary-red); flex-shrink: 0; }
        .error-notification span { flex-grow: 1; font-size: 0.95rem; line-height: 1.4; }
        .error-notification .close-notification {
            background: transparent; border: none; color: #999;
            font-size: 1.3rem; cursor: pointer; padding: 0;
            width: 24px; height: 24px; display: flex;
            align-items: center; justify-content: center;
            transition: color 0.2s; flex-shrink: 0;
        }
        .error-notification .close-notification:hover { color: white; }
        @media (max-width: 768px) {
            .error-notification {
                top: auto; bottom: 20px; right: 10px; left: 10px;
                min-width: auto; max-width: none;
            }
        }
    `;
    document.head.appendChild(errorStyles);
}

// ===========================================================
// 🆕 SISTEMA DE CACHÉ AVANZADO
// ===========================================================
class CacheManager {
    constructor() {
        this.version = '1.2.0';
        this.defaultTTL = 24 * 60 * 60 * 1000;
        this.keys = {
            content: `cineCornetaData_v${this.version}`,
            metadata: `contentMetadata_v${this.version}`
        };
    }

    set(key, data, ttl = this.defaultTTL) {
        try {
            const cacheEntry = {
                data,
                timestamp: Date.now(),
                ttl,
                version: this.version
            };
            localStorage.setItem(key, JSON.stringify(cacheEntry));
            return true;
        } catch (error) {
            console.error('Error al guardar en caché:', error);
            if (error.name === 'QuotaExceededError') {
                this.cleanup(true);
            }
            return false;
        }
    }

    get(key, options = {}) {
        const { ignoreExpiration = false, defaultValue = null } = options;
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return defaultValue;

            const cacheEntry = JSON.parse(cached);

            if (cacheEntry.version !== this.version) {
                this.remove(key);
                return defaultValue;
            }

            if (!ignoreExpiration && cacheEntry.ttl) {
                const age = Date.now() - cacheEntry.timestamp;
                if (age > cacheEntry.ttl) {
                    this.remove(key);
                    return defaultValue;
                }
            }

            return cacheEntry.data;
        } catch (error) {
            console.error('Error al leer caché:', error);
            return defaultValue;
        }
    }

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    cleanup(aggressive = false) {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                try {
                    const item = localStorage.getItem(key);
                    const parsed = JSON.parse(item);
                    if (parsed.version && parsed.version !== this.version) {
                        keysToRemove.push(key);
                    }
                } catch (e) {
                    if (aggressive) keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            return keysToRemove.length;
        } catch (error) {
            return 0;
        }
    }

    clearAll() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            return false;
        }
    }
}

const cacheManager = new CacheManager();

// ===========================================================
// 🆕 SISTEMA DE LAZY LOADING
// ===========================================================
class LazyImageLoader {
    constructor() {
        this.observer = null;
        this.options = {
            root: null,
            rootMargin: '50px',
            threshold: 0.01
        };
        this.init();
    }

    init() {
        if (!('IntersectionObserver' in window)) {
            this.loadAllImages();
            return;
        }

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }, this.options);

        this.observeImages();
    }

    observeImages() {
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => this.observer.observe(img));
    }

    loadImage(img) {
        const src = img.dataset.src;
        if (!src) return;

        img.classList.add('lazy-loading');
        const tempImg = new Image();
        
        tempImg.onload = () => {
            img.src = src;
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-loaded');
            delete img.dataset.src;
        };

        tempImg.onerror = () => {
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-error');
            console.warn('Error al cargar:', src);
        };

        tempImg.src = src;
    }

    loadAllImages() {
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
                delete img.dataset.src;
            }
        });
    }

    observe(img) {
        if (this.observer) this.observer.observe(img);
    }
}

const lazyLoader = new LazyImageLoader();

// Inyectar estilos de lazy loading
if (!document.getElementById('lazy-loading-styles')) {
    const lazyStyles = document.createElement('style');
    lazyStyles.id = 'lazy-loading-styles';
    lazyStyles.textContent = `
        img[data-src] { filter: blur(5px); transition: filter 0.3s ease; }
        img.lazy-loading {
            background: linear-gradient(135deg, #333 0%, #222 100%);
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        img.lazy-loaded { filter: blur(0); animation: fadeIn 0.3s ease-in; }
        @keyframes fadeIn { from { opacity: 0.7; } to { opacity: 1; } }
        img.lazy-error { filter: grayscale(1); opacity: 0.5; }
    `;
    document.head.appendChild(lazyStyles);
}

// ===========================================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN
// ===========================================================
const appState = {
    content: {
        movies: {},
        series: {},
        seriesEpisodes: {},
        seasonPosters: {},
        metadata: {
            movies: {},
            series: {}
        }
    },
    ui: {
        heroMovieIds: [],
        contentToDisplay: [],
        currentIndex: 0,
        heroInterval: null
    },
    user: {
        watchlist: new Set(),
        historyListenerRef: null
    },
    player: {
        state: {},
        activeSeriesId: null,
        pendingHistorySave: null,
        episodeOpenTimer: null,
        historyUpdateDebounceTimer: null
    },
    flags: {
        isLoadingMore: false
    },
    hero: {
        preloadedImages: new Map(),
        currentIndex: 0,
        isTransitioning: false
    }
};

const DOM = {
    preloader: document.getElementById('preloader'),
    pageWrapper: document.querySelector('.page-wrapper'),
    header: document.querySelector('.main-header'),
    heroSection: document.getElementById('hero-section'),
    carouselContainer: document.getElementById('carousel-container'),
    gridContainer: document.getElementById('full-grid-container'),
    myListContainer: document.getElementById('my-list-container'),
    historyContainer: document.getElementById('history-container'),
    profileContainer: document.getElementById('profile-container'),
    settingsContainer: document.getElementById('settings-container'),
    detailsModal: document.getElementById('details-modal'),
    cinemaModal: document.getElementById('cinema'),
    rouletteModal: document.getElementById('roulette-modal'),
    seriesPlayerModal: document.getElementById('series-player-modal'),
    authModal: document.getElementById('auth-modal'),
    confirmationModal: document.getElementById('confirmation-modal'),
    searchInput: document.getElementById('search-input'),
    filterControls: document.getElementById('filter-controls'),
    genreFilter: document.getElementById('genre-filter'),
    sortBy: document.getElementById('sort-by'),
    authButtons: document.getElementById('auth-buttons'),
    loginBtnHeader: document.getElementById('login-btn-header'),
    registerBtnHeader: document.getElementById('register-btn-header'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    switchAuthModeLink: document.getElementById('switch-auth-mode'),
    loginError: document.getElementById('login-error'),
    registerError: document.getElementById('register-error'),
    registerUsernameInput: document.getElementById('register-username'),
    registerEmailInput: document.getElementById('register-email'),
    registerPasswordInput: document.getElementById('register-password'),
    loginEmailInput: document.getElementById('login-email'),
    loginPasswordInput: document.getElementById('login-password'),
    userProfileContainer: document.getElementById('user-profile-container'),
    userGreetingBtn: document.getElementById('user-greeting'),
    userMenuDropdown: document.getElementById('user-menu-dropdown'),
    myListNavLink: document.getElementById('my-list-nav-link'),
    historyNavLink: document.getElementById('history-nav-link'),
    myListNavLinkMobile: document.getElementById('my-list-nav-link-mobile'),
    historyNavLinkMobile: document.getElementById('history-nav-link-mobile'),
    profileUsername: document.getElementById('profile-username'),
    profileEmail: document.getElementById('profile-email'),
    settingsUsernameInput: document.getElementById('settings-username-input'),
    updateUsernameBtn: document.getElementById('update-username-btn'),
    settingsPasswordInput: document.getElementById('settings-password-input'),
    updatePasswordBtn: document.getElementById('update-password-btn'),
    settingsFeedback: document.getElementById('settings-feedback'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
    hamburgerBtn: document.getElementById('menu-toggle'),
    mobileNavPanel: document.getElementById('mobile-nav-panel'),
    closeNavBtn: document.querySelector('.close-nav-btn'),
    menuOverlay: document.getElementById('menu-overlay')
};

const API_URL = 'https://script.google.com/macros/s/AKfycby2Jr0KETsnw97TQLRygS9AHjpsPcjbmJXfXkJ-4WjCfOmbtsk9a7hOR0IC80vm0DMz/exec';
const ITEMS_PER_LOAD = 18;

const firebaseConfig = {
    apiKey: "AIzaSyBgfvfYs-A_-IgAbYoT8GAmoOrSi--cLkw",
    authDomain: "cine-corneta.firebaseapp.com",
    projectId: "cine-corneta",
    storageBucket: "cine-corneta.appspot.com",
    messagingSenderId: "404306744690",
    appId: "1:404306744690:web:28f77ec91347e1f5f6b9eb",
    databaseURL: "https://cine-corneta-default-rtdb.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ===========================================================
// 2. INICIO Y CARGA DE DATOS (🆕 MEJORADO CON CACHÉ)
// ===========================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialDataWithCache();
});

async function fetchInitialDataWithCache() {
    const processData = (data) => {
        appState.content.movies = data.allMovies || {};
        appState.content.series = data.series || {};
        appState.content.seriesEpisodes = data.episodes || {};
        appState.content.seasonPosters = data.posters || {};
    };

    const setupAndShow = (movieMeta, seriesMeta) => {
        appState.content.metadata.movies = movieMeta || {};
        appState.content.metadata.series = seriesMeta || {};
        
        if (DOM.pageWrapper.style.display !== 'block') {
            setupApp();
            DOM.preloader.classList.add('fade-out');
            DOM.preloader.addEventListener('transitionend', () => DOM.preloader.remove());
            DOM.pageWrapper.style.display = 'block';
        } else {
            setupHero();
            generateCarousels();
            const activeFilter = document.querySelector('.main-nav a.active, .mobile-nav a.active')?.dataset.filter;
            if (activeFilter === 'movie' || activeFilter === 'series') {
                applyAndDisplayFilters(activeFilter);
            }
        }
    };

    // Intentar cargar desde caché
    const cachedContent = cacheManager.get(cacheManager.keys.content);
    const cachedMetadata = cacheManager.get(cacheManager.keys.metadata);

    if (cachedContent) {
        console.log('✓ Cargando UI desde caché...');
        processData(cachedContent);
        
        if (cachedMetadata) {
            appState.content.metadata.movies = cachedMetadata.movies || {};
            appState.content.metadata.series = cachedMetadata.series || {};
        }

        setupAndShow(cachedMetadata?.movies, cachedMetadata?.series);
    }

    // Cargar datos frescos en background
    try {
        console.log('⟳ Cargando datos frescos...');
        
        const [series, episodes, allMovies, posters, movieMeta, seriesMeta] = await Promise.all([
            ErrorHandler.fetchOperation(`${API_URL}?data=series`),
            ErrorHandler.fetchOperation(`${API_URL}?data=episodes`),
            ErrorHandler.fetchOperation(`${API_URL}?data=allMovies&order=desc`),
            ErrorHandler.fetchOperation(`${API_URL}?data=PostersTemporadas`),
            db.ref('movie_metadata').once('value').then(s => s.val() || {}),
            db.ref('series_metadata').once('value').then(s => s.val() || {})
        ]);

        const freshContent = { allMovies, series, episodes, posters };
        const freshMetadata = { movies: movieMeta, series: seriesMeta };

        processData(freshContent);
        appState.content.metadata.movies = freshMetadata.movies;
        appState.content.metadata.series = freshMetadata.series;

        cacheManager.set(cacheManager.keys.content, freshContent);
        cacheManager.set(cacheManager.keys.metadata, freshMetadata);

        console.log('✓ Datos frescos guardados');

        if (cachedContent) {
            setupHero();
            generateCarousels();
            const activeFilter = document.querySelector('.main-nav a.active, .mobile-nav a.active')?.dataset.filter;
            if (activeFilter === 'movie' || activeFilter === 'series') {
                applyAndDisplayFilters(activeFilter);
            }
        } else {
            setupApp();
            DOM.preloader.classList.add('fade-out');
            setTimeout(() => DOM.preloader.remove(), 500);
            DOM.pageWrapper.style.display = 'block';
        }

        const user = auth.currentUser;
        if (user) {
            db.ref(`users/${user.uid}/history`).orderByChild('viewedAt').once('value', snapshot => {
                if (snapshot.exists()) generateContinueWatchingCarousel(snapshot);
            });
        }

    } catch (error) {
        console.error('✗ Error al cargar datos:', error);
        if (!cachedContent) {
            DOM.preloader.innerHTML = `
                <div style="text-align: center;">
                    <p style="color: white; margin-bottom: 20px;">Error al cargar el contenido</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; background: var(--primary-red); color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Reintentar
                    </button>
                </div>
            `;
        }
    }
}

function setupApp() {
    setupHero();
    generateCarousels();
    // ⛔️ setupRouletteLogic(); // ELIMINADO: Se cargará bajo demanda
    setupEventListeners();
    setupAuthListeners();
    setupNavigation();
    setupSearch();
    // ⛔️ setupUserDropdown(); // ELIMINADO: Se cargará bajo demanda
    switchView('all');
}

// ===========================================================
// 3. NAVEGACIÓN Y MANEJO DE VISTAS
// ===========================================================
function setupNavigation() {
    const navContainers = document.querySelectorAll('.main-nav ul, .mobile-nav ul, .bottom-nav, #profile-hub-container');
    navContainers.forEach(container => container.addEventListener('click', handleFilterClick));
    
    const openMenu = () => { 
        DOM.mobileNavPanel.classList.add('is-open'); 
        DOM.menuOverlay.classList.add('active'); 
    };
    const closeMenu = () => { 
        DOM.mobileNavPanel.classList.remove('is-open'); 
        DOM.menuOverlay.classList.remove('active'); 
    };

    if (DOM.hamburgerBtn) DOM.hamburgerBtn.addEventListener('click', openMenu);
    if (DOM.closeNavBtn) DOM.closeNavBtn.addEventListener('click', closeMenu);
    if (DOM.menuOverlay) DOM.menuOverlay.addEventListener('click', closeMenu);
}

async function handleFilterClick(event) { // 🆕 Convertida en 'async'
    const link = event.target.closest('a');
    if (!link) return;
    event.preventDefault();

    DOM.mobileNavPanel?.classList.remove('is-open');
    DOM.menuOverlay?.classList.remove('active');
    
    const filter = link.dataset.filter;
    
    // 🆕 CARGA BAJO DEMANDA DE RULETA
    if (filter === 'roulette') {
        const roulette = await getRouletteModule();
        roulette.openRouletteModal();
        return;
    }

    if (link.classList.contains('active') && !['history', 'my-list'].includes(filter)) return;

    document.querySelectorAll('.main-nav a, .mobile-nav a, .bottom-nav a').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`a[data-filter="${filter}"]`).forEach(l => l.classList.add('active'));
    
    DOM.searchInput.value = '';
    switchView(filter);
}

async function switchView(filter) { // 🆕 Convertida en 'async'
    [
        DOM.heroSection, DOM.carouselContainer, DOM.gridContainer,
        DOM.myListContainer, DOM.historyContainer, DOM.profileContainer,
        DOM.settingsContainer, document.getElementById('profile-hub-container')
    ].forEach(container => {
        if (container) container.style.display = 'none';
    });

    if (DOM.filterControls) DOM.filterControls.style.display = 'none';

    if (filter === 'all') {
        if(DOM.heroSection) DOM.heroSection.style.display = 'flex';
        if(DOM.carouselContainer) DOM.carouselContainer.style.display = 'block';
    } else if (filter === 'movie' || filter === 'series') {
        if (DOM.gridContainer) DOM.gridContainer.style.display = 'block';
        if (DOM.filterControls) DOM.filterControls.style.display = 'flex';
        populateFilters(filter);
        applyAndDisplayFilters(filter);
        setupInfiniteScroll(filter);
    } else if (filter === 'my-list') {
        if (DOM.myListContainer) { DOM.myListContainer.style.display = 'block'; displayMyListView(); }
    } else if (filter === 'history') {
        if (DOM.historyContainer) { DOM.historyContainer.style.display = 'block'; renderHistory(); }
    } else if (filter === 'profile-hub') {
        const hubContainer = document.getElementById('profile-hub-container');
        if (hubContainer) {
            hubContainer.style.display = 'block';
            const user = auth.currentUser;
            if (user) {
                const emailEl = document.getElementById('profile-hub-email');
                if(emailEl) emailEl.textContent = user.email;
            }
        }
    } else if (filter === 'profile') {
        // 🆕 CARGA BAJO DEMANDA DE PERFIL
        const profile = await getProfileModule();
        if (DOM.profileContainer) { DOM.profileContainer.style.display = 'block'; profile.renderProfile(); }
    } else if (filter === 'settings') {
        // 🆕 CARGA BAJO DEMANDA DE AJUSTES
        const profile = await getProfileModule();
        if (DOM.settingsContainer) { DOM.settingsContainer.style.display = 'block'; profile.renderSettings(); }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function populateFilters(type) {
    const sourceData = (type === 'movie') ? appState.content.movies : appState.content.series;
    
    if (!DOM.genreFilter || !DOM.sortBy) return;

    const handleFilterChange = () => applyAndDisplayFilters(type);
    DOM.genreFilter.onchange = handleFilterChange;
    DOM.sortBy.onchange = handleFilterChange;

    const genres = new Set(Object.values(sourceData).flatMap(item => item.genres?.split(';').map(g => g.trim()).filter(Boolean) || []));
    
    DOM.genreFilter.innerHTML = `<option value="all">Todos los géneros</option>`;
    Array.from(genres).sort().forEach(genre => {
        DOM.genreFilter.innerHTML += `<option value="${genre}">${genre}</option>`;
    });

    DOM.sortBy.innerHTML = `
        <option value="recent">Recientes</option>
        <option value="title-asc">Título (A - Z)</option>
        <option value="title-desc">Título (Z - A)</option>
        <option value="year-desc">Año (Descendente)</option>
        <option value="year-asc">Año (Ascendente)</option>
    `;
}

function applyAndDisplayFilters(type) {
    const sourceData = (type === 'movie') ? appState.content.movies : appState.content.series;
    const gridEl = DOM.gridContainer.querySelector('.grid');
    if (!gridEl) return;
    const selectedGenre = DOM.genreFilter.value;
    const sortByValue = DOM.sortBy.value;

    let content = Object.entries(sourceData);
    if (selectedGenre !== 'all') {
        content = content.filter(([id, item]) => item.genres?.toLowerCase().includes(selectedGenre.toLowerCase()));
    }

    content.sort((a, b) => {
        const aData = a[1], bData = b[1];
        switch (sortByValue) {
            case 'recent':
                return bData.tr - aData.tr;
            case 'title-asc':
                return aData.title.localeCompare(bData.title);
            case 'title-desc':
                return bData.title.localeCompare(aData.title);
            case 'year-desc':
                return (bData.year || 0) - (aData.year || 0);
            case 'year-asc':
                return (aData.year || 0) - (bData.year || 0);
            default:
                return bData.tr - aData.tr;
        }
    });
    
    appState.ui.contentToDisplay = content;
    appState.ui.currentIndex = 0;
    gridEl.innerHTML = '';
    loadMoreContent(type);
}

// ===========================================================
// 4. MÓDULOS DE FUNCIONALIDADES (HERO, BÚSQUEDA, ETC.)
// ===========================================================
function setupEventListeners() {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAllModals();
    });

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('click', handleGlobalClick);
}

function handleFullscreenChange() {
    const lockOrientation = async () => {
        try {
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                await screen.orientation.lock('landscape');
            }
        } catch (err) { 
            console.error('No se pudo bloquear la orientación:', err); 
        }
    };
    const unlockOrientation = () => {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
        }
    };
    if (document.fullscreenElement) {
        lockOrientation();
    } else {
        unlockOrientation();
    }
}

function setupInfiniteScroll(type) {
    const sentinelId = "infinite-scroll-sentinel";
    let sentinel = document.getElementById(sentinelId);
    if (!sentinel) {
        sentinel = document.createElement("div");
        sentinel.id = sentinelId;
        sentinel.style.height = "1px";
        DOM.gridContainer.appendChild(sentinel);
    }

    if (sentinel._observer) sentinel._observer.disconnect();

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !appState.flags.isLoadingMore) {
                loadMoreContent(type);
            }
        });
    }, { rootMargin: "200px" });

    observer.observe(sentinel);
    sentinel._observer = observer;
}

function handleGlobalClick(event) {
    if (event.target.closest('.close-btn')) {
        closeAllModals();
        return;
    }
    const watchlistButton = event.target.closest('.btn-watchlist');
    if (watchlistButton) {
        handleWatchlistClick(watchlistButton);
    }
}

function preloadHeroImages(movieIds) {
    movieIds.forEach((movieId) => {
        const movieData = appState.content.movies[movieId];
        if (!movieData) return;
        const imagesToPreload = [
            { type: 'banner', url: movieData.banner },
            { type: 'poster', url: movieData.poster }
        ];
        imagesToPreload.forEach(({ type, url }) => {
            if (!url) return;
            const img = new Image();
            img.onload = () => {
                const key = `${movieId}_${type}`;
                appState.hero.preloadedImages.set(key, url);
            };
            img.src = url;
        });
    });
}

function setupHero() {
    clearInterval(appState.ui.heroInterval);
    if (!DOM.heroSection) return;
    DOM.heroSection.innerHTML = `<div class="hero-content"><h1 id="hero-title"></h1><p id="hero-synopsis"></p><div class="hero-buttons"></div></div><div class="guirnalda-container"></div>`;
    
    const allMoviesArray = Object.entries(appState.content.movies);
    allMoviesArray.sort((a, b) => b[1].tr - a[1].tr);
    const topHeroMovies = allMoviesArray.slice(0, 7);
    appState.ui.heroMovieIds = topHeroMovies.map(entry => entry[0]);

    if (appState.ui.heroMovieIds.length > 0) {
        shuffleArray(appState.ui.heroMovieIds);
        preloadHeroImages(appState.ui.heroMovieIds);
        changeHeroMovie(appState.ui.heroMovieIds[0]);
        startHeroInterval(); 
    } else {
       DOM.heroSection.style.display = 'none'; 
    }
}

function startHeroInterval() {
    clearInterval(appState.ui.heroInterval);
    let currentHeroIndex = 0;
    if (appState.ui.heroMovieIds.length === 0) return;
    appState.ui.heroInterval = setInterval(() => {
        currentHeroIndex = (currentHeroIndex + 1) % appState.ui.heroMovieIds.length;
        changeHeroMovie(appState.ui.heroMovieIds[currentHeroIndex]);
    }, 8000);
}

function changeHeroMovie(movieId) {
    if (appState.hero.isTransitioning) return;
    
    const heroContent = DOM.heroSection.querySelector('.hero-content');
    const movieData = appState.content.movies[movieId];
    if (!heroContent || !movieData) return;

    appState.hero.isTransitioning = true;
    heroContent.classList.add('hero-fading');

    setTimeout(() => {
        const isMobile = window.innerWidth < 992;
        const imageType = isMobile ? 'poster' : 'banner';
        const cacheKey = `${movieId}_${imageType}`;
        
        const imageUrl = appState.hero.preloadedImages.get(cacheKey) || 
                        (isMobile ? movieData.poster : movieData.banner);
        
        DOM.heroSection.style.backgroundImage = `url(${imageUrl})`;
        
        heroContent.querySelector('#hero-title').textContent = movieData.title;
        heroContent.querySelector('#hero-synopsis').textContent = movieData.synopsis;

        const user = auth.currentUser;
        let watchlistButtonHTML = '';

        if (user) { 
            const isInList = appState.user.watchlist.has(movieId);
            const iconClass = isInList ? 'fa-check' : 'fa-plus';
            const buttonClass = isInList ? 'btn-watchlist in-list' : 'btn-watchlist';
            watchlistButtonHTML = `<button class="${buttonClass}" data-content-id="${movieId}" title="Añadir a Mi Lista"><i class="fas ${iconClass}"></i></button>`;
        }

        const playButton = document.createElement('button');
        playButton.className = 'btn btn-play';
        playButton.innerHTML = '<i class="fas fa-play"></i> Ver Ahora';
        playButton.onclick = async () => { // 🆕 Carga bajo demanda
            const player = await getPlayerModule();
            player.openPlayerModal(movieId, movieData.title.replace(/'/g, "\\'"));
        };

        const infoButton = document.createElement('button');
        infoButton.className = 'btn btn-info';
        infoButton.textContent = 'Más Información';
        infoButton.onclick = () => openDetailsModal(movieId, 'movie');

        const heroButtons = heroContent.querySelector('.hero-buttons');
        heroButtons.innerHTML = watchlistButtonHTML; // Limpia y añade watchlist
        heroButtons.prepend(infoButton); // Añade info
        heroButtons.prepend(playButton); // Añade play al principio

        heroContent.classList.remove('hero-fading');
        appState.hero.isTransitioning = false;
    }, 300);
}

function generateCarousels() {
    const container = DOM.carouselContainer;
    container.innerHTML = '';

    createCarouselSection('Películas Nuevas', appState.content.movies);
    createCarouselSection('Series Nuevas', appState.content.series);
}

function createCarouselSection(title, dataSource) {
    if (!dataSource || Object.keys(dataSource).length === 0) return;

    const section = document.createElement('section');
    section.classList.add('carousel');

    const titleEl = document.createElement('h2');
    titleEl.classList.add('carousel-title');
    titleEl.textContent = title;
    section.appendChild(titleEl);

    const track = document.createElement('div');
    track.classList.add('carousel-track');

    Object.entries(dataSource)
        .sort((a, b) => b[1].tr - a[1].tr)
        .slice(0, 8)
        .forEach(([id, item]) => {
            const type = title.includes('Serie') ? 'series' : 'movie';
            const card = createMovieCardElement(id, item, type, 'carousel', true);
            track.appendChild(card);
            const img = card.querySelector('img[data-src]');
            if (img) {
                lazyLoader.observe(img);
            }
        });

    section.appendChild(track);
    DOM.carouselContainer.appendChild(section);
}

function setupSearch() {
    if (!DOM.searchInput) return;
    let isSearchActive = false;
    DOM.searchInput.addEventListener('input', () => {
        const searchTerm = DOM.searchInput.value.toLowerCase().trim();
        if (searchTerm === '') {
            const gridEl = DOM.gridContainer.querySelector('.grid');
            if (gridEl) {
                gridEl.style.display = '';
                gridEl.style.justifyContent = '';
                gridEl.style.alignItems = '';
            }

            if (isSearchActive) {
                const activeNav = document.querySelector('.main-nav a.active, .mobile-nav a.active');
                switchView(activeNav ? activeNav.dataset.filter : 'all');
                isSearchActive = false;
            }
            return;
        }
        isSearchActive = true;
        const allContent = { ...appState.content.movies, ...appState.content.series };
        const results = Object.entries(allContent).filter(([id, item]) => item.title.toLowerCase().includes(searchTerm));
        displaySearchResults(results);
    });
}

function displaySearchResults(results) {
    switchView('search');
    const gridEl = DOM.gridContainer.querySelector('.grid');
    
    if (DOM.gridContainer) DOM.gridContainer.style.display = 'block';
    
    if (!gridEl) return;
    gridEl.innerHTML = '';
    
    if (results.length > 0) {
        gridEl.style.display = 'grid';
        results.forEach(([id, item]) => {
            const type = appState.content.series[id] ? 'series' : 'movie';
            gridEl.appendChild(createMovieCardElement(id, item, type, 'grid', false));
        });
    } else {
        gridEl.style.display = 'flex';
        gridEl.style.justifyContent = 'center';
        gridEl.style.alignItems = 'center';
        gridEl.innerHTML = `<p style="color: var(--text-muted); text-align: center;">No se encontraron resultados.</p>`;
    }
}

function generateContinueWatchingCarousel(snapshot) {
    const user = auth.currentUser;
    const existingCarousel = document.getElementById('continue-watching-carousel');
    if (existingCarousel) existingCarousel.remove();

    if (!user || !DOM.carouselContainer || !snapshot.exists()) {
        return;
    }

    let historyItems = [];
    snapshot.forEach(child => {
        historyItems.push(child.val());
    });
    historyItems.reverse();

    const itemsToDisplay = [];
    const displayedSeries = new Set();

    for (const item of historyItems) {
        if (item.type === 'series' && !displayedSeries.has(item.contentId)) {
            const seasonEpisodes = appState.content.seriesEpisodes[item.contentId]?.[item.season];
            if (!seasonEpisodes) continue;

            const lastWatchedIndex = item.lastEpisode;

            if (lastWatchedIndex !== null && seasonEpisodes[lastWatchedIndex]) {
                const lastEpisode = seasonEpisodes[lastWatchedIndex];
                const seriesData = appState.content.series[item.contentId];

                itemsToDisplay.push({
                    cardType: 'series',
                    contentId: item.contentId,
                    season: item.season,
                    episodeIndexToOpen: lastWatchedIndex,
                    thumbnail: lastEpisode.thumbnail || seriesData.poster,
                    title: seriesData.title,
                    subtitle: `Visto: T${String(item.season).replace('T', '')} E${lastEpisode.episodeNumber || lastWatchedIndex + 1}`
                });

                displayedSeries.add(item.contentId);
            }
        }
    }

    if (itemsToDisplay.length > 0) {
        const carouselEl = document.createElement('div');
        carouselEl.id = 'continue-watching-carousel';
        carouselEl.className = 'carousel';
        carouselEl.innerHTML = `<h3 class="carousel-title">Continuar Viendo</h3><div class="carousel-track"></div>`;
        const track = carouselEl.querySelector('.carousel-track');
        itemsToDisplay.forEach(itemData => {
            track.appendChild(createContinueWatchingCard(itemData));
        });
        DOM.carouselContainer.prepend(carouselEl);
    }
}

function createContinueWatchingCard(itemData) {
    const card = document.createElement('div');
    card.className = 'continue-watching-card';
    card.onclick = async () => { // 🆕 Carga bajo demanda
        const player = await getPlayerModule();
        player.openPlayerToEpisode(itemData.contentId, itemData.season, itemData.episodeIndexToOpen);
    };
    card.innerHTML = `
        <img src="${itemData.thumbnail}" class="cw-card-thumbnail" alt="">
        <div class="cw-card-overlay"></div>
        <div class="cw-card-info">
            <h4 class="cw-card-title">${itemData.title}</h4>
            <p class="cw-card-subtitle">${itemData.subtitle}</p>
        </div>
        <div class="cw-card-play-icon"><i class="fas fa-play"></i></div>
    `;
    return card;
}

// ===========================================================
// 5. MODALES (GENERAL, DETALLES)
// ===========================================================
function closeAllModals() {
    document.querySelectorAll('.modal.show').forEach(modal => {
        modal.classList.remove('show');
        const iframe = modal.querySelector('iframe');
        if (iframe) iframe.src = '';
    });
    document.body.classList.remove('modal-open');
}

async function openDetailsModal(id, type, triggerElement = null) {
    try {
        const modal = DOM.detailsModal;
        const panel = modal.querySelector('.details-panel'); 
        
        const detailsPoster = document.getElementById('details-poster-img');
        const detailsTitle = document.getElementById('details-title');
        const detailsYear = document.getElementById('details-year');
        const detailsGenres = document.getElementById('details-genres');
        const detailsSynopsis = document.getElementById('details-synopsis');
        const detailsButtons = document.getElementById('details-buttons');

        const data = type === 'movie'
            ? appState.content.movies[id]
            : appState.content.series[id];

        if (!data) {
            ErrorHandler.show('content', 'No se pudo cargar la información del título.');
            return;
        }

        detailsButtons.innerHTML = '';
        detailsPoster.src = data.poster || '';
        
        if (data.banner && data.banner.trim() !== '') {
            panel.style.backgroundImage = `url(${data.banner})`;
        } else {
            panel.style.backgroundImage = 'none';
            panel.style.backgroundColor = '#181818';
        }
        
        detailsTitle.textContent = data.title || 'Sin título';
        detailsYear.textContent = data.year ? `(${data.year})` : '';
        detailsGenres.textContent = data.genres || '';
        detailsSynopsis.textContent = data.synopsis || 'Sin descripción disponible.';

        let listBtn = null; 
        const user = auth.currentUser;
        if (user) {
            const isInList = appState.user.watchlist.has(id);
            listBtn = document.createElement('button');
            listBtn.className = `btn btn-watchlist ${isInList ? 'in-list' : ''}`;
            listBtn.dataset.contentId = id;
            listBtn.innerHTML = `<i class="fas ${isInList ? 'fa-check' : 'fa-plus'}"></i>`; 
            listBtn.addEventListener('click', () => handleWatchlistClick(listBtn));
        }

        const playBtn = document.createElement('button');
        playBtn.className = 'btn btn-play';
        playBtn.innerHTML = `<i class="fas fa-play"></i> Ver ahora`;
        playBtn.addEventListener('click', async () => { // 🆕 Carga bajo demanda
            closeAllModals();
            const player = await getPlayerModule();
            if (type === 'movie') {
                player.openPlayerModal(id, data.title); 
            } else {
                player.openSeriesPlayer(id, false);
            }
        });
        detailsButtons.appendChild(playBtn);

        if (type === 'series') {
            const seriesEpisodes = appState.content.seriesEpisodes[id] || {};
            const seasonCount = Object.keys(seriesEpisodes).length;
            if (seasonCount > 1) { 
                const infoBtn = document.createElement('button');
                infoBtn.className = 'btn btn-info';
                infoBtn.innerHTML = `<i class="fas fa-tv"></i> Temporadas`;
                infoBtn.addEventListener('click', async () => { // 🆕 Carga bajo demanda
                    closeAllModals();
                    const player = await getPlayerModule();
                    player.openSeriesPlayer(id, true);
                });
                detailsButtons.appendChild(infoBtn);
            }
        }

        if (
            type === 'series' &&
            appState.content.seriesEpisodes[id] &&
            data.random?.toLowerCase() === 'sí'
            ) {
            const randomBtn = document.createElement('button');
            randomBtn.className = 'btn btn-random'; 
            randomBtn.innerHTML = `🎲 Aleatorio`;
            randomBtn.addEventListener('click', async () => { // 🆕 Carga bajo demanda
                const player = await getPlayerModule();
                player.playRandomEpisode(id)
            });
            detailsButtons.appendChild(randomBtn);
        }

        if (listBtn) {
            detailsButtons.appendChild(listBtn);
        }

        modal.classList.add('show');
        document.body.classList.add('modal-open');

        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('show');
                document.body.classList.remove('modal-open');
            };
        }
    } catch (error) {
        console.error('Error en openDetailsModal:', error);
        ErrorHandler.show('content', 'Ocurrió un error al abrir los detalles.');
    }
}

// ===========================================================
// 6. AUTENTICACIÓN Y DATOS DE USUARIO
// ===========================================================
function setupAuthListeners() {
    if (DOM.loginBtnHeader) DOM.loginBtnHeader.addEventListener('click', () => openAuthModal(true));
    if (DOM.registerBtnHeader) DOM.registerBtnHeader.addEventListener('click', () => openAuthModal(false));

    if (DOM.switchAuthModeLink) {
        DOM.switchAuthModeLink.addEventListener('click', (e) => {
            e.preventDefault();
            const isLoginVisible = DOM.loginForm.style.display === 'flex' || DOM.loginForm.style.display === '';
            openAuthModal(!isLoginVisible);
        });
    }

    if (DOM.registerForm) {
        DOM.registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = DOM.registerUsernameInput.value;
            const email = DOM.registerEmailInput.value;
            const password = DOM.registerPasswordInput.value;
            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => userCredential.user.updateProfile({ displayName: username }))
                .then(() => { closeAllModals(); DOM.registerForm.reset(); })
                .catch(error => { DOM.registerError.textContent = error.message; });
        });
    }

    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = DOM.loginEmailInput.value;
            const password = DOM.loginPasswordInput.value;
            auth.signInWithEmailAndPassword(email, password)
                .then(() => { closeAllModals(); DOM.loginForm.reset(); })
                .catch(error => { DOM.loginError.textContent = error.message; });
        });
    }

    auth.onAuthStateChanged(updateUIAfterAuthStateChange);

    if (DOM.historyContainer) {
        DOM.historyContainer.addEventListener('click', (event) => {
            const removeButton = event.target.closest('.btn-remove-history');
            if (removeButton) {
                event.stopPropagation();
                const entryKey = removeButton.dataset.key;
                openConfirmationModal(
                    'Eliminar del Historial',
                    '¿Estás seguro de que quieres eliminar este item de tu historial? Esta acción no se puede deshacer.',
                    () => removeFromHistory(entryKey)
                );
            }
        });
    }

    const logoutBtnHub = document.getElementById('logout-btn-hub');
    if (logoutBtnHub) {
        logoutBtnHub.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut();
        });
    }
}

function openAuthModal(isLogin) {
    DOM.loginForm.style.display = isLogin ? 'flex' : 'none';
    DOM.registerForm.style.display = isLogin ? 'none' : 'flex';
    DOM.switchAuthModeLink.textContent = isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión';
    DOM.loginError.textContent = '';
    DOM.registerError.textContent = '';
    DOM.authModal.classList.add('show');
    document.body.classList.add('modal-open');
}

function updateUIAfterAuthStateChange(user) {
    const loggedInElements = [DOM.userProfileContainer, DOM.myListNavLink, DOM.historyNavLink, DOM.myListNavLinkMobile, DOM.historyNavLinkMobile];
    const loggedOutElements = [DOM.authButtons];

    if (user) {
        loggedInElements.forEach(el => el && (el.style.display = 'flex'));
        loggedOutElements.forEach(el => el && (el.style.display = 'none'));
        const userName = user.displayName || user.email.split('@')[0];
        if (DOM.userGreetingBtn) DOM.userGreetingBtn.textContent = `Hola, ${userName}`;
        
        db.ref(`users/${user.uid}/watchlist`).once('value', snapshot => {
            appState.user.watchlist = snapshot.exists() ? new Set(Object.keys(snapshot.val())) : new Set();
        });

        setupRealtimeHistoryListener(user);
        
        // 🆕 Carga el módulo de perfil/menú en background si el usuario inicia sesión
        getProfileModule();

    } else {
        loggedInElements.forEach(el => el && (el.style.display = 'none'));
        loggedOutElements.forEach(el => el && (el.style.display = 'flex'));
        appState.user.watchlist.clear();
        
        if (appState.user.historyListenerRef) {
            appState.user.historyListenerRef.off('value');
            appState.user.historyListenerRef = null;
        }
        
        const continueWatchingCarousel = document.getElementById('continue-watching-carousel');
        if (continueWatchingCarousel) continueWatchingCarousel.remove();
    }
    
    const activeFilter = document.querySelector('.main-nav a.active, .mobile-nav a.active')?.dataset.filter;
    if (!user && (activeFilter === 'my-list' || activeFilter === 'history')) {
        document.querySelectorAll('.main-nav a, .mobile-nav a').forEach(l => l.classList.remove('active'));
        document.querySelectorAll(`a[data-filter="all"]`).forEach(l => l.classList.add('active'));
        switchView('all');
    }
}

function addToHistoryIfLoggedIn(contentId, type, episodeInfo = {}) {
    const user = auth.currentUser;
    if (!user) return;

    const isSeries = type.includes('series');
    const itemData = isSeries ? appState.content.series[contentId] : appState.content.movies[contentId];
    if (!itemData) return;

    let posterUrl = itemData.poster;
    if (isSeries && episodeInfo.season) {
        const seasonPosterUrl = appState.content.seasonPosters[contentId]?.[episodeInfo.season];
        if (seasonPosterUrl) {
            posterUrl = seasonPosterUrl;
        }
    }
    
    const historyKey = isSeries ? `${contentId}_${episodeInfo.season}` : contentId;
    const historyTitle = isSeries ? `${itemData.title}: T${String(episodeInfo.season).replace('T', '')}` : itemData.title;
    
    const historyEntry = {
        type,
        contentId,
        title: historyTitle,
        poster: posterUrl,
        viewedAt: firebase.database.ServerValue.TIMESTAMP,
        season: isSeries ? episodeInfo.season : null,
        lastEpisode: isSeries ? episodeInfo.index : null
    };

    const userHistoryRef = db.ref(`users/${user.uid}/history/${historyKey}`);
    userHistoryRef.set(historyEntry);
}

function removeFromHistory(entryKey) {
    const user = auth.currentUser;
    if (!user) return;
    db.ref(`users/${user.uid}/history/${entryKey}`).remove().then(() => renderHistory());
}

function handleWatchlistClick(button) {
    const user = auth.currentUser;
    if (!user) {
        openConfirmationModal(
            "Acción Requerida",
            "Debes iniciar sesión para usar esta función.",
            () => openAuthModal(true)
        );
        return;
    }
    
    const contentId = button.dataset.contentId;
    const isInList = appState.user.watchlist.has(contentId);

    if (isInList) {
        openConfirmationModal(
            'Eliminar de Mi Lista',
            '¿Estás seguro de que quieres eliminar este item de tu lista?',
            () => removeFromWatchlist(contentId)
        );
    } else {
        addToWatchlist(contentId);
    }
}

async function addToWatchlist(contentId) {
    const user = auth.currentUser;
    if (!user) return;

    await ErrorHandler.firebaseOperation(async () => {
        await db.ref(`users/${user.uid}/watchlist/${contentId}`).set(true);
        appState.user.watchlist.add(contentId);
        
        document.querySelectorAll(`.btn-watchlist[data-content-id="${contentId}"]`).forEach(button => {
            button.classList.add('in-list');
            button.innerHTML = '<i class="fas fa-check"></i>';
        });
    });
}

async function removeFromWatchlist(contentId) {
    const user = auth.currentUser;
    if (!user) return;
    
    await ErrorHandler.firebaseOperation(async () => {
        await db.ref(`users/${user.uid}/watchlist/${contentId}`).remove();
        appState.user.watchlist.delete(contentId);
        
        document.querySelectorAll(`.btn-watchlist[data-content-id="${contentId}"]`).forEach(button => {
            button.classList.remove('in-list');
            button.innerHTML = '<i class="fas fa-plus"></i>';
        });
        
        const activeFilter = document.querySelector('.main-nav a.active, .mobile-nav a.active')?.dataset.filter;
        if (activeFilter === 'my-list') {
            const cardToRemove = DOM.myListContainer.querySelector(`.movie-card[data-content-id="${contentId}"]`);
            if (cardToRemove) {
                cardToRemove.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                cardToRemove.style.opacity = '0';
                cardToRemove.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    cardToRemove.remove();
                    if (appState.user.watchlist.size === 0) {
                        DOM.myListContainer.querySelector('.grid').innerHTML = `<p class="empty-message">Tu lista está vacía. Agrega contenido para verlo aquí.</p>`;
                    }
                }, 300);
            }
        }
    });
}

function displayMyListView() {
    const user = auth.currentUser;
    const myListGrid = DOM.myListContainer.querySelector('.grid');
    if (!user) {
        myListGrid.innerHTML = `<p class="empty-message">Debes iniciar sesión para ver tu lista.</p>`;
        return;
    }
    if (appState.user.watchlist.size === 0) {
        myListGrid.innerHTML = `<p class="empty-message">Tu lista está vacía. Agrega contenido para verlo aquí.</p>`;
        return;
    }
    myListGrid.innerHTML = '';
    const allContent = { ...appState.content.movies, ...appState.content.series };
    appState.user.watchlist.forEach(contentId => {
        const data = allContent[contentId];
        if (data) {
            const type = appState.content.series[contentId] ? 'series' : 'movie';
            myListGrid.appendChild(createMovieCardElement(contentId, data, type, 'grid', false));
        }
    });
}

function renderHistory() {
    const user = auth.currentUser;
    const historyGrid = DOM.historyContainer.querySelector('.grid');
    if (!user) {
        historyGrid.innerHTML = `<p class="empty-message">Debes iniciar sesión para ver tu historial.</p>`;
        return;
    }
    historyGrid.innerHTML = `<p>Cargando tu historial...</p>`;
    db.ref(`users/${user.uid}/history`).orderByChild('viewedAt').once('value', snapshot => {
        if (!snapshot.exists()) {
            historyGrid.innerHTML = `<p class="empty-message">Tu historial está vacío.</p>`;
            return;
        }
        const historyData = [];
        snapshot.forEach(child => {
            const item = child.val();
            item.key = child.key;
            historyData.push(item);
        });
        historyGrid.innerHTML = '';
        historyData.reverse().forEach((item) => {
            const options = {
                source: 'history',
                season: item.season
            };
            const card = createMovieCardElement(item.contentId, item, item.type, 'grid', false, options);
            
            const removeButton = document.createElement('button');
            removeButton.className = 'btn-remove-history';
            removeButton.dataset.key = item.key;
            removeButton.innerHTML = `<i class="fas fa-times"></i>`;
            card.appendChild(removeButton);

            const infoOverlay = document.createElement('div');
            infoOverlay.className = 'history-item-overlay';
            infoOverlay.innerHTML = `<h4 class="history-item-title">${item.title}</h4><p class="history-item-date">Visto: ${new Date(item.viewedAt).toLocaleDateString()}</p>`;
            card.appendChild(infoOverlay);

            historyGrid.appendChild(card);
        });
    });
}

function setupRealtimeHistoryListener(user) {
    if (appState.user.historyListenerRef) {
        appState.user.historyListenerRef.off('value');
    }

    if (user) {
        appState.user.historyListenerRef = db.ref(`users/${user.uid}/history`).orderByChild('viewedAt');
        
        appState.user.historyListenerRef.on('value', (snapshot) => {
            clearTimeout(appState.player.historyUpdateDebounceTimer);

            appState.player.historyUpdateDebounceTimer = setTimeout(() => {
                generateContinueWatchingCarousel(snapshot);
                if (DOM.historyContainer && DOM.historyContainer.style.display === 'block') {
                    renderHistory();
                }
            }, 250);
        });
    }
}

// ===========================================================
// 7. MODAL DE CONFIRMACIÓN
// ===========================================================
document.addEventListener('DOMContentLoaded', () => {
    if (DOM.confirmDeleteBtn && DOM.cancelDeleteBtn && DOM.confirmationModal) {
        DOM.confirmDeleteBtn.addEventListener('click', () => {
            if (typeof DOM.confirmationModal.onConfirm === 'function') {
                DOM.confirmationModal.onConfirm();
                hideConfirmationModal();
            }
        });

        DOM.cancelDeleteBtn.addEventListener('click', () => hideConfirmationModal());
    }
});

function hideConfirmationModal() {
    DOM.confirmationModal.classList.remove('show');
    DOM.confirmationModal.onConfirm = null;
    if (!document.querySelector('.modal.show')) {
        document.body.classList.remove('modal-open');
    }
}

function openConfirmationModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    if (!modal) return;

    const titleEl = modal.querySelector('h2');
    const messageEl = modal.querySelector('p');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    DOM.confirmationModal.onConfirm = onConfirm;

    modal.classList.add('show');
    document.body.classList.add('modal-open');
}

// ===========================================================
// 8. FUNCIONES DE UTILIDAD Y HELPERS
// ===========================================================
function createMovieCardElement(id, data, type, layout = 'carousel', lazy = false, options = {}) {
    const card = document.createElement('div');
    card.className = `movie-card ${layout === 'carousel' ? 'carousel-card' : ''}`;
    card.dataset.contentId = id;

    card.onclick = (e) => {
        if (e.target.closest('.btn-watchlist') || e.target.closest('.btn-remove-history')) {
            return;
        }
        if (options.source === 'history' && type === 'series' && options.season) {
            (async () => {
                const player = await getPlayerModule();
                player.openSeriesPlayerDirectlyToSeason(id, options.season);
            })();
        } else {
            openDetailsModal(id, type);
        }
    };
    
    let watchlistBtnHTML = '';
    if(auth.currentUser && options.source !== 'history'){
        const isInList = appState.user.watchlist.has(id);
        const icon = isInList ? 'fa-check' : 'fa-plus';
        const inListClass = isInList ? 'in-list' : '';
        watchlistBtnHTML = `<button class="btn-watchlist ${inListClass}" data-content-id="${id}"><i class="fas ${icon}"></i></button>`;
    }

    const imgHTML = lazy 
        ? `<img data-src="${data.poster}" alt="${data.title}" data-width="200" data-height="300">`
        : `<img src="${data.poster}" alt="${data.title}">`;

    card.innerHTML = `
        ${imgHTML}
        ${watchlistBtnHTML}
    `;

    return card;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function loadMoreContent(type) {
    if (appState.flags.isLoadingMore || appState.ui.currentIndex >= appState.ui.contentToDisplay.length) return;
    
    appState.flags.isLoadingMore = true;
    const gridEl = DOM.gridContainer.querySelector('.grid');
    const nextIndex = Math.min(appState.ui.currentIndex + ITEMS_PER_LOAD, appState.ui.contentToDisplay.length);
    for (let i = appState.ui.currentIndex; i < nextIndex; i++) {
        const [id, item] = appState.ui.contentToDisplay[i];
        gridEl.appendChild(createMovieCardElement(id, item, type, 'grid', true));
    }
    
    lazyLoader.observeImages();
    
    appState.ui.currentIndex = nextIndex;
    appState.flags.isLoadingMore = false;
}

// ===========================================================
// 10. 🎯 EXPORTAR PARA USO GLOBAL (Solo funciones principales)
// ===========================================================
window.ErrorHandler = ErrorHandler;
window.cacheManager = cacheManager;
window.lazyLoader = lazyLoader;
window.showCacheStats = () => {
    const stats = {
        itemCount: localStorage.length,
        version: cacheManager.version,
        contentCached: !!cacheManager.get(cacheManager.keys.content),
        metadataCached: !!cacheManager.get(cacheManager.keys.metadata)
    };
    console.table(stats);
    return stats;
};