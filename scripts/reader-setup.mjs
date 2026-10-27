import path from 'node:path';
import { spawn } from 'node:child_process';

// Credentials travel over stdin and the private result channel, never argv or job logs.
export function runReaderSetup({ root, python, request, onProgress = () => {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-B', path.join(root, 'scripts', 'reader_setup.py')], {
      cwd: root, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' },
    });
    let pending = '', result, diagnostic = '', finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('READER_SETUP_TIMEOUT')); }, 210000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      pending += chunk;
      if (pending.length > 128000) { child.kill(); finish(new Error('READER_SETUP_PROTOCOL')); return; }
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'progress' && typeof event.message === 'string') onProgress(event.message);
          if (event.type === 'result') result = event;
        } catch { /* Third-party diagnostics are private and are never forwarded. */ }
      }
    });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-8000); });
    child.stdin.on('error', () => {});
    child.once('error', () => finish(new Error('READER_RUNTIME_MISSING')));
    child.once('close', () => {
      if (result) finish(null, result);
      else finish(new Error(/ModuleNotFoundError|ImportError|DLL load failed/.test(diagnostic) ? 'READER_DEPENDENCY_MISSING' : 'READER_SETUP_FAILED'));
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export const readerSetupMessages = {
  READER_PATH_MISSING: '没有找到账号数据库。请先在微信登录并等待同步，再选择包含 db_storage 的账号文件夹或 xwechat_files 文件夹。',
  READER_DATABASE_MISSING: '账号目录已找到，但消息或联系人数据库尚未同步完成。请在微信打开几个聊天，等待同步后重试。',
  READER_KEY_INVALID: '读取密钥与所选账号不匹配。请点击“一键连接并验证”重新获取，或在高级选项中填写该账号的有效密钥。',
  READER_KEY_REQUIRED: '尚未获取读取密钥。请点击“一键连接并验证”，然后在微信中完成登录。',
  READER_LOGIN_RESTART_REQUIRED: '微信已经登录，但当前账号还没有可复用的有效读取凭据。请点击“重开微信并连接”，程序会先准备连接，再提示你登录。',
  READER_SECRET_UNAVAILABLE: '旧凭据无法在当前 Windows 用户下读取。请点击“一键连接并验证”重新获取。',
  READER_DATABASE_UNREADABLE: '密钥验证通过，但数据库暂时无法完整读取。请等待微信同步完成后重试；若仍失败，请使用“验证内置环境”检查安装文件。',
  READER_DEPENDENCY_MISSING: '读取组件不完整或无法加载。请重新安装更新后的安装包，再使用“验证内置环境”检查。',
  READER_RUNTIME_MISSING: '找不到内置 Python 运行环境。请重新安装更新后的安装包。',
  READER_KEY_COMPONENT_MISSING: '自动连接组件缺失或无法加载。请重新安装更新后的安装包；也可以在高级选项中手动填写密钥。',
  WECHAT_NOT_RUNNING: '匹配微信尚未打开。请点击“打开微信”，再点击“一键连接并验证”，随后在微信中完成登录。',
  WECHAT_MULTIPLE_PROCESSES: '检测到多个独立微信客户端。请从托盘退出多余客户端，保留要绑定的微信后重试。',
  WECHAT_PROCESS_IDENTITY_UNCLEAR: '无法确认微信主进程。请从托盘完整退出微信，再使用“打开微信”重新打开后重试。',
  READER_ACCOUNT_STATE_INVALID: '账号状态无法安全切换。请检查账号状态文件或目录；原账号配置已保留。',
  READER_ACCOUNT_RESULT_MISMATCH: '验证返回的账号与所选目录不一致，原账号配置已保留。请重新识别账号目录后再连接。',
  HOOK_ACCOUNT_MISMATCH: '微信当前打开的账号与所选数据库不一致，原配置已保留。请重新选择当前账号，或在微信切换到所选账号后重试。',
  HOOK_MULTIPLE_ACCOUNT_DATABASES: '匹配微信进程同时打开了多个账号的数据库，无法安全确定发送账号。请使用“修复微信连接”，核对并再次确认后重开匹配微信，再登录目标账号并重试。',
  HOOK_LOGIN_REQUIRED: '微信尚未打开所选账号的数据库。请完成登录并等待同步后重试；原账号配置已保留。',
  HOOK_NOT_LISTENING: '匹配微信发送组件尚未连接，原配置已保留。请先打开匹配微信并登录所选账号，再连接验证。',
  HOOK_HEALTH_TIMEOUT: '实时微信账号核对超时，原配置已保留。请检查匹配微信是否正常运行后重试。',
  HOOK_HEALTH_FAILED: '无法核对实时微信账号，原配置已保留。请检查匹配微信连接后重试。',
  HOOK_ACCOUNT_METADATA_INVALID: '发送组件未返回有效账号信息，无法安全切换。请修复微信连接或检查发送组件版本。',
  HOOK_AUTH_FAILED: '微信发送组件令牌与当前项目不一致，原配置已保留。请使用“修复微信连接”核对后重开匹配微信。',
  HOOK_TOKEN_MISSING: '发送组件令牌尚未准备。请在工具页准备配置，再打开匹配微信后重试。',
  HOOK_HEALTH_INVALID_RESPONSE: '微信发送端口返回了无效响应，原配置已保留。请检查端口或修复微信连接。',
  HOOK_INITIALIZATION_TIMEOUT: '匹配微信发送组件未能完成初始化。请使用“修复微信连接”，核对并确认后重开。',
  HOOK_VERSION_MISMATCH: '微信版本与当前发送组件不匹配，原配置已保留。请使用项目匹配的微信客户端。',
  REVIEWED_HOOK_BUILD_REQUIRED: '当前端口不是已适配的微信发送组件，原配置已保留。请检查端口和匹配微信。',
  READER_KEY_ACCESS_DENIED: '无法连接微信进程。请以相同的 Windows 用户和权限打开微信与助手后重试。',
  READER_SETUP_TIMEOUT: '本次未等到可验证的登录初始化。请点击“重开微信并连接”，按提示重新打开匹配微信；已有配置和聊天记录会保留。',
  READER_SETUP_FAILED: '自动连接未完成。请确认微信已打开、目录对应当前账号后重试；原有配置已保留。',
};

export function readerSetupMessage(code) {
  return readerSetupMessages[code] ?? readerSetupMessages.READER_SETUP_FAILED;
}
