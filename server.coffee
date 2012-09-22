fs      = require "fs"
express = require "express"
md      = require "markdown"
async   = require "async"
_       = require "underscore"
nconf   = require "nconf"
moment  = require "moment"

stylus  = require "stylus"
nib     = require "nib"

github  = require "octonode"
gitty   = require "gitty"

GitHubApi = require "github"
ghRepos   = new GitHubApi({version: "3.0.0"}).repos


redis = require "redis"
rc    = redis.createClient()

http  = require "http"
https = require "https"

sslOptions = 
  key: fs.readFileSync __dirname + "/configs/ssl.key"
  cert: fs.readFileSync __dirname + "/configs/ssl.crt"
  ca: fs.readFileSync __dirname + "/configs/ca.pem"



app = module.exports = express()


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



createRepo = (repo, username, callback) ->
  createGitHubRepo repo, username, (err, repo) ->
    if err
      callback err
      return
    createGitRepo repo, callback  


createGitHubRepo = (repo, username, callback) ->
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  ghAdmin.post "/orgs/communities/repos", repo, (err, status, repo) ->
    if err
      callback err
      return
    ghAdmin.post "/orgs/communities/teams", {name: "#{repo.name}-admins", permission: "admin", repo_names:["communities/#{repo.name}"]}, (err, status, team) ->
      if err
        callback err
        return
      ghAdmin.put "/teams/#{team.id}/members/#{username}", {}, (err, status, resp) ->
        if err
          callback err
          return   
        ghAdmin.post "/orgs/communities/teams", {name: "#{repo.name}-members", permission: "push", repo_names:["communities/#{repo.name}"]}, (err, status, team) ->
          if err
            callback err
            return
          hook = {
            "name": "web",
            "active": true,
            "config": {
              "url": "http://gitcommunities.com/webhook"
            }
          }  
          ghAdmin.post "/repos/communities/#{repo.name}/hooks", hook, (err) ->
            if err
              callback err
              return
            callback undefined, repo    


createGitRepo = (repo, callback) ->
  {name} = repo
  gitty.create name, repo.longDescription, __dirname + "/repos", (err, data) ->
    license = """
      All materials are licensed under the Creative Commons Attribution 3.0 License
      http://creativecommons.org/licenses/by/3.0/
    """
    fs.writeFileSync __dirname + "/repos/#{name}/LICENSE", license
    gitty.add __dirname + "/repos/#{name}", ["LICENSE"], (err, data) ->
      gitty.commit __dirname + "/repos/#{name}", "initial", (err, data) ->
        gitty.remote.add __dirname + "/repos/#{name}", "origin", "https://github.com/communities/#{name}.git", (err, data) ->
          console.log "origin was added", err, data
          gitty.push __dirname + "/repos/#{name}", "origin", "master", (err, data) ->
            callback undefined, repo  


passport = require "passport"

GitHubStrategy = require("passport-github").Strategy

passport.serializeUser (user, done) -> done null, user
passport.deserializeUser (obj, done) -> done null, obj



passport.use new GitHubStrategy {
    clientID: nconf.get("GITHUB_CLIENT_ID"),
    clientSecret: nconf.get("GITHUB_CLIENT_SECRET"),
    callbackURL: nconf.get("GITHUB_CALLBACK_URL")
  },
  (accessToken, refreshToken, profile, done) ->

    process.nextTick ->
      profile.accessToken = accessToken
      profile.avatar = profile._json.avatar_url
      return done null, profile



# stylus compile function
compile = (str, path) ->

  func = stylus(str)
    .define("url", stylus.url({ paths: [__dirname + "/public"] }))
    .set("filename", path)
    .set("warn", true)
    .use(nib())
  
  if nconf.get("NODE_ENV") == "production"
    func.set("compress", true)
  else
    func.set("compress", false)
  return func  

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
  app.use express.compress()
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
  getCommunities (err, communities) ->
    if err
      res.send 500, { error: "API call failed" }
      return
    res.json communities

app.get "/api/:username/communities", (req, res) ->
  getCommunities (err, communities) ->
    if err
      res.send 500, { error: "API call failed" }
      return
    username = req.params.username
    communities = _.filter communities, (community) ->
      isMember = _.any community.members, (member) -> member.login == username
      isAdmin = _.any community.admins, (admin) -> admin.login == username
      console.log "isMember and isAdmin", isMember, isAdmin, username, community.members, "admins", community.admins
      return isMember or isAdmin
    res.json communities


getCommunities = (callback) ->
  rc.hgetall "communities", (err, hash) ->
    if err or not hash or Object.keys(hash) == 0
      ghRepos.getFromOrg {org: "communities"}, (err, repos) ->
        if err
          callback err
          return
        repos = _.filter repos, (repo) -> repo.name != "gitcommunities.com"
        communitiesFetchFuncs = []
        _.each repos, (repo) ->
          communitiesFetchFuncs.push async.apply getCommunity, repo.name
        async.parallel communitiesFetchFuncs, (err, repos) ->
          if err
            callback err
            return
          hash = {}  
          _.each repos, (repo) -> hash[repo.name] = JSON.stringify(repo)  
          rc.hmset "communities", hash, (err) ->
            callback err, repos
    else  
      repos = (JSON.parse(repo) for name, repo of hash)
      callback undefined, repos


app.get "/api/communities/:community", (req, res) ->
  community = req.params.community
  getCommunity community, (err, community) ->
    if err
      res.send 500, { error: "API call failed" }
      return
    res.json community 


getCommunity = (community, callback) ->
  ghRepos.get {user: "communities", repo: community}, (err, repo) ->
    if err
      callback err
      return
    worker =
      topics: async.apply getTopics, community
      users: async.apply getMembers, community
    async.parallel worker, (err, results) ->
      if err
        callback err
        return
      repo.topics = results.topics or []
      repo.topics_count = repo.topics.length
      repo.members = results.users.members or []
      repo.admins = results.users.admins or []
      repo.members_count = repo.members.length + repo.admins.length
      repo.created = moment(repo.created_at).fromNow()
      repo.pushed = moment(repo.pushed_at).fromNow()
  
      callback undefined, repo             

getTopics = (community, callback) ->
  ghRepos.getBranches {user: "communities", repo: community}, (err, branches) ->
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
        if meta[i] and topics[i]
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
  getGitHubTeams (err, teams) ->
    console.log("teams", teams);
    if err 
      callback err
      return
    membersTeam = team for team in teams when team.name == "#{community}-members"
    adminsTeam = team for team in teams when team.name == "#{community}-admins"
    workers = {}
    if membersTeam
      workers.members = async.apply getGitHubTeamMembers, membersTeam.id
    if adminsTeam
      workers.admins = async.apply getGitHubTeamMembers, adminsTeam.id
    async.parallel workers, callback  

getGitHubTeamMembers = (id, callback) ->
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  ghAdmin.get "/teams/#{id}/members", {}, (err, status, members) ->
    if err
      callback err
      return
    callback undefined, members 


getGitHubTeams = (callback) ->
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  ghAdmin.get "/orgs/communities/teams", (err, status, teams) ->
    callback err, teams

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
      callback undefined, resp    

getCommits = (community, sha, callback) ->
  github.client().get "/repos/communities/#{community}/commits?sha=#{sha}", {}, (err, status, commits) ->
    callback err, commits

app.post "/communities", (req, res) ->
  data = req.body
  repo = 
    name: data.name
    description: data.description
    longDescription: data.longDescription
    homepage: "http://gitcommunities.com/communities/#{data.name}"
    private: false
    has_issues: true
    has_wiki: true
    has_downloads: true
  createRepo repo, req.user.username, (err, repo) ->
    if err
      console.log "error", err
      res.send 500, { error: "API call failed" }
      return
    rc.hmset "communities", repo.name, JSON.stringify(repo)  
    res.json repo

app.post "/communities/:community/join", (req, res) ->
  community = req.params.community
  ghAdmin = github.client nconf.get "GIHUB_ADMIN_TOKEN"
  getGitHubTeams (err, teams) ->
    if err
      res.send 500, { error: "API call failed" }
      return
    console.log("teams", teams);
    membersTeam = team for team in teams when team.name == "#{community}-members"
    console.log "membersTeam", membersTeam
    if membersTeam
      ghAdmin.put "/teams/#{membersTeam.id}/members/#{req.user.username}", {}, (err, status, resp) ->
        console.log "add new team member", err, status, resp
        if err
          res.send 500, { error: "API call failed" }
          return
        rc.hmget "communities", community, (err, reply) ->
          console.log "repo from cache", err, reply
          if not err and reply
            repo = JSON.parse reply
            console.log "parsed repo", repo
            repo.members.push req.user
            repo.members_count = repo.members.length + repo.admins.length
            rc.hmset "communities", community, JSON.stringify(repo)           
          res.json resp
    else
      res.send 500, {error: "Internal error"}

renderIndexPage = (req, res) ->
  params = 
    user: req.user or {}
    jsFile: if nconf.get("NODE_ENV") == "production" then "/app.min.js" else  "/app.js"
  res.render "index", params

app.get "/", renderIndexPage
app.get "/communities", renderIndexPage
app.get "/create", renderIndexPage
app.get "/communities/:community", renderIndexPage
app.get "/communities/:community/:topic", renderIndexPage


if nconf.get("NODE_ENV") == "development"
  http.createServer(app).listen 8090
else
  proxyServer = express.createServer()
  proxyServer.get "*", (req, res) -> 
    res.redirect "https://gitcommunities.com" + req.url
  proxyServer.listen 80  
  https.createServer(sslOptions, app).listen 443
console.log "server started on port"