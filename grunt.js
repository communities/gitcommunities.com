/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: '<json:package.json>',
    meta: {
      banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
        '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
        '<%= pkg.homepage ? "* " + pkg.homepage + "\n" : "" %>' +
        '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author %>;' +
        ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */'
    },
    lint: {
      files: ['public/js/app.js']
    },
    concat: {
      dist: {
        src: ['<banner:meta.banner>', 'public/js/jquery-1.8.0.js', 'public/js/underscore.js', 'public/js/async.min.js', 'public/js/moment.js', 'public/js/page.js', 'public/js/github.js', 'public/js/spin.js', 'public/js/showdown.js', 'public/js/epiceditor.js', 'public/js/app.js'],
        dest: 'public/app.js'
      }
    },
    min: {
      dist: {
        src: ['<banner:meta.banner>', 'public/js/jquery-1.8.0.js', 'public/js/underscore.js', 'public/js/async.min.js', 'public/js/moment.js', 'public/js/page.js', 'public/js/github.js', 'public/js/spin.js', 'public/js/showdown.js', 'public/js/epiceditor.js', 'public/js/app.js'],
        dest: 'public/app.min.js'
      }
    },
    watch: {
      files: '<config:lint.files>',
      tasks: 'concat'
    },
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        browser: true
      },
      globals: {
        jQuery: true
      }
    },
    uglify: {}
  });

  // Default task.
  grunt.registerTask('default', 'lint qunit concat min');

};
