# cs2_box_simulator

一个纯前端、本地运行的 CS2 风格开箱模拟器。项目内置反冲、梦魇、变革三种武器箱，支持选择箱子和钥匙、滚动开箱、稀有物品揭晓，以及浏览器本地武器仓库。

## 主要功能

- 三种武器箱及对应钥匙，可成套添加到仓库
- 拟真的减速滚动和品质展示效果
- 金色奖励抽中后才揭晓具体刀具或手套
- 粉、红、金品质使用调整后的演示概率
- 抽中物品自动保存到浏览器本地仓库
- 武器仓库支持品质筛选及高低品质排序

## 依赖

- Python 3：启动静态 Web 服务
- Node.js / npm：可选，仅用于执行 npm 启动命令
- 现代浏览器：Chrome、Edge、Safari 或 Firefox

无需安装 npm 包，也不依赖 NoneBot 或任何 Python 第三方库。

## 启动

在项目目录中执行：

```bash
npm run start
```

未安装 Node.js 时，可直接执行：

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

启动后访问：

- 本机：`http://localhost:8080`
- 局域网：`http://你的电脑局域网IP:8080`

局域网设备需与电脑处于同一网络，且系统防火墙允许 Python 接收传入连接。

## 本地数据

箱子、钥匙和抽中的物品保存在浏览器 `localStorage` 中。清除该站点的浏览器数据会重置仓库。

第三方素材与许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目仅用于本地交互演示，与 Valve 或 Counter-Strike 2 官方无关。
