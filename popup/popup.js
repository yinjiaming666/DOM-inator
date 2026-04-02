document.addEventListener('DOMContentLoaded', async () => {
  const currentDomainEl = document.getElementById('currentDomain');
  const selectorInput = document.getElementById('selectorInput');
  const pickElementBtn = document.getElementById('pickElementBtn');
  const pickContentBtn = document.getElementById('pickContentBtn');
  const pickContainerBtn = document.getElementById('pickContainerBtn');
  const addRuleBtn = document.getElementById('addRuleBtn');
  const rulesList = document.getElementById('rulesList');
  const globalToggle = document.getElementById('globalToggle');
  const globalToggleText = document.getElementById('globalToggleText');

  const ruleTypeSel = document.getElementById('ruleType');
  const selectorGroup = document.getElementById('selectorInputGroup');
  const contentGroup = document.getElementById('contentInputGroup');
  const keywordInput = document.getElementById('keywordInput');
  const containerInput = document.getElementById('containerInput');

  // 监听规则类型切换
  ruleTypeSel.addEventListener('change', (e) => {
    if (e.target.value === 'selector') {
      selectorGroup.style.display = 'flex';
      contentGroup.style.display = 'none';
    } else {
      selectorGroup.style.display = 'none';
      contentGroup.style.display = 'flex';
      keywordInput.placeholder = e.target.value === 'text' ? '输入要屏蔽的文本内容 (如 张三)' : '输入图片URL片段 (如 ads/banner.jpg)';
    }
    saveFormState();
  });

  // 保存表单状态到 storage
  const saveFormState = () => {
    chrome.storage.local.set({
      popupFormState: {
        ruleType: ruleTypeSel.value,
        selector: selectorInput.value,
        keyword: keywordInput.value,
        container: containerInput.value
      }
    });
  };

  // 监听输入框变化并保存状态
  selectorInput.addEventListener('input', saveFormState);
  keywordInput.addEventListener('input', saveFormState);
  containerInput.addEventListener('input', saveFormState);

  // 更新当前域名的函数
  const updateDomainInfo = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        // 排除受限页面
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
          domain = '受限页面';
        } else {
          const url = new URL(tab.url);
          domain = url.hostname;
        }
      } else {
        domain = '未知页面';
      }
    } catch (e) {
      console.error('获取域名失败', e);
      domain = '未知页面';
    }
    currentDomainEl.textContent = domain;
    loadRules(domain);
  };

  // 初始加载域名和规则
  updateDomainInfo();

  // 初始化全局开关状态
  chrome.storage.local.get(['globalToggleState'], (result) => {
    // 默认是开启的 (undefined 时视为 true)
    const isEnabled = result.globalToggleState !== false;
    globalToggle.checked = isEnabled;
    globalToggleText.textContent = isEnabled ? '已开启' : '已暂停';
    globalToggleText.style.color = isEnabled ? '#1a73e8' : '#888';
  });

  // 监听全局开关切换
  globalToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    globalToggleText.textContent = isEnabled ? '已开启' : '已暂停';
    globalToggleText.style.color = isEnabled ? '#1a73e8' : '#888';
    
    // 保存状态到 storage，content script 会监听到这个变化
    chrome.storage.local.set({ globalToggleState: isEnabled });
  });

  // 恢复之前保存的表单状态
  chrome.storage.local.get(['popupFormState'], (result) => {
    if (result.popupFormState) {
      const state = result.popupFormState;
      ruleTypeSel.value = state.ruleType || 'selector';
      selectorInput.value = state.selector || '';
      keywordInput.value = state.keyword || '';
      containerInput.value = state.container || '';
      
      // 触发一下 change 事件来更新 UI 的显示/隐藏
      ruleTypeSel.dispatchEvent(new Event('change'));
    }
  });

  // 监听 Tab 切换事件
  chrome.tabs.onActivated.addListener(() => {
    updateDomainInfo();
  });

  // 监听 Tab URL 更新事件 (处理同一个 Tab 内的跳转)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) {
      updateDomainInfo();
    }
  });

  let domain = '未知域名';

  // 渲染规则列表
  const loadRules = (targetDomain = domain) => {
    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      const domainRules = allRules[targetDomain] || [];
      
      rulesList.innerHTML = '';
      if (domainRules.length === 0) {
        rulesList.innerHTML = '<li class="empty">暂无屏蔽规则</li>';
        return;
      }

      domainRules.forEach((rule, index) => {
        const li = document.createElement('li');
        li.className = 'rule-item';
        
        // 兼容旧版本的纯字符串规则
        const ruleObj = typeof rule === 'string' ? { type: 'selector', keyword: rule } : rule;
        let typeText = '选择器';
        if (ruleObj.type === 'text') typeText = '文本';
        if (ruleObj.type === 'image') typeText = '图片';

        const text = document.createElement('div');
        text.className = 'rule-text';
        text.innerHTML = `<span style="color:#1a73e8; font-weight:bold;">[${typeText}]</span> ${ruleObj.keyword} 
                          ${ruleObj.container && ruleObj.container !== '*' ? `<br><small style="color:#888;">容器: ${ruleObj.container}</small>` : ''}`;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'del-btn';
        delBtn.textContent = '删除';
        delBtn.onclick = () => deleteRule(index);

        li.appendChild(text);
        li.appendChild(delBtn);
        rulesList.appendChild(li);
      });
    });
  };

  // 添加规则
  addRuleBtn.addEventListener('click', () => {
    const type = ruleTypeSel.value;
    let newRule = null;

    if (type === 'selector') {
      const selector = selectorInput.value.trim();
      if (!selector) return;

      // 简单验证选择器是否合法
      try {
        document.createDocumentFragment().querySelector(selector);
      } catch (e) {
        alert('无效的 CSS 选择器！');
        return;
      }
      newRule = { type: 'selector', keyword: selector };
    } else {
      const keyword = keywordInput.value.trim();
      const container = containerInput.value.trim();
      
      if (!keyword) {
        alert('请输入要屏蔽的内容或链接片段！');
        return;
      }
      
      if (container) {
        try {
          document.createDocumentFragment().querySelector(container);
        } catch (e) {
          alert('无效的父容器 CSS 选择器！');
          return;
        }
      }
      newRule = { type, keyword, container: container || '*' };
    }

    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      if (!allRules[domain]) {
        allRules[domain] = [];
      }
      
      // 判断是否已存在相同规则
      const exists = allRules[domain].some(r => {
        const rObj = typeof r === 'string' ? { type: 'selector', keyword: r } : r;
        return rObj.type === newRule.type && rObj.keyword === newRule.keyword && rObj.container === newRule.container;
      });

      if (!exists) {
        allRules[domain].push(newRule);
        chrome.storage.local.set({ domRules: allRules }, () => {
          selectorInput.value = '';
          keywordInput.value = '';
          containerInput.value = '';
          saveFormState(); // 添加成功后清空状态
          loadRules();
        });
      } else {
        alert('该规则已存在！');
      }
    });
  });

  // 删除规则
  const deleteRule = (index) => {
    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      if (allRules[domain]) {
        allRules[domain].splice(index, 1);
        chrome.storage.local.set({ domRules: allRules }, loadRules);
      }
    });
  };

  // 初始化加载 (已被 updateDomainInfo 替代，这里删除冗余的调用)
  // loadRules();

  // 监听来自 content script 的消息（获取用户选择的元素）
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "elementSelected") {
      // 在 Side Panel 模式下，面板不会关闭，直接回填数据
      const { targetInput, value, pickType } = request;
      
      if (targetInput === 'selector') {
        ruleTypeSel.value = 'selector';
        selectorGroup.style.display = 'flex';
        contentGroup.style.display = 'none';
        selectorInput.value = value;
      } 
      else if (targetInput === 'keyword') {
        ruleTypeSel.value = pickType;
        selectorGroup.style.display = 'none';
        contentGroup.style.display = 'flex';
        keywordInput.placeholder = pickType === 'text' ? '输入要屏蔽的文本内容 (如 张三)' : '输入图片URL片段 (如 ads/banner.jpg)';
        keywordInput.value = value;
      } 
      else if (targetInput === 'container') {
        selectorGroup.style.display = 'none';
        contentGroup.style.display = 'flex';
        containerInput.value = value;
      }
      
      saveFormState(); // 更新并保存新状态
    }
  });

  const triggerPicker = async (pickType, targetInput) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        // 排除受限页面
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
          console.warn('无法在此类型的页面上使用拾取功能。请在普通的网页上使用。');
          return;
        }

        const sendMessage = () => {
          chrome.tabs.sendMessage(tab.id, { action: "startPicking", pickType, targetInput })
            .catch((err) => {
              console.warn('⚠️ 消息发送失败，即使尝试了重新注入:', err.message);
            });
        };

        // 尝试发送一个探测消息，检查 content script 是否活跃
        chrome.tabs.sendMessage(tab.id, { action: "ping" }).then(() => {
          // 收到响应或没报错，说明 content script 已经存在，直接发真正的消息
          sendMessage();
        }).catch(async () => {
          // 如果报错，说明网页没刷新，content script 失效了。我们尝试自动给它注入！
          console.log('检测到网页未注入脚本，正在尝试自动注入...');
          try {
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ["content/content.css"]
            });
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content/content.js"]
            });
            // 注入完成后，稍微等一下让脚本初始化，然后再发消息
            setTimeout(sendMessage, 100);
          } catch (injectErr) {
            // 将 error 降级为 warn，因为它只是不能注入，不影响插件的其他功能
            console.warn('⚠️ 无法在此页面自动注入脚本 (通常是因为没有访问该域名的权限)。请尝试手动刷新网页。', injectErr.message);
          }
        });
      }
    } catch (e) {
      console.error('发送选择消息失败:', e);
    }
  };

  // 开启页面选择器 (选择器模式)
  pickElementBtn.addEventListener('click', () => triggerPicker('selector', 'selector'));

  // 开启页面选择器 (提取文本/图片模式)
  pickContentBtn.addEventListener('click', () => triggerPicker(ruleTypeSel.value, 'keyword'));

  // 开启页面选择器 (提取父容器模式，统一使用 CSS 选择器逻辑)
  pickContainerBtn.addEventListener('click', () => triggerPicker('selector', 'container'));
});
