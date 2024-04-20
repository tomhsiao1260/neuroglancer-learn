# Introduction

Try to learn [Neuroglancer](https://github.com/google/neuroglancer) step by step.

## 打包

程式碼的切入點在 `./src/main.bundle.js`，透過 webpack 打包，開發階段可執行 `npm run dev-server` 開啟 localhost:8080，但有別於傳統的 `webpack serve` 指令，這個專案用了比較客製化的打包方式：

當執行 `npm run dev-serve` 時，會先透過 `./build_tools/cli.ts` 把 `webpack.config.js` 的 config 進行擴充，然後再透過 webpack cli 打包並產生伺服器。更詳細來說，首先會透過 yargs 產生一系列的參數配置 (有點像 python 的 argparse)，並透過 `setConfig` 方法將 config 寫入 webpack，最後再透過 `runWebpack` 執行 webpack cli 指令來開啟伺服器。