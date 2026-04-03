let currentRules = [];
let observer = null;
let isPickingMode = false;
let hoveredElement = null;
let currentPickType = 'selector'; // 'selector', 'text', 'image'
let currentTargetInput = 'selector'; // 标记回传给哪个输入框
let temporarilyUnblockedElements = new Set(); // 记录用户点击“暂时显示”的元素
let isGlobalEnabled = true; // 全局屏蔽开关状态

// 生成通用 CSS 选择器的辅助函数（移除 nth-child 限制，实现一次屏蔽同类元素）
const generateSelector = (el) => {
  if (el.tagName.toLowerCase() === 'html') return 'html';
  if (el.id) return `#${el.id}`;

  let selector = el.tagName.toLowerCase();
  
  if (el.className && typeof el.className === 'string') {
    // 过滤掉扩展添加的类名和一些常见的表示状态的动态类名（如 active, hover 等，可选）
    const classes = el.className.split(/\s+/).filter(c => 
      c && 
      !c.includes('extension-picker') && 
      !c.includes('extension-blocked')
    );
    if (classes.length > 0) {
      selector += `.${classes.join('.')}`;
    }
  }

  // 为了让选择器更精确，但又不至于像 nth-child 那样只能匹配一个
  // 我们可以向上寻找有 id 的父元素，或者直接返回 tag.class 组合
  // 这里我们选择返回最通用的 tag.class 组合，这样就能匹配所有同类广告/评论了
  
  return selector;
};

// --- DOM 选择器交互逻辑 (全屏快照遮罩方案) ---
let overlaySvg = null;
let pickerToolbar = null;
let pickerTooltip = null;

const createOverlay = () => {
  // 创建覆盖全屏的 SVG 遮罩层
  overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlaySvg.id = 'extension-picker-overlay';
  overlaySvg.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483646; cursor: crosshair;
  `;
  overlaySvg.innerHTML = `
    <defs>
      <mask id="picker-mask">
        <rect width="100%" height="100%" fill="white" />
        <rect id="picker-hole" x="0" y="0" width="0" height="0" fill="black" />
      </mask>
    </defs>
    <!-- 半透明黑色背景，挖空部分通过 mask 实现 -->
    <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#picker-mask)" />
    <!-- 蓝色高亮边框 -->
    <rect id="picker-outline" x="0" y="0" width="0" height="0" fill="none" stroke="#1a73e8" stroke-width="3" />
  `;
  document.documentElement.appendChild(overlaySvg);

  // 创建顶部提示和取消工具栏
  pickerToolbar = document.createElement('div');
  pickerToolbar.id = 'extension-picker-toolbar';
  pickerToolbar.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    z-index: 2147483647; background: #fff; padding: 12px 24px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    display: flex; gap: 16px; align-items: center; font-family: sans-serif;
    color: #333; font-size: 14px; pointer-events: auto;
  `;
  pickerToolbar.innerHTML = `
    <span>👆 请点击页面上的元素生成屏蔽规则</span>
    <button id="extension-picker-cancel" style="
      padding: 6px 12px; cursor: pointer; border: 1px solid #ccc;
      background: #f8f9fa; border-radius: 4px; font-size: 13px; color: #333;
    ">取消 (Esc)</button>
  `;
  document.documentElement.appendChild(pickerToolbar);

  // 取消按钮点击事件
  document.getElementById('extension-picker-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    stopPickingMode();
  });

  // 创建跟随鼠标的 Tooltip 预览
  pickerTooltip = document.createElement('div');
  pickerTooltip.id = 'extension-picker-tooltip';
  pickerTooltip.style.cssText = `
    position: fixed; z-index: 2147483647;
    background: rgba(0, 0, 0, 0.85); color: #fff;
    padding: 8px 12px; border-radius: 6px;
    font-size: 13px; font-family: monospace;
    pointer-events: none; max-width: 350px;
    word-break: break-all; display: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.2);
    line-height: 1.4;
  `;
  document.documentElement.appendChild(pickerTooltip);
};

  const handleMouseMove = (e) => {
    if (!isPickingMode || !overlaySvg) return;
  
    // 隐藏遮罩和高亮框以获取底层元素
    overlaySvg.style.display = 'none';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    overlaySvg.style.display = 'block';
  
    // 避免选中工具栏、tooltip或已经屏蔽的元素
    if (!target || target.closest('#extension-picker-toolbar') || target.closest('#extension-picker-tooltip') || target.classList.contains('extension-blocked-element')) {
      document.getElementById('picker-hole').setAttribute('width', '0');
      document.getElementById('picker-outline').setAttribute('width', '0');
      hoveredElement = null;
      if (pickerTooltip) pickerTooltip.style.display = 'none';
      return;
    }
  
    hoveredElement = target;
    const rect = target.getBoundingClientRect();
    
    // 更新遮罩层挖空区域和高亮边框
    const hole = document.getElementById('picker-hole');
    const outline = document.getElementById('picker-outline');
    
    hole.setAttribute('x', rect.left);
    hole.setAttribute('y', rect.top);
    hole.setAttribute('width', rect.width);
    hole.setAttribute('height', rect.height);
    
    outline.setAttribute('x', rect.left);
    outline.setAttribute('y', rect.top);
    outline.setAttribute('width', rect.width);
    outline.setAttribute('height', rect.height);
    
    // 更新 Tooltip 预览内容和位置
    if (pickerTooltip) {
      let previewText = '';
      let prefix = '';
      
      if (currentTargetInput === 'container') {
        previewText = generateSelector(hoveredElement);
        prefix = '父容器选择器';
      } else if (currentPickType === 'selector') {
        previewText = generateSelector(hoveredElement);
        prefix = 'CSS选择器';
      } else if (currentPickType === 'text') {
        let text = hoveredElement.innerText || '';
        text = text.trim();
        previewText = text.length > 80 ? text.substring(0, 80) + '...' : text;
        prefix = '文本内容';
      } else if (currentPickType === 'image') {
        if (hoveredElement.tagName.toLowerCase() === 'img') {
          previewText = hoveredElement.src;
        } else if (hoveredElement.tagName.toLowerCase() === 'svg' || hoveredElement.closest('svg')) {
          // 如果是 SVG 或 SVG 内部的元素
          const svgEl = hoveredElement.tagName.toLowerCase() === 'svg' ? hoveredElement : hoveredElement.closest('svg');
          // 由于 SVG 通常是内联的，没有链接，我们提取它的一部分内容（如 viewBox 或 classes）作为标识
          // 为了作为规则的特征，我们尝试获取一个能唯一标识这个 SVG 的 CSS 选择器
          previewText = generateSelector(svgEl);
          prefix = 'SVG 图片 (CSS 特征)';
        } else {
          const bg = window.getComputedStyle(hoveredElement).backgroundImage;
          if (bg && bg !== 'none') {
            const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
            if (match) previewText = match[1];
          }
        }
        if (!prefix) prefix = '图片链接';
      }

      if (previewText) {
        pickerTooltip.innerHTML = `<strong style="color:#8ab4f8;">[${prefix}]</strong><br/>${previewText}`;
        pickerTooltip.style.display = 'block';
        
        // 计算位置，给鼠标留出一点偏移量避免遮挡
        let tooltipX = e.clientX + 15;
        let tooltipY = e.clientY + 15;
        
        // 边界检查，防止 tooltip 超出屏幕边缘
        if (tooltipX + 370 > window.innerWidth) {
          tooltipX = e.clientX - 370;
        }
        if (tooltipY + 80 > window.innerHeight) {
          tooltipY = e.clientY - 80;
        }
        
        pickerTooltip.style.left = tooltipX + 'px';
        pickerTooltip.style.top = tooltipY + 'px';
      } else {
        pickerTooltip.style.display = 'none';
      }
    }
  };

const handleClick = (e) => {
  if (!isPickingMode) return;
  e.preventDefault();
  e.stopPropagation();

  // 如果点击的是工具栏本身，直接忽略（取消按钮有自己的事件）
  if (e.target.closest('#extension-picker-toolbar')) return;

  if (hoveredElement) {
    const targetEl = hoveredElement;
    
    // 退出选择模式，恢复页面交互
    stopPickingMode();
    
    // 获取提取结果
    let extractedValue = '';
    
    if (currentPickType === 'selector') {
      extractedValue = generateSelector(targetEl);
    } 
    else if (currentPickType === 'text') {
      let text = targetEl.innerText || '';
      text = text.trim();
      if (!text) {
        alert('所选元素没有可识别的文本内容！');
        return;
      }
      extractedValue = text.length > 100 ? text.substring(0, 100) : text;
    } 
    else if (currentPickType === 'image') {
      if (targetEl.tagName.toLowerCase() === 'img') {
        extractedValue = targetEl.src;
      } else if (targetEl.tagName.toLowerCase() === 'svg' || targetEl.closest('svg')) {
        // SVG 处理
        const svgEl = targetEl.tagName.toLowerCase() === 'svg' ? targetEl : targetEl.closest('svg');
        // 因为 SVG 没有明确的 src，且通常内联，我们只能把它当作普通元素，提取它的 CSS 特征
        // 并自动把规则类型改为 selector，这需要在 popup 那边处理或者我们就用它的特征作为 "包含文本" 的一种变体
        // 最稳妥的是提取它的外部 HTML 结构的一小段，但太长。或者提取它的类名。
        // 这里我们提取它的类名特征，并告诉用户这会被作为 CSS 选择器规则
        extractedValue = generateSelector(svgEl);
      } else {
        const bg = window.getComputedStyle(targetEl).backgroundImage;
        if (bg && bg !== 'none') {
          const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
          if (match) extractedValue = match[1];
        }
      }
      if (!extractedValue) {
        alert('所选元素不是图片(img/svg)或没有背景图！');
        return;
      }
    }

    // 将提取结果直接发给侧边栏 (Side Panel)
    if (extractedValue) {
      // 动态判断实际的 pickType，特别是当用户在图片模式下点到了 SVG 时
      let actualPickType = currentPickType;
      if (currentPickType === 'image' && (targetEl.tagName.toLowerCase() === 'svg' || targetEl.closest('svg'))) {
        actualPickType = 'selector'; // SVG 只能用 CSS 选择器屏蔽
      }

      chrome.runtime.sendMessage({
        action: "elementSelected",
        value: extractedValue,
        targetInput: currentTargetInput,
        pickType: actualPickType
      });
      console.log('已提取内容:', extractedValue);
    }
  }
};

const handleKeyDown = (e) => {
  if (isPickingMode && e.key === 'Escape') {
    stopPickingMode();
  }
};

const startPickingMode = (pickType = 'selector', targetInput = 'selector') => {
  if (isPickingMode) return;
  isPickingMode = true;
  currentPickType = pickType;
  currentTargetInput = targetInput;
  
  createOverlay();
  
  let hintText = '👆 请点击页面上的元素生成选择器';
  if (currentPickType === 'text') hintText = '👆 请点击你要提取的文本片段';
  if (currentPickType === 'image') hintText = '👆 请点击你要提取的图片';
  if (currentTargetInput === 'container') hintText = '👆 请点击你想作为父容器的元素';
  
  const span = document.querySelector('#extension-picker-toolbar span');
  if (span) span.textContent = hintText;
  
  // 在捕获阶段监听事件，确保优先处理并能阻断页面默认行为
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
};

const stopPickingMode = () => {
  isPickingMode = false;
  
  if (overlaySvg) overlaySvg.remove();
  if (pickerToolbar) pickerToolbar.remove();
  if (pickerTooltip) pickerTooltip.remove();
  
  overlaySvg = null;
  pickerToolbar = null;
  pickerTooltip = null;
  hoveredElement = null;

  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
};

// 监听 Popup 发来的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
    return;
  }
  if (request.action === 'startPicking') {
    startPickingMode(request.pickType || 'selector', request.targetInput || 'selector');
  }
});

// 统一的添加屏蔽样式的方法
const blockElement = (el) => {
  if (el && !el.classList.contains('extension-blocked-element')) {
    el.classList.add('extension-blocked-element');
  }
};

// 执行屏蔽规则
const applyRules = () => {
  // 如果全局开关被关闭，直接返回，不执行任何屏蔽逻辑
  if (!isGlobalEnabled) return;
  if (!currentRules || currentRules.length === 0) return;
  
  currentRules.forEach(rule => {
    // 兼容旧版本的纯字符串规则（默认按 CSS 选择器处理）
    const ruleObj = typeof rule === 'string' ? { type: 'selector', keyword: rule } : rule;
    
    try {
      if (ruleObj.type === 'selector') {
        const elements = document.querySelectorAll(ruleObj.keyword);
        elements.forEach(el => {
          // 如果该元素已经被更具体的规则屏蔽，跳过
          if (el.closest('.extension-blocked-element')) return;
          
          // 查找最近的指定父容器，如果不指定，则屏蔽该元素本身
          const targetEl = (ruleObj.container && ruleObj.container !== '*') 
            ? el.closest(ruleObj.container) 
            : el;
            
          if (targetEl) blockElement(targetEl);
        });
      } 
      else if (ruleObj.type === 'text') {
        // 使用 TreeWalker 遍历页面上的所有文本节点
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
          if (node.nodeValue.includes(ruleObj.keyword)) {
            const parent = node.parentElement;
            if (!parent) continue;
            
            // 避免把自己添加的提示文字（或已被屏蔽的容器内部文本）再次处理
            if (parent.closest('.extension-blocked-element')) continue;
            
            // 查找最近的指定父容器，如果不指定，则屏蔽文本的直接父标签
            const targetEl = (ruleObj.container && ruleObj.container !== '*') 
              ? parent.closest(ruleObj.container) 
              : parent;
              
            blockElement(targetEl);
          }
        }
      } 
      else if (ruleObj.type === 'image') {
        // 查找所有图片，通过 src 属性匹配，并且支持对 svg 的处理（虽然 svg 已经被转为 selector，但兼容旧数据或逻辑）
        const imgs = document.querySelectorAll('img');
        imgs.forEach(img => {
          // 排除已经被屏蔽的图片
          if (img.closest('.extension-blocked-element')) return;

          if (img.src.includes(ruleObj.keyword)) {
            const targetEl = (ruleObj.container && ruleObj.container !== '*') 
              ? img.closest(ruleObj.container) 
              : img;
            if (targetEl) blockElement(targetEl);
          }
        });
      }
    } catch (e) {
      console.error('规则执行失败:', ruleObj, e);
    }
  });
};

// 清除现有屏蔽标记
const clearRules = () => {
  // 清空“暂时显示”的记录
  temporarilyUnblockedElements.clear();

  document.querySelectorAll('.extension-blocked-element').forEach(el => {
    el.classList.remove('extension-blocked-element');
    // 移除所有的“暂时显示”按钮
    const btn = el.querySelector('.extension-unblock-btn');
    if (btn) btn.remove();
  });
};

// 监听 DOM 变化以处理动态加载的元素（如瀑布流、懒加载广告）
const startObserver = () => {
  if (observer) observer.disconnect();
  
  observer = new MutationObserver((mutations) => {
    // 使用 requestAnimationFrame 简单节流
    requestAnimationFrame(() => {
      applyRules();
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
};

// 初始化获取当前域名的规则和全局开关状态
const init = () => {
  const domain = window.location.hostname;
  
  chrome.storage.local.get(['domRules', 'globalToggleState'], (result) => {
    // 读取全局开关状态，默认为 true
    isGlobalEnabled = result.globalToggleState !== false;

    const allRules = result.domRules || {};
    currentRules = allRules[domain] || [];
    
    applyRules();
    startObserver();
  });

  // 监听存储变化，当在 Popup 添加或删除规则，或者切换全局开关时实时生效
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let needReapply = false;

      // 如果全局开关发生变化
      if (changes.globalToggleState !== undefined) {
        isGlobalEnabled = changes.globalToggleState.newValue !== false;
        needReapply = true;
      }

      // 如果当前域名的规则发生变化
      if (changes.domRules) {
        const allRules = changes.domRules.newValue || {};
        currentRules = allRules[domain] || [];
        needReapply = true;
      }

      if (needReapply) {
        // 先清除所有现有的屏蔽效果
        clearRules();
        // 如果开关开着，则重新应用最新规则；如果关着，applyRules 内部会直接 return
        applyRules();
      }
    }
  });
};

// 确保 DOM 加载后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
