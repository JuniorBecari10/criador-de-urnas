// ========================================
// Criador de Urnas - Main Script
// ========================================

const STORAGE_KEY = 'criador_de_urnas_data';

let state = {
    adminPassword: '',
    allowBlank: true,
    allowNull: true,
    candidates: [],
    votes: {},
    status: 'config',
    totalVotes: 0
};

// ============ DOM ELEMENTS ============
const screens = {
    config: document.getElementById('configScreen'),
    voting: document.getElementById('votingScreen'),
    adminOptions: document.getElementById('adminOptionsScreen'),
    results: document.getElementById('resultsScreen')
};

const statusBadge = document.getElementById('statusBadge');
const candidateList = document.getElementById('candidateList');
const resultsContainer = document.getElementById('resultsContainer');
const votePopup = document.getElementById('votePopup');
const popupNumber = document.getElementById('popupNumber');
const popupName = document.getElementById('popupName');
const popupType = document.getElementById('popupType');
const popupWarning = document.getElementById('popupWarning');
const confirmVoteBtn = document.getElementById('confirmVote');
const btnBlank = document.getElementById('btnBlank');
const btnNull = document.getElementById('btnNull');
const otpInputs = document.querySelectorAll('#otpContainer .otp-input');
const candInputs = [document.getElementById('candNum1'), document.getElementById('candNum2')];
const modalOverlay = document.getElementById('modalOverlay');
const modalPassword = document.getElementById('modalPassword');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const confirmModalOverlay = document.getElementById('confirmModalOverlay');
const confirmModalTitle = document.getElementById('confirmModalTitle');
const confirmModalMessage = document.getElementById('confirmModalMessage');
const confirmModalYes = document.getElementById('confirmModalYes');
const confirmModalNo = document.getElementById('confirmModalNo');
const toastContainer = document.getElementById('toastContainer');

let currentOtpIndex = 0;
let pendingAction = null;
let popupTimeout = null;
let toasts = [];

// ============ INIT ============
function init() {
    loadState();
    renderCandidateList();
    updateUIForStatus();
    setupEventListeners();
    setupOTPInputs();
    setupCandidateOTP();
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            state = { ...state, ...JSON.parse(saved) };
        } catch (e) { console.error(e); }
    }
    state.candidates.forEach(c => { if (!state.votes[c.number]) state.votes[c.number] = 0; });
    if (!state.votes.branco) state.votes.branco = 0;
    if (!state.votes.nulo) state.votes.nulo = 0;
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(msg, type = 'info') {
    // Remove oldest if we have 5 or more
    if (toasts.length >= 5) {
        removeToast(toasts[0]);
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    toastEl.textContent = msg;
    toastEl.addEventListener('click', () => removeToast(toastEl));

    toastContainer.appendChild(toastEl);
    toasts.push(toastEl);

    // Trigger show animation
    requestAnimationFrame(() => {
        toastEl.classList.add('show');
    });

    // Auto remove after 2.5s
    setTimeout(() => {
        if (toasts.includes(toastEl)) {
            removeToast(toastEl);
        }
    }, 2500);
}

function removeToast(toastEl) {
    const idx = toasts.indexOf(toastEl);
    if (idx === -1) return;

    toasts.splice(idx, 1);
    toastEl.classList.add('removing');
    toastEl.addEventListener('transitionend', () => {
        toastEl.remove();
    }, { once: true });
}

// ============ CONFIRM DIALOG (Sim/Não) ============
function showConfirmDialog(message, onYes) {
    confirmModalMessage.textContent = message;
    confirmModalOverlay.classList.add('active');

    // Remove old listeners to avoid duplicates
    const yesHandler = () => {
        confirmModalOverlay.classList.remove('active');
        confirmModalYes.removeEventListener('click', yesHandler);
        confirmModalNo.removeEventListener('click', noHandler);
        confirmModalOverlay.removeEventListener('click', overlayHandler);
        onYes();
    };
    const noHandler = () => {
        confirmModalOverlay.classList.remove('active');
        confirmModalYes.removeEventListener('click', yesHandler);
        confirmModalNo.removeEventListener('click', noHandler);
        confirmModalOverlay.removeEventListener('click', overlayHandler);
    };
    const overlayHandler = (e) => {
        if (e.target === confirmModalOverlay) {
            noHandler();
        }
    };

    confirmModalYes.addEventListener('click', yesHandler);
    confirmModalNo.addEventListener('click', noHandler);
    confirmModalOverlay.addEventListener('click', overlayHandler);
}

// ============ SCREENS ============
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    state.status = name === 'config' ? 'config' : name === 'results' ? 'ended' : 'voting';
    updateStatusBadge();
}

function updateStatusBadge() {
    const map = {
        config: { text: 'Configuração', class: 'config' },
        voting: { text: 'Votação em Andamento', class: 'voting' },
        ended: { text: 'Eleição Encerrada', class: 'ended' }
    };
    const b = map[state.status] || map.config;
    statusBadge.textContent = b.text;
    statusBadge.className = `status-badge ${b.class}`;
}

function updateUIForStatus() {
    const screenMap = { config: 'config', voting: 'voting', ended: 'results' };
    showScreen(screenMap[state.status] || 'config');
    if (state.status === 'voting') { resetVotingOTP(); updateVoteButtons(); }
    else if (state.status === 'ended') { renderResults(); }
}

// ============ CANDIDATES ============
function renderCandidateList() {
    candidateList.innerHTML = '';
    state.candidates.forEach((c, i) => {
        const li = document.createElement('li');
        li.className = 'candidate-item';
        li.innerHTML = `
            <span class="candidate-number">${c.number}</span>
            <span class="candidate-name">${c.name}</span>
            <button class="btn-icon" data-index="${i}" aria-label="Remover"><i class="fa-solid fa-xmark"></i></button>
        `;
        candidateList.appendChild(li);
    });
    candidateList.querySelectorAll('.btn-icon').forEach(b => b.addEventListener('click', e => removeCandidate(+e.currentTarget.dataset.index)));
}

function getCandidateNumber() {
    return candInputs.map(i => i.value).join('');
}

function setCandidateNumber(val) {
    val = String(val).padStart(2, '0').slice(0,2);
    candInputs[0].value = val[0] || '';
    candInputs[1].value = val[1] || '';
    candInputs.forEach(i => i.classList.toggle('filled', !!i.value));
}

function resetCandidateOTP() {
    candInputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
    candInputs[0].focus();
}

function setupCandidateOTP() {
    candInputs.forEach((input, idx) => {
        input.addEventListener('input', e => {
            const v = e.target.value;
            if (v && !/^\d$/.test(v)) { e.target.value = ''; return; }
            if (v) { e.target.classList.add('filled'); if (idx < 1) candInputs[1].focus(); }
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Backspace') {
                if (!e.target.value && idx > 0) { candInputs[0].focus(); candInputs[0].value = ''; candInputs[0].classList.remove('filled'); }
                else if (e.target.value) { e.target.value = ''; e.target.classList.remove('filled'); }
            }
        });
    });
}

function addCandidate() {
    const num = getCandidateNumber();
    const name = document.getElementById('candidateName').value.trim();
    if (num.length !== 2) { showToast('Informe 2 dígitos', 'error'); candInputs[0].focus(); return; }
    if (!name) { showToast('Nome obrigatório', 'error'); return; }
    if (state.candidates.some(c => c.number === num)) { showToast('Número já existe', 'error'); return; }
    state.candidates.push({ number: num, name, type: 'candidate' });
    state.votes[num] = 0;
    saveState();
    renderCandidateList();
    resetCandidateOTP();
    document.getElementById('candidateName').value = '';
    showToast('Candidato adicionado', 'success');
}

function removeCandidate(idx) {
    const c = state.candidates[idx];
    delete state.votes[c.number];
    state.candidates.splice(idx, 1);
    saveState();
    renderCandidateList();
    showToast('Candidato removido', 'success');
}

// ============ VOTING OTP ============
function setupOTPInputs() {
    otpInputs.forEach((input, idx) => {
        input.addEventListener('input', e => {
            const v = e.target.value;
            if (v && !/^\d$/.test(v)) { e.target.value = ''; return; }
            if (v) { e.target.classList.add('filled'); if (idx < 1) otpInputs[1].focus(); }
            updateVotePreview();
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Backspace') {
                hideVotePopup();
                if (!e.target.value && idx > 0) { otpInputs[0].focus(); otpInputs[0].value = ''; otpInputs[0].classList.remove('filled'); }
                else if (e.target.value) { e.target.value = ''; e.target.classList.remove('filled'); }
                updateVotePreview();
            } else if (e.key === 'Enter' && !confirmVoteBtn.disabled) { confirmVote(); }
        });
        input.addEventListener('focus', () => currentOtpIndex = idx);
    });
}

function resetVotingOTP() {
    otpInputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
    currentOtpIndex = 0;
    otpInputs[0].focus();
    hideVotePopup();
    confirmVoteBtn.disabled = true;
    updateVoteButtons();
}

function getVotingOTP() {
    return Array.from(otpInputs).map(i => i.value).join('');
}

function updateVotePreview() {
    const val = getVotingOTP();
    if (val.length === 2) showVotePopup(val);
    else { hideVotePopup(); confirmVoteBtn.disabled = true; }
}

function showVotePopup(num) {
    const c = state.candidates.find(x => x.number === num);
    popupNumber.textContent = num;
    if (c) {
        popupName.textContent = c.name;
        popupType.textContent = 'Candidato';
        popupWarning.classList.add('hidden');
    } else {
        popupName.textContent = 'Candidato não encontrado';
        popupType.textContent = 'Será computado como voto nulo';
        popupWarning.textContent = 'Número inexistente — voto nulo';
        popupWarning.classList.remove('hidden');
    }
    confirmVoteBtn.disabled = false;
    votePopup.classList.add('active');
}

function hideVotePopup() {
    votePopup.classList.remove('active');
}

function updateVoteButtons() {
    btnBlank.disabled = !state.allowBlank;
    btnNull.disabled = !state.allowNull;
}

function castVote(type, number = null) {
    if (state.status !== 'voting') return;
    let key = number, label = '';
    if (type === 'branco') { key = 'branco'; label = 'Branco'; }
    else if (type === 'nulo') { key = 'nulo'; label = 'Nulo'; }
    else { const c = state.candidates.find(x => x.number === number); label = c ? c.name : 'Nulo'; }
    state.votes[key] = (state.votes[key] || 0) + 1;
    state.totalVotes++;
    saveState();
    showToast('Voto Registrado', 'success');
    resetVotingOTP();
}

function confirmVote() {
    const val = getVotingOTP();
    if (val.length !== 2) return;
    const c = state.candidates.find(x => x.number === val);
    castVote(c ? 'candidate' : 'nulo', val);
}

// ============ ADMIN ============
function openAdminMenu() {
    pendingAction = 'adminMenu';
    modalTitle.textContent = 'Menu do Administrador';
    modalMessage.textContent = 'Digite a senha para acessar as opções';
    modalPassword.value = '';
    modalPassword.placeholder = 'Senha de administrador';
    modalOverlay.classList.add('active');
    setTimeout(() => modalPassword.focus(), 100);
}

function verifyMenuPassword() {
    if (modalPassword.value === state.adminPassword) {
        modalOverlay.classList.remove('active');
        showScreen('adminOptions');
    } else {
        showToast('Senha incorreta', 'error');
        modalPassword.value = '';
        modalPassword.focus();
    }
}

function startElection() {
    const pw = document.getElementById('adminPassword').value;
    if (!pw || pw.length < 4) { showToast('Senha mín. 4 caracteres', 'error'); return; }
    if (state.candidates.length === 0) { showToast('Adicione candidatos', 'error'); return; }
    state.adminPassword = pw;
    state.status = 'voting';
    state.votes = {}; state.totalVotes = 0;
    state.candidates.forEach(c => state.votes[c.number] = 0);
    state.votes.branco = 0; state.votes.nulo = 0;
    saveState();
    updateUIForStatus();
    showToast('Eleição iniciada', 'success');
}

function requestEndElection() { doEndElection(); }

function doEndElection() {
    state.status = 'ended';
    saveState();
    updateUIForStatus();
    showToast('Eleição encerrada', 'success');
}

function requestClearAll() {
    if (state.status === 'config') {
        showConfirmDialog('Tem certeza que deseja limpar todos os dados?', doClearAll);
    } else {
        openConfirmModal('Limpar Tudo', 'Isso apagará todos os dados. Confirmar?', 'clearAll');
    }
}

function doClearAll() {
    state = { adminPassword: '', allowBlank: true, allowNull: true, candidates: [], votes: {}, status: 'config', totalVotes: 0 };
    localStorage.removeItem(STORAGE_KEY);
    renderCandidateList();
    updateUIForStatus();
    document.getElementById('adminPassword').value = '';
    document.getElementById('allowBlank').checked = true;
    document.getElementById('allowNull').checked = true;
    resetCandidateOTP();
    showToast('Dados limpos', 'success');
}

function openConfirmModal(title, msg, action) {
    pendingAction = action;
    modalTitle.textContent = title;
    modalMessage.textContent = msg;
    modalPassword.value = '';
    modalOverlay.classList.add('active');
    modalPassword.focus();
}

// ============ RESULTS ============
function renderResults() {
    const entries = [];
    state.candidates.forEach(c => entries.push({ number: c.number, name: c.name, type: 'candidate', votes: state.votes[c.number] || 0 }));
    if (state.allowBlank) entries.push({ number: 'BR', name: 'Voto em Branco', type: 'branco', votes: state.votes.branco || 0 });
    if (state.allowNull) entries.push({ number: 'NL', name: 'Voto Nulo', type: 'nulo', votes: state.votes.nulo || 0 });
    entries.sort((a,b) => b.votes - a.votes);
    const candEntries = entries.filter(e => e.type === 'candidate');
    const maxV = candEntries[0]?.votes || 0;
    const winners = candEntries.filter(e => e.votes === maxV && maxV > 0);

    resultsContainer.innerHTML = '';
    if (state.totalVotes === 0) {
        resultsContainer.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:40px">Nenhum voto registrado</p>';
        return;
    }
    entries.forEach((e, i) => {
        const win = winners.some(w => w.number === e.number);
        const pct = state.totalVotes ? ((e.votes/state.totalVotes)*100).toFixed(1) : 0;
        const div = document.createElement('div');
        div.className = `result-item ${win ? 'winner' : ''}`;
        div.innerHTML = `
            <div class="result-rank">${i+1}</div>
            <div class="result-info">
                <div class="result-name">${e.name}</div>
                <div class="result-meta">${e.type==='candidate'?'Número: '+e.number:e.type==='branco'?'Voto em Branco':'Voto Nulo'}</div>
            </div>
            <div class="result-bar-wrap"><div class="result-bar"><div class="result-bar-fill" style="width:${pct}%"></div></div></div>
            <div class="result-stats"><span class="result-votes">${e.votes}</span><span class="result-percent">${pct}%</span></div>
        `;
        resultsContainer.appendChild(div);
    });
    if (winners.length === 0 && maxV === 0 && state.totalVotes > 0) {
        const div = document.createElement('div');
        div.style.cssText = 'margin-top:16px;padding:18px;border-radius:var(--radius);text-align:center;background:var(--bg-color);border:2px solid var(--border);color:var(--text-light)';
        div.innerHTML = 'Sem vencedores, nenhum candidato recebeu votos.';
        resultsContainer.appendChild(div);
    } else if (winners.length === 1) {
        const w = winners[0];
        const pct = ((w.votes/state.totalVotes)*100).toFixed(1);
        const div = document.createElement('div');
        div.className = 'winner-banner single';
        div.innerHTML = `<h3>Vencedor</h3><div class="winner-name">${w.name}</div><div class="winner-detail">Número ${w.number} • ${w.votes} voto(s) (${pct}%)</div>`;
        resultsContainer.appendChild(div);
    } else if (winners.length > 1) {
        const div = document.createElement('div');
        div.className = 'winner-banner tie';
        div.innerHTML = `<h3>Empate</h3><div class="winner-name">${winners.map(x=>x.name+' ('+x.number+')').join(', ')}</div><div class="winner-detail">Todos com ${maxV} voto(s)</div>`;
        resultsContainer.appendChild(div);
    }
}

// ============ EVENTS ============
function setupEventListeners() {
    document.getElementById('addCandidate').addEventListener('click', addCandidate);
    document.getElementById('candidateName').addEventListener('keypress', e => { if(e.key==='Enter') addCandidate(); });
    candInputs.forEach(i => i.addEventListener('keypress', e => { if(e.key==='Enter') addCandidate(); }));

    document.getElementById('startElection').addEventListener('click', startElection);
    document.getElementById('clearAll').addEventListener('click', requestClearAll);

    document.getElementById('btnBlank').addEventListener('click', () => castVote('branco'));
    document.getElementById('btnNull').addEventListener('click', () => castVote('nulo'));
    document.getElementById('confirmVote').addEventListener('click', confirmVote);
    document.getElementById('openMenu').addEventListener('click', openAdminMenu);

    document.getElementById('endElection').addEventListener('click', requestEndElection);
    document.getElementById('backToVoting2').addEventListener('click', () => showScreen('voting'));

    document.getElementById('clearAllResults').addEventListener('click', requestClearAll);

    document.getElementById('modalCancel').addEventListener('click', () => { modalOverlay.classList.remove('active'); pendingAction=null; });
    document.getElementById('modalConfirm').addEventListener('click', () => {
        if (modalPassword.value === state.adminPassword) {
            modalOverlay.classList.remove('active');
            if (pendingAction==='endElection') doEndElection();
            else if (pendingAction==='clearAll') doClearAll();
            else if (pendingAction==='adminMenu') showScreen('adminOptions');
            pendingAction=null;
        } else {
            showToast('Senha incorreta', 'error');
            modalPassword.value = '';
            modalPassword.focus();
        }
    });
    modalPassword.addEventListener('keypress', e => { if(e.key==='Enter') document.getElementById('modalConfirm').click(); });
    modalOverlay.addEventListener('click', e => { if(e.target===modalOverlay){modalOverlay.classList.remove('active');pendingAction=null;} });

    // Keyboard shortcuts for blank (B) and null (N) votes
    document.addEventListener('keydown', (e) => {
        // Ignore if any modal/popup is open
        if (modalOverlay.classList.contains('active') ||
            confirmModalOverlay.classList.contains('active') ||
            votePopup.classList.contains('active')) return;
        if (state.status !== 'voting') return;
        const key = e.key.toLowerCase();
        if (key === 'b' && !btnBlank.disabled) {
            e.preventDefault();
            castVote('branco');
        } else if (key === 'n' && !btnNull.disabled) {
            e.preventDefault();
            castVote('nulo');
        }
    });

    document.getElementById('allowBlank').addEventListener('change', e => { state.allowBlank = e.target.checked; saveState(); });
    document.getElementById('allowNull').addEventListener('change', e => { state.allowNull = e.target.checked; saveState(); });
}

document.addEventListener('DOMContentLoaded', init);