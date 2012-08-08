$(function(){

  function showPage(pagename, fn) {
    $(".page.visible").removeClass('visible').addClass('invisible');

    $("#" + pagename).removeClass('invisible').addClass('visible');

    if (fn) {
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
      var i = 0;
      for(; i < tree.length; i++){
        var node = tree[i];
        repo.read(thread, node.path, function(err, data){
          console.log(data);
        });
      }
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