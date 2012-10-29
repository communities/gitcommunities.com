/*global cUnity: false, console: false, $: false, moment: false, _: false, page: false, async: false, alert: false, Showdown: false, EpicEditor: false, Github: false */
$(function(){
  var socket = io.connect('https://gitcommunities.com');

  function showPage(pageName, pageTitle, fn){
    $('.page.visible').removeClass('visible').addClass('invisible');

    $('#' + pageName).removeClass('invisible').addClass('visible');
    document.title = pageTitle;
    $('html').attr("data-page-name", pageName);
    if(fn){
      fn();
    }
  }

  function subscribreToRealTimeUpdates(community){
    socket.on(community, function (data) {
      console.log('message from server',data);
    });
  }

  // RENDERERS

  function renderHomePage(){
    var $communitiesListEl = $('#communities-list').empty();
    $communitiesListEl.spin();
    $.get('/api/communities', function(repos){
      $communitiesListEl.spin(false);
      renderArray(repos, $communitiesListEl, 'home-page-community-tpl');
    }).error(function(){
      console.log("Failed to load communities");
      $communitiesListEl.spin(false);
    });
    $communitiesListEl.on('click', '.join-community-btn', function(e){
      e.preventDefault();
      e.stopPropagation();
      var $item = $(e.currentTarget).closest('.community-item');
      $item.spin();
      var name = $(e.currentTarget).data('name');
      $.post('/communities/' + name + '/join', function(){
        // TODO (anton) we should update amount of members.
        $item.spin(false);
      }).error(function(){
        console.log("failed to join community");
        $item.spin(false);
      });
    });
    $communitiesListEl.on('click', '.leave-community-btn', function(e){
      e.preventDefault();
      e.stopPropagation();
      var $item = $(e.currentTarget).closest('.community-item');
      $item.spin();
      var name = $(e.currentTarget).data('name');
      $.post('/communities/' + name + '/leave', function(){
        // TODO (anton) we should update amount of members.
        $item.spin(false);
      }).error(function(){
        console.log("failed to leave community");
        $item.spin(false);
      });
    });
  }
  function renderMemberPage(username){
    var $page = $('#member-page');
    $page.spin();
    getUserProfile(username, function(err, profile){
       $page.spin(false);
      if(err){
        console.log('error hapenned');
      } else{
        $page.find('img.avatar').attr('src', profile.avatar_url);
        $page.find('.name').html(profile.name);
        $page.find('.bio').html(profile.bio);
        $page.find('.location').html(profile.location);
        $page.find('.blog').html(profile.blog);
        $page.find('.followers-count').html(profile.followers);
        $page.find('.following-count').html(profile.following);
      }

      $('#follow-member-btn').on('click', function(){
        var url = 'https://api.github.com/user/following/'+ username + '?access_token=' + cUnity.user.accessToken;
        if ($('#follow-member-btn').text() == 'Follow') {
          // start following user
          $.ajax({
            accept: 'application/vnd.github.raw',
            type: 'PUT',
            url: url,
            contentType: "application/json"
          }).done(function(){
            var followersCount = parseInt($('.followers-count').text(), 10);
            followersCount += 1;
            $('.followers-count').text(followersCount);
          });
        } else {
          // unfollow user
          $.ajax({
            accept: 'application/vnd.github.raw',
            type: 'DELETE',
            url: url,
            contentType: "application/json"
          }).done(function(){
            var followersCount = parseInt($('.followers-count').text(), 10);
            followersCount -= 1;
            $('.followers-count').text(followersCount);
          });
            
        }
        // update followers amount on page.
      });
    });
  }

  function renderMyCommunitiesPage(){
    var $communitiesListEl = $('#my-communities-list').empty();
    $communitiesListEl.spin();
    var url = '/api/' + cUnity.user.username + '/communities';
    $.get(url, function(communities){
      $communitiesListEl.spin(false);
      renderArray(communities, $communitiesListEl, 'my-communities-page-community-tpl');
      _.each(communities, function(community){
        subscribreToRealTimeUpdates(community.name);
      });
    }).error(function(){
      console.log("Failed to load my communities");
      $communitiesListEl.spin(false);
    });
  }

  function renderCreateCommunityPage(){
    var $createCommunityBtn = $('#create-new-community-btn');
    var $form = $('#new-community-page form');
    var $communityName = $("#new-community-name");
    var $communityDescription = $("#new-community-description");
    var $communityLongDescription = $("#new-community-long-description");
    clearFieldErrors($form);
    // clear controls
    $communityName.val('');
    $communityDescription.val('');
    $communityLongDescription.val('');
    // setup listeners
    $createCommunityBtn.on('click', function(e){
      e.preventDefault();
      var isValid = validateFields($form);
      if(isValid){
        $form.spin();
        var name = $communityName.val();
        var description = $communityDescription.val();
        var longDescription = $communityLongDescription.val();
        var inputData = {name: name, description: description, longDescription: longDescription};
        $.post('/communities', inputData, function(data){
          console.log("repo created");
          $form.spin(false);
          page('/communities/' + name);
        }).error(function(){
          alert("Impossible to create community with such data");
          $form.spin(false);
        });
      }
    });
  }

  function renderCommunityPage(community){
    $('html').attr("data-community-name", community);
    var $page = $('#community-page');
    var $topicsListEl = $('#topics-list').empty();
    var $joinCommunityBtn = $('#join-community-btn');
    var $leaveCommunityBtn = $('#leave-community-btn');
    $page.find('.page-header h1').html(community);
    $topicsListEl.spin();
    
     var repo = getRepo(community);

     repo.read('master', 'README.md', function(err, content){
       if(!err && content){
          var html = makeHtml(content);
          $page.find('.community-intro').html(html);
        }
     });

    $.get('/api/communities/' + community, function(community){
      $topicsListEl.spin(false);
      if(community.isMember){
        $leaveCommunityBtn.attr('style', 'display: inline-block!important');
      } else{
        $joinCommunityBtn.attr('style', 'display: inline-block!important');
      }
      _.each(community.topics, function(topic){
        if(topic.created){
          topic.created_at = topic.created.commit.author.date;
          topic.createdWhen = moment(topic.created_at).fromNow();
        }
        if(topic.updated){
          topic.updated_at = topic.updated.commit.author.date;
          topic.updatedWhen = moment(topic.updated_at).fromNow();
        }
      });
      $page.find('.page-header h2').html(community.description);
      renderArray(community.topics, $topicsListEl, 'community-page-topic-tpl');
    }).error(function(){
      console.log('Failed to load community info');
      $topicsListEl.spin(false);
    });
    // TODO add listeners for join and leave buttons.
  }
 
  function renderCreateTopicPage(community){
    var editor = new EpicEditor({container: 'new-topic-message', basePath: '/epiceditor'}).load();
    var $createTopicBtn = $('#create-new-topic-btn');
    var $newTopicName = $('#new-topic-name');
    var $form = $('#new-topic-page form');
    clearFieldErrors($form);
    // clear controls
    $newTopicName.val('');
    editor.getElement('editor').body.innerHTML = '';
    // setup listeners
    $createTopicBtn.on('click', function(e){
      e.preventDefault();
      var isValid = validateFields($form);
      if(isValid){
        $form.spin();
        var repo =  getAuthRepo(community);
        repo.getRef('heads/master', function(err, sha) {
          console.log('get branch', err, sha);
          var topic = $newTopicName.val();
          var refSpec = {
            ref: 'refs/heads/' + topic,
            sha: sha
          };
          repo.createRef(refSpec, function(err) {
            var content = editor.getElement('editor').body.innerHTML;
            console.log('content', content);
            repo.write(topic, '1.md', content, 'start conversation', function(err) {
              $form.spin(false);
              if(err){
                alert('Error hapenned');
              }else{
                page('/communities/' + community + '/' + topic);
              }
            });
          });
        });
      }
    });
  }

  function renderTopicPage(community, topic){
    var repo = getRepo(community);
    var $createMessageBtn = $('#create-new-message-btn');
    var $form = $('#new-message-form');
    var $postInput = $form.find('.new-message-content');
    var $messagesListEl = $('#messages-list').empty();
    var communityLink = '/communities/' + community;
    $('a.goto-current-community-page-btn').attr('href', communityLink);
    $messagesListEl.spin();
    repo.getTree(topic, function(err, tree){
      if(!err && tree){
        $createMessageBtn.on('click', function(e){
          e.preventDefault();
          $form.spin();
          var text = $postInput.val();
          var fileName = tree.length + '.md';
          var authedRepo = getAuthRepo(community);
          authedRepo.write(topic, fileName, text, 'reply', function(err, sha) {
            console.log("sha", sha);
            $form.spin(false);
            if(err){
              alert("Error hapenned");
            } else{
              tree.push({path: fileName});
              var message = {
                html: makeHtml(text)
              };
              message.commit = {
                published: moment().fromNow(),
                published_at: moment().format()
              };
              message.commit.author = {
                url: cUnity.user.profileUrl,
                avatar_url: cUnity.user.avatar
              };
              $form.spin(false);
              $postInput.val('');
              renderArrayItem(message, $messagesListEl, 'topic-page-message-tpl');
            }
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
        async.parallel(workers, function(error, files){
          files = _.first(files, files.length - 1);
          console.log('files', files);
          repo.getRef('heads/' + topic, function(err, sha){

            repo.commits(sha, function(err, commits){
              commits = _.first(commits, commits.length - 1);
              console.log("commits", commits);
              var i = 0;
              for(; i < commits.length; i++){
                var k = commits.length - i - 1;
                var file = files[k];
                if(file){
                  var commit = commits[i];
                  commit.published_at = commit.commit.author.date;
                  commit.published = moment(commit.published_at).fromNow();
                  file.commit = commit;
                  file.html = makeHtml(file.content);
                }
              }
              $messagesListEl.spin(false);
              renderArray(files, $messagesListEl, 'topic-page-message-tpl');
            });
          });
        });
      }
    });
  }
  function makeHtml(md){
    var mdConverter = new Showdown.converter();
    return mdConverter.makeHtml(md);
  }

  function validateFields(selector){
    var valid = true;
    var elements = selector.find('input,textarea').get();
    for(var i = 0; i < elements.length; i++){
      var el = elements[i];
      var elValid = el.checkValidity();
      if(elValid){
        $(el).removeClass('error');
      } else{
        $(el).addClass('error');
        valid = false;
      }
    }
    return valid;
  }

  function clearFieldErrors(selector){
    selector.find('input,textarea').removeClass('error');
  }
    


  function getAuthRepo(community){
    var gh = new Github({
        token: cUnity.user.accessToken,
        auth: 'oauth'
    });
    return gh.getRepo('communities', community);
  }
  function getRepo(community){
    if(_.isEmpty(cUnity.user.accessToken)){
      var gh = new Github({});
      return gh.getRepo('communities', community);
    } else{
      return getAuthRepo(community);
    }
  }
  
  function getUserProfile(username, callback){
    var gh;
    if(_.isEmpty(cUnity.user.accessToken)){
      gh = new Github({});
    } else{
      gh = new Github({
        token: cUnity.user.accessToken,
        auth: 'oauth'
      });
      // show follow or unfollow btn
      var url = 'https://api.github.com/user/following/'+ username + '?access_token=' + cUnity.user.accessToken;
      $.get(url, function(){
        // you are following this user
        $('#follow-member-btn').text('Following');
        $('#follow-member-btn').hover(function(){
          $(this).text('Unfollow');
        }, function(){
          $(this).text('Following');
        });
      });
    }
    return gh.getUser().show(username, callback);
  }

  function renderHeader(ctx, next){
    if(_.isEmpty(cUnity.user.username)){
      $('html').addClass('unlogined');
    } else{
      $('html').addClass('logined');
      $('#user-profile img').attr('src', cUnity.user.avatar);
      $('#user-profile span').text(cUnity.user.username);
    }
    next();
  }

  function renderArrayItem(item, containerEl, templateName){
    var tplStr = $('#' + templateName).html();
    var tpl = _.template(tplStr);
    var html = tpl(item);
    containerEl.append(html);
  }

  function renderArray(array, containerEl, templateName){
    _.each(array, function(item){
      renderArrayItem(item, containerEl, templateName);
    });
  }

  // ROUTER

  page('', renderHeader, function(){
    showPage('home-page', 'Communities', renderHomePage);
  });

  page('/communities', renderHeader, function(){
    showPage('my-communities-page', 'My Communities', renderMyCommunitiesPage);
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

  page('/members/:username', renderHeader, function(ctx){
    showPage('member-page',ctx.params.username + ': profile' , function(){
      renderMemberPage(ctx.params.username);
    });
  });

  page.start({ click: false });


  $('html').on('click', 'a.nav-link', function(e){
    e.preventDefault();
    var href = $(e.currentTarget).attr('href');
    page(href);
  });
  $('html').on('click', '.cancel-btn', function(e){
    e.preventDefault();
    if(history){
      history.back();
    }
  });
  $('#goto-new-topic-page-btn').on('click', function(){
    page('/communities/' + $('html').attr('data-community-name') + '/create');
  });

  $('.footer-toggle').on('click', function(){
    var footer = $('footer.app-footer').toggleClass("expanded");
    if(footer.hasClass('expanded')){
      footer.find('.footer-toggle').html('&#x25BC;');
    } else{
      footer.find('.footer-toggle').html('&#x25B2;');
    }
  });
});