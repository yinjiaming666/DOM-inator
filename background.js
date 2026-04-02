chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed successfully!');
});

// 允许用户通过点击扩展程序图标打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
