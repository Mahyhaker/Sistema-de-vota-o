/* ═══════════════════════════════════════════════
   FAESA Voting System — script.js
   Admin creates teams; voters pick from the list.
   ═══════════════════════════════════════════════ */

// ── Config ──────────────────────────────────────
const API_URL = '/api';

const defaultHeaders = (extra = {}) => ({
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
    ...extra,
});

const authHeaders = () => defaultHeaders({
    'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
});

const ADMIN_USERNAME = 'admin';

const CATEGORIES = [
    { name: 'Originalidade', weight: 1.5 },
    { name: 'Design', weight: 1.2 },
    { name: 'Utilidade', weight: 1.0 },
    { name: 'Projeto Codificado', weight: 1.5 },
    { name: 'Produto de Mercado', weight: 1.3 },
    { name: 'Viabilidade', weight: 1.4 },
    { name: 'Pitch', weight: 1.1 },
];

const RATINGS = [
    { text: 'Muito Ruim', value: 1 },
    { text: 'Ruim', value: 2 },
    { text: 'Razoável', value: 3 },
    { text: 'Bom', value: 4 },
    { text: 'Muito Bom', value: 5 },
];

// ── State ────────────────────────────────────────
let currentUser = null;
let authToken = null;
let ratedCount = 0;
let availTeams = [];

// ── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    injectShakeKeyframe();
    initTheme();
    checkAuth();
    buildCategoryCards();
    bindEvents();
});

// ════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════
function checkAuth() {
    const token = localStorage.getItem('authToken');
    const username = localStorage.getItem('username');
    if (token && username) {
        authToken = token;
        currentUser = username;
        enterApp();
    }
}

function login(username, password) {
    setFormLoading('loginForm', true);
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: defaultHeaders(),
        body: JSON.stringify({ username, password }),
    })
        .then(r => r.json())
        .then(data => {
            setFormLoading('loginForm', false);
            if (data.token) {
                authToken = data.token;
                currentUser = data.username;
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('username', data.username);
                enterApp();
                toast('Login realizado com sucesso!', 'success');
            } else {
                toast('Usuário ou senha inválidos.', 'error');
                shakeCard();
            }
        })
        .catch(() => {
            setFormLoading('loginForm', false);
            toast('Não foi possível conectar ao servidor.', 'error');
        });
}

function register(username, password) {
    if (password.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.', 'error'); shakeCard(); return; }
    setFormLoading('signupForm', true);
    fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: defaultHeaders(),
        body: JSON.stringify({ username, password }),
    })
        .then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.message); }); return r.json(); })
        .then(() => {
            setFormLoading('signupForm', false);
            toast('Conta criada! Fazendo login…', 'info');
            login(username, password);
        })
        .catch(err => {
            setFormLoading('signupForm', false);
            toast(err.message || 'Erro ao registrar.', 'error');
            shakeCard();
        });
}

function logout() {
    // limpa formulário de votação
    resetVotingForm();

    localStorage.removeItem('authToken');
    localStorage.removeItem('username');

    authToken = null;
    currentUser = null;
    availTeams = [];

    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';

    switchPanel('login');

    toast('Sessão encerrada.', 'info');
}

// ── enter app ────────────────────────────────────
function enterApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';

    const initial = currentUser.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent = initial;
    document.getElementById('chipAvatar').textContent = initial;
    document.getElementById('sidebarUsername').textContent = currentUser;
    document.getElementById('chipUsername').textContent = currentUser;

    const isAdmin = currentUser === ADMIN_USERNAME;
    document.getElementById('sidebarRole').textContent = isAdmin ? 'Administrador' : 'Avaliador';

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? (el.tagName === 'BUTTON' ? 'flex' : 'block') : 'none';
    });
    document.querySelectorAll('.voter-only').forEach(el => {
        el.style.display = isAdmin ? 'none' : 'flex';
    });

    if (isAdmin) {
        showTab('admin', document.querySelector('[data-tab="admin"]'));
    }

    loadTeams();
    updateResults();

}

// ════════════════════════════════════════════════
// TEAM LOADING
// ════════════════════════════════════════════════
function loadTeams() {
    return fetch(`${API_URL}/teams`, { headers: defaultHeaders() })
        .then(r => r.json())
        .then(teams => {
            availTeams = teams;
            _lastTeamsHash = hashOf(teams);
            renderTeamSelector(teams);
            if (currentUser === ADMIN_USERNAME) renderAdminTeamList(teams);
        })
        .catch(() => {
            toast('Erro ao carregar equipes.', 'error');
            availTeams = [];
            renderTeamSelector([]);
        });
}

// ── voter: team chip selector ─────────────────────
function renderTeamSelector(teams) {
    const sel = document.getElementById('teamSelector');
    const noMsg = document.getElementById('noTeamsMsg');
    const form = document.getElementById('votingForm');

    if (!teams || teams.length === 0) {
        sel.innerHTML = '';
        noMsg.style.display = 'flex';
        form.style.display = 'none';
        return;
    }

    noMsg.style.display = 'none';
    form.style.display = 'block';

    sel.innerHTML = teams.map(name =>
        `<button type="button"
                class="team-chip"
                data-team="${escHtml(name)}"
                onclick="selectTeam(this)">
            ${escHtml(name)}
        </button>`
    ).join('');

    document.getElementById('selectedTeam').value = '';
}

function selectTeam(btn) {
    document.querySelectorAll('.team-chip').forEach(c => c.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('selectedTeam').value = btn.dataset.team;
}

// ── admin: team list ──────────────────────────────
function renderAdminTeamList(teams) {
    const list = document.getElementById('adminTeamList');
    const badge = document.getElementById('teamCountBadge');
    if (badge) badge.textContent = teams.length;

    if (!teams || teams.length === 0) {
        list.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-users-slash"></i>
                Nenhuma equipe cadastrada ainda.
            </div>`;
        return;
    }

    list.innerHTML = teams.map((name, i) =>
        `<div class="admin-team-item" style="animation-delay:${i * 40}ms">
            <div class="admin-team-icon"><i class="fas fa-users"></i></div>
            <span class="admin-team-name">${escHtml(name)}</span>
            <button class="admin-team-delete" onclick="deleteTeam('${escHtml(name)}')" title="Excluir equipe">
                <i class="fas fa-trash"></i>
            </button>
        </div>`
    ).join('');
}

// ── admin: add team ───────────────────────────────
function addTeam() {
    const input = document.getElementById('newTeamName');
    const name = (input.value || '').trim();

    if (!name) { toast('Informe o nome da equipe.', 'error'); input.focus(); return; }

    const btn = document.getElementById('addTeamBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Adicionando…';

    fetch(`${API_URL}/teams`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name }),
    })
        .then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.message); }); return r.json(); })
        .then(() => {
            toast(`Equipe "${name}" cadastrada!`, 'success');
            input.value = '';
            loadTeams();
        })
        .catch(err => toast(err.message || 'Erro ao cadastrar equipe.', 'error'))
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
        });
}

// ── admin: delete team ────────────────────────────
function deleteTeam(teamName) {
    if (!confirm(`Excluir permanentemente a equipe "${teamName}" e todos os seus votos?\nEsta ação não pode ser desfeita.`)) return;

    fetch(`${API_URL}/teams/${encodeURIComponent(teamName)}`, {
        method: 'DELETE',
        headers: {
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${authToken}`,
        },
    })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(() => {
            toast(`Equipe "${teamName}" excluída.`, 'success');
            loadTeams();
            updateResults();
        })
        .catch(() => toast('Erro ao excluir equipe.', 'error'));
}

// ════════════════════════════════════════════════
// VOTING FORM
// ════════════════════════════════════════════════
function buildCategoryCards() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    CATEGORIES.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.dataset.category = cat.name;

        card.innerHTML = `
            <div class="category-header">
                <span class="category-name">${cat.name}</span>
            </div>
            <div class="rating-group">
                ${RATINGS.map(r => `
                    <div class="rating-option">
                        <input type="radio"
                               id="cat-${cat.name}-${r.value}"
                               name="${cat.name}"
                               value="${r.value}">
                        <label for="cat-${cat.name}-${r.value}">
                            <span class="rating-num">${r.value}</span>
                            ${r.text}
                        </label>
                    </div>
                `).join('')}
            </div>`;

        grid.appendChild(card);
    });

    document.querySelectorAll('.categories-grid input[type="radio"]')
        .forEach(r => r.addEventListener('change', updateProgress));

    updateProgress();
}

function updateProgress() {
    ratedCount = 0;
    CATEGORIES.forEach(cat => {
        const checked = document.querySelector(`input[name="${cat.name}"]:checked`);
        const card = document.querySelector(`.category-card[data-category="${cat.name}"]`);
        if (checked) { ratedCount++; card && card.classList.add('rated'); }
        else { card && card.classList.remove('rated'); }
    });
    const pct = (ratedCount / CATEGORIES.length) * 100;
    const bar = document.getElementById('progressBar');
    const cnt = document.getElementById('progressCount');
    if (bar) bar.style.width = `${pct}%`;
    if (cnt) cnt.textContent = `${ratedCount} / ${CATEGORIES.length}`;
}

function resetVotingForm() {
    document.getElementById('votingForm').reset();
    document.getElementById('selectedTeam').value = '';
    document.querySelectorAll('.team-chip').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('rated'));
    ratedCount = 0;
    updateProgress();
    toast('Formulário limpo.', 'info');
}

function submitVotes(e) {
    e.preventDefault();

    const teamName = document.getElementById('selectedTeam').value.trim();
    if (!teamName) {
        toast('Selecione uma equipe antes de votar.', 'error');
        document.getElementById('teamSelectorCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const votes = {};
    let allRated = true;

    CATEGORIES.forEach(cat => {
        const sel = document.querySelector(`input[name="${cat.name}"]:checked`);
        if (sel) { votes[cat.name] = parseInt(sel.value); }
        else { allRated = false; }
    });

    if (!allRated) {
        toast('Avalie todas as categorias antes de enviar.', 'error');
        CATEGORIES.forEach(cat => {
            const card = document.querySelector(`.category-card[data-category="${cat.name}"]`);
            const sel = document.querySelector(`input[name="${cat.name}"]:checked`);
            if (!sel && card) {
                card.style.boxShadow = '0 0 0 2px var(--error)';
                setTimeout(() => (card.style.boxShadow = ''), 2200);
            }
        });
        return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Enviando…';

    fetch(`${API_URL}/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ teamName, votes }),
    })
        .then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.message); }); return r.json(); })
        .then(() => {
            toast('Avaliação enviada com sucesso!', 'success');
            resetVotingForm();
            updateResults();
        })
        .catch(err => toast(err.message || 'Erro ao enviar avaliação.', 'error'))
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Enviar Avaliação</span>';
        });
}

// ════════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════════
function updateResults() {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="skeleton-list">
            ${[1, 2, 3].map(() => '<div class="skeleton-card"></div>').join('')}
        </div>`;

    const btn = document.getElementById('refreshBtn');
    if (btn) { btn.disabled = true; btn.querySelector('i')?.classList.add('fa-spin'); }

    fetch(`${API_URL}/results`, { headers: defaultHeaders() })
        .then(r => r.json())
        .then(results => {
            _lastResultsHash = hashOf(results);
            renderResults(results);
        })
        .catch(() => {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Erro ao carregar resultados. Verifique a conexão.</p>
                </div>`;
        })
        .finally(() => {
            if (btn) { btn.disabled = false; btn.querySelector('i')?.classList.remove('fa-spin'); }
        });
}

function renderResults(results) {
    const container = document.getElementById('resultsContainer');

    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-chart-bar"></i>
                <p>Nenhuma avaliação registrada ainda.</p>
            </div>`;
        return;
    }

    const rankClass = ['rank-1', 'rank-2', 'rank-3'];
    const badgeClass = ['gold', 'silver', 'bronze'];
    const isAdmin = currentUser === ADMIN_USERNAME;

    const html = results.map((team, idx) => {
        const rankCls = idx < 3 ? rankClass[idx] : '';
        const badgeCls = idx < 3 ? badgeClass[idx] : '';

        const scoreItems = Object.entries(team.scores)
            .map(([cat, score]) =>
                `<div class="score-item">
                    <div class="score-item-name">${cat}</div>
                    <div class="score-item-val">${score}%</div>
                </div>`
            ).join('');

        const noScores = Object.keys(team.scores).length === 0
            ? `<p style="color:var(--text-3);font-size:.85rem">Ainda sem avaliações.</p>`
            : `<div class="scores-grid">${scoreItems}</div>`;

        return `
        <div class="team-card ${rankCls}" style="animation-delay:${idx * 60}ms">
            <div class="team-card-header" onclick="toggleDetails(this)">
                <div class="rank-badge ${badgeCls}">${idx + 1}</div>
                <div class="team-info">
                    <div class="team-card-name">${escHtml(team.teamName)}</div>
                    <div class="team-card-meta">${team.voterCount} avaliador${team.voterCount !== 1 ? 'es' : ''}</div>
                </div>
                <span class="score-pill">${team.totalScore}%</span>
                <div class="team-card-actions" onclick="event.stopPropagation()">
                    ${isAdmin ?
                `<button class="delete-btn-sm" onclick="deleteTeam('${escHtml(team.teamName)}')">
                        <i class="fas fa-trash"></i> Excluir
                    </button>` : ''}
                    <button class="expand-btn" title="Ver detalhes" onclick="toggleDetails(this.closest('.team-card-header'))">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="team-card-body">
                ${noScores}
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="results-list">${html}</div>`;
}

function toggleDetails(header) {
    const body = header.nextElementSibling;
    const btn = header.querySelector('.expand-btn');
    body.classList.toggle('open');
    btn.classList.toggle('expanded');
}

// ════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════
function switchPanel(name) {
    document.getElementById('panelLogin').classList.toggle('active', name === 'login');
    document.getElementById('panelRegister').classList.toggle('active', name === 'register');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('visible');
}

function showTab(tabName, btnEl) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    document.getElementById(`tab${cap(tabName)}`).classList.add('active');
    if (btnEl) btnEl.classList.add('active');

    const titles = { voting: 'Votação', results: 'Resultados', admin: 'Painel Admin' };
    document.getElementById('topbarTitle').textContent = titles[tabName] || tabName;

    if (tabName === 'results') updateResults();
    if (tabName === 'admin') { loadTeams(); loadUsers(); }

    if (window.innerWidth <= 768) toggleSidebar();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.classList.toggle('fa-eye', !isHidden);
    icon.classList.toggle('fa-eye-slash', isHidden);
}

function setFormLoading(formId, loading) {
    const form = document.getElementById(formId);
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? '<i class="fas fa-circle-notch fa-spin"></i> Aguarde…'
        : (formId === 'loginForm'
            ? '<span>Entrar</span><i class="fas fa-arrow-right"></i>'
            : '<span>Registrar</span><i class="fas fa-arrow-right"></i>');
}

function shakeCard() {
    const card = document.getElementById('authCard');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'shake 0.4s ease';
}

function injectShakeKeyframe() {
    const s = document.createElement('style');
    s.textContent = '@keyframes shake{0%,100%{transform:none}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}';
    document.head.appendChild(s);
}

// ── Theme ─────────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    applyTheme(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// ── Toast ─────────────────────────────────────────
function toast(message, type = 'info') {
    const icons = { success: 'fa-check', error: 'fa-times', info: 'fa-info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type] || 'fa-info'}"></i></div>
        <span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 3200);
}

// ── Escape HTML ───────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ════════════════════════════════════════════════
// EVENT BINDING
// ════════════════════════════════════════════════
function bindEvents() {
    document.getElementById('loginForm').addEventListener('submit', e => {
        e.preventDefault();
        login(
            document.getElementById('username').value.trim(),
            document.getElementById('password').value
        );
    });

    document.getElementById('signupForm').addEventListener('submit', e => {
        e.preventDefault();
        register(
            document.getElementById('newUsername').value.trim(),
            document.getElementById('newPassword').value
        );
    });

    document.getElementById('votingForm').addEventListener('submit', submitVotes);
}

// ════════════════════════════════════════════════
// SMART AUTO REFRESH — só atualiza se algo mudou
// ════════════════════════════════════════════════

// Guarda o último estado conhecido para comparar
let _lastTeamsHash = '';
let _lastResultsHash = '';

function hashOf(obj) {
    return JSON.stringify(obj);
}

// Verifica equipes silenciosamente e só re-renderiza se a lista mudou
function pollTeams() {
    if (!currentUser) return;
    fetch(`${API_URL}/teams`, { headers: defaultHeaders() })
        .then(r => r.json())
        .then(teams => {
            const h = hashOf(teams);
            if (h === _lastTeamsHash) return; // nada mudou
            _lastTeamsHash = h;

            // preserva a equipe selecionada pelo avaliador
            const selected = document.getElementById('selectedTeam')?.value || '';

            availTeams = teams;
            renderTeamSelector(teams);
            if (currentUser === ADMIN_USERNAME) renderAdminTeamList(teams);

            // restaura a seleção se a equipe ainda existe
            if (selected && teams.includes(selected)) {
                document.getElementById('selectedTeam').value = selected;
                document.querySelectorAll('.team-chip').forEach(c => {
                    c.classList.remove('selected');
                    if (c.dataset.team === selected) {
                        c.classList.add('selected');
                    }
                });
            }
        })
        .catch(() => { });
}

// Verifica resultados silenciosamente e só re-renderiza se mudaram
function pollResults() {
    if (!currentUser) return;
    const resultsTab = document.getElementById('tabResults');
    if (!resultsTab?.classList.contains('active')) return;

    fetch(`${API_URL}/results`, { headers: defaultHeaders() })
        .then(r => r.json())
        .then(results => {
            const h = hashOf(results);
            if (h === _lastResultsHash) return; // nada mudou
            _lastResultsHash = h;
            renderResults(results);
        })
        .catch(() => { });
}

setInterval(() => {
    pollTeams();
    pollResults();
}, 30000);

// ════════════════════════════════════════════════
// USER MANAGEMENT (Admin only)
// ════════════════════════════════════════════════

function loadUsers() {
    fetch(`${API_URL}/users`, {
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${authToken}`,
        },
    })
        .then(r => r.json())
        .then(renderUserList)
        .catch(() => toast('Erro ao carregar usuários.', 'error'));
}

function renderUserList(users) {
    const list = document.getElementById('adminUserList');
    const badge = document.getElementById('userCountBadge');
    if (!list) return;
    if (badge) badge.textContent = users.length;

    if (!users || users.length === 0) {
        list.innerHTML = `
            <div class="admin-empty">
                <i class="fas fa-user-slash"></i>
                Nenhum usuário cadastrado ainda.
            </div>`;
        return;
    }

    list.innerHTML = users.map((u, i) => `
        <div class="admin-user-item" id="user-row-${u.id}" style="animation-delay:${i * 40}ms">
            <div class="admin-user-icon"><i class="fas fa-user"></i></div>
            <div class="admin-user-info">
                <span class="admin-user-name">${escHtml(u.username)}</span>
                <span class="admin-user-meta">${u.voteCount} equipe${u.voteCount !== 1 ? 's' : ''} avaliada${u.voteCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="admin-user-actions">
                <button class="admin-btn-edit" onclick="openEditUser(${u.id}, '${escHtml(u.username)}')" title="Editar">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="admin-btn-delete" onclick="deleteUser(${u.id}, '${escHtml(u.username)}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openEditUser(userId, username) {
    const row = document.getElementById(`user-row-${userId}`);
    if (!row) return;

    // toggle: if already open, close it
    const existing = document.getElementById(`edit-form-${userId}`);
    if (existing) { existing.remove(); return; }

    // close any other open forms first
    document.querySelectorAll('.admin-user-edit-form').forEach(f => f.remove());

    const form = document.createElement('div');
    form.id = `edit-form-${userId}`;
    form.className = 'admin-user-edit-form';
    form.innerHTML = `
        <div class="edit-form-title">
            <i class="fas fa-user-pen"></i> Editar usuário
        </div>
        <div class="edit-field">
            <label>Novo nome de usuário</label>
            <div class="edit-field-wrap">
                <i class="fas fa-user"></i>
                <input type="text" id="edit-username-${userId}"
                       placeholder="Deixe vazio para manter"
                       value="${escHtml(username)}"
                       onkeydown="if(event.key==='Enter') saveUser(${userId})">
            </div>
        </div>
        <div class="edit-field">
            <label>Nova senha</label>
            <div class="edit-field-wrap">
                <i class="fas fa-lock"></i>
                <input type="password" id="edit-password-${userId}"
                       placeholder="Deixe vazio para manter"
                       onkeydown="if(event.key==='Enter') saveUser(${userId})">
            </div>
        </div>
        <div class="admin-user-edit-btns">
            <button class="admin-btn-save" onclick="saveUser(${userId})">
                <i class="fas fa-check"></i> Salvar alterações
            </button>
            <button class="admin-btn-cancel" onclick="document.getElementById('edit-form-${userId}').remove()">
                <i class="fas fa-times"></i> Cancelar
            </button>
        </div>`;

    row.insertAdjacentElement('afterend', form);
    document.getElementById(`edit-username-${userId}`).focus();
}

function saveUser(userId) {
    const newUsername = document.getElementById(`edit-username-${userId}`).value.trim();
    const newPassword = document.getElementById(`edit-password-${userId}`).value;

    if (!newUsername && !newPassword) {
        toast('Informe ao menos um campo para atualizar.', 'error');
        return;
    }

    const body = {};
    if (newUsername) body.username = newUsername;
    if (newPassword) body.password = newPassword;

    fetch(`${API_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
    })
        .then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.message); }); return r.json(); })
        .then(data => {
            toast(data.message, 'success');
            document.getElementById(`edit-form-${userId}`)?.remove();
            loadUsers();
        })
        .catch(err => toast(err.message || 'Erro ao atualizar usuário.', 'error'));
}

function deleteUser(userId, username) {
    if (!confirm(`Excluir o usuário "${username}" e todos os seus votos?\nEsta ação não pode ser desfeita.`)) return;

    fetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: {
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${authToken}`,
        },
    })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
            toast(data.message, 'success');
            loadUsers();
            updateResults();
        })
        .catch(() => toast('Erro ao excluir usuário.', 'error'));
}
