// (c) Mihai Bazon 2010 <mihai.bazon@gmail.com>
// http://www.dynarch.com/
// Distributed under the BSD license.
//
// http://mihai.bazon.net/blog/redis-client-library-javascript-node/utils.js

function listeners(target, handlers) {
  for (var i in handlers) if (handlers.hasOwnProperty(i))
    target.addListener(i, handlers[i]);
};

//> the most useful function, ever.
function curry(obj, func) {
  var copy = Array.prototype.slice, args = copy.call(arguments, 2);
  return function() {
    return func.apply(obj, args.concat(copy.call(arguments)));
  };
};

exports.listeners = listeners;
exports.curry = curry;
