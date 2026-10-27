# 致谢与项目来源

本仓库是基于上游项目开展的二次开发与问题修复，保留原始代码来源、版权和许可证声明。本仓库的维护者为 XilinKang，不能将 Fork 内已有的全部代码归为本仓库独立原创。

## 原项目与主要组件

- **sourcepro5 / WeChatAgent**：本仓库的直接上游，提供微信助手、桌面控制台及集成能力。[原项目](https://github.com/sourcepro5/WeChatAgent)
- **Derpyu520 与 qq-bridge / QSH contributors**：消息桥接相关代码的原作者与贡献者；根目录及组件内的版权通知继续保留。[qq-bridge](https://github.com/Derpyu520/qq-bridge)
- **zhuobichen / weflow-cli**：NT 数据库读取源码子集的来源；具体版本、裁剪范围与 MIT 许可见组件目录。[weflow-cli](https://github.com/zhuobichen/weflow-cli)
- **DeepSeek Harness 及各依赖项目的贡献者**：提供独立运行的模型程序、插件 SDK 和基础依赖。各自的许可证与使用条件继续适用。

更多第三方来源与许可范围见 [LICENSES.md](LICENSES.md)、[components.json](components.json) 和各组件的 LICENSE、README。

## 本仓库追加的开发工作

本轮围绕设置草稿同步、保存冲突恢复、微信连接时序、消息处理入口和 DSH 已有会话恢复开展问题复现、修复与回归验证，详见[开发复盘](docs/development/2026-10-27-connection-and-console-fixes.md)。与上游相同或已经由上游修复的内容，会保留来源历史，不重复宣称为独立成果。

## 二次开发的许可依据

根目录以及相应组件采用的 MIT 许可，允许在其适用范围内使用、修改、合并和再分发；复制或实质性再分发时必须保留原版权及许可声明。完整原文见 [LICENSE](LICENSE)。

该许可不自动覆盖仓库之外的微信、DSH 客户端、第三方原生组件、未包含的参考项目、模型服务或其他独立资源。相关内容应分别遵守其自身许可、授权和服务条款；本仓库不声称获得原作者对本分支的单独背书，也不把上游维护者的个别授权声明当作对所有使用者的一般授权。
