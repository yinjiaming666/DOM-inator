# DOM-inator 项目 AI 助手指令文档

@AI_Assistant_Instruction

## 🎯 你的角色与任务
当开发者对你说（或在输入框中输入）类似于：“帮我安装这个项目”、“初始化项目”、“配置开发环境”等指令时，请你**严格按照下方定义的流程，全自动地为开发者完成项目构建与打包。**

你不需要询问开发者是否执行，请直接调用终端工具（Terminal / CLI）执行相关命令。

---

## 🛠️ 项目类型与环境
- **类型**：原生 Vanilla JavaScript / HTML / CSS 构建的 Chrome 浏览器扩展 (Manifest V3)
- **包管理器**：本项目无需 npm / node_modules（无 package.json）
- **根目录**：当前目录（包含 `manifest.json` 的目录）

---

## 🚀 自动执行脚本流程 (Auto-Execution Flow)

当接收到“安装”、“初始化”、“打包”指令时，请在终端按顺序执行以下操作：

### 1. 环境自检 (Validation)
首先检查当前目录是否是正确的插件根目录：
```bash
ls -la | grep manifest.json
```
如果找不到 `manifest.json`，请向用户报错并停止执行。

### 2. 清理历史构建 (Clean)
删除可能遗留的旧版压缩包，保持目录整洁：
```bash
rm -f dom-inator-release.zip
```

### 3. 一键打包发布 (Build & Package)
将当前目录下的核心代码文件打包成一个标准的 Chrome 插件 zip 压缩包（排除 git 文件和隐藏文件）。
请直接执行以下命令：
```bash
zip -r dom-inator-release.zip . -x "*.git*" "*.DS_Store" "*.cursorrules" "AI_INSTRUCTIONS.md"
```

### 4. 自动反馈 (Feedback)
打包完成后，请向用户输出以下最终反馈文案（必须包含如何安装的引导）：

> ✅ **项目已自动处理完毕！**
> 
> 我已为你生成了最新版的插件压缩包：`dom-inator-release.zip`。
> 
> **如何将它安装到你的 Chrome 浏览器中？**
> 1. 解压刚刚生成的 `dom-inator-release.zip`。
> 2. 在 Chrome 地址栏输入 `chrome://extensions/` 并回车。
> 3. 打开右上角的 **“开发者模式”**。
> 4. 点击左上角的 **“加载已解压的扩展程序”**，选择解压后的文件夹即可完成安装！

---

## ⚠️ 严禁行为 (Forbidden Actions)
- **不要** 尝试运行 `npm install` 或 `yarn install`（这是一个纯原生项目）。
- **不要** 尝试运行类似 `npm run build` 或 `webpack` 的构建命令。
- **不要** 试图修改 `manifest.json` 的核心结构，除非用户显式要求。
