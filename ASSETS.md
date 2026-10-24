# 素材与字体

| 内容 | 来源及使用 |
|---|---|
| 视觉主参考 | [Gubbins / Folly Studio](https://folly.studio/)，参考纸片构图、细墨线、平涂色与手写气质，不复制游戏原画或标识 |
| 食物插画、信封 | `public/art.mjs`，本作以 SVG 路径重新绘制，网页与 Canvas 使用同一份素材 |
| 封面 | `public/assets/cover.svg` 及其 PNG/WebP 导出，由本作插画组成；小赖标题转为路径以保持一致 |
| 小赖手写字体 | [LXGW / kose-font](https://github.com/lxgw/kose-font/releases/tag/v3.126)，版本 3.126；保留 `public/assets/Xiaolai-OFL.txt` 原样 SIL OFL 1.1 授权 |
| 标题字体子集 | `xiaolai.woff2`，固定文案子集，动态昵称与餐名使用系统中文字体回退 |
| 相机/相册照片 | 玩家自行选择，仅在本机处理，源码与示例不包含用户真实照片 |
| QA 照片样本 | 程序绘制的双人位置与方向测试图，标注 TEST IMAGE，不冒充真人照片 |

配色：纸 `#E5E0D2`、墨 `#25231F`、黄 `#E8C547`、绿 `#70A58B`、紫 `#B69ACA`、橙 `#D88443`。

本作没有使用麦当劳 Logo 或直接复制 Gubbins 角色。官方餐品名称仅用于展示查询结果。

## 食物头套与本机检测

`public/headwear.mjs` 是本项目绘制的 SVG 头套；保留透明脸部开口，使用原插画的颜色与线条。

`@mediapipe/tasks-vision` 固定为 1.1.1（Apache-2.0），仅同源发布 ESM bundle、non-SIMD JS/WASM 和 BlazeFace short-range float16 v1 模型。许可保留在 `public/assets/vision/LICENSE`。模型来自 Google 官方 MediaPipe Models：
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

这些资源只在选择照片后由 Worker 按需加载；没有 CDN 请求。官方样图仅用于私密检测验收，不加入开源素材；公开例图使用本项目 TEST IMAGE 合成图。
