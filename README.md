# BeadPixel · 拼豆像素化工具

<p align="center">
  <img src="public/images/logo-full.png" alt="BeadPixel" width="320">
</p>

> **English** — BeadPixel turns your images into makeable fuse-bead patterns (Perler / Artkal / Hama). One grid cell = one bead, every color is drawn from a **real bead palette**, and you can export to PNG / PDF pattern sheet / CSV. It also ships a brush tool for hand-tuning colors, an undo stack, a collapsible side panel, and a full history manager.

将图片转换为**可手工制作的拼豆图纸**：一个格子 = 一颗拼豆，所有颜色来自真实拼豆色板（Perler / Artkal / Hama），可导出 PNG / PDF 图纸 / CSV。内置画笔微调、回退、可折叠侧边栏与历史记录管理。

---

## ✨ 功能特性

- **图片 → 拼豆图纸**：一个格子对应一颗拼豆，所见即所得。
- **真实色板匹配**：Perler / Artkal / Hama 三套真实拼豆色板，最近邻匹配（CIEDE2000 色差 + 缓存）。
- **严格网格尺寸**：32×32 / 64×64 / 100×100 或自定义，输出严格等于所选网格。
- **三种适应方式**：保持比例留白（`contain`）/ 智能裁剪填满（`cover`）/ 拉伸（`stretch`）。
- **颜色数量控制**：自动 / 16 / 24 / 32 / 48 / 64 / 全部色板，从真实拼豆色板中智能裁剪（细节优先，而非简单删低频色）。
- **细节保护**：Sobel 边缘检测 + 细节优先权重，轮廓、五官、文字、描边不被颜色平均抹掉。
- **四种视图模式**：拼豆模式（圆豆 / 孔 / 高光 / 阴影）、图片模式、网格模式、**编号模式**（每格显示真实色板编号，便于对照配色）。
- **🖌 画笔工具**：手动微调任意拼豆的颜色，支持 `1×1` / `3×3` / `5×5` 笔刷，可拖拽连续上色；颜色取自当前结果已有的真实色板编号色。
- **↶ 回退（Undo）**：画笔按"笔画"入栈，一键回退整笔修改并落盘。
- **可折叠右侧侧边栏**：原图、生成参数、颜色统计集中收纳，支持独立滚动；窄屏自动改为上下布局。
- **🕘 历史记录管理**：列表 / 加载 / 重命名 / 删除，删除时同步清理落盘的矩阵 JSON 与预览 PNG。
- **多格式导出**：PNG（拼豆 / 像素风格，可叠加每格颜色编号）、PDF 图纸（编号网格 + 颜色清单 + 数量统计）、CSV（颜色清单 + 图纸网格，带 BOM 兼容 Excel）。
- **黑蓝白主题**：清爽的 `#0B6FFF` 主色视觉体系。

---

## 🧩 核心算法流水线

```
图片
 → 预处理（Alpha 展平 / 工作分辨率限制，防内存爆炸）
 → 拼豆网格采样（严格按用户指定网格，如 64×64 = 4096 颗）
     · 区域平均色（平滑区，抗噪）
     · 中心加权色（保护眼睛 / 高光等居中小特征）
     · 主导色（保护轮廓线、描边）
     · Sobel 边缘能量 + 局部对比度 → 细节权重
 → 真实色板最近邻匹配（CIEDE2000 色差 + 双级缓存）
 → 颜色数量裁剪（从真实色板选最多 N 色，细节优先加权，非简单删低频色）
 → 真实色板抖动（Floyd-Steinberg 蛇形扫描，轻度模式抑制噪点 + 保护细节格）
 → 拼豆矩阵（结构化数据：cells + colors + totalBeads）—— 唯一数据源
 → 渲染 / 导出（全部基于同一矩阵）
```

> **设计要点**：后端所有导出（PNG / PDF / CSV）都基于持久化的 **拼豆矩阵 JSON**（结构化单元格 + 真实色号），不再从 PNG 反推颜色，因此真实拼豆色号在任意导出格式下都不会丢失。

---

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选，见 .env.example）
cp .env.example .env

# 3. 启动开发服务器（热重载）
npm run dev

# 4. 或启动生产服务器
npm start
```

启动后访问 **http://localhost:3000**

```bash
# 运行算法单元/集成测试（无需服务器）
node tests/test-engine.js

# 运行 API 集成测试（需先启动服务器）
node tests/test-api.js
```

### 使用流程

1. **上传**：拖入或选择一张 JPG / PNG / WebP 图片（默认上限 10 MB）。
2. **生成**：设置网格尺寸、适应方式、颜色数量、抖动、拼豆品牌、规格、细节保护等参数，点击生成。
3. **微调（可选）**：用画笔工具修正个别拼豆颜色，编号模式便于对照真实色号；支持整笔回退。
4. **导出**：导出 PNG / PDF 图纸 / CSV 清单；或从历史记录里随时加载、重命名、删除过往结果。

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 图片处理 | sharp (libvips) |
| 色差计算 | CIEDE2000 (Lab) |
| 文件上传 | multer |
| PDF 生成 | pdfkit |
| 前端 | 原生 HTML / CSS / JS + Canvas |
| 持久化 | 文件系统（`exports/*.json` 矩阵 + `data/history.json` 索引） |

---

## 📁 项目结构

```
BeadPixel/
├── server.js                     # Express 入口
├── src/
│   ├── routes/
│   │   ├── api.js                # 聚合路由 + 色板查询
│   │   ├── upload.js             # 上传
│   │   ├── process.js            # 生成 / 预览
│   │   ├── export.js             # PNG / PDF / CSV / 矩阵读写
│   │   └── history.js            # 历史记录（list / delete / rename）
│   ├── controllers/
│   │   ├── uploadController.js
│   │   ├── processController.js  # 生成后写矩阵 + 登记历史
│   │   ├── exportController.js   # 导出 + 画笔批量改色（updateMatrixCells）
│   │   └── historyController.js
│   ├── services/
│   │   ├── beadEngine.js         # 拼豆核心引擎（采样 / 边缘保护 / 抖动 / 矩阵）
│   │   ├── beadMapper.js         # 真实色板最近邻匹配（CIEDE2000 + 缓存）
│   │   ├── colorQuantizer.js     # 真实色板颜色数量裁剪
│   │   ├── beadRenderer.js       # 拼豆视觉渲染（PNG）
│   │   ├── imageProcessor.js     # 兼容门面
│   │   ├── pdfGenerator.js       # PDF 图纸
│   │   ├── csvGenerator.js       # CSV 生成
│   │   ├── resultStore.js        # 拼豆矩阵持久化（JSON）
│   │   └── historyStore.js       # 历史索引（data/history.json）
│   ├── utils/
│   │   ├── colorUtils.js         # 颜色转换 + CIEDE2000 + Lab 缓存
│   │   └── fileUtils.js
│   └── data/beadColors/          # 真实拼豆色板数据（perler / artkal / hama）
├── public/
│   ├── index.html
│   ├── css/style.css             # 黑蓝白主题
│   └── js/
│       ├── uploader.js
│       ├── preview.js            # Canvas 渲染 + 画笔 + 回退 + 四视图
│       ├── colorPanel.js         # 颜色统计 / 编号面板
│       ├── exporter.js
│       ├── history.js            # 历史记录前端（modal）
│       └── app.js                # 主控（串联流程 + 侧边栏 + 持久化回写）
├── tests/                        # 算法测试 + API 集成测试
├── uploads/                      # 上传文件（运行时生成，已忽略）
├── exports/                      # 导出文件（矩阵 JSON + 预览 PNG，运行时生成，已忽略）
├── data/                         # 运行时数据（history.json，已忽略）
├── .env.example                  # 环境变量模板
└── package.json
```

---

## 📡 API 参考

所有接口前缀为 `/api`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 上传图片（字段名 `image`，支持 JPG / PNG / WebP） |
| POST | `/api/process/pixelate` | 生成拼豆矩阵（返回矩阵 + 预览图），并登记历史 |
| POST | `/api/process/preview` | 快速预览（返回 base64） |
| GET  | `/api/colors/:brand` | 获取品牌色板（`:brand` = `perler` / `artkal` / `hama`） |
| POST | `/api/export/png` | 导出 PNG（`style`: `bead` / `pixel`；`showGrid`: 网格；`showNumbers`: 每格颜色编号；`scale`: 每豆像素） |
| POST | `/api/export/pdf` | 导出 PDF 图纸 |
| POST | `/api/export/csv` | 导出 CSV |
| GET  | `/api/export/matrix/:resultId` | 获取持久化拼豆矩阵 |
| POST | `/api/export/matrix/:resultId` | **画笔改色**：批量更新拼豆格颜色 |
| GET  | `/api/history` | 列出全部历史（最新在前） |
| DELETE | `/api/history/:resultId` | 删除一条历史（同步清理矩阵 JSON 与预览 PNG） |
| PUT  | `/api/history/:resultId/name` | 重命名历史记录（`body.name`） |

### 生成参数（`/api/process/pixelate`）

```json
{
  "imageId": "uuid",
  "gridWidth": 64,
  "gridHeight": 64,
  "colorLimit": "auto | all | 16 | 24 | 32 | 48 | 64",
  "dithering": "none | light | standard",
  "fitMode": "contain | cover | stretch",
  "background": "#FFFFFF",
  "beadBrand": "perler | artkal | hama",
  "beadSizeMm": 5,
  "detailPriority": true
}
```

（兼容旧参数 `boardWidth` / `boardHeight` / `quantizeColors`）

### 画笔改色（`POST /api/export/matrix/:resultId`）

```json
{
  "changes": [
    { "x": 10, "y": 20, "c": 3 }
  ]
}
```

- `x` / `y`：单元格坐标（0 基，`0 ≤ x < width`，`0 ≤ y < height`）。
- `c`：目标颜色在 `colors[]` 中的 **0 基下标**（即编号模式里的"编号 − 1"）。
- 响应返回 `{ success, resultId, applied, colors, totalBeads }`，并重新统计各颜色数量（保持编号与顺序稳定）。

---

## 🎨 前端交互说明

- **四视图**：拼豆 / 图片 / 网格 / 编号。编号模式下每个单元格显示真实色板编号，便于对照配色与手工制作。
- **画笔**：点击工具栏画笔按钮开启，从当前结果已有的真实色板编号色中选取目标色，选择 `1×1` / `3×3` / `5×5` 笔刷后可在画布上拖拽连续上色。每次松手记为"一笔"，可一键回退。
- **侧边栏**：原图、生成参数、颜色统计集中在可折叠右侧面板，独立滚动；窗口宽度 ≤ 1024px 时自动切换为上下布局。
- **历史**：底部"🕘 历史记录"按钮打开历史弹窗，支持加载 / 重命名 / 删除。

---

## 🔧 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `NODE_ENV` | `development` | 运行环境（development / production） |
| `UPLOAD_DIR` | `./uploads` | 上传目录 |
| `EXPORT_DIR` | `./exports` | 导出 / 矩阵落盘目录 |
| `MAX_FILE_SIZE` | `10485760` | 上传文件大小上限（字节，默认 10 MB） |

---

## 📜 许可证

本项目以 **MIT 许可证** 开源。详见 [LICENSE](./LICENSE)。

---

## 🤝 参与贡献 / 开源说明

欢迎 Issue 与 PR。提交前请：

1. `npm install` 安装依赖并确保 `npm run dev` 可正常启动；
2. 运行 `node tests/test-engine.js` 与 `node tests/test-api.js`（后者需先启动服务）；
3. 保持后端所有导出基于拼豆矩阵 JSON（真实色号不丢失）这一设计约束；
4. 请勿将 `uploads/`、`exports/`、`data/history.json`、`.env` 等运行时产物提交到仓库（已写入 `.gitignore`）。

> 仓库根目录的 `.workbuddy-ai/` 与 `.trae/` 为本地工具 / IDE 目录，已在 `.gitignore` 中忽略，请勿提交。
