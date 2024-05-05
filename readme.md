# Introduction

Try to learn [Neuroglancer](https://github.com/google/neuroglancer) step by step.

## 打包

程式碼的切入點在 `./src/main.bundle.js`，透過 webpack 打包，開發階段可執行 `npm run dev-server` 開啟 localhost:8080，但有別於傳統的 `webpack serve` 指令，這個專案用了比較客製化的打包方式：

當執行 `npm run dev-serve` 時，會先透過 `./build_tools/cli.ts` 把 `webpack.config.js` 的 config 進行擴充，然後再透過 webpack cli 打包並產生伺服器。更詳細來說，首先會透過 yargs 產生一系列的參數配置 (有點像 python 的 argparse)，並透過 `setConfig` 方法將 config 寫入 webpack，最後再透過 `runWebpack` 執行 webpack cli 指令來開啟伺服器。

## RefCounted

實作了 dispose 方法，所有繼承此 class 的類別可以呼叫 `registerDisposer` 方法，來註冊之後要捨棄項目

## minimal_viewer

創建 ui 的地方，會先產生一個 `neuroglancer-container` div，裡面包一個由 `display_context.ts` 初始化產生的 canvas，和一個 `viewer` 初始化產生的 div (透過 `makeCanvasOverlayElement`)。

## viewer

當 viewer 產生 div 後，會透過 `RootLayoutContainer` 產生一個內部的 div，用來渲染內部的 ui 細節 (位於 `layer_groups_layout.ts`)。

## ui

viewer 的 ui 中間會透過許多中間 component 傳遞，但在我們的應用裡相對不重要，主要的 ui 是從 `DataPanelLayoutContainer` 這個 class 渲染出來的
