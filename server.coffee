express = require "express"
md      = require "markdown"
async   = require "async"
_       = require "underscore"
nconf   = require "nconf"
moment  = require "moment"

stylus  = require "stylus"
nib     = require "nib"

github    = require "octonode"

GitHubApi = require "github"


nconf
  .argv()
  .env()
  .file({file: __dirname + "/configs/" + app.settings.env + ".config.json"})
  .defaults({"NODE_ENV": "development"})


github.auth.config({
  username: nconf.get("GIHUB_ADMIN_USERNAME")
  password: nconf.get("GIHUB_ADMIN_PASSWORD")
}).login ["user", "repo", "gist"], (err, id, token) ->
  if err or not token
    throw new Error("Cannot connect to GitHub")
  nconf.set "GIHUB_ADMIN_TOKEN", token  



# gitty = require "gitty"
# communities = github.org "communities"

# gitty.create "dsad", "description", __dirname + "/repos", (err, data) ->
#   console.log "xx", err, data
#   gitty.add __dirname + "/repos/dsad", ["README.md"], (err, data) ->
#     console.log "xx2", err, data
#     gitty.commit __dirname + "/repos/dsad", "initial", (err, data) ->
#       console.log "xx3", err, data
#       gitty.remote.add __dirname + "/repos/dsad", "origin", "https://github.com/communities/dsad.git", (err, data) ->
#         console.log "xx4", err, data
#         gitty.push __dirname + "/repos/dsad", "origin", "master", (err, data) ->
#           console.log "xx5", err, data

app = module.exports = express.createServer()



passport = require "passport"

GitHubStrategy = require("passport-github").Strategy

passport.serializeUser (user, done) -> done(null, user)
passport.deserializeUser (obj, done) -> done(null, obj)



passport.use new GitHubStrategy {
    clientID: nconf.get("GITHUB_CLIENT_ID"),
    clientSecret: nconf.get("GITHUB_CLIENT_SECRET"),
    callbackURL: nconf.get("GITHUB_CALLBACK_URL")
  },
  (accessToken, refreshToken, profile, done) ->

    process.nextTick ->
      profile.accessToken = accessToken
      profile.avatar = profile._json.avatar_url
      return done(null, profile);



# stylus compile function
compile = (str, path) ->
  return stylus(str)
    .define("url", stylus.url({ paths: [__dirname + "/public"] }))
    .set("filename", path)
    .set("warn", true)
    .set("compress", false)
    .use(nib())

app.configure ->
  # stylus middleware
  app.use stylus.middleware
    src    : __dirname + "/styls"  # styl files should be placed inside this folder
    dest   : __dirname + "/public" # CSS files will be complied to public directory
    compile: compile    # compile function
  app.set "views", __dirname + "/views"
  app.set "view engine", "jade"
  app.set "view options", {layout: false}
  app.use express.favicon __dirname + "/public/favicon.ico"
  app.use express.logger()
  app.use express.cookieParser()
  app.use express.bodyParser()
  app.use express.methodOverride()
  app.use express.session { secret: "session-secret-key" }


  app.use passport.initialize()
  app.use passport.session()
  app.use app.router 
  app.use express.static __dirname + "/public"


app.get "/auth",
  passport.authenticate("github", scope: "repo"),
  (req, res) ->


app.get "/logout", (req, res) ->
  req.logout()
  res.redirect "/"

app.get "/auth/callback", 
  passport.authenticate("github", { failureRedirect: "/login" }),
  (req, res) ->
    res.redirect "/"


app.get "/api/communities", (req, res) ->
  gh = new GitHubApi version: "3.0.0"
  gh.repos.getFromOrg {org: "communities"}, (err, repos) ->
    repos = _.filter repos, (repo) -> repo.name != 'gitcommunities.com'
    membersFetchFuncs = []
    topicsFetchFuncs = []
    _.each repos, (repo) ->
      repo.created = moment(repo.created_at).fromNow()
      repo.pushed = moment(repo.pushed_at).fromNow()
      membersFetchFuncs.push async.apply getMembers, repo.name
      topicsFetchFuncs.push async.apply getTopics, repo.name
    async.parallel membersFetchFuncs, (err, results) ->
      for i in [0...repos.length]
        repos[i].members = results[i] 
        repos[i].members_count = results[i].length    
      async.parallel topicsFetchFuncs, (err, results) ->
        for i in [0...repos.length]
          repos[i].topics = results[i] 
          repos[i].topics_count = results[i].length  
        res.json repos

app.get "/api/communities/:community", (req, res) ->
  community = req.params.community
  getCommunity community, (err, community) ->
    res.json community 


getCommunity = (community, callback) ->
  gh = new GitHubApi version: "3.0.0"
  gh.repos.get {user: "communities", repo: community}, (err, repo) ->
    if err
      callback err
      return
    worker =
      topics: async.apply getTopics, community
      members: async.apply getMembers, community
    async.parallel worker, (err, results) ->
      if err
        callback err
        return
      repo.topics = results.topics
      repo.members = results.members  
      callback undefined, repo             

getTopics = (community, callback) ->
  gh = new GitHubApi version: "3.0.0"  
  gh.repos.getBranches {user: "communities", repo: community}, (err, branches) ->
    if err
      callback err
      return
    topics = []
    workers = []
    _.each branches, (branch) ->
      if branch.name != "master"
        topics.push name: branch.name, community: community
        workers.push async.apply getTopicMeta, community, branch.name
    async.parallel workers, (errors, meta) ->
      for i in [0...topics.length]
        topics[i].sha = meta[i].sha
        commits = meta[i].commits
        topics[i].commits = _.first(commits, commits.length - 1)
        topics[i].created = _.last topics[i].commits
        topics[i].updated = _.first topics[i].commits 
        participants = (commit.author for commit in topics[i].commits)
        participants = _.uniq participants, false, (participant) -> participant.id
        topics[i].participants = participants
      callback undefined, topics    
        

getMembers = (community, callback) ->
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  ghAdmin.get "/orgs/communities/teams", (err, status, teams) ->
    console.log("teams", teams);
    if err 
      callback err
      return
    membersTeam = team for team in teams when team.name == "#{community}-members"
    console.log "membersTeam", membersTeam
    ghAdmin.get "/teams/#{membersTeam.id}/members", {}, (err, status, members) ->
      if err
        callback err
        return
      callback undefined, members 


getTopicMeta = (community, topic, callback) ->
  github.client().get "/repos/communities/#{community}/git/refs/heads/#{topic}", {}, (err, status, ref) ->
    if err
      callback err
      return
    getCommits community, ref.object.sha, (err, commits) ->
      if err
        callback err
        return
      resp =
        sha: ref.object.sha
        commits: commits
      console.log "opop", resp  
      callback undefined, resp    

getCommits = (community, sha, callback) ->
  github.client().get "/repos/communities/#{community}/commits?sha=#{sha}", {}, (err, status, commits) ->
    callback err, commits

app.post "/communities", (req, res) ->
  data = req.body
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  org = ghAdmin.org "communities"
  repo = 
    name: data.name
    description: data.description
    homepage: ""
    private: false
    has_issues: true
    has_wiki: true
    has_downloads: true
  ghAdmin.post "/orgs/communities/repos", repo, (err, status, repo) ->
   console.log "yyy1", err, status, repo
   ghAdmin.post "/orgs/communities/teams", {name: "#{repo.name}-admins", permission: "admin", repo_names:["communities/#{repo.name}"]}, (err, status, team) ->
     console.log "create new admin team", err, status, team

     ghAdmin.put "/teams/#{team.id}/members/#{req.user.username}", {}, (err, status, resp) ->
       console.log "add new team member", err, status, resp   
       ghAdmin.post "/orgs/communities/teams", {name: "#{repo.name}-members", permission: "push", repo_names:["communities/#{repo.name}"]}, (err, status, team) ->
        console.log "yyy3", err, status, team

        spec = {"ref": "refs/heads/master","sha": ""}
        ghAdmin.post "/repos/communities/#{repo.name}/git/refs", spec, (err, status, resp) ->
          console.log "new branch", err, status, resp
          res.json repo

app.post "/communities/:community/join", (req, res) ->
  community = req.params.community
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  ghAdmin.get "/orgs/communities/teams", (err, status, teams) ->
    console.log("teams", teams);
    membersTeam = team for team in teams when team.name == "#{community}-members"
    console.log "membersTeam", membersTeam
    ghAdmin.put "/teams/#{membersTeam.id}/members/#{req.user.username}", {}, (err, status, resp) ->
      console.log "add new team member", err, status, resp
      res.json resp

app.get "/communities/:community/members", (req, res) ->
  community = req.params.community
  getMembers community, (err, members) ->
    res.json members


app.post "/communities/:community", (req, res) ->
  community = req.params.community
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  spec = {"ref": "refs/heads/test","sha": "496a6ddf94d1889a27e1979c9578f9e1257e40c3"}
  ghAdmin.post "/repos/communities/#{community}/git/refs", spec, (err, status, resp) ->
    res.json resp




app.get "/", (req, res) ->
  res.render "index", user: req.user or {}

app.get "/create", (req, res) ->
  res.render "index", user: req.user or {}

app.get "/communities/:community", (req, res) ->
  res.render "index", user: req.user or {}

app.get "/communities/:community/:topic", (req, res) ->
  res.render "index", user: req.user or {}


port = process.env.PORT || 8090
app.listen port
console.log "server started on port 8090. Open http://localhost:8090 in your browser"  