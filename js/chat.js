// site/js/chat.js — FAB toggle + DeepSeek SSE client
(() => {
  const fab = document.getElementById('chat-fab');
  if (!fab) return;

  const button   = fab.querySelector('.chat-fab-button');
  const panel    = fab.querySelector('.chat-panel');
  const closeBtn = fab.querySelector('.chat-close');
  const log      = fab.querySelector('.chat-messages');
  const form     = fab.querySelector('.chat-input');
  const input    = form.querySelector('input[name=q]');
  const sendBtn  = form.querySelector('.chat-send');

  const API = '/api/chat';

  // --- Open / close ---
  function open() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('on'));
    if (!log.childElementCount) greet();
    setTimeout(() => input.focus(), 180);
  }
  function close() {
    panel.classList.remove('on');
    button.setAttribute('aria-expanded', 'false');
    setTimeout(() => { panel.hidden = true; }, 220);
  }
  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  // --- Render helpers ---
  function addMessage(role, text = '') {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-' + role;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function addTyping() {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-assistant chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function greet() {
    addMessage('assistant',
      '你好,我是 AOI 智能助手。可以问我关于工业视觉检测、标杆案例、方法论或合作方式 —— 随便问。');
  }

  // --- Send ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    addMessage('user', text);
    const typing = addTyping();
    let aiEl = null;

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: { current_path: location.pathname },
        }),
      });

      if (!res.ok) {
        typing.remove();
        const msg = await res.json().catch(() => ({ message: '请求失败' }));
        addMessage('assistant', '⚠ ' + (msg.message || '未知错误'));
        return;
      }
      if (!res.body) {
        typing.remove();
        addMessage('assistant', '⚠ 连接异常');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let started = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(s.slice(6));
            if (parsed.token) {
              if (!started) {
                typing.remove();
                aiEl = addMessage('assistant', '');
                started = true;
              }
              aiEl.textContent += parsed.token;
              log.scrollTop = log.scrollHeight;
            }
            if (parsed.error) {
              if (!started) {
                typing.remove();
                aiEl = addMessage('assistant', '');
                started = true;
              }
              aiEl.textContent += '\n⚠ ' + parsed.error;
            }
          } catch { /* skip malformed */ }
        }
      }

      // No tokens received at all
      if (!started) {
        typing.remove();
        addMessage('assistant', '⚠ 未收到回复');
      }
    } catch (err) {
      typing.remove();
      addMessage('assistant', '⚠ 网络错误: ' + err.message);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });
})();
