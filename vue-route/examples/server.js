const express = require('express')
const rewrite = require('express-urlrewrite')
const webpack = require('webpack')
const webpackDevMiddleware = require('webpack-dev-middleware')
const WebpackConfig = require('./webpack.config')

const app = express()

// 生成一个与 webpack 的complier 绑定的中间件，在express 启动的服务app中调用这个中间件。
// 主要作用，监听资源的变化，然后自动打包，快速编译，走内存，
app.use(webpackDevMiddleware(webpack(WebpackConfig), {
  publicPath: '/__build__/',
  stats: {
    colors: true,
    chunks: false
  }
}))

const fs = require('fs')
const path = require('path')

fs.readdirSync(__dirname).forEach(file => {
  console.log(file)
  if (fs.statSync(path.join(__dirname, file)).isDirectory()) {
    // URL 重写中间件。
    // url 根据文件名进行匹配时，可以匹配到文件夹中 对应的 html 文件。
    app.use(rewrite('/' + file + '/*', '/' + file + '/index.html'))
  }
})

app.use(express.static(__dirname))

const port = process.env.PORT || 8080
module.exports = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}, Ctrl+C to stop`)
})
