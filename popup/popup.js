document.addEventListener('DOMContentLoaded', async () => {
  const currentDomainEl = document.getElementById('currentDomain');
  const keywordInput = document.getElementById('keywordInput');
  const containerInput = document.getElementById('containerInput');
  const textMatchInput = document.getElementById('textMatchInput');
  const pickContentBtn = document.getElementById('pickContentBtn');
  const pickTextMatchBtn = document.getElementById('pickTextMatchBtn');
  const pickContainerBtn = document.getElementById('pickContainerBtn');
  const addRuleBtn = document.getElementById('addRuleBtn');
  const rulesList = document.getElementById('rulesList');
  const globalToggle = document.getElementById('globalToggle');
  const globalToggleText = document.getElementById('globalToggleText');

  const ruleTypeSel = document.getElementById('ruleType');
  const keywordPreview = document.getElementById('keywordPreview');
  const containerPreview = document.getElementById('containerPreview');
  const textMatchGroup = document.getElementById('textMatchGroup');
  const textMatchPreview = document.getElementById('textMatchPreview');
  const rulesListTitle = document.getElementById('rulesListTitle');

  let currentScope = 'domain'; // 'domain' or 'global'
  const GLOBAL_KEY = '__global__';

  // 监听 Tab 切换
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // 样式重置
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.boxShadow = 'none';
        b.style.fontWeight = 'normal';
        b.style.color = '#5f6368';
      });
      
      const targetBtn = e.target;
      targetBtn.classList.add('active');
      targetBtn.style.background = '#fff';
      targetBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      targetBtn.style.fontWeight = 'bold';
      targetBtn.style.color = '#1a73e8';

      currentScope = targetBtn.dataset.scope;
      
      // 更新按钮和标题文本
      addRuleBtn.textContent = currentScope === 'domain' ? '添加到当前域名' : '添加到全局规则';
      rulesListTitle.textContent = currentScope === 'domain' ? '当前域名的屏蔽规则：' : '全局屏蔽规则 (所有网站生效)：';
      
      // 重新加载对应作用域的规则
      loadRules();
    });
  });

  // 监听规则类型切换
  ruleTypeSel.addEventListener('change', (e) => {
    // 检查是否是由用户手动触发的切换，而不是代码中 dispatchEvent 触发的
    if (e.isTrusted) {
      keywordInput.value = '';
      containerInput.value = '';
      textMatchInput.value = '';
    }
    
    if (e.target.value === 'text') {
      keywordInput.placeholder = '输入要屏蔽的文本内容 (如 张三)';
      textMatchGroup.style.display = 'none';
    } else if (e.target.value === 'selector') {
      keywordInput.placeholder = '输入CSS选择器 (如 .ad-banner)';
      textMatchGroup.style.display = 'none';
    } else if (e.target.value === 'selector_text') {
      keywordInput.placeholder = '输入目标元素的 CSS选择器 (如 .ad-banner)';
      textMatchGroup.style.display = 'flex';
    } else if (e.target.value === 'image') {
      keywordInput.placeholder = '输入图片URL片段 (如 ads/banner.jpg)';
      textMatchGroup.style.display = 'none';
    }
    saveFormState();
  });

  // 保存表单状态到 storage
  const saveFormState = () => {
    chrome.storage.local.set({
      popupFormState: {
        ruleType: ruleTypeSel.value,
        keyword: keywordInput.value,
        textMatch: textMatchInput.value,
        container: containerInput.value
      }
    });
    updatePreviews();
  };

  // 监听输入框变化并保存状态
  keywordInput.addEventListener('input', saveFormState);
  textMatchInput.addEventListener('input', saveFormState);
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
      ruleTypeSel.value = state.ruleType || 'text'; // 默认设为文本
      keywordInput.value = state.keyword || '';
      textMatchInput.value = state.textMatch || '';
      containerInput.value = state.container || '';
      
      // 触发一下 change 事件来更新 placeholder 的显示
      ruleTypeSel.dispatchEvent(new Event('change'));
    } else {
      ruleTypeSel.value = 'text';
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
      const targetKey = currentScope === 'domain' ? targetDomain : GLOBAL_KEY;
      const scopeRules = allRules[targetKey] || [];
      
      rulesList.innerHTML = '';
      if (scopeRules.length === 0) {
        rulesList.innerHTML = '<li class="empty">暂无屏蔽规则</li>';
        return;
      }

      scopeRules.forEach((rule, index) => {
        const li = document.createElement('li');
        li.className = 'rule-item';
        
        // 兼容旧版本的纯字符串规则
        const ruleObj = typeof rule === 'string' ? { type: 'selector', keyword: rule } : rule;
        let typeText = '选择器';
        if (ruleObj.type === 'text') typeText = '文本';
        if (ruleObj.type === 'image') typeText = '图片';
        if (ruleObj.type === 'selector_text') typeText = 'CSS+文本';

        const text = document.createElement('div');
        text.className = 'rule-text';
        
        let extraInfo = '';
        if (ruleObj.type === 'selector_text' && ruleObj.textMatch) {
          extraInfo += `<br><small style="color:#e67c73;">必须包含: ${ruleObj.textMatch}</small>`;
        }
        if (ruleObj.container && ruleObj.container !== '*') {
          extraInfo += `<br><small style="color:#888;">容器: ${ruleObj.container}</small>`;
        }
        
        text.innerHTML = `<span style="color:#1a73e8; font-weight:bold;">[${typeText}]</span> ${ruleObj.keyword} ${extraInfo}`;
        
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'switch';
        toggleLabel.style.cssText = 'display: flex; align-items: center; font-size: 12px; cursor: pointer; gap: 4px;';
        
        const isEnabled = ruleObj.enabled !== false; // 默认为 true
        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.checked = isEnabled;
        toggleCheckbox.style.accentColor = '#1a73e8';
        toggleCheckbox.style.cursor = 'pointer';
        
        const toggleText = document.createElement('span');
        toggleText.textContent = isEnabled ? '开启' : '关闭';
        toggleText.style.color = isEnabled ? '#1a73e8' : '#888';

        toggleCheckbox.addEventListener('change', (e) => {
          toggleRule(index, e.target.checked);
        });

        toggleLabel.appendChild(toggleCheckbox);
        toggleLabel.appendChild(toggleText);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'del-btn';
        delBtn.textContent = '删除';
        delBtn.onclick = () => deleteRule(index);

        controlsDiv.appendChild(toggleLabel);
        controlsDiv.appendChild(delBtn);

        // 如果规则被禁用，给整行加个透明度
        if (!isEnabled) {
          li.style.opacity = '0.6';
        }

        li.appendChild(text);
        li.appendChild(controlsDiv);
        rulesList.appendChild(li);
      });
    });
  };

  // 添加规则
  addRuleBtn.addEventListener('click', () => {
    const type = ruleTypeSel.value;
    const keyword = keywordInput.value.trim();
    const textMatch = textMatchInput.value.trim();
    const container = containerInput.value.trim();
    
    if (!keyword) {
      console.warn('请输入要屏蔽的内容或特征！');
      return;
    }
    
    if (type === 'selector_text' && !textMatch) {
      console.warn('请输入必须包含的文本！');
      return;
    }
    
    if (type === 'selector' || type === 'selector_text') {
      try {
        document.createDocumentFragment().querySelector(keyword);
      } catch (e) {
        console.warn('无效的 CSS 选择器！');
        return;
      }
    }
    
    if (container) {
      try {
        document.createDocumentFragment().querySelector(container);
      } catch (e) {
        console.warn('无效的父容器 CSS 选择器！');
        return;
      }
    }
    
    const newRule = { type, keyword, textMatch, container: container || '*' };

    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      const targetKey = currentScope === 'domain' ? domain : GLOBAL_KEY;
      
      if (!allRules[targetKey]) {
        allRules[targetKey] = [];
      }
      
      // 判断是否已存在相同规则
      const exists = allRules[targetKey].some(r => {
        const rObj = typeof r === 'string' ? { type: 'selector', keyword: r, container: '*', textMatch: '' } : r;
        return rObj.type === newRule.type && 
               rObj.keyword === newRule.keyword && 
               (rObj.textMatch || '') === (newRule.textMatch || '') && 
               (rObj.container || '*') === newRule.container;
      });

      if (!exists) {
        allRules[targetKey].push(newRule);
        chrome.storage.local.set({ domRules: allRules }, () => {
          keywordInput.value = '';
          textMatchInput.value = '';
          containerInput.value = '';
          saveFormState(); // 添加成功后清空状态
          loadRules();
        });
      } else {
        console.warn('该规则已存在！');
      }
    });
  });

  // 删除规则
  const deleteRule = (index) => {
    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      const targetKey = currentScope === 'domain' ? domain : GLOBAL_KEY;
      
      if (allRules[targetKey]) {
        allRules[targetKey].splice(index, 1);
        chrome.storage.local.set({ domRules: allRules }, loadRules);
      }
    });
  };

  // 开启/关闭单个规则
  const toggleRule = (index, isEnabled) => {
    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      const targetKey = currentScope === 'domain' ? domain : GLOBAL_KEY;
      
      if (allRules[targetKey] && allRules[targetKey][index]) {
        const rule = allRules[targetKey][index];
        // 如果是老字符串格式，先转成对象
        if (typeof rule === 'string') {
          allRules[targetKey][index] = { type: 'selector', keyword: rule, enabled: isEnabled };
        } else {
          allRules[targetKey][index].enabled = isEnabled;
        }
        chrome.storage.local.set({ domRules: allRules }, loadRules);
      }
    });
  };

  // 初始化加载 (已被 updateDomainInfo 替代，这里删除冗余的调用)
  // loadRules();

  // 监听来自 content script 的消息（获取用户选择的元素）
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "elementSelected") {
      const { targetInput, value, pickType } = request;
      
      if (targetInput === 'keyword') {
        // 如果当前是 selector_text 模式，并且 pickType 提取出来是 selector，则保留 selector_text 模式
        if (ruleTypeSel.value === 'selector_text' && pickType === 'selector') {
          // 不改变 ruleTypeSel
        } else {
          ruleTypeSel.value = pickType;
        }
        keywordInput.value = value;
      } else if (targetInput === 'textMatch') {
        textMatchInput.value = value;
      } else if (targetInput === 'container') {
        containerInput.value = value;
      }
      
      ruleTypeSel.dispatchEvent(new Event('change'));
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

  // 开启页面选择器 (提取文本/图片/选择器模式)
  pickContentBtn.addEventListener('click', () => {
    const pType = ruleTypeSel.value === 'selector_text' ? 'selector' : ruleTypeSel.value;
    triggerPicker(pType, 'keyword');
  });

  pickTextMatchBtn.addEventListener('click', () => triggerPicker('text', 'textMatch'));

  // 开启页面选择器 (提取父容器模式，统一使用 CSS 选择器逻辑)
  pickContainerBtn.addEventListener('click', () => triggerPicker('selector', 'container'));
});
