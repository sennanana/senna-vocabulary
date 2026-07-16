# SENNA Vocabulary

公开的个人英语生词记录表。网页通过 GitHub Pages 访问，词表内容保存在仓库的 `vocabulary.json` 中。

## 数据公开性

仓库和 GitHub Pages 网站均为公开内容。任何拿到网址的人都可以查看单词、中文释义、例句、熟悉度和复习日期。只有持有仓库写权限令牌的人可以从网页保存修改。

## 连接 GitHub

1. 在 GitHub 创建 Fine-grained personal access token。
2. Repository access 只选择 `senna-vocabulary`。
3. Repository permissions 将 `Contents` 设置为 `Read and write`。
4. 选择一个到期日期。
5. 在词表网页点击“连接 GitHub”，粘贴令牌。

令牌保存在当前网站来源的浏览器 `localStorage` 中，因此同一来源的 JavaScript 或可以操作此设备的人可能读取它。本站不加载第三方脚本，但仍应使用最小仓库权限和有限有效期。

**Never commit a GitHub token to this repository.**

## 日常保存

编辑、添加或清空内容后，页面先保存本地恢复副本。停止输入两秒后，页面自动提交 `vocabulary.json`。状态栏显示本地保存、同步中、已同步、认证失败或冲突。

云端冲突不会被自动覆盖。先导出本地 JSON，再决定加载云端版本或处理差异。

## 备份与恢复

- “导出 CSV”用于表格软件。
- “导出 JSON”保留完整字段，可作为恢复副本。
- 网络故障时，未同步内容仍留在浏览器本地。
- “断开 GitHub”会从浏览器删除令牌，不会删除词表。
- 若令牌疑似泄露，请在 GitHub Settings > Developer settings > Personal access tokens 中立即撤销。

## 本地运行

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8766/>。

## 验证

```bash
node --test
node -e "import('./row-model.js').then(async ({validateRows}) => { const {readFile} = await import('node:fs/promises'); validateRows(JSON.parse(await readFile('vocabulary.json', 'utf8'))); console.log('vocabulary.json valid'); })"
```
