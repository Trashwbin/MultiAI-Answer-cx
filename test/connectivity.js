const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', color: '#4D6BFE', domain: 'chat.deepseek.com', enabled: true },
  { id: 'kimi', name: 'Kimi', color: '#1A73E8', domain: 'kimi.moonshot.cn', enabled: true },
  { id: 'chatgpt', name: 'ChatGPT', color: '#10A37F', domain: 'chatgpt.com', enabled: true },
  { id: 'gemini', name: 'Gemini', color: '#4285F4', domain: 'gemini.google.com', enabled: true },
  { id: 'doubao', name: '豆包', color: '#FF6B35', domain: 'doubao.com', enabled: true },
  { id: 'grok', name: 'Grok', color: '#000000', domain: 'grok.com', enabled: true },
  { id: 'qwen-cn', name: '通义千问', color: '#FF6A00', domain: 'qianwen.com', enabled: true },
  { id: 'chatglm', name: '智谱清言', color: '#36B37E', domain: 'chatglm.cn', enabled: true },
];

function sendMsg(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function log(text, level) {
  level = level || 'info';
  const body = document.getElementById('consoleBody');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + level;

  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  entry.innerHTML = '<span class="log-time">' + time + '</span>' + escapeHtml(text);

  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildProviderCards() {
  var grid = document.getElementById('providerGrid');

  PROVIDERS.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'provider-card' + (p.enabled ? '' : ' disabled');
    card.id = 'card-' + p.id;

    card.innerHTML =
      '<div class="card-header">' +
        '<div class="card-header-left">' +
          '<span class="provider-dot" style="background:' + p.color + '"></span>' +
          '<span class="provider-name">' + p.name + '</span>' +
          '<span class="provider-id">' + p.id + '</span>' +
        '</div>' +
        '<div class="card-header-right">' +
          '<span class="auth-badge" id="auth-' + p.id + '">--</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="btn btn-primary btn-check-auth" data-id="' + p.id + '">检查登录</button>' +
        '<button class="btn btn-warning btn-login" data-id="' + p.id + '">去登录</button>' +
        '<button class="btn btn-success btn-test" data-id="' + p.id + '">测试连通</button>' +
        '<button class="btn btn-secondary btn-debug-cookies" data-id="' + p.id + '">查看Cookies</button>' +
        '<button class="btn btn-secondary btn-clear-creds" data-id="' + p.id + '">清除缓存</button>' +
      '</div>' +
      '<div class="card-result" id="result-' + p.id + '">' +
        '<span class="result-placeholder">等待测试...</span>' +
      '</div>';

    grid.appendChild(card);
  });
}

function setAuthBadge(providerId, status) {
  var badge = document.getElementById('auth-' + providerId);
  if (!badge) return;

  badge.className = 'auth-badge ' + status;

  var labels = {
    checking: '检查中...',
    authenticated: '已登录',
    unauthenticated: '未登录',
    expired: '已过期',
    error: '错误',
  };

  badge.textContent = labels[status] || status;
}

function setResult(providerId, html) {
  var el = document.getElementById('result-' + providerId);
  if (el) el.innerHTML = html;
}

function setResultLoading(providerId) {
  setResult(providerId, '<span class="spinner"></span> 请求中...');
}

async function checkAuth(providerId) {
  setAuthBadge(providerId, 'checking');
  log('[' + providerId + '] 检查登录状态...');

  try {
    var resp = await sendMsg({ type: 'AUTH_STATUS', providerId: providerId });
    if (resp && resp.success) {
      setAuthBadge(providerId, resp.status);
      log('[' + providerId + '] 登录状态: ' + resp.status, resp.status === 'authenticated' ? 'success' : 'warn');
    } else {
      setAuthBadge(providerId, 'error');
      log('[' + providerId + '] 检查失败: ' + (resp && resp.error || 'unknown'), 'error');
    }
  } catch (err) {
    setAuthBadge(providerId, 'error');
    log('[' + providerId + '] 检查异常: ' + err.message, 'error');
  }
}

async function checkAllAuth() {
  log('=== 批量检查所有 Provider 登录状态 ===');

  try {
    var resp = await sendMsg({ type: 'AUTH_STATUS_ALL' });
    if (resp && resp.success && resp.statuses) {
      Object.keys(resp.statuses).forEach(function (id) {
        setAuthBadge(id, resp.statuses[id]);
        log('[' + id + '] ' + resp.statuses[id], resp.statuses[id] === 'authenticated' ? 'success' : 'warn');
      });
    } else {
      log('批量检查失败: ' + (resp && resp.error || 'unknown'), 'error');
    }
  } catch (err) {
    log('批量检查异常: ' + err.message, 'error');
  }
}

async function loginProvider(providerId) {
  log('[' + providerId + '] 发起登录引导...');

  try {
    var resp = await sendMsg({ type: 'AUTH_LOGIN', providerId: providerId });
    if (resp && resp.success) {
      log('[' + providerId + '] 登录窗口已打开，请在新标签页完成登录', 'success');
    } else {
      log('[' + providerId + '] 登录失败: ' + (resp && resp.error || 'unknown'), 'error');
    }
  } catch (err) {
    log('[' + providerId + '] 登录异常: ' + err.message, 'error');
  }
}

async function testProvider(providerId) {
  var question = document.getElementById('testQuestion').value.trim();
  if (!question) {
    log('请输入测试问题', 'warn');
    return;
  }

  setResultLoading(providerId);
  log('[' + providerId + '] 发送测试请求: ' + question.substring(0, 50) + '...');

  try {
    var resp = await sendMsg({
      type: 'TEST_PROVIDER',
      providerId: providerId,
      question: question,
    });

    if (!resp) {
      setResult(providerId, '<div class="result-error">No response from Service Worker</div>');
      log('[' + providerId + '] 无响应', 'error');
      return;
    }

    var timing = '<div class="result-timing">耗时: ' + (resp.elapsed || 0) + 'ms</div>';

    if (resp.success) {
      var answersHtml = '';
      if (resp.answers && resp.answers.length > 0) {
        answersHtml = '<div class="result-answers">';
        resp.answers.forEach(function (a) {
          var answerText = Array.isArray(a.answer) ? a.answer.join(', ') : a.answer;
          answersHtml +=
            '<div class="result-answer-item">' +
              '<span class="result-answer-q">Q' + escapeHtml(a.questionNumber) + ':</span>' +
              '<span class="result-answer-a">' + escapeHtml(answerText) + '</span>' +
            '</div>';
        });
        answersHtml += '</div>';
      }

      var errorNote = '';
      if (resp.error) {
        errorNote = '<div class="result-error" style="margin-top:6px;">Parse warning: ' + escapeHtml(resp.error) + '</div>';
      }

      var rawHtml = '';
      if (resp.rawText) {
        var rawPreview = resp.rawText.length > 2000 ? resp.rawText.substring(0, 2000) + '...' : resp.rawText;
        rawHtml = '<div class="result-raw">' + escapeHtml(rawPreview) + '</div>';
      }

      setResult(providerId, timing + '<div class="result-success">OK</div>' + answersHtml + errorNote + rawHtml);
      log('[' + providerId + '] 成功! ' + (resp.answers ? resp.answers.length : 0) + ' answers, ' + (resp.elapsed || 0) + 'ms', 'success');
    } else {
      setResult(providerId, timing + '<div class="result-error">' + escapeHtml(resp.error || 'Unknown error') + '</div>');
      log('[' + providerId + '] 失败: ' + (resp.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    setResult(providerId, '<div class="result-error">Exception: ' + escapeHtml(err.message) + '</div>');
    log('[' + providerId + '] 异常: ' + err.message, 'error');
  }
}

async function testAll() {
  var enabledProviders = PROVIDERS.filter(function (p) { return p.enabled; });
  log('=== 批量测试 ' + enabledProviders.length + ' 个 Provider ===');

  enabledProviders.forEach(function (p) {
    setResultLoading(p.id);
  });

  var promises = enabledProviders.map(function (p) {
    return testProvider(p.id);
  });

  await Promise.allSettled(promises);
  log('=== 批量测试完成 ===');
}

function clearAll() {
  PROVIDERS.forEach(function (p) {
    setResult(p.id, '<span class="result-placeholder">等待测试...</span>');
  });
  log('结果已清除');
}

function clearConsole() {
  document.getElementById('consoleBody').innerHTML = '';
}

async function debugCookies(providerId) {
  log('[' + providerId + '] 查看 Cookies...');
  setResult(providerId, '<span class="spinner"></span> 查询中...');

  try {
    var resp = await sendMsg({ type: 'DEBUG_COOKIES', providerId: providerId });

    if (resp && resp.success) {
      var names = resp.cookieNames || [];
      var storedKeys = resp.storedCookieKeys || [];
      var hasBearer = !!resp.storedBearer;

      log('[' + providerId + '] cookies=' + names.length + ', stored=' + storedKeys.length + ', bearer=' + (hasBearer ? 'yes' : 'no'), names.length > 0 ? 'success' : 'warn');

      var html = '<div class="result-timing">';
      html += 'Browser Cookies: ' + names.length;
      html += ' | Stored Keys: ' + storedKeys.length;
      html += ' | Bearer: ' + (hasBearer ? '<span style="color:#52c41a">' + escapeHtml(resp.storedBearer) + '</span>' : '<span style="color:#ff4d4f">无</span>');
      html += '</div>';

      if (storedKeys.length > 0 && storedKeys.length !== names.length) {
        html += '<div style="font-size:12px;color:#1890ff;margin-bottom:4px;">已存储凭证: ' + escapeHtml(storedKeys.join(', ')) + '</div>';
      }

      if (names.length === 0) {
        html += '<div class="result-error">未找到任何 Cookie — 请确认已在浏览器中登录该网站</div>';
      } else {
        html += '<div class="result-raw">';
        names.forEach(function (name) {
          var val = resp.cookies[name] || '';
          var preview = val.length > 80 ? val.substring(0, 80) + '...' : val;
          html += escapeHtml(name) + ' = ' + escapeHtml(preview) + '\n';
        });
        html += '</div>';
      }
      setResult(providerId, html);
    } else {
      setResult(providerId, '<div class="result-error">' + escapeHtml(resp && resp.error || 'Unknown') + '</div>');
      log('[' + providerId + '] 查看失败: ' + (resp && resp.error || 'Unknown'), 'error');
    }
  } catch (err) {
    setResult(providerId, '<div class="result-error">Exception: ' + escapeHtml(err.message) + '</div>');
    log('[' + providerId + '] 查看异常: ' + err.message, 'error');
  }
}

async function clearProviderCreds(providerId) {
  log('[' + providerId + '] 清除缓存凭证...');
  try {
    var resp = await sendMsg({ type: 'AUTH_LOGOUT', providerId: providerId });
    if (resp && resp.success) {
      setAuthBadge(providerId, 'unauthenticated');
      setResult(providerId, '<span class="result-placeholder">缓存已清除，请重新检查登录</span>');
      log('[' + providerId + '] 缓存已清除', 'success');
    } else {
      log('[' + providerId + '] 清除失败: ' + (resp && resp.error || 'Unknown'), 'error');
    }
  } catch (err) {
    log('[' + providerId + '] 清除异常: ' + err.message, 'error');
  }
}

async function clearAllCreds() {
  log('=== 清除所有缓存凭证 ===');
  try {
    var resp = await sendMsg({ type: 'CLEAR_ALL_CREDENTIALS' });
    if (resp && resp.success) {
      PROVIDERS.forEach(function (p) {
        setAuthBadge(p.id, 'unauthenticated');
        setResult(p.id, '<span class="result-placeholder">缓存已清除</span>');
      });
      log('所有缓存已清除', 'success');
    } else {
      log('清除失败: ' + (resp && resp.error || 'Unknown'), 'error');
    }
  } catch (err) {
    log('清除异常: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  buildProviderCards();

  document.getElementById('btnCheckAllAuth').addEventListener('click', checkAllAuth);
  document.getElementById('btnTestAll').addEventListener('click', testAll);
  document.getElementById('btnClearAll').addEventListener('click', clearAll);
  document.getElementById('btnClearConsole').addEventListener('click', clearConsole);
  document.getElementById('btnClearAllCreds').addEventListener('click', clearAllCreds);

  document.getElementById('providerGrid').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;

    var id = btn.getAttribute('data-id');

    if (btn.classList.contains('btn-check-auth')) {
      checkAuth(id);
    } else if (btn.classList.contains('btn-login')) {
      loginProvider(id);
    } else if (btn.classList.contains('btn-test')) {
      testProvider(id);
    } else if (btn.classList.contains('btn-debug-cookies')) {
      debugCookies(id);
    } else if (btn.classList.contains('btn-clear-creds')) {
      clearProviderCreds(id);
    }
  });

  log('连通性测试页面已加载');
  checkAllAuth();
});
