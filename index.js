var builder = require('./lib/builder'),
    gulp = require('gulp'),
    clean = require('gulp-clean'),
    through = require("through2"),
    path = require('path'),
    lifecycleEvents = ['onSectionPreBrowserify', 'onSectionPostBrowserify', 'onSectionPreDest', 'onPublicPreDest'],
    plugins = [],
    devServerPlugins = [];

function checkOptions(options, mergeOptions) {
    options = options || {};
    var nop = function() {
            return through(function(data) {
                    this.emit('data', data);
            });
        },
        _defaults = {
        entry: 'main.js',
        primarySection: 'base',
        buildPath: 'build',
        defaultServResource: 'index.html',
        port: 8080,
        proxy: function(gulpOptions, requestOptions, callback) {
            callback();
        }
    }
    for (var i in _defaults) {
        if (options[i] === undefined) {
            options[i] = _defaults[i];
        }
    }
    if (!_defaults.entry.match(/.*\.js/)) {
        _defaults.entry += '.js';
    }
    if (mergeOptions) {
        var rtn = {};
        for (var name in options) {
            rtn[name] = options[name];
        }
        for (var name in mergeOptions) {
            rtn[name] = mergeOptions[name];
        }
        return rtn;
    }
    console.log(JSON.stringify(options));
    return options;
}

function normalizePlugins(plugins) {
    var _plugins = {}
    for (var i in plugins) {
        var plugin = plugins[i];
        for (var j in lifecycleEvents) {
            var eventName = lifecycleEvents[j],
                lifecyclePlugin = plugin[eventName];
            if (lifecyclePlugin) {
                // a plugin exists for the current event
                var pluginPipeline = _plugins[eventName];
                if (!pluginPipeline) {
                    // initialize
                    pluginPipeline = lifecyclePlugin();
                } else {
                    // hook it into the pipeline
                    pluginPipeline = pluginPipeline.pipe(lifecyclePlugin());
                }
            }
        }
    }
    return _plugins;
}

function initPlugins(options) {
    var _plugins = options.plugins || [];

    // add direct lifecicye events from options as the first plugin
    var rootPlugin = {};
    for (var i in lifecycleEvents) {
        var eventName = lifecycleEvents[i];
        rootPlugin[eventName] = options[eventName];
    }
    plugins.push(rootPlugin);

    // add all registered plugins
    for (var i in _plugins) {
        var plugin = _plugins[i];
        plugins.push(plugin);
        if (plugin.devServer) {
            devServerPlugins.push(plugin.devServer);
        }
    }

    // normalize the plugins into a single piped object
    options.normalizedPlugins = normalizePlugins(plugins);


    // add the root devserver plugin
    devServerPlugins.push(options.devServer || {
        onRequest: function(requestOptions, pluginOptions, callback) {
            var uri = requestOptions.uri;
            if (uri === '/') {
                uri = options.defaultServResource;
            }
            callback( {
                fileName: path.join(requestOptions.base, uri)
            })
        }
    });
}

function _clean(src) {
    gulp.src(src, {read: false}).pipe(clean());
}

module.exports = function(options) {
    options = checkOptions(options);
    initPlugins(options);

    return {
        injectTasks: function(gulp, tasks) {
            if (!tasks) {
                tasks = [];
                for (var i in this) {
                    if (i != 'injectTasks') {
                        tasks.push(i);
                    }
                }
            }

            for (var i in tasks) {
                var task = tasks[i];
                if (this[task]) {
                    gulp.task(task, this[task]);
                } else {
                    throw "invalid gulp-web-module task '" + task + "'";
                }
            }
        },

        build: function() {
            builder(checkOptions(options, {buildType: gulp.env.type || 'dev'}));
        },

        watch: function() {
            builder(checkOptions(options, checkOptions(options, {buildType: gulp.env.type || 'dev', watch: true})));
        },

        watchrun: function() {
            builder(checkOptions(options, checkOptions(options, {buildType: gulp.env.type || 'dev', watch: true})));
            require("./lib/server")(checkOptions(options, { plugins: devServerPlugins })).start();
        },

        clean: function() {
            _clean(options.buildPath);
        }
    }
}
