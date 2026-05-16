// ============================================================
// APP.JS — Neuro Notes AI
// Main Application Logic
// ============================================================

// ============================================================
// 🗂️  STATE
// ============================================================
const state = {
  user:          null,
  notes:         [],       // all notes fetched from Firestore
  filteredNotes: [],       // after search
  currentNote:   null,     // note being edited
  searchQuery:   '',
  unsubscribe:   null,     // Firestore listener
  draftTimer:    null,
  autoSaveTimer: null,
};

// ============================================================
// 🎯  DOM REFS
// ============================================================
const $ = id => document.getElementById(id);

const DOM = {
  loadingScreen:   $('loading-screen'),
  authPage:        $('auth-page'),
  app:             $('app'),

  // Auth
  tabLogin:        $('tab-login'),
  tabSignup:       $('tab-signup'),
  loginForm:       $('login-form'),
  signupForm:      $('signup-form'),
  loginEmail:      $('login-email'),
  loginPass:       $('login-pass'),
  signupName:      $('signup-name'),
  signupEmail:     $('signup-email'),
  signupPass:      $('signup-pass'),
  btnLoginEmail:   $('btn-login-email'),
  btnLoginGoogle:  $('btn-login-google'),
  btnSignupEmail:  $('btn-signup-email'),
  btnSignupGoogle: $('btn-signup-google'),

  // Sidebar
  sidebar:         $('sidebar'),
  sidebarOverlay:  $('sidebar-overlay'),
  sidebarNotesList:$('sidebar-notes-list'),
  searchInput:     $('search-input'),
  hamburger:       $('hamburger'),
  btnLogout:       $('btn-logout'),

  // User
  userAvatar:      $('user-avatar'),
  userName:        $('user-name'),
  userEmail:       $('user-email'),
  notesCount:      $('notes-count'),

  // Notes area
  notesGrid:       $('notes-grid'),
  emptyState:      $('empty-state'),
  topbarTitle:     $('topbar-title'),
  fab:             $('fab'),

  // Editor
  editorOverlay:   $('editor-overlay'),
  editorTitle:     $('editor-title'),
  noteTextarea:    $('note-textarea'),
  charCounter:     $('char-counter'),
  btnSave:         $('btn-save'),
  btnClose:        $('btn-close'),
  btnSummarize:    $('btn-summarize'),
  btnGenTitle:     $('btn-gen-title'),
  aiResultBox:     $('ai-result-box'),
  aiResultText:    $('ai-result-text'),
  aiResultClose:   $('ai-result-close'),
  draftBadge:      $('draft-badge'),

  // Confirm
  confirmOverlay:  $('confirm-overlay'),
  confirmYes:      $('confirm-yes'),
  confirmNo:       $('confirm-no'),

  // Toast
  toastContainer:  $('toast-container'),
};

// ============================================================
// 🔒  AUTH
// ============================================================

// Watch auth state
auth.onAuthStateChanged(user => {
  hideLoading();
  if (user) {
    state.user = user;
    showApp();
    updateUserUI();
    subscribeNotes();
  } else {
    state.user = null;
    showAuth();
    if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
  }
});

// Tab switching
DOM.tabLogin.addEventListener('click', () => switchAuthTab('login'));
DOM.tabSignup.addEventListener('click', () => switchAuthTab('signup'));

function switchAuthTab(tab) {
  if (tab === 'login') {
    DOM.tabLogin.classList.add('active');
    DOM.tabSignup.classList.remove('active');
    DOM.loginForm.classList.remove('hidden');
    DOM.signupForm.classList.add('hidden');
  } else {
    DOM.tabSignup.classList.add('active');
    DOM.tabLogin.classList.remove('active');
    DOM.signupForm.classList.remove('hidden');
    DOM.loginForm.classList.add('hidden');
  }
}

// Email Login
DOM.btnLoginEmail.addEventListener('click', async () => {
  const email = DOM.loginEmail.value.trim();
  const pass  = DOM.loginPass.value;
  if (!email || !pass) return showToast('⚠️ Email aur password dono daalo', 'error');

  setButtonLoading(DOM.btnLoginEmail, true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    showToast('✅ Login ho gaye!', 'success');
  } catch (e) {
    showToast('❌ ' + getFriendlyError(e.code), 'error');
  } finally {
    setButtonLoading(DOM.btnLoginEmail, false);
  }
});

// Email Signup
DOM.btnSignupEmail.addEventListener('click', async () => {
  const name  = DOM.signupName.value.trim();
  const email = DOM.signupEmail.value.trim();
  const pass  = DOM.signupPass.value;
  if (!name || !email || !pass) return showToast('⚠️ Sab fields bharo', 'error');
  if (pass.length < 6) return showToast('⚠️ Password 6+ characters ka hona chahiye', 'error');

  setButtonLoading(DOM.btnSignupEmail, true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    showToast('🎉 Account ban gaya!', 'success');
  } catch (e) {
    showToast('❌ ' + getFriendlyError(e.code), 'error');
  } finally {
    setButtonLoading(DOM.btnSignupEmail, false);
  }
});

// Google Login (both buttons)
[DOM.btnLoginGoogle, DOM.btnSignupGoogle].forEach(btn => {
  btn.addEventListener('click', async () => {
    try {
      await auth.signInWithPopup(googleProvider);
      showToast('✅ Google se login ho gaye!', 'success');
    } catch (e) {
      showToast('❌ Google login fail ho gaya', 'error');
    }
  });
});

// Logout
DOM.btnLogout.addEventListener('click', async () => {
  await auth.signOut();
  state.notes = [];
  state.filteredNotes = [];
  showToast('👋 Logout ho gaye', 'info');
});

// ============================================================
// 🗄️  FIRESTORE — Real-time Notes Sync
// ============================================================
function subscribeNotes() {
  if (state.unsubscribe) state.unsubscribe();

  state.unsubscribe = db.collection('notes')
    .where('uid', '==', state.user.uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(snapshot => {
      state.notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      applySearch();
      renderNotes();
      renderSidebarNotes();
      updateNotesCount();
    }, err => {
      console.error('Firestore error:', err);
      showToast('❌ Notes load nahi hue', 'error');
    });
}

async function saveNote() {
  const title   = DOM.editorTitle.value.trim() || 'Untitled Note';
  const content = DOM.noteTextarea.value.trim();

  if (!content && !DOM.editorTitle.value.trim()) {
    return showToast('⚠️ Note khali hai!', 'error');
  }

  setButtonLoading(DOM.btnSave, true, '💾 Save');

  const noteData = {
    uid:       state.user.uid,
    title,
    content,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (state.currentNote && state.currentNote.id) {
      // Update existing
      await db.collection('notes').doc(state.currentNote.id).update(noteData);
      showToast('✅ Note update ho gaya!', 'success');
    } else {
      // Create new
      noteData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('notes').add(noteData);
      showToast('🎉 Note save ho gaya!', 'success');
    }
    clearDraft();
    closeEditor();
  } catch (e) {
    console.error(e);
    showToast('❌ Save nahi hua, dobara try karo', 'error');
  } finally {
    setButtonLoading(DOM.btnSave, false, '💾 Save');
  }
}

async function deleteNote(id) {
  try {
    await db.collection('notes').doc(id).delete();
    showToast('🗑️ Note delete ho gaya', 'info');
  } catch (e) {
    showToast('❌ Delete nahi hua', 'error');
  }
}

// ============================================================
// 📝  EDITOR
// ============================================================
DOM.fab.addEventListener('click', () => openEditor(null));

function openEditor(note) {
  state.currentNote = note;
  DOM.editorTitle.value   = note ? note.title   : '';
  DOM.noteTextarea.value  = note ? note.content : '';
  DOM.aiResultBox.classList.add('hidden');
  updateCharCounter();
  // Show delete button only when editing an existing note
  const delBtn = document.getElementById('btn-delete-current');
  if (delBtn) delBtn.style.display = (note && note.id) ? 'inline-flex' : 'none';
  DOM.editorOverlay.classList.remove('hidden');
  // Load draft if new note
  if (!note) loadDraft();
  setTimeout(() => DOM.noteTextarea.focus(), 100);
}

function closeEditor() {
  DOM.editorOverlay.classList.add('hidden');
  state.currentNote = null;
  clearAutoSave();
}

DOM.btnClose.addEventListener('click', () => {
  if (DOM.noteTextarea.value.trim()) saveDraft();
  closeEditor();
});

DOM.editorOverlay.addEventListener('click', e => {
  if (e.target === DOM.editorOverlay) {
    if (DOM.noteTextarea.value.trim()) saveDraft();
    closeEditor();
  }
});

DOM.btnSave.addEventListener('click', saveNote);

// Char counter + auto-save
DOM.noteTextarea.addEventListener('input', () => {
  updateCharCounter();
  scheduleAutoSave();
});

DOM.editorTitle.addEventListener('input', scheduleAutoSave);

function updateCharCounter() {
  const len = DOM.noteTextarea.value.length;
  DOM.charCounter.textContent = `${len.toLocaleString()} characters`;
  DOM.charCounter.className = 'char-counter';
  if (len > 4000) DOM.charCounter.classList.add('warn');
  if (len > 4800) DOM.charCounter.classList.add('limit');
}

// ============================================================
// 💾  DRAFT (localStorage)
// ============================================================
function saveDraft() {
  const draft = {
    title:   DOM.editorTitle.value,
    content: DOM.noteTextarea.value,
    savedAt: Date.now(),
  };
  localStorage.setItem('neuro_draft', JSON.stringify(draft));
  DOM.draftBadge.classList.remove('hidden');
}

function loadDraft() {
  try {
    const raw = localStorage.getItem('neuro_draft');
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft.content || draft.title) {
      DOM.editorTitle.value  = draft.title || '';
      DOM.noteTextarea.value = draft.content || '';
      DOM.draftBadge.classList.remove('hidden');
      updateCharCounter();
    }
  } catch(e) {}
}

function clearDraft() {
  localStorage.removeItem('neuro_draft');
  DOM.draftBadge.classList.add('hidden');
}

function scheduleAutoSave() {
  clearAutoSave();
  state.autoSaveTimer = setTimeout(() => {
    if (DOM.noteTextarea.value.trim()) {
      saveDraft();
    }
  }, 2000);
}

function clearAutoSave() {
  if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
}

// ============================================================
// 🤖  AI FEATURES
// ============================================================
DOM.btnSummarize.addEventListener('click', async () => {
  const content = DOM.noteTextarea.value.trim();
  if (!content) return showToast('⚠️ Pehle kuch likho!', 'error');

  setAILoading(DOM.btnSummarize, true, '✨ Summarize');
  try {
    const prompt = `Summarize this note in 2-3 concise sentences. Keep it clear and helpful:\n\n${content}`;
    const result = await callGemini(prompt);
    showAIResult('AI Summary', result);
    showToast('✨ Summary ready!', 'success');
  } catch (e) {
    showToast('❌ AI error: ' + e.message, 'error');
  } finally {
    setAILoading(DOM.btnSummarize, false, '✨ Summarize');
  }
});

DOM.btnGenTitle.addEventListener('click', async () => {
  const content = DOM.noteTextarea.value.trim();
  if (!content) return showToast('⚠️ Pehle kuch likho!', 'error');

  setAILoading(DOM.btnGenTitle, true, '🏷️ Title');
  try {
    const prompt = `TITLE: Generate a short, catchy, creative title (max 6 words) for this note. Only return the title, nothing else:\n\n${content}`;
    const result = await callGemini(prompt);
    const cleanTitle = result.replace(/^["']|["']$/g, '').trim();
    DOM.editorTitle.value = cleanTitle;
    showToast('🏷️ Title generate ho gaya!', 'success');
  } catch (e) {
    showToast('❌ AI error: ' + e.message, 'error');
  } finally {
    setAILoading(DOM.btnGenTitle, false, '🏷️ Title');
  }
});

function showAIResult(label, text) {
  DOM.aiResultBox.querySelector('.ai-result-label').textContent = label;
  DOM.aiResultText.textContent = text;
  DOM.aiResultBox.classList.remove('hidden');
}

DOM.aiResultClose.addEventListener('click', () => {
  DOM.aiResultBox.classList.add('hidden');
});

// ============================================================
// 🗑️  DELETE with Confirmation
// ============================================================
let pendingDeleteId = null;

function confirmDelete(id) {
  pendingDeleteId = id;
  DOM.confirmOverlay.classList.remove('hidden');
}

DOM.confirmYes.addEventListener('click', async () => {
  if (pendingDeleteId) {
    await deleteNote(pendingDeleteId);
    pendingDeleteId = null;
  }
  DOM.confirmOverlay.classList.add('hidden');
});

DOM.confirmNo.addEventListener('click', () => {
  pendingDeleteId = null;
  DOM.confirmOverlay.classList.add('hidden');
});

// ============================================================
// 🔍  SEARCH
// ============================================================
DOM.searchInput.addEventListener('input', e => {
  state.searchQuery = e.target.value.toLowerCase();
  applySearch();
  renderNotes();
  renderSidebarNotes();
});

function applySearch() {
  if (!state.searchQuery) {
    state.filteredNotes = [...state.notes];
  } else {
    state.filteredNotes = state.notes.filter(n =>
      n.title.toLowerCase().includes(state.searchQuery) ||
      n.content.toLowerCase().includes(state.searchQuery)
    );
  }
}

// ============================================================
// 🖼️  RENDER
// ============================================================
function renderNotes() {
  DOM.notesGrid.innerHTML = '';

  if (state.filteredNotes.length === 0) {
    DOM.emptyState.classList.remove('hidden');
    DOM.notesGrid.classList.add('hidden');
    return;
  }

  DOM.emptyState.classList.add('hidden');
  DOM.notesGrid.classList.remove('hidden');

  state.filteredNotes.forEach((note, i) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.animationDelay = `${i * 0.04}s`;
    card.style.opacity = '0';
    setTimeout(() => card.style.opacity = '', i * 40);

    const date = note.updatedAt?.toDate
      ? formatDate(note.updatedAt.toDate())
      : 'Just now';

    card.innerHTML = `
      <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="note-card-body">${escapeHtml(note.content || '')}</div>
      <div class="note-card-footer">
        <span class="note-card-date">🕐 ${date}</span>
        <div class="note-card-actions">
          <button class="note-action-btn edit" title="Edit" data-id="${note.id}">✏️</button>
          <button class="note-action-btn delete" title="Delete" data-id="${note.id}">🗑️</button>
        </div>
      </div>
    `;

    card.addEventListener('click', e => {
      if (!e.target.closest('.note-action-btn')) openEditor(note);
    });

    card.querySelector('.edit').addEventListener('click', e => {
      e.stopPropagation();
      openEditor(note);
    });

    card.querySelector('.delete').addEventListener('click', e => {
      e.stopPropagation();
      confirmDelete(note.id);
    });

    DOM.notesGrid.appendChild(card);
  });
}

function renderSidebarNotes() {
  DOM.sidebarNotesList.innerHTML = '';
  const list = state.filteredNotes.slice(0, 12);

  if (list.length === 0) {
    DOM.sidebarNotesList.innerHTML = `<p style="font-size:0.78rem;color:var(--text-muted);padding:8px;">No notes found</p>`;
    return;
  }

  list.forEach(note => {
    const item = document.createElement('div');
    item.className = 'sidebar-note-item';

    const date = note.updatedAt?.toDate
      ? formatDate(note.updatedAt.toDate())
      : 'Just now';

    item.innerHTML = `
      <div class="sidebar-note-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="sidebar-note-date">${date}</div>
    `;
    item.addEventListener('click', () => {
      openEditor(note);
      closeSidebar();
    });
    DOM.sidebarNotesList.appendChild(item);
  });
}

function updateNotesCount() {
  DOM.notesCount.textContent = state.notes.length;
}

// ============================================================
// 🎭  SHOW / HIDE SCREENS
// ============================================================
function hideLoading() {
  DOM.loadingScreen.classList.add('hidden');
}

function showAuth() {
  DOM.authPage.classList.remove('hidden');
  DOM.app.classList.add('hidden');
}

function showApp() {
  DOM.authPage.classList.add('hidden');
  DOM.app.classList.remove('hidden');
}

function updateUserUI() {
  const u = state.user;
  DOM.userName.textContent  = u.displayName || 'User';
  DOM.userEmail.textContent = u.email;

  if (u.photoURL) {
    DOM.userAvatar.innerHTML = `<img src="${u.photoURL}" alt="avatar">`;
  } else {
    const initials = (u.displayName || u.email || 'U')[0].toUpperCase();
    DOM.userAvatar.textContent = initials;
  }
}

// ============================================================
// 📱  SIDEBAR MOBILE
// ============================================================
DOM.hamburger.addEventListener('click', toggleSidebar);
DOM.sidebarOverlay.addEventListener('click', closeSidebar);

function toggleSidebar() {
  DOM.sidebar.classList.toggle('open');
  DOM.sidebarOverlay.classList.toggle('active');
}

function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.sidebarOverlay.classList.remove('active');
}

// ============================================================
// 🍞  TOAST NOTIFICATIONS
// ============================================================
const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️' };

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${TOAST_ICONS[type] || '🔔'}</span> ${message}`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

// ============================================================
// 🔧  UTILS
// ============================================================
function setButtonLoading(btn, loading, label = '') {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> Loading...`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || label;
    btn.disabled = false;
  }
}

function setAILoading(btn, loading, label) {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> AI thinking...`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || label;
    btn.disabled = false;
  }
}

function formatDate(date) {
  const now  = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days < 7)  return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getFriendlyError(code) {
  const map = {
    'auth/user-not-found':     'Email registered nahi hai',
    'auth/wrong-password':     'Password galat hai',
    'auth/email-already-in-use': 'Ye email already use ho rahi hai',
    'auth/invalid-email':      'Email format galat hai',
    'auth/weak-password':      'Password zyada strong banana hoga',
    'auth/too-many-requests':  'Bahut zyada attempts. Thodi der baad try karo',
    'auth/network-request-failed': 'Network error. Internet check karo',
  };
  return map[code] || 'Kuch error aa gaya. Dobara try karo';
}

// ============================================================
// 🚀  INIT — Loader animation
// ============================================================
window.addEventListener('load', () => {
  // Loading bar runs, then firebase auth decides what to show
  setTimeout(() => {
    // If auth hasn't fired yet (slow network), hide loader anyway after 3s
    DOM.loadingScreen.classList.add('hidden');
  }, 3000);
});
