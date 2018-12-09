'use strict';

var path = require('path'),
	PluginError = require('plugin-error'),
	Vinyl = require('vinyl'),
	vfs = require('vinyl-fs'),
	nextback = require('nextback'),
	consolidate = require('consolidate'),
	_ = require('lodash'),
	Stream = require('stream');

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
	if(/^(scss|less|css)$/i.test(config.path)) {
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
		var processGlyphMap = function(path, cb) {
			var files = [],
				globber = vfs.src(path);
			cb = nextback(cb);
			globber.once('error', cb);
			globber.on('data', function(file){
				files.push(file);
			});
			globber.once('end', function(){
				cb(null, files);
			});
		};

		processGlyphMap('./glyphMap.json', function(error, files) {
			var file = files[0]

			console.log(file.contents);
		})


		if (1 == 2) {
			config.fixedCodepoints = glyphMapFile.contents ? JSON.parse(glyphMapFile.contents) : [];
			lastCodepoint = config.fixedCodepoints.length ? "0x" + config.fixedCodepoints[config.fixedCodepoints.length - 1].codePoint : null;
			console.log('Icons Map Read!');
		}
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
				contents: file.isBuffer() ? new Buffer(0) : new Stream.PassThrough()
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
				glyphMapFile.contents = JSON.stringify(glyphMap);
				console.log('Icons Map Saved!');
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

				// TODO: remove condition and the else block for version 3.0
				if( Buffer.from ){
					content = Buffer.from(html);
				}else{
					content = Buffer(html);
				}

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
