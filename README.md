# fonts.lzray.com + cdn.fonts.lzray.com (GitHub Actions + Ubuntu + Caddy)

这是一套**最小可用**的在线字体库方案：
- `fonts.lzray.com`：主站（列表/搜索/下载/控制台）
- `cdn.fonts.lzray.com`：只做静态分发（`/data` 挂载：`/data/fonts`、`/data/css`）
- `app`：本地 API（`/api/fonts` 扫描 `/data`；`/css2` 动态生成 CSS），通过 Caddy 反代
- GitHub Actions：一键把主站、API、Caddy 片段同步到你的 Ubuntu 服务器并重启服务

> 你的使用方式：只需要把字体和 CSS 文件夹放到服务器的 `/data/` 里：
> - `/data/fonts/<FamilyName>/` 里放 `.woff2` 与 `.ttf`（**同名**，例如 `WenKai-Medium.woff2` 和 `WenKai-Medium.ttf`）
> - 同一字体的多个变体（`lite`、`medium`、`bold`、`italic` 等）**都在同一文件夹**，程序会自动识别并映射到数值字重
> - 可选：你也可以往 `/data/css/` 放手写的样式（比如 `LXGWWenKai.css`）；对外也会被 CDN 直接分发

---

## 一、服务器先决条件（一次性）
1. Ubuntu 已安装：`caddy`、`node >= 18`
2. 确保目录：
   ```bash
   sudo mkdir -p /data/fonts /data/css /var/www/fonts-site /opt/fonts-api /etc/caddy/Caddyfile.d
   sudo chown -R $USER:$USER /data /var/www/fonts-site /opt/fonts-api
   ```
3. 主 Caddyfile 里确保引入片段：
   ```caddy
   import /etc/caddy/Caddyfile.d/*.conf
   ```
4. DNS 已解析：`fonts.lzray.com` 与 `cdn.fonts.lzray.com` 指向你的服务器。

---

## 二、GitHub Actions 部署
在 GitHub 仓库设置以下 Secrets：
- `SSH_HOST`：服务器 IP 或域名
- `SSH_USER`：SSH 用户（具备 sudo 权限）
- `SSH_PORT`：SSH 端口（默认 22）
- `SSH_KEY`：私钥（PEM）

> 首次部署会：
> - 拷贝 `site` → `/var/www/fonts-site`
> - 拷贝 `app` → `/opt/fonts-api` 并 `npm ci`、启动 systemd 服务
> - 拷贝 `caddy/*.conf` → `/etc/caddy/Caddyfile.d/` 并 `sudo systemctl reload caddy`

---

## 三、目录约定
- `/data/fonts/<FamilyName>/` 内是该字体家族的全部变体文件（`.woff2` 与 `.ttf` **同名**）
  - 例：`/data/fonts/LXGWWenKai/WenKai-Regular.woff2` 与 `WenKai-Regular.ttf`
  - 例：`/data/fonts/LXGWWenKai/WenKai-Medium.woff2` 与 `WenKai-Medium.ttf`
  - 程序会从文件名中识别 `thin/extralight/light/lite/regular/book/medium/semibold/bold/extrabold/black`、`italic` 等关键词，并映射数值字重
  - 也识别数值权重（如 `-400`、`w400`、`_700` 等片段）
- `/data/css/`：可选的手写 CSS 文件，将被 `cdn.fonts.lzray.com` 直接分发

---

## 四、对外使用方式
**A. 动态 CSS API（推荐）**
```html
<link rel="preconnect" href="https://cdn.fonts.lzray.com" crossorigin>
<link href="https://cdn.fonts.lzray.com/css2?family=LXGWWenKai:wght@400;500;700&display=swap" rel="stylesheet">
```
- 语法与 Google Fonts 类似：`family=<Name>:wght@400;700`，用 `+` 代替空格
- 也支持同时请求多个 family：`...&family=SecondFont:wght@300;400`

**B. 直接 @font-face（自己维护 CSS）**
```css
@font-face {
  font-family: "LXGWWenKai";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("https://cdn.fonts.lzray.com/fonts/LXGWWenKai/WenKai-Medium.woff2") format("woff2");
}
```

---

## 五、常见操作
**1) 查看所有字体（主站调用）**
```
GET https://fonts.lzray.com/api/fonts
```
返回 JSON（家族 → 变体 → woff2/ttf 下载链接）。

**2) 列表页自动识别新字体**
- 你把新文件放进 `/data/fonts/...` 后，API 会在数秒内重新扫描并更新缓存（默认 10 秒 TTL）。

**3) 手工生成家族 CSS（可选）**
- 直接把你手写的 `*.css` 放到 `/data/css/`，CDN 会自动分发。

---

## 六、系统服务
- `fonts-api.service`：在 `127.0.0.1:8787` 启动 API，Caddy 反代到公网。
  - 日志：`journalctl -u fonts-api -f`
  - 重启：`sudo systemctl restart fonts-api`

---

## 七、Caddy 片段（自动下发）
- `caddy/fonts.lzray.com.conf`：主站 + 反代 `/api` `/css2`
- `caddy/cdn.fonts.lzray.com.conf`：挂载 `/data` 并设置 CORS/MIME/缓存

> 如果你已有主 Caddy 配置，请合并片段或按需调整域名。

祝你搭建顺利！
