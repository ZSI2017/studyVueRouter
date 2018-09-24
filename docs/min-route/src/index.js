/**
 *
 *  1. 事件监听  √
 *  2. 钩子函数  √
 *  3. 路由变化，页面渲染  ——
 *  4. 记录路由信息   √
 *  5. 传递路由参数   √
 *  6. 路由正则匹配   √
 *  7. 路由配置信息管理 --
 *  8. 路由参数解析  √
 *  9. 代码重构     ---
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
import './style.css';

function init(options) {}

function getHash() {
  var href = window.location.href,
      pos = href.indexOf("#");

  if (index > -1) {
    return href.slice(pos+1)
  } else {
    return ''
  }
}

function setupListener() {
  window.addEventListener('popstate', function() {
    transitionTo(getHash())
  },false)

}

function transitionTo(hash, cb) {

}

function resolvePath() {

}
