require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const localStrategy = require('passport-local');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const sgMail = require('@sendgrid/mail');


sgMail.setApiKey(process.env.SENDGRID_API_KEY);


const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));

app.use(session({ // Set up session
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize()); //Initialize passport
app.use(passport.session()) //Tell passport to use session.


main().catch(err => console.log(err));

async function main() {
    await mongoose.connect('mongodb://127.0.0.1:27017/userDB', {useNewUrlParser: true});
}

const userSchema = new mongoose.Schema ({
    firstName: String,
    lastName: String,
    email: String,
    password: String,
    googleId: String,
});

const itemSchema = new mongoose.Schema ({
    owner: String,
    assigned: String,
    createDate: { type: Date, default: Date.now },
    title: String,
    content: String,
    list: String,
    status: String,
    relatedTasks: [String],
    comments: [String]
});

const listSchema = new mongoose.Schema ({
    owner: String,
    title: String,
    items: [itemSchema],
    collaborators: [String]
});

const commentSchema = new mongoose.Schema ({
    commentor: String,
    content: String,
    date: { type: Date, default: Date.now }
});


userSchema.plugin(passportLocalMongoose); // tells the schema to use this plugin to hash/salt/save  users into DB
userSchema.plugin(findOrCreate);
itemSchema.plugin(findOrCreate);
listSchema.plugin(findOrCreate); 
commentSchema.plugin(findOrCreate);

const User = new mongoose.model('User', userSchema);
const Item = new mongoose.model('Item', itemSchema);
const List = new mongoose.model('List', listSchema);
const Comment = new mongoose.model('Comment', commentSchema);

const secondList = new List ({
    owner: '62dc6d67a45e46069afb1929',
    title: 'Second title',
    items: [{
        owner: '62dc6d67a45e46069afb1929',
        assigned: '62dc6d67a45e46069afb1929',
        title: 'Card7',
        content: 'Card7 content',
        list: '62dc6d67a45e46069afb1928',
        status: 'New',
    },
    {
        owner: '62dc6d67a45e46069afb1929',
        assigned: '62dc6d67a45e46069afb1929',
        title: 'Card7',
        content: 'Card7 content',
        list: '62dc6d67a45e46069afb1928',
        status: 'New',
    }]
});
//secondList.save();
const newItem = new Item ({
    owner: '62dc6d67a45e46069afb1929',
    assigned: '62dc6d67a45e46069afb1929',
    title: 'Card3',
    content: 'Card3 content',
    list: '62dc6d67a45e46069afb1928',
    status: 'New',
});
//newItem.save();

const newComment = new Comment ({
    commentor: {
        _id: '62dc6d67a45e46069afb1929',
        firstName: 'Carter',
        lastName: 'Clackson',
        email: 'test@google.ca',
    },
    content: 'This is a test comment',
});//
//newComment.save();

passport.use(User.createStrategy()); // Creates a local login strategy.

passport.use(new localStrategy(User.authenticate())); // Necessary to have the user authenticated when they try to go back to /secrets after login once.
passport.serializeUser(function(user, done) {
    done(null, user.id);
}); 
passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        done(err, user);
    });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));


app.get('/', function(req, res) {
    res.render('index');
});

app.get('/dashboard', function(req, res) {
    if (req.isAuthenticated()) { // Check if user is logged in, if not, redirect to log in. They are secret after all...
        List.find({"owner" : "62dc6d67a45e46069afb1929"}, function(err, foundLists) {
            if (err) {
                console.log(err);
            } else {
                res.render('dashboard', {lists: foundLists}); // Render the secrets view with foundUsers being passed in.
            }
        });
    } else {
        res.redirect('/login');
    }
})

app.get('/login', function(req, res) {
    res.render('login');
});

app.get('/register', function(req, res) {
    res.render('register');
});

app.get('/secrets', function(req, res) {
    User.find({"secret": {$ne: null}}, function(err, foundUsers) { // Find all users with a secret stores in their doc.
        if (err) {
            console.log(err);
        } else {
            if (foundUsers) { // Just check to make sure that something was returned foundUsers != nil
                if (req.isAuthenticated()) { // Check if user is logged in, if not, redirect to log in. They are secret after all...
                    res.render('secrets', { usersWithSecrets: foundUsers }); // Render the secrets view with foundUsers being passed in.
                } else {
                    res.redirect('/login');
                }
            }
        }
    });
});

app.get('/submit', function(req, res) {
    if (req.isAuthenticated()) { // Check if user is logged in/Authenticated
        res.render('submit');
    } else {
        res.redirect('/login');
    }
})

app.get('/logout', function(req, res) {
    req.logout(function(err) {
        if (err) {
            console.log(err);
        } else {
            res.redirect('/');
        }
    });
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/secrets', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/dashboard');
  });

app.listen(3000, function() {
    console.log('Server started');
});

app.post('/register', function(req, res) {
    User.register({username: req.body.username}, req.body.password, function(err, user) {
        if (err) {
            console.log(err);
            res.redirect('/');
        } else {
            passport.authenticate('local')(req, res, function() {
                res.redirect('dashboard');
            });
        }
    });
});

app.post('/login', function(req, res) {
        const user = new User({
            username: req.body.username, 
            password: req.body.password
        });
        req.login(user, function(err) {
            if (err) {
                console.log(err);
            } else {
                passport.authenticate('local')(req, res, function() {
                    res.redirect('/dashboard');
                });
            }
        });

});

app.post('/submit', function (req, res) {
  const submittedSecret = req.body.secret; // The submitted secret.

  User.findById(req.user.id, function(err, foundUser) { //Find a user with the ID matching their user, this is submitted in the request.
    if (err){
        console.log(err);
    } else {
        if (foundUser) { // If user is found, upload the secret to their document.
            foundUser.secret = submittedSecret;
            foundUser.save(function() {
                res.redirect('/secrets');
            });
        }
    }
  });

})