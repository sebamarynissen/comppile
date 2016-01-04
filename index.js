var hbs = require('handlebars').compile;
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs-extra'));
var path = require('path');
var nomnom = require('nomnom');
var cp = require('child_process');

// Configuration constants, such as the msbuild location and the vctargets.
var config = require('./config');
var msbuild = config.msbuild || 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\msbuild';
var vctargets = config.vctargets || 'C:\\Program Files (x86)\\MSBuild\\Microsoft.Cpp\\v4.0\\V120';

// Read in the program arguments.
var program = nomnom
	.option('output', {
		"abbr": "o",
		"help": "The output file. Optional."
	})
	.option('set-msbuild', {
		"help": "Sets the value of msbuild. Note that this will not compile, but only set the path to msbuild!"
	})
	.option('set-vctargets', {
		"help": "Sets the value of the vctragets variable. Note that this will not compile, but only set the VCTargetsPath!"
	})
	.parse();

// First of all, if we're dealing with configuration, handle it here.
var cpath = path.join(__dirname, 'config.json');
var flag = false;
if (program['set-msbuild']) {
	config.msbuild = program['set-msbuild'];
	flag = true;
}
if (program['set-vctargets']) {
	config.vctargets = program['set-vctargets'];
	flag = true;
}
if (flag) {
	fs.writeFileAsync(cpath, JSON.stringify(config, null, 2));
}
else {

	// Now parse the options into the usable filenames etc.
	var main = program[0];
	var cwd = process.cwd();
	var exe = path.join(cwd, 'Debug/buildfile.exe');
	if (program.output) {
		var dist = program.output;
	}
	else {
		var ext = new RegExp(path.extname(main) + '$');
		var dist = main.replace(ext, '.exe');
	}
	var buildhbs = path.normalize(path.join(__dirname, 'buildfile.hbs'));
	var buildfile = path.join(cwd, 'buildfile.vcxproj');
	var debug = path.join(cwd, 'Debug');

	// Okay open the file.
	fs.readFileAsync(buildhbs).then(function(raw) {
		return ''+raw;
	}).then(function(raw) {
		var tpl = hbs(raw);
		return fs.writeFileAsync(buildfile, tpl({
			"main": main,
			"vctargets": vctargets
		}));
	}).then(function() {
		return new Promise(function(resolve, reject) {

			// Run the actual compiler.
			var child = cp.spawn(msbuild, [buildfile]);
			child.stdout.pipe(process.stdout);
			child.stderr.pipe(process.stderr);
			child.stderr.on('error', function(err) {
				reject(err);
			});
			child.on('close', function() {
				resolve();
			});

		});
	}).then(function() {
		return fs.copyAsync(exe, dist);
	}).then(function() {
		return Promise.all([
			fs.removeAsync(debug),
			fs.removeAsync(buildfile)
		]);
	});

}