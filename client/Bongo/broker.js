(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return window.setImmediate;
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/node_modules_koding/koding-broker-client/lib/broker-client/index.js",function(require,module,exports,__dirname,__filename,process,global){exports.Broker = require('./broker');

exports.Channel = require('./channel');

if (typeof window !== "undefined" && window !== null) {
  window['KDBroker'] = exports;
}

});

require.define("/node_modules_koding/koding-broker-client/lib/broker-client/broker.js",function(require,module,exports,__dirname,__filename,process,global){var Broker,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __slice = [].slice;

module.exports = Broker = (function(_super) {
  var CLOSED, Channel, NOTREADY, READY, createId, emitToChannel, _ref;

  __extends(Broker, _super);

  _ref = [0, 1, 3], NOTREADY = _ref[0], READY = _ref[1], CLOSED = _ref[2];

  Channel = require('./channel');

  createId = require('hat');

  emitToChannel = require('./util').emitToChannel;

  function Broker(ws, options) {
    var _ref1, _ref2;

    Broker.__super__.constructor.apply(this, arguments);
    this.sockURL = ws;
    this.autoReconnect = options.autoReconnect, this.authExchange = options.authExchange, this.overlapDuration = options.overlapDuration, this.servicesEndpoint = options.servicesEndpoint;
    if ((_ref1 = this.overlapDuration) == null) {
      this.overlapDuration = 3000;
    }
    if ((_ref2 = this.authExchange) == null) {
      this.authExchange = 'auth';
    }
    this.readyState = NOTREADY;
    this.channels = {};
    this.namespacedEvents = {};
    this.subscriptions = {};
    if (this.autoReconnect) {
      this.initBackoff(options.backoff);
    }
    this.connect();
  }

  Broker.prototype.initBackoff = require('koding-backoff');

  Broker.prototype.setP2PKeys = function(channelName, _arg, serviceType) {
    var bindingKey, channel, consumerChannel, producerChannel, routingKey;

    routingKey = _arg.routingKey, bindingKey = _arg.bindingKey;
    channel = this.channels[channelName];
    if (!channel) {
      return;
    }
    channel.close();
    consumerChannel = this.subscribe(bindingKey, {
      exchange: 'chat',
      isReadOnly: true,
      isSecret: true
    });
    consumerChannel.setAuthenticationInfo({
      serviceType: serviceType
    });
    consumerChannel.pipe(channel);
    producerChannel = this.subscribe(routingKey, {
      exchange: 'chat',
      isReadOnly: false,
      isSecret: true
    });
    producerChannel.setAuthenticationInfo({
      serviceType: serviceType
    });
    channel.off('publish');
    channel.on('publish', producerChannel.bound('publish'));
    channel.consumerChannel = consumerChannel;
    channel.producerChannel = producerChannel;
    return channel;
  };

  Broker.prototype.bound = require('koding-bound');

  Broker.prototype.onopen = function() {
    var _this = this;

    this.clearBackoffTimeout();
    this.once('broker.connected', function(newSocketId) {
      return _this.socketId = newSocketId;
    });
    if (this.readyState === CLOSED) {
      this.resubscribe();
    }
    this.readyState = READY;
    this.emit('ready');
    return this.emit('connected');
  };

  Broker.prototype.onclose = function() {
    var _this = this;

    this.readyState = CLOSED;
    this.emit("disconnected", Object.keys(this.channels));
    if (this.autoReconnect) {
      return process.nextTick(function() {
        return _this.connectAttemptFail();
      });
    }
  };

  Broker.prototype.connectAttemptFail = function() {
    return this.setBackoffTimeout(this.bound("connect"), this.bound("connectFail"));
  };

  Broker.prototype.selectAndConnect = function() {
    var xhr,
      _this = this;

    xhr = new XMLHttpRequest;
    xhr.open('GET', this.servicesEndpoint);
    xhr.onreadystatechange = function() {
      var response, _ref1;

      if (xhr.status === 0 || xhr.status >= 400) {
        _this.connectAttemptFail();
        return _this;
      }
      if (xhr.readyState !== 4) {
        return;
      }
      if ((_ref1 = xhr.status) !== 200 && _ref1 !== 304) {
        return;
      }
      response = JSON.parse(xhr.responseText);
      _this.sockURL = "" + (Array.isArray(response) ? response[0] : response) + "/subscribe";
      return _this.connectDirectly();
    };
    return xhr.send();
  };

  Broker.prototype.connectDirectly = function() {
    var _this = this;

    this.ws = new SockJS(this.sockURL);
    this.ws.addEventListener('open', this.bound('onopen'));
    this.ws.addEventListener('close', this.bound('onclose'));
    this.ws.addEventListener('message', this.bound('handleMessageEvent'));
    return this.ws.addEventListener('message', function() {
      return _this.emit('messageArrived');
    });
  };

  Broker.prototype.disconnect = function(reconnect) {
    if (reconnect == null) {
      reconnect = true;
    }
    if (reconnect != null) {
      this.autoReconnect = !!reconnect;
    }
    return this.ws.close();
  };

  Broker.prototype.connect = function() {
    if (this.servicesEndpoint != null) {
      return this.selectAndConnect();
    } else {
      return this.connectDirectly();
    }
  };

  Broker.prototype.connectFail = function() {
    return this.emit('connectFailed');
  };

  Broker.prototype.createRoutingKeyPrefix = function(name, options) {
    var isReadOnly, suffix;

    if (options == null) {
      options = {};
    }
    isReadOnly = options.isReadOnly, suffix = options.suffix;
    name += suffix || '';
    if (isReadOnly) {
      return name;
    } else {
      return "client." + name;
    }
  };

  Broker.prototype.wrapPrivateChannel = function(channel) {
    var _this = this;

    channel.on('cycle', function() {
      return _this.authenticate(channel);
    });
    return channel.on('setSecretNames', function(secretName) {
      var consumerChannel, isReadOnly;

      isReadOnly = channel.isReadOnly;
      channel.setSecretName(secretName);
      channel.isForwarder = true;
      consumerChannel = _this.subscribe(secretName.publishingName, {
        isReadOnly: isReadOnly,
        isSecret: true,
        exchange: channel.exchange
      });
      consumerChannel.setAuthenticationInfo({
        serviceType: 'secret',
        wrapperRoutingKeyPrefix: channel.routingKeyPrefix
      });
      channel.consumerChannel = consumerChannel;
      consumerChannel.on('cycleChannel', function() {
        channel.oldConsumerChannel = channel.consumerChannel;
        return channel.cycle();
      });
      if (!isReadOnly) {
        channel.on('publish', function() {
          var rest;

          rest = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
          return consumerChannel.publish.apply(consumerChannel, rest);
        });
      }
      _this.swapPrivateSourceChannel(channel);
      return channel.emit('ready');
    });
  };

  Broker.prototype.swapPrivateSourceChannel = function(channel) {
    var consumerChannel, oldConsumerChannel,
      _this = this;

    consumerChannel = channel.consumerChannel, oldConsumerChannel = channel.oldConsumerChannel;
    if (oldConsumerChannel != null) {
      return setTimeout(function() {
        oldConsumerChannel.close().off();
        delete channel.oldConsumerChannel;
        return consumerChannel.pipe(channel);
      }, this.overlapDuration);
    } else {
      return consumerChannel.pipe(channel);
    }
  };

  Broker.prototype.registerNamespacedEvent = function(name) {
    var register, _ref1;

    register = this.namespacedEvents;
    if ((_ref1 = register[name]) == null) {
      register[name] = 0;
    }
    register[name] += 1;
    return register[name] === 1;
  };

  Broker.prototype.createChannel = function(name, options) {
    var channel, exchange, handler, isExclusive, isP2P, isPrivate, isReadOnly, isSecret, routingKeyPrefix, suffix,
      _this = this;

    if (this.channels[name] != null) {
      return this.channels[name];
    }
    isReadOnly = options.isReadOnly, isSecret = options.isSecret, isExclusive = options.isExclusive, isPrivate = options.isPrivate, isP2P = options.isP2P, suffix = options.suffix, exchange = options.exchange;
    if (suffix == null) {
      suffix = isExclusive ? "." + (createId(32)) : '';
    }
    routingKeyPrefix = this.createRoutingKeyPrefix(name, {
      suffix: suffix,
      isReadOnly: isReadOnly
    });
    channel = new Channel(name, routingKeyPrefix, {
      isReadOnly: isReadOnly,
      isSecret: isSecret,
      isP2P: isP2P,
      isExclusive: isExclusive != null ? isExclusive : isPrivate,
      exchange: exchange
    });
    this.on('broker.subscribed', handler = function(routingKeyPrefixes) {
      var prefix, _i, _len, _ref1;

      _ref1 = routingKeyPrefixes.split(' ');
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        prefix = _ref1[_i];
        if (!(prefix === routingKeyPrefix)) {
          continue;
        }
        _this.authenticate(channel);
        channel.emit('broker.subscribed', channel.routingKeyPrefix);
        return;
      }
    });
    this.on(routingKeyPrefix, function() {
      var rest;

      rest = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      if (!channel.isForwarder) {
        return channel.emit.apply(channel, ['message'].concat(__slice.call(rest)));
      }
    });
    channel.on('newListener', function(event, listener) {
      var namespacedEvent, needsToBeRegistered;

      if (channel.isExclusive || channel.isP2P) {
        channel.trackListener(event, listener);
      }
      if (event !== 'broker.subscribed') {
        namespacedEvent = "" + routingKeyPrefix + "." + event;
        needsToBeRegistered = _this.registerNamespacedEvent(namespacedEvent);
        if (needsToBeRegistered) {
          return _this.on(namespacedEvent, function() {
            var rest;

            rest = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
            return emitToChannel.apply(null, [_this, channel, event].concat(__slice.call(rest)));
          });
        }
      }
    });
    if (!isSecret) {
      channel.on('auth.authOk', function() {
        return channel.isAuthenticated = true;
      });
    }
    channel.once('error', channel.bound('close'));
    channel.once('close', function() {
      return _this.unsubscribe(channel.name);
    });
    if (isExclusive || isPrivate) {
      this.wrapPrivateChannel(channel);
    }
    if (!(isPrivate || isReadOnly)) {
      channel.on('publish', function(options, payload) {
        var _ref1, _ref2, _ref3;

        if (payload == null) {
          _ref1 = [options, payload], payload = _ref1[0], options = _ref1[1];
        }
        exchange = (_ref2 = (_ref3 = options != null ? options.exchange : void 0) != null ? _ref3 : channel.exchange) != null ? _ref2 : channel.name;
        return _this.publish({
          exchange: exchange,
          routingKey: channel.name
        }, payload);
      });
    }
    this.channels[name] = channel;
    return channel;
  };

  Broker.prototype.authenticate = function(channel) {
    var authInfo, key, val, _ref1;

    authInfo = {};
    _ref1 = channel.getAuthenticationInfo();
    for (key in _ref1) {
      if (!__hasProp.call(_ref1, key)) continue;
      val = _ref1[key];
      authInfo[key] = val;
    }
    authInfo.routingKey = channel.routingKeyPrefix;
    return this.publish(this.authExchange, authInfo);
  };

  Broker.prototype.handleMessageEvent = function(event) {
    var message;

    message = event.data;
    this.emit('rawMessage', message);
    if (message.routingKey) {
      this.emit(message.routingKey, message.payload);
    }
  };

  Broker.prototype.ready = function(listener) {
    if (this.readyState === READY) {
      return process.nextTick(listener);
    } else {
      return this.once('ready', listener);
    }
  };

  Broker.prototype.send = function(data) {
    var _this = this;

    this.ready(function() {
      var e;

      try {
        return _this.ws._transport.doSend(JSON.stringify(data));
      } catch (_error) {
        e = _error;
        return _this.disconnect();
      }
    });
    return this;
  };

  Broker.prototype.publish = function(options, payload) {
    var exchange, routingKey;

    this.emit('messagePublished');
    if ('string' === typeof options) {
      routingKey = exchange = options;
    } else {
      routingKey = options.routingKey, exchange = options.exchange;
    }
    routingKey = this.createRoutingKeyPrefix(routingKey);
    if ('string' !== typeof payload) {
      payload = JSON.stringify(payload);
    }
    this.send({
      action: 'publish',
      exchange: exchange,
      routingKey: routingKey,
      payload: payload
    });
    return this;
  };

  Broker.prototype.resubscribeBySocketId = function() {
    var _this = this;

    this.send({
      action: 'resubscribe',
      socketId: this.socketId
    });
    return this.once('broker.resubscribed', function(found) {
      var channel, _, _ref1, _results;

      if (found) {
        _ref1 = _this.channels;
        _results = [];
        for (_ in _ref1) {
          if (!__hasProp.call(_ref1, _)) continue;
          channel = _ref1[_];
          _results.push(channel.emit('broker.subscribed'));
        }
        return _results;
      } else {
        return _this.resubscribeBySubscriptions();
      }
    });
  };

  Broker.prototype.resubscribeBySubscriptions = function() {
    var rk, routingKeyPrefix, _;

    routingKeyPrefix = ((function() {
      var _ref1, _results;

      _ref1 = this.subscriptions;
      _results = [];
      for (_ in _ref1) {
        if (!__hasProp.call(_ref1, _)) continue;
        rk = _ref1[_].routingKeyPrefix;
        _results.push(rk);
      }
      return _results;
    }).call(this)).join(' ');
    return this.send({
      action: 'subscribe',
      routingKeyPrefix: routingKeyPrefix
    });
  };

  Broker.prototype.resubscribe = function(callback) {
    if (this.socketId != null) {
      return this.resubscribeBySocketId();
    } else {
      return this.resubscribeBySubscriptions();
    }
  };

  Broker.prototype.subscribe = function(name, options, callback) {
    var channel, exchange, handler, isExclusive, isP2P, isPrivate, isReadOnly, isSecret, routingKeyPrefix, suffix,
      _this = this;

    if (options == null) {
      options = {};
    }
    channel = this.channels[name];
    if (channel == null) {
      isSecret = !!options.isSecret;
      isExclusive = !!options.isExclusive;
      isReadOnly = options.isReadOnly != null ? !!options.isReadOnly : isExclusive;
      isPrivate = !!options.isPrivate;
      isP2P = !!options.isP2P;
      suffix = options.suffix, exchange = options.exchange;
      routingKeyPrefix = this.createRoutingKeyPrefix(name, {
        isReadOnly: isReadOnly
      });
      this.subscriptions[name] = {
        name: name,
        routingKeyPrefix: routingKeyPrefix,
        arguments: arguments
      };
      channel = this.channels[name] = this.createChannel(name, {
        isReadOnly: isReadOnly,
        isSecret: isSecret,
        isExclusive: isExclusive,
        isPrivate: isPrivate,
        isP2P: isP2P,
        suffix: suffix,
        exchange: exchange
      });
    }
    this.send({
      action: 'subscribe',
      routingKeyPrefix: channel.routingKeyPrefix
    });
    if (callback != null) {
      this.on('broker.subscribed', handler = function(routingKeyPrefixes) {
        var prefix, _i, _len, _ref1;

        _ref1 = routingKeyPrefixes.split(' ');
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          prefix = _ref1[_i];
          if (!(prefix === routingKeyPrefix)) {
            continue;
          }
          _this.off('broker.subscribed', handler);
          callback(prefix);
          return;
        }
      });
    }
    return channel;
  };

  Broker.prototype.unsubscribe = function(name) {
    this.send({
      action: 'unsubscribe',
      routingKeyPrefix: this.createRoutingKeyPrefix(name)
    });
    delete this.channels[name];
    delete this.subscriptions[name];
    return this;
  };

  Broker.prototype.ping = function(callback) {
    this.send({
      action: "ping"
    });
    if (callback != null) {
      return this.once("broker.pong", callback);
    }
  };

  return Broker;

})(KDEventEmitter.Wildcard);

});

require.define("/node_modules_koding/koding-broker-client/lib/broker-client/channel.js",function(require,module,exports,__dirname,__filename,process,global){var Channel,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __slice = [].slice;

module.exports = Channel = (function(_super) {
  __extends(Channel, _super);

  function Channel(name, routingKeyPrefix, options) {
    var _this = this;

    this.name = name;
    this.routingKeyPrefix = routingKeyPrefix;
    Channel.__super__.constructor.apply(this, arguments);
    this.isOpen = true;
    this.isReadOnly = options.isReadOnly, this.isSecret = options.isSecret, this.isExclusive = options.isExclusive, this.isP2P = options.isP2P, this.exchange = options.exchange;
    if (this.isExclusive || this.isP2P) {
      this.eventRegister = [];
      this.trackListener = function(event, listener) {
        var _ref;

        _this.eventRegister.push({
          event: event,
          listener: listener
        });
        if (event !== 'publish') {
          return (_ref = _this.consumerChannel) != null ? _ref.on(event, listener) : void 0;
        }
      };
    }
  }

  Channel.prototype.publish = function() {
    var rest;

    rest = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (!this.isReadOnly) {
      return this.emit.apply(this, ['publish'].concat(__slice.call(rest)));
    }
  };

  Channel.prototype.close = function() {
    this.isOpen = false;
    return this.emit('close');
  };

  Channel.prototype.cycle = function() {
    if (this.isOpen) {
      return this.emit('cycle');
    }
  };

  Channel.prototype.pipe = function(channel) {
    var event, listener, _i, _len, _ref, _ref1;

    _ref = channel.eventRegister;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      _ref1 = _ref[_i], event = _ref1.event, listener = _ref1.listener;
      if (event !== 'publish') {
        this.on(event, listener);
      }
    }
    return this.on('message', function(message) {
      return channel.emit('message', message);
    });
  };

  Channel.prototype.setAuthenticationInfo = function(authenticationInfo) {
    this.authenticationInfo = authenticationInfo;
  };

  Channel.prototype.getAuthenticationInfo = function() {
    return this.authenticationInfo;
  };

  Channel.prototype.isListeningTo = function(event) {
    var listeners, _ref;

    listeners = (_ref = this._events) != null ? _ref[event] : void 0;
    return listeners && (Object.keys(listeners)).length > 0;
  };

  Channel.prototype.setSecretName = function(secretName) {
    this.secretName = secretName;
  };

  Channel.prototype.bound = require('koding-bound');

  return Channel;

})(KDEventEmitter);

});

require.define("/node_modules/koding-bound/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js"}
});

require.define("/node_modules/koding-bound/index.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = require('./lib/koding-bound');
});

require.define("/node_modules/koding-bound/lib/koding-bound/index.js",function(require,module,exports,__dirname,__filename,process,global){var __slice = [].slice;

module.exports = function() {
  var boundMethod, method, rest, _ref;

  method = arguments[0], rest = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
  if (this[method] == null) {
    throw new Error("Unknown method! " + method);
  }
  boundMethod = "__bound__" + method;
  boundMethod in this || Object.defineProperty(this, boundMethod, {
    value: (_ref = this[method]).bind.apply(_ref, [this].concat(__slice.call(rest)))
  });
  return this[boundMethod];
};

});

require.define("/node_modules/hat/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js"}
});

require.define("/node_modules/hat/index.js",function(require,module,exports,__dirname,__filename,process,global){var hat = module.exports = function (bits, base) {
    if (!base) base = 16;
    if (bits === undefined) bits = 128;
    if (bits <= 0) return '0';
    
    var digits = Math.log(Math.pow(2, bits)) / Math.log(base);
    for (var i = 2; digits === Infinity; i *= 2) {
        digits = Math.log(Math.pow(2, bits / i)) / Math.log(base) * i;
    }
    
    var rem = digits - Math.floor(digits);
    
    var res = '';
    
    for (var i = 0; i < Math.floor(digits); i++) {
        var x = Math.floor(Math.random() * base).toString(base);
        res = x + res;
    }
    
    if (rem) {
        var b = Math.pow(base, rem);
        var x = Math.floor(Math.random() * b).toString(base);
        res = x + res;
    }
    
    var parsed = parseInt(res, base);
    if (parsed !== Infinity && parsed >= Math.pow(2, bits)) {
        return hat(bits, base)
    }
    else return res;
};

hat.rack = function (bits, base, expandBy) {
    var fn = function (data) {
        var iters = 0;
        do {
            if (iters ++ > 10) {
                if (expandBy) bits += expandBy;
                else throw new Error('too many ID collisions, use more bits')
            }
            
            var id = hat(bits, base);
        } while (Object.hasOwnProperty.call(hats, id));
        
        hats[id] = data;
        return id;
    };
    var hats = fn.hats = {};
    
    fn.get = function (id) {
        return fn.hats[id];
    };
    
    fn.set = function (id, value) {
        fn.hats[id] = value;
        return fn;
    };
    
    fn.bits = bits || 128;
    fn.base = base || 16;
    return fn;
};

});

require.define("/node_modules_koding/koding-broker-client/lib/broker-client/util.js",function(require,module,exports,__dirname,__filename,process,global){var __slice = [].slice;

exports.emitToChannel = function() {
  var channel, ctx, event, oldChannelEvent, rest;

  ctx = arguments[0], channel = arguments[1], event = arguments[2], rest = 4 <= arguments.length ? __slice.call(arguments, 3) : [];
  if (channel.isForwarder && (event !== 'cycleChannel' && event !== 'setSecretNames')) {
    return;
  }
  if (channel.event != null) {
    oldChannelEvent = channel.event;
  }
  channel.event = ctx.event;
  channel.emit.apply(channel, [event].concat(__slice.call(rest)));
  if (oldChannelEvent != null) {
    channel.event = oldChannelEvent;
  } else {
    delete channel.event;
  }
};

});

require.define("/node_modules/koding-backoff/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js"}
});

require.define("/node_modules/koding-backoff/index.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = require('./lib/backoff.js');
});

require.define("/node_modules/koding-backoff/lib/backoff.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = function(ctx, options) {
  var initalDelayMs, maxDelayMs, maxReconnectAttempts, multiplyFactor, totalReconnectAttempts, _ref, _ref1, _ref2, _ref3, _ref4,
    _this = this;

  if (options == null) {
    options = {};
  }
  if (!options) {
    _ref = [ctx, options], options = _ref[0], ctx = _ref[1];
  }
  ctx || (ctx = this);
  totalReconnectAttempts = 0;
  initalDelayMs = (_ref1 = options.initialDelayMs) != null ? _ref1 : 700;
  multiplyFactor = (_ref2 = options.multiplyFactor) != null ? _ref2 : 1.4;
  maxDelayMs = (_ref3 = options.maxDelayMs) != null ? _ref3 : 1000 * 15;
  maxReconnectAttempts = (_ref4 = options.maxReconnectAttempts) != null ? _ref4 : 50;
  ctx.clearBackoffTimeout = function() {
    return totalReconnectAttempts = 0;
  };
  ctx.setBackoffTimeout = function(attemptFn, failFn) {
    var timeout;

    if (totalReconnectAttempts < maxReconnectAttempts) {
      timeout = Math.min(initalDelayMs * Math.pow(multiplyFactor, totalReconnectAttempts), maxDelayMs);
      setTimeout(attemptFn, timeout);
      return totalReconnectAttempts++;
    } else {
      return failFn();
    }
  };
  return ctx;
};

});

require.define("/node_modules_koding/koding-broker-client/index.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = require('./lib/broker-client');
});
require("/node_modules_koding/koding-broker-client/index.js");
})();
