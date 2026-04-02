document.addEventListener('DOMContentLoaded', async () => {
  const currentDomainEl = document.getElementById('currentDomain');
  const selectorInput = document.getElementById('selectorInput');
  const pickElementBtn = document.getElementById('pickElementBtn');
  const pickContentBtn = document.getElementById('pickContentBtn');
  const pickContainerBtn = document.getElementById('pickContainerBtn');
  const addRuleBtn = document.getElementById('addRuleBtn');
  const rulesList = document.getElementById('rulesList');

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

  let domain = '未知域名';

  // 获取当前标签页域名
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      domain = url.hostname;
    }
  } catch (e) {
    console.error('获取域名失败', e);
  }
  currentDomainEl.textContent = domain;

  // 渲染规则列表
  const loadRules = () => {
    chrome.storage.local.get(['domRules'], (result) => {
      const allRules = result.domRules || {};
      const domainRules = allRules[domain] || [];
      
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

  // 初始化加载
  loadRules();

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

  // 初始化加载
  loadRules();
  
  // 检查是否有刚刚拾取返回的数据
  chrome.storage.local.get(['popupFormState'], (result) => {
    // 1. 先恢复基本状态
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
  const triggerPicker = async (pickType, targetInput) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "startPicking", pickType, targetInput });
        // 注意：因为现在是 Side Panel 侧边栏模式，我们千万不能调用 window.close()
        // 这样侧边栏就会一直保持打开，用户选择后能直接看到回填效果！
      }
    } catch (e) {
      console.error('发送选择消息失败:', e);
      alert('无法连接到当前页面，请刷新页面后重试。');
    }
  };

  // 开启页面选择器 (选择器模式)
  pickElementBtn.addEventListener('click', () => triggerPicker('selector', 'selector'));

  // 开启页面选择器 (提取文本/图片模式)
  pickContentBtn.addEventListener('click', () => triggerPicker(ruleTypeSel.value, 'keyword'));

  // 开启页面选择器 (提取父容器模式，统一使用 CSS 选择器逻辑)
  pickContainerBtn.addEventListener('click', () => triggerPicker('selector', 'container'));
});
