$(function(){

  function showPage(pagename, fn){
    $(".page.visible").removeClass('visible').addClass('invisible');

    $("#" + pagename).removeClass('invisible').addClass('visible');

    if(fn){
      fn();
    }
  }

  // RENDERERS

  function renderHomePage(){
    var $communitiesListEl = $('#communities-list');
    var github = new Github({}).getUser();
    github.orgRepos('communities', function(err, repos){
      _.each(repos, function(repo){
        repo.created = moment(repo.created_at).fromNow();
      });
      renderArray(repos, $communitiesListEl, 'home-page-community-tpl');
    });
    
    $('#goto-new-community-page-btn').on('click', function(){
      page('create');
    });
    $('#communities-list').on('click', '.join-community-btn', function(e){
      var name = $(e.currentTarget).data('name');
      $.post('/communities/' + name + '/join');
    });
  }

  function renderCreateCommunityPage(){
    var $createCommunityBtn = $('#create-new-community-btn');
    $createCommunityBtn.on('click', function(){
      var name = $("#new-community-name").val();
      var description = $("#new-community-description").val();
      $.post('/communities', {name: name, description: description}, function(data){
        console.log("repo created");
      });
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
    $.get("/communities/" + community + '/members', function(members){
      console.log("members", members);
    });
    var $createThreadBtn = $('#create-new-thread-btn');
    $createThreadBtn.on('click', function(){
      var refSpec = {
        "ref": "refs/heads/test",
        "sha": "496a6ddf94d1889a27e1979c9578f9e1257e40c3"
      };
      var repo = cUnity.github.getRepo('communities', community);
      console.log('user', cUnity.github.getUser());
      repo.getRef('heads/master', function(err, sha) {
        console.log('get branch', err, sha);
      });
      // repo.createRef(refSpec, function(err){
      //   console.log("create branch", err);
      // });
      $.post("/communities/" + community);
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
        repo.getRef('heads/' + thread, function(err, sha){

          repo.commits(sha, function(err, commits){
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

            renderArray(files, $messagesListEL, 'thread-page-message-tpl');
            });
        
          });


        });
    });
    
    
  }
  function renderHeader(ctx, next){
    if(_.isEmpty(cUnity.user.username)){
      console.log('unlogined');
      $('html').addClass('unlogined');
    } else{
      console.log('logined');
      $('html').addClass('logined');
      cUnity.github = new Github({
        token: cUnity.user.accessToken,
        auth: "oauth"
      });
    }
    var $breadcumbsEl = $('.app-header nav.breadcrumbs ul');
    var pathes = ctx.path.split("/");
    var i = 1;
    for(; i < pathes.length; i++){
      if(i != 1){
        $breadcumbsEl.append("<li>></li>");
      }
      $breadcumbsEl.append("<li>" + pathes[i] + "</li>");
    }
    next();
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
  // ROUTER

  page('', renderHeader, function(){
    showPage('home-page', renderHomePage);
  });
  
  page('/create', renderHeader, function(){
    showPage('new-community-page', renderCreateCommunityPage);
  });

  page('/communities/:community', renderHeader, function(ctx){
    showPage('community-page', function(){
      renderCommunityPage(ctx.params.community);
    });
  });

  page('/communities/:community/:thread', renderHeader, function(ctx){
    showPage('thread-page', function(){
      renderThreadPage(ctx.params.community, ctx.params.thread);
    });
  });

  page.start({ click: false });
  
});