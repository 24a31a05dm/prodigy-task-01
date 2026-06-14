const state = {
  mode: 'login',
  user: null,
  isSubmitting: false
};

const elements = {
  authForm: document.querySelector('[data-auth-form]'),
  nameField: document.querySelector('[data-name-field]'),
  submitButton: document.querySelector('[data-submit-button]'),
  authNote: document.querySelector('[data-auth-note]'),
  toast: document.querySelector('[data-toast]'),
  logoutButton: document.querySelector('[data-logout]'),
  sessionChip: document.querySelector('[data-session-chip]'),
  userInitials: document.querySelector('[data-user-initials]'),
  userName: document.querySelector('[data-user-name]'),
  userRole: document.querySelector('[data-user-role]'),
  adminLink: document.querySelector('[data-admin-link]'),
  navLinks: document.querySelectorAll('[data-route]'),
  views: document.querySelectorAll('[data-view]'),
  stats: document.querySelector('[data-stats]'),
  activity: document.querySelector('[data-activity]'),
  accountName: document.querySelector('[data-account-name]'),
  accountEmail: document.querySelector('[data-account-email]'),
  accountRole: document.querySelector('[data-account-role]'),
  usersTable: document.querySelector('[data-users-table]')
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

function setMode(mode) {
  state.mode = mode;
  const isRegistering = mode === 'register';

  document.querySelectorAll('[data-mode-button]').forEach((button) => {
    button.classList.toggle('active', button.dataset.modeButton === mode);
  });

  elements.nameField.hidden = !isRegistering;
  elements.submitButton.textContent = isRegistering ? 'Create account' : 'Login securely';
  elements.authNote.textContent = isRegistering
    ? 'First registered user automatically becomes admin.'
    : 'Sessions are stored in HTTP-only cookies after login.';

  clearFieldErrors();
}

function clearFieldErrors() {
  document.querySelectorAll('[data-error-for]').forEach((errorElement) => {
    errorElement.textContent = '';
  });
}

function renderFieldErrors(errors = {}) {
  clearFieldErrors();

  Object.entries(errors).forEach(([field, message]) => {
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);

    if (errorElement) {
      errorElement.textContent = message;
    }
  });
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.errors = data.errors;
    throw error;
  }

  return data;
}

function pathToView() {
  if (window.location.pathname === '/admin') {
    return 'admin';
  }

  if (window.location.pathname === '/dashboard') {
    return 'dashboard';
  }

  return 'auth';
}

function navigate(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }

  render();
}

function setSessionUi() {
  const isSignedIn = Boolean(state.user);

  elements.sessionChip.hidden = !isSignedIn;
  elements.logoutButton.hidden = !isSignedIn;
  elements.adminLink.hidden = !isSignedIn || state.user.role !== 'admin';

  if (!isSignedIn) {
    return;
  }

  const initials = state.user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  elements.userInitials.textContent = initials;
  elements.userName.textContent = state.user.name;
  elements.userRole.textContent = state.user.role;
}

function showView(viewName) {
  elements.views.forEach((view) => {
    view.hidden = view.dataset.view !== viewName;
  });

  elements.navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.route === viewName);
  });
}

function renderStats(stats) {
  elements.stats.innerHTML = stats
    .map(
      (stat) => `
        <div class="metric">
          <span>${escapeHtml(stat.label)}</span>
          <strong>${escapeHtml(stat.value)}</strong>
        </div>
      `
    )
    .join('');
}

function renderActivity(items) {
  elements.activity.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

async function renderDashboard() {
  const data = await request('/api/dashboard');

  state.user = data.user;
  elements.accountName.textContent = data.user.name;
  elements.accountEmail.textContent = data.user.email;
  elements.accountRole.textContent = data.user.role;
  renderStats(data.stats);
  renderActivity(data.activity);
}

async function renderAdmin() {
  if (state.user.role !== 'admin') {
    navigate('/dashboard');
    showToast('Admin access is required.');
    return;
  }

  const data = await request('/api/admin/users');

  elements.usersTable.innerHTML = data.users
    .map(
      (user) => `
        <tr>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td><span class="role-pill">${escapeHtml(user.role)}</span></td>
          <td>${formatDate(user.createdAt)}</td>
        </tr>
      `
    )
    .join('');
}

async function render() {
  setSessionUi();
  const requestedView = pathToView();

  if (!state.user) {
    showView('auth');
    return;
  }

  if (requestedView === 'auth') {
    navigate('/dashboard');
    return;
  }

  showView(requestedView);

  try {
    if (requestedView === 'admin') {
      await renderAdmin();
    } else {
      await renderDashboard();
    }

    setSessionUi();
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      navigate('/');
      showToast('Please log in again.');
      return;
    }

    showToast(error.message);
  }
}

function formPayload() {
  const formData = new FormData(elements.authForm);

  return {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password')
  };
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (state.isSubmitting) {
    return;
  }

  state.isSubmitting = true;
  elements.submitButton.disabled = true;
  clearFieldErrors();

  try {
    const endpoint = state.mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = formPayload();
    const data = await request(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    state.user = data.user;
    elements.authForm.reset();
    showToast(data.message);
    navigate('/dashboard');
  } catch (error) {
    renderFieldErrors(error.errors);
    showToast(error.message);
  } finally {
    state.isSubmitting = false;
    elements.submitButton.disabled = false;
  }
}

async function logout() {
  try {
    await request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
  } catch (error) {
    if (error.status !== 401) {
      showToast(error.message);
    }
  }

  state.user = null;
  navigate('/');
}

async function bootstrap() {
  try {
    const data = await request('/api/auth/me');
    state.user = data.user;
  } catch (error) {
    state.user = null;
  }

  if (!state.user && pathToView() !== 'auth') {
    window.history.replaceState({}, '', '/');
  }

  if (new URLSearchParams(window.location.search).has('auth')) {
    showToast('Log in to access that page.');
  }

  if (new URLSearchParams(window.location.search).has('admin')) {
    showToast('Admin access is required.');
  }

  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

document.querySelectorAll('[data-mode-button]').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.modeButton));
});

document.querySelectorAll('[data-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const href = link.getAttribute('href');

    if (!href || href.startsWith('http')) {
      return;
    }

    event.preventDefault();
    navigate(href);
  });
});

elements.authForm.addEventListener('submit', handleAuthSubmit);
elements.logoutButton.addEventListener('click', logout);
window.addEventListener('popstate', render);

setMode('login');
bootstrap();
