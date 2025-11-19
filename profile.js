// ===========================================================
// MÓDULO DE PERFIL (Cargado bajo demanda)
// ===========================================================

let shared; // Para almacenar las dependencias
let isInitialized = false;

// Inyecta las dependencias
export function initProfile(dependencies) {
    if (isInitialized) return;
    shared = dependencies;
    isInitialized = true;
}

// Lógica del menú desplegable del usuario (Header)
export function setupUserDropdown() {
    if (shared.DOM.userGreetingBtn && shared.DOM.userMenuDropdown) {
        shared.DOM.userGreetingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            shared.DOM.userMenuDropdown.classList.toggle('show');
        });

        shared.DOM.userMenuDropdown.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-action]');
            if (!link) return;
            
            e.preventDefault();
            const action = link.dataset.action;

            if (action === 'logout') {
                shared.auth.signOut();
            } else if (action === 'profile' || action === 'settings') {
                document.querySelectorAll('.main-nav a, .mobile-nav a').forEach(l => l.classList.remove('active'));
                shared.switchView(action); // Llama a la función principal
            }
            
            shared.DOM.userMenuDropdown.classList.remove('show');
        });

        document.addEventListener('click', (e) => {
            if (!shared.DOM.userMenuDropdown.contains(e.target) && !shared.DOM.userGreetingBtn.contains(e.target)) {
                shared.DOM.userMenuDropdown.classList.remove('show');
            }
        });
    }
}

// Muestra la página de Perfil
export function renderProfile() {
    const user = shared.auth.currentUser;
    if (!user) {
        shared.switchView('all');
        return;
    }

    shared.DOM.profileUsername.textContent = user.displayName || 'Usuario';
    shared.DOM.profileEmail.textContent = user.email;

    calculateAndDisplayUserStats(); 

    const tabs = document.querySelectorAll('.profile-tab');
    const tabContents = document.querySelectorAll('.profile-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.dataset.tab;
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === `${tabName}-tab`);
            });
        });
    });

    if (tabs.length > 0) {
        tabs[0].click();
    }
}

// Muestra la página de Ajustes
export function renderSettings() {
    const user = shared.auth.currentUser;
    if (!user) {
        shared.switchView('all');
        return;
    }

    shared.DOM.settingsUsernameInput.value = user.displayName || '';

    shared.DOM.updateUsernameBtn.onclick = async () => {
        const newUsername = shared.DOM.settingsUsernameInput.value.trim();
        if (newUsername && newUsername !== user.displayName) {
            try {
                await user.updateProfile({ displayName: newUsername });
                shared.db.ref(`users/${user.uid}/profile/displayName`).set(newUsername);
                showFeedbackMessage('Nombre de usuario actualizado correctamente.', 'success');
                shared.DOM.userGreetingBtn.textContent = `Hola, ${newUsername}`;
            } catch (error) {
                console.error("Error al actualizar nombre:", error);
                showFeedbackMessage(`Error: ${error.message}`, 'error');
            }
        } else {
            showFeedbackMessage('Por favor, ingresa un nombre válido y diferente.', 'error');
        }
    };

    shared.DOM.updatePasswordBtn.onclick = async () => {
        const newPassword = shared.DOM.settingsPasswordInput.value;
        if (newPassword.length >= 6) {
            try {
                await user.updatePassword(newPassword);
                showFeedbackMessage('Contraseña actualizada correctamente.', 'success');
                shared.DOM.settingsPasswordInput.value = '';
            } catch (error) {
                console.error("Error al actualizar contraseña:", error);
                showFeedbackMessage(`Error: ${error.message}`, 'error');
            }
        } else {
            showFeedbackMessage('La contraseña debe tener al menos 6 caracteres.', 'error');
        }
    };
}

// Función interna (privada) del módulo
function showFeedbackMessage(message, type) {
    const feedbackElement = document.getElementById('settings-feedback');
    feedbackElement.textContent = message;
    feedbackElement.className = `feedback-message ${type}`;
    feedbackElement.style.display = 'block';
    
    setTimeout(() => {
        feedbackElement.style.display = 'none';
        feedbackElement.textContent = '';
        feedbackElement.className = 'feedback-message';
    }, 5000);
}

// Función interna (privada) del módulo
async function calculateAndDisplayUserStats() {
    const user = shared.auth.currentUser;
    if (!user) return;

    const [historySnapshot] = await Promise.all([
        shared.db.ref(`users/${user.uid}/history`).once('value'),
    ]);

    if (!historySnapshot.exists()) {
        document.querySelector('.stats-container').innerHTML = `<p class="empty-message">Aún no tienes actividad para mostrar estadísticas.</p>`;
        return;
    }

    const history = historySnapshot.val();
    let moviesWatched = 0;
    const seriesWatched = new Set();
    let genreCounts = {};
    let totalItemsInHistory = 0;

    for (const item of Object.values(history)) {
        totalItemsInHistory++;
        if (item.type === 'movie') {
            moviesWatched++;
        } else if (item.type === 'series') {
            seriesWatched.add(item.contentId);
        }

        const content = shared.appState.content.movies[item.contentId] || shared.appState.content.series[item.contentId];
        if (content && content.genres) {
            content.genres.split(';').forEach(genreStr => {
                const genre = genreStr.trim();
                if (genre) {
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                }
            });
        }
    }

    document.getElementById('stat-movies-watched').textContent = moviesWatched;
    document.getElementById('stat-series-watched').textContent = seriesWatched.size;
    document.getElementById('stat-total-items').textContent = totalItemsInHistory;

    const genreStatsContainer = document.getElementById('genre-stats-container');
    genreStatsContainer.innerHTML = '';
    const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCount = sortedGenres.length > 0 ? sortedGenres[0][1] : 0;

    sortedGenres.forEach(([genre, count]) => {
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const barHtml = `
            <div class="genre-stat-bar">
                <span class="genre-label">${genre}</span>
                <div class="genre-progress">
                    <div class="genre-progress-fill" style="width: ${percentage}%;"></div>
                </div>
                <span class="genre-count">${count}</span>
            </div>`;
        genreStatsContainer.insertAdjacentHTML('beforeend', barHtml);
    });
}