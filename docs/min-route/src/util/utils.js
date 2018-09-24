export function supportPushState() {
  return window.history && 'pushState' in window.history
}

/**
 * 多维数组，转化为一维数组
 */
 export function flatten(queue) {
  var flatMap = [],
      j = 0,
      flatFn = function(queue) {
        queue.forEach(function(item) {
          if (Array.isArray(item)) {
            flatFn(item)
          } else {
            flatMap[j++] = item;
          }
        })
      };

  flatFn(queue);

  return flatMap;
}

/**
 * 获取hash 值
 * @return {[type]} [description]
 */
export function getHash() {
  var href = window.location.href,
      pos = href.indexOf('#');

  if (pos == -1) {
    return ''
  }

  return decodeURI(href.slice(pos+1));
}

/**
 * 替换完整的url
 * @param  {[type]} path [description]
 * @return {[type]}      [description]
 */
export function getUrl(path) {
  var href = window.location.href,
      hash = href.indexOf('#'),
      url;

  if (hash > -1) {
    url = href.slice(0, hash)
  } else {
    url = href;
  }

  return url + "#" + path;
}
/**
 *  顺序执行函数的迭代器
 */
function iterator(queue, hooks, onComplete) {

}
