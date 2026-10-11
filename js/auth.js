(() => {
  const sb = window.synvioSupabase;
  const page = document.body.dataset.authPage;
  const message = document.getElementById("auth-message");
  const submit = document.getElementById("auth-submit");
  const expectedRole = document.body.dataset.loginRole || "";

  async function openWorkspace(user) {
    if (safeNext()?.startsWith('/accept-invite.html') && !expectedRole) {
      window.location.replace(destination());
      return;
    }
    const { data:members, error } = await sb.from('organization_members')
      .select('organization_id,role').eq('user_id', user.id);
    if (error) throw error;
    if (!members?.length) throw new Error('Your account has not joined a company yet. Open your invitation email to finish joining.');
    if (expectedRole && !members.some(member => member.role === expectedRole)) {
      throw new Error(expectedRole === 'agent' ? 'This account is an administrator. Use Admin sign in.' : 'This account is an employee. Use Employee sign in.');
    }
    if (!members.some(member => member.role === 'admin')) throw new Error('Flow is managed by company administrators. Use Workspace to answer customer chats.');
    window.location.replace(destination());
  }

  function showMessage(text, type = "") {
    if (!message) return;
    message.textContent = text;
    message.className = `auth-message show ${type}`.trim();
  }

  function setLoading(loading, label) {
    if (!submit) return;
    submit.disabled = loading;
    if (label) submit.textContent = label;
  }

  function safeNext() {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }

  function destination() {
    return safeNext() || "./index.html";
  }

  if (!window.SYNVIO_CONFIGURED || !sb) {
    document.getElementById("dev-notice")?.classList.remove("hidden");
    showMessage("Synvio authentication is temporarily unavailable.");
    return;
  }

  async function redirectIfSignedIn() {
    const { data, error } = await sb.auth.getUser();
    if (!error && data?.user) {
      try { await openWorkspace(data.user); }
      catch (error) { showMessage(error.message, 'error'); }
    }
  }

  if (page === 'login' || page === 'register') redirectIfSignedIn().catch(error => showMessage(error.message, 'error'));

  if (page === "login") {
    const form = document.getElementById("login-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      showMessage("");
      setLoading(true, "Signing in...");

      const email = form.email.value.trim();
      const password = form.password.value;
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await openWorkspace(data.user);
      } catch (error) {
        showMessage(error.message === 'Invalid login credentials'
          ? 'Email or password is incorrect. If you joined through an email link without setting a password, use Set or reset password below.'
          : error.message, "error");
        setLoading(false, "Sign in");
      }
    });
  }

  if (page === 'forgot') {
    document.getElementById('forgot-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      setLoading(true, 'Sending…');
      try {
        const email = document.getElementById('email').value.trim();
        const response = await fetch('/api/request-password-reset', {
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email})
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to send reset email. Try again later.');
        showMessage('If this email has an account, a password-setting link has been submitted. Check your inbox and spam folder.', 'success');
      } catch (error) { showMessage(error.message, 'error'); }
      finally { setLoading(false, 'Send password link'); }
    });
  }

  if (page === 'reset') {
    const form = document.getElementById('reset-form');
    (async () => {
      const { data, error } = await sb.auth.getSession();
      const { data:userData, error:userError } = await sb.auth.getUser();
      if (error || userError || !data.session || !userData.user) {
        showMessage('This link has expired or is incomplete. Request a fresh password link.', 'error');
        submit.disabled = true;
      } else {
        document.getElementById('reset-account').textContent = `Set password for ${userData.user.email}`;
        submit.disabled = false;
      }
    })().catch(error => showMessage(error.message, 'error'));
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const password = document.getElementById('password').value;
      const confirmation = document.getElementById('confirm-password').value;
      if (password.length < 8 || password !== confirmation) {
        showMessage('Use at least 8 characters and enter the same password twice.', 'error');return;
      }
      setLoading(true, 'Saving…');
      try {
        const { error } = await sb.auth.updateUser({password});
        if (error) throw error;
        await sb.auth.signOut({scope:'local'});
        window.location.replace('./login.html?password_set=1');
      } catch (error) { showMessage(error.message, 'error'); setLoading(false, 'Save password'); }
    });
  }

  if (page === "register") {
    const form = document.getElementById("register-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      showMessage("");
      setLoading(true, "Creating workspace...");

      const companyName = form.company.value.trim();
      const fullName = form.name.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;

      if (password.length < 8) {
        showMessage("Use at least 8 characters for the password.", "error");
        setLoading(false, "Create account");
        return;
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login.html?confirmed=1${safeNext() ? "&next="+encodeURIComponent(safeNext()) : ""}`,
          data: {
            full_name: fullName,
            company_name: companyName
          }
        }
      });

      if (error) {
        showMessage(error.message, "error");
        setLoading(false, "Create account");
        return;
      }

      if (data?.session) {
        showMessage("Workspace created. Opening Synvio...", "success");
        window.location.replace(safeNext() ? destination() : "./index.html");
        return;
      }

      showMessage("Account created. Check your email and confirm the address before signing in.", "success");
      form.reset();
      setLoading(false, "Create account");
    });
  }
})();
