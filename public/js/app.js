$(function(){

  function showPage(pageName, pageTitle, fn){
    $('.page.visible').removeClass('visible').addClass('invisible');

    $('#' + pageName).removeClass('invisible').addClass('visible');
    document.title = pageTitle;
    if(fn){
      fn();
    }
  }

  // RENDERERS

  function renderHomePage(){
    var $communitiesListEl = $('#communities-list').empty();
    var github = new Github({}).getUser();
    $communitiesListEl.spin();
    $.get('/api/communities', function(repos){
      $communitiesListEl.spin(false);
      renderArray(repos, $communitiesListEl, 'home-page-community-tpl');
    });
    
    $('#goto-new-community-page-btn').on('click', function(){
      page('create');
    });
    $communitiesListEl.on('click', '.join-community-btn', function(e){
      var name = $(e.currentTarget).data('name');
      $.post('/communities/' + name + '/join');
    });
  }

  function renderCreateCommunityPage(){
    var $createCommunityBtn = $('#create-new-community-btn');
    $createCommunityBtn.on('click', function(e){
      e.preventDefault();
      var name = $("#new-community-name").val();
      var description = $("#new-community-description").val();
      $.post('/communities', {name: name, description: description}, function(data){
        console.log("repo created");
        var repo = cUnity.github.getRepo('communities', name);
        repo.write('master', 'README', 'YOUR_NEW_CONTENTS', 'YOUR_COMMIT_MESSAGE', function(err){
          console.log('error saving file');
        });
      });
    });
  }

  function renderCommunityPage(community){
    var $topicsListEl = $('#topics-list').empty();
    $topicsListEl.spin();
    $.get("/api/communities/" + community, function(community){
      $topicsListEl.spin(false);
      renderArray(community.topics, $topicsListEl, 'community-page-topic-tpl');      
    });
    $('#goto-new-topic-page-btn').on('click', function(){
      page('/communities/' + community + '/create');
    });
  }
 
  function renderCreateTopicPage(community){
    var editor = new EpicEditor({container: 'new-topic-message', basePath: '/epiceditor'}).load();
   
    var $createTopicBtn = $('#create-new-topic-btn');
    $createTopicBtn.on('click', function(e){
      e.preventDefault();
      var repo = cUnity.github.getRepo('communities', community);
      repo.getRef('heads/master', function(err, sha) {
        console.log('get branch', err, sha);
        var topic = $('#new-topic-name').val();
        var refSpec = {
          ref: 'refs/heads/' + topic,
          sha: sha
        };
        repo.createRef(refSpec, function(err) {
          console.log('xx', err);
          var content = editor.getElement('editor').body.innerHTML;
          console.log('content', content);
          repo.write(topic, '1.md', content, 'start conversation', function(err) {
            if(err){
              alert("Error hapenned");
            }else{
              page("/communities/" + community + "/" + topic);
            }
          });
        });
      });
      //$.post("/communities/" + community);
    });
  }

  function renderTopicPage(community, topic){
    var repo = new Github({}).getRepo('communities', community);
    var $createMessageBtn = $('#create-new-message-btn');
    var $messagesListEl = $('#messages-list').empty();
    $messagesListEl.spin();
    repo.getTree(topic, function(err, tree){

      $createMessageBtn.on('click', function(e){
        e.preventDefault();
        var text = $('#new-message-form .new-message-content').val();
        var fileName =  tree.length + '.md';
        var authedRepo = cUnity.github.getRepo('communities', community);
        authedRepo.write(topic, fileName, text, 'reply', function(err) {
          console.log('yy', err);
        });
      });
      console.log(tree);
      var workers = [];
      var i = 0;
      for(; i < tree.length; i++){
        var node = tree[i];
        (function(node){
          var worker = function(callback){
            repo.read(topic, node.path, function(err, data, sha){
              callback(err, {content: data, topic: topic, path: node.path, sha: sha});
            });
          };
          workers.push(worker);
        })(node);
      }
      async.parallel(workers, function(erros, files){
        files = _.first(files, files.length - 1);
        console.log("files", files);
        repo.getRef('heads/' + topic, function(err, sha){

          repo.commits(sha, function(err, commits){
            commits = _.first(commits, commits.length - 1);
            console.log("commits", commits);
            var mdConverter = new Showdown.converter();
            var i = 0;
            for(; i < commits.length; i++){
              var k = commits.length - i - 1;
              var file = files[k];
              if(file){
                var commit = commits[i];
                commit.published_at = commit.commit.author.date;
                commit.published = moment(commit.published_at).fromNow();
                file.commit = commit;
                file.html = mdConverter.makeHtml(file.content);
              }
            }
            console.log("new files", files);
            $messagesListEl.spin(false);
            renderArray(files, $messagesListEl, 'topic-page-message-tpl');
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
      $('#user-profile img').attr('src', cUnity.user.avatar);
      $('#user-profile span').text(cUnity.user.username);
      cUnity.github = new Github({
        token: cUnity.user.accessToken,
        auth: "oauth"
      });
    }
    var $breadcumbsEl = $('.app-header nav.breadcrumbs ul').empty();
    var pathes = ctx.path.split("/");
    var i = 1;
    for(; i < pathes.length; i++){
      if(i != 1){
        $breadcumbsEl.append("<li>></li>");
      }
      var html = '';
      if(i == 1){
       html = "<li><a class='nav-link' href='/'>Home</a></li>";
      } else if(i == 2){
       html = "<li><a class='nav-link' href='/communities/" + pathes[i] + "'>" + pathes[i] + "</a></li>";
      } else {
        html = "<li>" + pathes[i] + "</li>";
      }

      $breadcumbsEl.append(html);
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
    showPage('home-page', 'Communities', renderHomePage);
  });
  
  page('/create', renderHeader, function(){
    showPage('new-community-page', 'Communities: create new one', renderCreateCommunityPage);
  });
 
  page('/communities/:community', renderHeader, function(ctx){
    showPage('community-page', ctx.params.community,  function(){
      renderCommunityPage(ctx.params.community);
    });
  });

  page('/communities/:community/create', renderHeader, function(ctx){
    showPage('new-topic-page', ctx.params.community + ': create new topic', function(){
      renderCreateTopicPage(ctx.params.community);
    });
  });


  page('/communities/:community/:topic', renderHeader, function(ctx){
    showPage('topic-page', ctx.params.community + ': ' + ctx.params.topic, function(){
      renderTopicPage(ctx.params.community, ctx.params.topic);
    });
  });

  page.start({ click: false });

  $('html').on('click', 'a.nav-link', function(e){
    e.preventDefault();
    var href = $(e.currentTarget).attr('href');
    page(href);
  });
  
});