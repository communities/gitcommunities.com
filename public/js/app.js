$(function(){

  function showPage(pagename, fn){
    $(".page.visible").removeClass('visible').addClass('invisible');

    $("#" + pagename).removeClass('invisible').addClass('visible');

    if(fn){
      fn();
    }
  }

  // ROUTER

  function renderHomePage(){
    var $communitiesListEl = $('#communities-list');
    var github = new Github({}).getUser();
    github.orgRepos('communities', function(err, repos){
      renderArray(repos, $communitiesListEl, 'home-page-community-tpl');
    });
  }

  function renderCommunityPage(community){
    var $threadsListEl = $('#threads-list');
    var repo = new Github({}).getRepo('communities', community);
    repo.listBranches(function(err, branches){
      var data = [];
      _.each(branches, function(branch){
        data.push({name: branch, community: community});
      });
      renderArray(data, $threadsListEl, 'community-page-thread-tpl');
    });
  }
  
  function renderThreadPage(community, thread){
    var repo = new Github({}).getRepo('communities', community);
    repo.getTree(thread, function(err, tree){
      console.log(tree);
      var workers = [];
      var i = 0;
      for(; i < tree.length; i++){
        var node = tree[i];
        (function(node){
          var worker = function(callback){
            repo.read(thread, node.path, function(err, data, sha){
              callback(err, {content: data, thread: thread, path: node.path, sha: sha});    
            });
          };
          workers.push(worker);
        })(node);
      }
      async.parallel(workers, function(erros, files){
        files = _.first(files, files.length - 1);
        console.log("files", files);
        repo.commits("0eaaef6e5cba616d78e7428beda0f9c4320126dc", function(err, commits){
          commits = _.first(commits, commits.length - 1);
          console.log("commits", commits);
          var mdConverter = new Showdown.converter();
          var $messagesListEL = $('#messages-list');
          var i = 0;
          for(; i < commits.length; i++){
            var k = commits.length - i - 1;
            var file = files[k];
            var commit = commits[i];
            file.commit = commit;
            file.html = mdConverter.makeHtml(file.content);
          }
          console.log("new files", files);
          // _.each(files, function(file){
          //   file.html = mdConverter.makeHtml(file.content);
          // });
          renderArray(files, $messagesListEL, 'thread-page-message-tpl');
          });
        
      });
    });
    
    
  }

  function renderArray(array, containerEl, templateName){
    var i = 0;
    var tplStr = $('#' + templateName).html();
    var tpl = _.template(tplStr);
    for(; i <  array.length; i++){
      var html = tpl(array[i]);
      containerEl.append(html);
    }
  }

  page('', function(){
    showPage('home-page', renderHomePage);    
  });

  page('/communities/:community', function(ctx){
    showPage('community-page', function(){
      renderCommunityPage(ctx.params.community);
    }); 
  });

  page('/communities/:community/:thread', function(ctx){
    showPage('thread-page', function(){
      renderThreadPage(ctx.params.community, ctx.params.thread);
    }); 
  });

  page.start({ click: false });
  
});