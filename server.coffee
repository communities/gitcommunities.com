express = require "express"
stitch  = require "stitch"
md      = require "markdown"
async   = require "async"


github      = require("octonode").client()
communities = github.org "communities"

app = module.exports = express.createServer()



passport = require "passport"

GitHubStrategy = require("passport-github").Strategy

GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "bba39387bffdb36bdf54"
GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "201e8fe53f64ccaa9b117a65460734befdde66b9";
callbackURL =  process.env.GITHUB_CALLBACK_URL || "http://localhost:8090/auth/callback"


passport.serializeUser (user, done) -> done(null, user)
passport.deserializeUser (obj, done) -> done(null, obj)



passport.use new GitHubStrategy {
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: callbackURL
  },
  (accessToken, refreshToken, profile, done) ->

    process.nextTick ->
      profile.accessToken = accessToken
      profile.avatar = profile._json.avatar_url
      return done(null, profile);


app.configure ->

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


jsPack = stitch.createPackage({
  paths: [__dirname + "/client"]
})

app.get "/app.js", jsPack.createServer()


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


app.get "/", (req, res) ->
  communities.repos (error, communities) ->
    user = req.user or {}
    res.render "index", communities: communities, user: user


app.get "/communities", (req, res) ->

  communities.repos (error, communities) ->
    console.log typeof communities, communities.length
    res.json communities

app.get "/communities/:community", (req, res) ->
  communityUrl = "communities/" + req.params.community
  communityRepo = github.repo communityUrl
  communityRepo.branches (error, branches) ->
    console.log branches
    res.render "community", threads: branches, communityUrl: communityUrl

app.get "/communities/:community/:thread", (req, res) ->
  communityUrl = "communities/" + req.params.community
  communityRepo = github.repo communityUrl
  communityRepo.commits {sha: "0eaaef6e5cba616d78e7428beda0f9c4320126dc"}, (error, commits) ->
    messagesCount = commits.length - 1
    console.log "count", messagesCount, commits[0].author.login, commits[1].author.login, commits[2].author.login, commits[3].author.login
    workers = for i in [0..messagesCount - 1]
      do (i) ->
        (callback) ->
          communityRepo.contents "#{i + 1}.md", "links-to-animations-examples", (error, blob) ->
            if error
              callback error
              return
            content = new Buffer(blob.content, "base64").toString("utf8")
            html = md.markdown.toHTML(content)
            message =
              content: content
              html: html
              author: commits[messagesCount - i - 1].author
            callback undefined, message  
    async.parallel workers, (errors, messages) -> 
      res.render "thread", messages: messages
  # communityRepo.contents "1.md", "links-to-animations-examples", (error, blob) ->
  #   console.log "xxx", error, blob
  #   content = new Buffer(blob.content, "base64").toString("utf8")
  #   res.render "thread", messages: [{content: content}]
  # communityRepo = github.repo url
  # communityRepo.branches (error, branches) ->
  #   console.log branches
  #   res.render "community", threads: branches, communityUrl: url    

port = process.env.PORT || 8090
app.listen port
console.log "server started on port 8090. Open http://localhost:8090 in your browser"  