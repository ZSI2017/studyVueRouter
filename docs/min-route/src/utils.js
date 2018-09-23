function supportPushState() {
  return window.history && 'pushState' in window.history
}

/**
 * 多维数组，转化为一维数组
 */
function flatten(queue) {
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
 *  顺序执行函数的迭代器
 */
function iterator(queue, hooks, onComplete) {

}
