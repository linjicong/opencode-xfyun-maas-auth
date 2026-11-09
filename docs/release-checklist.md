# 发布清单(v0.1.0)

真机验证完成后按序执行。需要:GitHub 账号、npm 账号(automation token)、
讯飞 API key(至少一条产品线)。

## 0. 真机验证(发布前必做)

- [ ] `magpie plugin login xfyun-maas` + `magpie provider test xfyun-maas`(真 key)
- [ ] 有 Coding/Token key 的线同样跑一遍
- [ ] `GET {origin}/v2/models`(带 Bearer)探测未公开文档的列表端点;可用则
      记录结果,模型表按需增补(v0.1.x 再做动态发现)
- [ ] 星火模型发一次带 `reasoning_effort` 的请求,确认 `thinking` 映射被接受
- [ ] 修正模型表后 `bun test && bun scripts/check.mjs` 全绿

## 1. GitHub 仓库

- [ ] 在 GitHub 建公开仓库 `opencode-xfyun-maas-auth`(不要勾选初始化文件)
- [ ] `git remote add origin git@github.com:linjicong/opencode-xfyun-maas-auth.git`
- [ ] `package.json` 补 `repository`/`homepage`/`bugs` 字段(指向该仓库)
- [ ] `git push -u origin main`
- [ ] 仓库页 → Topics 添加 `magpie-plugin`(以及其他想加的)
- [ ] Settings → Secrets and variables → Actions → 新增 `NPM_TOKEN`
      (npm 账号 → Access Tokens → Generate new token → 类型 **Automation**,
      Packages: Read and write)

## 2. npm 发布(GitHub Actions 自动)

- [ ] `git tag v0.1.0 && git push --tags`
- [ ] Actions → release 工作流跑绿 → npmjs.com 上确认包存在、provenance 标出现
- [ ] 本地或沙箱 `magpie plugin add opencode-xfyun-maas-auth` 复验安装

## 3. 上架推荐列表

- [ ] 按 `docs/registry-pr.md` 给 magpie-community/plugins 提 PR
- [ ] PR 合并后,插件页「发现」的推荐列表出现本插件(最多 6 小时同步)

## 备注

- npm publish 走 CI(token 配在 repo secrets),本机无需 `npm login`;
  若想本机手工发布:`npm login` 后 `npm publish --access public`
  (provenance 仅 CI 发布时可用)。
- 版本号流程:改 `package.json` 的 `version` → commit → 打同号 tag → push tag。
