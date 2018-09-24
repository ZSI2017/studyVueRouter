const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require("webpack-Hot-middleware")

const app = express();
const config = require('./webpack.config.js');
const compiler = webpack(config);

// tell express to use the webpack-dev-middleware and use the webpack.config.js
app.use(webpackDevMiddleware(compiler, {
  publicPath: config.output.publicPath
}));

app.use(webpackHotMiddleware(compiler, {
  log: false,
  heartbeat: 2000,
}))
app.listen(3000, function() {
  console.log('express app listener on port 3000! \n');
})
