'use strict';

var path = require('path'),
	Vinyl = require('vinyl'),
	PluginError = require('plugin-error'),
	consolidate = require('consolidate'),
	_ = require('lodash'),
	Stream = require('stream'),
    fs = require('fs');

var PLUGIN_NAME  = 'gulp-iconfont-css';

function iconfontCSS(config) {
    var glyphMap = [],
        iconsMap = {},
        currentGlyph,
        currentCodePoint,
        lastCodepoint,
        inputFilePrefix,
        stream,
        outputFile,
        engine,
        cssClass,
        savedGlyph;

	// Set default values
	config = _.merge({
		path: 'css',
		targetPath: '_icons.css',
		fontPath: './',
		engine: 'lodash',
		firstGlyph: 0xE001,
		fixedCodepoints: false,
		cssClass: 'icon',
		aliases: {},
		cacheBuster: '',
        glyphMapFilePath: ''
	}, config);

	// Enable default stylesheet generators
	if(!config.path) {
		config.path = 'scss';
	}
	if(/^(scss|sass|less|css)$/i.test(config.path)) {
		config.path = __dirname + '/templates/_icons.' + config.path;
	}

	// Validate config
	if (!config.fontName) {
		throw new PluginError(PLUGIN_NAME, 'Missing option "fontName"');
	}
	if (!consolidate[config.engine]) {
		throw new PluginError(PLUGIN_NAME, 'Consolidate missing template engine "' + config.engine + '"');
	}
	try {
		engine = require(config.engine);
	} catch(e) {
		throw new PluginError(PLUGIN_NAME, 'Template engine "' + config.engine + '" not present');
	}

	// Define starting point
	currentGlyph = config.firstGlyph;

	// Happy streaming
	stream = Stream.PassThrough({
		objectMode: true
	});

    if (config.glyphMapFilePath) {
        fs.readFile(config.glyphMapFilePath, 'utf8', function (err, data) {
            if (err && err.code != 'ENOENT')
                throw err;

            config.fixedCodepoints = data ? JSON.parse(data) : [];
            lastCodepoint = config.fixedCodepoints.length ? "0x" + config.fixedCodepoints[config.fixedCodepoints.length - 1].codePoint : null;
            console.log('Icons Map Read!');
        });
    }

	stream._transform = function(file, unused, cb) {
		var fileName;

		if (file.isNull()) {
			this.push(file);
			return cb();
		}

		// Create output file
		if (!outputFile) {
			outputFile = new Vinyl({
				base: file.base,
				cwd: file.cwd,
				path: path.join(file.base, config.targetPath),
				contents: file.isBuffer() ? Buffer.alloc(0) : new Stream.PassThrough()
			});
		}

		fileName = path.basename(file.path, '.svg');

        if (config.glyphMapFilePath) {
            savedGlyph = config.fixedCodepoints.find(function(icon) {
                return icon.fileName == fileName;
            });
            if (savedGlyph) {
                currentCodePoint = savedGlyph.codePoint;
                currentGlyph = ("0x" + currentCodePoint);
                currentGlyph++;
            } else {
                currentCodePoint = (lastCodepoint ? ++lastCodepoint : currentGlyph++).toString(16).toUpperCase();
            }
        } else {
            if (config.fixedCodepoints && config.fixedCodepoints[fileName]) {
                currentCodePoint = config.fixedCodepoints[fileName].toString(16).toUpperCase();
            } else {
                currentCodePoint = (currentGlyph++).toString(16).toUpperCase();
            }
        }

        // Add glyph
		glyphMap.push({
			fileName: fileName,
			codePoint: currentCodePoint
		});

		if (config.aliases[fileName]) {
			_.each(config.aliases[fileName], function(_alias) {
				glyphMap.push({
					fileName: _alias,
					codePoint: currentCodePoint,
					originalFileName: fileName // used for less and scss
				});
			})
		}

		// Prepend codePoint to input file path for gulp-iconfont
		inputFilePrefix = 'u' + currentCodePoint + '-';

		file.path = path.dirname(file.path) + '/' + inputFilePrefix + path.basename(file.path);

		this.push(file);
		cb();
	};

	stream._flush = function(cb) {
		var content;
		if (glyphMap.length) {

            if (config.glyphMapFilePath) {
                glyphMap.sort(function (a, b) {
                    var iconA = a.codePoint,
                        iconB = b.codePoint;

                    if (iconA < iconB) return -1;
                    if (iconA > iconB) return 1;

                    return 0;
                });
                fs.writeFile(config.glyphMapFilePath, JSON.stringify(glyphMap), function (err) {
                    if (err)
                        throw err;
                    console.log('Icons Map Saved!');
                });
            }

			consolidate[config.engine](config.path, {
					glyphs: glyphMap,
					fontName: config.fontName,
					fontPath: config.fontPath,
					cssClass: config.cssClass,
					cacheBuster: config.cacheBuster,
					cacheBusterQueryString: config.cacheBuster ? '?' + config.cacheBuster : ''
				}, function(err, html) {
					if (err) {
						throw new PluginError(PLUGIN_NAME, 'Error in template: ' + err.message);
					}

					content = Buffer.from(html);

					if (outputFile.isBuffer()) {
						outputFile.contents = content;
					} else {
						outputFile.contents.write(content);
						outputFile.contents.end();
					}

					stream.push(outputFile);

					cb();
			});
		} else {
			cb();
		}
	};

	return stream;
};

module.exports = iconfontCSS;
