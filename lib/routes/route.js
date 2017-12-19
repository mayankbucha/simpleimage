require('dotenv').config();
const ImageDatabase = require('../ImageDatabase');
const commentUtil = require('../comments');
const util = require('../util');
const multer = require('multer');
const fs = require("fs");
const bodyParser = require("body-parser");
const session = require('express-session');
const validator = require('validator');
var RedisStore;
if (process.env.NODE_ENV === "prod") {
    RedisStore = require("connect-redis")(session);
}

var upload = multer({
    limits: {fileSize: 500000000}
});

module.exports = function(app, router) {
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    if (process.env.NODE_ENV === "prod") {
        app.use(session({
            store: new RedisStore({
                host: "si_sessions",
                port: 6379
            }),
            secret: process.env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false
        }));
    } else {
        app.use(session({
            secret: "QWERTYUIOP",
            resave: true,
            saveUninitialized: false
        }));
    }

    function errorHandler(err, req, res, next) {
        if (req.query.type === "json") {
            res.status(500).send({
                status: "error",
                message: err.message || "failed"
            });
        } else {
            renderError(res, 500, err.message);
        }
    }

    function handleSession(session, callback) {
        var sessionObj = {};

        if (session.userID !== undefined) {
            ImageDatabase.findUserByHiddenID(session.userID, function (err, result) {
                if (err) {
                    callback({
                        type: "userID"
                    }, null);
                    return;
                }

                var user = result[0];

                user = {
                    username: user.username,
                    email: user.email
                };

                sessionObj.user = user;

                callback(null, sessionObj);
            });
        } else {
            callback(null, sessionObj);
        }
    }

    function renderError(res, statusCode, message) {
        if (message === undefined) {
            message = "There was an error loading this page. Please try again later.";
        }
        if (statusCode === undefined) {
            statusCode = 500;
        }
        res.status(statusCode);
        res.render("error", {
           message
        });
    }

    app.get(["/", "/index.htm(l|)"], function(req, res, next) {
        req.query.type = "html";
        handleSession(req.session, function(err, sessionObj) {
            if (err) {
                if (err.type === "userID") {
                    req.session.userID = undefined;
                    sessionObj = {};
                } else {
                    var err = new Error(err.message);
                    err.statusCode = 500;
                    next(err);
                    return;
                }
            }

            res.status(200);
            res.render("index", {
                user: sessionObj.user,
                fromUrl: req.url
            });
        });
    });

    app.get("/images/:id.:ext", function(req, res, next) {
        var id = parseInt(req.params.id, 10);
        ImageDatabase.findImage(id, function(err, imageEntry) {
            if (err || imageEntry.length == 0 || (req.params.ext !== undefined && util.extToMimeType(req.params.ext) !== imageEntry[0].mimetype)) {
                var err = new Error("Image of this ID does not exist on the database.");
                err.statusCode = 500;
                next(err);
            } else {
                res.status(200);
                res.type(imageEntry[0].mimetype);
                res.send(imageEntry[0].data.buffer); // Send the file data to the browser.
                console.log("Served image " + imageEntry[0].id + " by direct link");
            }
            res.end();
        });
    });

    app.get("/images/:id/", function(req, res, next) {
        if (req.path[req.path.length - 1] === ".") {
            var err = new Error("Malformed url");
            err.statusCode = 500;
            next(err);
            return;
        }
        handleSession(req.session, function (err, sessionObj) {
            if (err) {
                if (err.type === "userID") {
                    req.session.userID = undefined;
                    sessionObj = {};
                } else {
                    var err = new Error(err.message);
                    err.statusCode = 500;
                    next(err);
                    return;
                }
            }

            res.status(200);
            res.type("html");
            var id = util.getIDFromParam(req.params.id);
            if (id === undefined) {
                var err = new Error("Image of this ID does not exist on the database.");
                err.statusCode = 500;
                next(err);
                return;
            }
            ImageDatabase.findImage(id, function (err, imageEntry) {
                if (err || imageEntry.length == 0) {
                    var err = new Error("Image of this ID does not exist on the database.");
                    err.statusCode = 500;
                    next(err);
                } else {
                    res.render("image-view", {
                        id,
                        imageSrc: id + "." + util.mimeTypeToExt(imageEntry[0].mimetype),
                        uploadedDate: imageEntry[0].uploadeddate || "Unknown Date",
                        author: imageEntry[0].username,
                        user: sessionObj.user,
                        fromUrl: req.url
                    });
                    console.log("Served image " + imageEntry[0].id + " via image page");
                }
            });
        });
    });

    app.get("/users/:username", function(req, res, next) {
        res.type("html");
        var username = req.params.username;
        if (username === undefined) {
            var err = new Error("User does not exist.");
            err.statusCode = 500;
            next(err);
            return;
        }
        handleSession(req.session, function (err, sessionObj) {
            if (err) {
                if (err.type === "userID") {
                    req.session.userID = undefined;
                    sessionObj = {};
                } else {
                    var err = new Error(err.message);
                    err.statusCode = 500;
                    next(err);
                    return;
                }
            }

            ImageDatabase.findUser(username, function (err, result) {
                if (err) {
                    var err = new Error("Could not find user " + username + ".");
                    err.statusCode = 500;
                    next(err);
                    return;
                }

                if (result.length === 0) {
                    var err = new Error("Could not find user " + username + ".");
                    err.statusCode = 500;
                    next(err);
                    return;
                }

                res.status(200);
                var user = result[0];
                if (req.query.type === "json") {
                    res.send(util.createJSONResponseObject("success", user.username));
                } else { //html
                    res.render("user-view", {
                        user,
                        sessionUser: sessionObj.user,
                        fromUrl: req.url
                    });
                }
                console.log("Served user page of user " + user.username + ".");
            });
        });
    });

    app.get("/images/:id/comments", function(req, res, next) {
        res.type("html");
        var id = util.getIDFromParam(req.params.id);
        if (id === undefined) {
            var err = new Error("Image of this ID does not exist on the database.");
            err.statusCode = 500;
            next(err);
            return;
        }
        ImageDatabase.findCommentsForImage(id, function (err, result) {
            if (err) {
                var err = new Error("Could not load comments for image of image ID " + id + ".");
                err.statusCode = 500;
                next(err);
                return;
            }

            if (result.length === 0) {
                res.status(200);
                if (req.query.type === "html") {
                    res.send("<div id='comments'>There are currently no comments to display.</div>");
                } else { //json
                    res.send({
                        status: "success",
                        message: "There are currently no comments to display."
                    });
                }
                return;
            }

            var comments = [];
            result.forEach(function (comment) {
                var commentInfo = {
                    username: comment.username,
                    imageID: comment.image_id,
                    comment: comment.comment,
                    postedDate: comment.posted_date
                };
                comments.push(commentInfo);
            });

            res.status(200);
            var message;
            if (req.query.type === "html") {
                message = "<div id='comments'>";
                comments.forEach(function (comment) {
                    message += commentUtil.generateCommentHTML(comment, "image");
                });
                message += "</div>";
            } else { //json
                message = {
                    status: "success",
                    result_count: result.length,
                    results: []
                };
                comments.forEach(function (comment) {
                    message.results.push(comment);
                });
            }
            res.send(message);
        });
    });

    app.get("/users/:username/comments", function(req, res, next) {
        res.type("html");
        var username = req.params.username;
        if (username === undefined) {
            var err = new Error("User does not exist.");
            err.statusCode = 500;
            next(err);
            return;
        }
        ImageDatabase.findCommentsForUser(username, function (err, result) {
            if (err) {
                var err = new Error("Could not load comments for user of user ID " + id + ".");
                err.statusCode = 500;
                next(err);
                return;
            }

            if (result.length === 0) {
                res.status(200);
                if (req.query.type === "html") {
                    res.send("<div id='comments'>There are currently no comments to display.</div>");
                } else { //json
                    res.send({
                        status: "success",
                        message: "There are currently no comments to display."
                    });
                }
                return;
            }

            var comments = [];

            result.forEach(function (comment) {
                var commentInfo = {
                    username: comment.username,
                    imageID: comment.image_id,
                    comment: comment.comment,
                    postedDate: comment.posted_date
                };
                comments.push(commentInfo);
            });

            res.status(200);
            var message;
            if (req.query.type === "html") {
                message = "<div id='comments'>";
                comments.forEach(function (comment) {
                    message += commentUtil.generateCommentHTML(comment, "user");
                });
                message += "</div>";
            } else { //json
                message = {
                    status: "success",
                    result_count: result.length,
                    results: []
                };
                comments.forEach(function (comment) {
                    var comment = {
                        username: comment.username,
                        imageID: comment.imageID,
                        comment: comment.comment,
                        postedDate: comment.postedDate
                    };
                    message.results.push(comment);
                });
            }
            res.send(message);
        });
    });

    app.get("/register", function(req, res, next) {
        res.render("register-view", {
            fromUrl: req.query.fromUrl || "home"
        });
    });

    app.get("/login", function (req, res, next) {
        res.render("login-view", {
            fromUrl: req.query.fromUrl || "home"
        });
    });

    app.post("/upload", function(req, res, next) {
        var uploadFunc = upload.any();
        //If user is logged in, upload image under their username
        //Otherwise, upload anonymously
        ImageDatabase.findUserByHiddenID(req.session.userID, function(err, result) {
            if (err && req.session.userID !== undefined) {
                var err = new Error(err.message);
                err.statusCode = 500;
                next(err);
                return;
            }

            var username = (!err) ? result[0].username : null;
            
            uploadFunc(req, res, function (err) {
                if (err) {
                    var err = new Error(err.message);
                    err.statusCode = 500;
                    next(err);
                    return;
                }

                if (req.files.length === 0) {
                    var err = new Error("Nothing was selected to upload.");
                    err.statusCode = 500;
                    next(err);
                    return;
                }
                var imageEntry = {
                    data: req.files[0].buffer,
                    filename: req.files[0].originalname,
                    id: 0,
                    mimetype: req.files[0].mimetype,
                    encoding: req.files[0].encoding,
                    username: username
                }
                ImageDatabase.addImage(imageEntry, function (err, result) {
                    if (result != null) {
                        console.log("Image upload successful.");
                        res.send({
                            status: "success",
                            message: "Image uploaded successfully.",
                            id: result.ops[0].id
                        });
                    } else {
                        var err = new Error("Image upload failed.");
                        err.statusCode = 500;
                        next(err);
                    }
                });
            });
        });
    });

    app.post("/comment", function(req, res, next) {
        if (req.session.userID === undefined) {
            var err = new Error("Can not post comment. Currently not logged in.");
            err.statusCode = 500;
            next(err);
            return;
        }
        if (req.body.imageID === undefined) {
            var err = new Error("Can not post comment. Missing image ID.");
            err.statusCode = 500;
            next(err);
            return;
        }
        if (req.body.comment === undefined) {
            var err = new Error("Can not post comment. Missing comment.");
            err.statusCode = 500;
            next(err);
            return;
        }

        var userHiddenID = req.session.userID;
        
        var imageID = Number(req.body.imageID);
        if (isNaN(imageID)) {
            var err = new Error("Can not post comment. Invalid image ID.");
            err.statusCode = 500;
            next(err);
            return;
        }
        ImageDatabase.addComment({
                userHiddenID,
                imageID,
                comment: req.body.comment
            }, function(err, result) {
            if (err) {
                var err = new Error("Could not post comment.");
                err.statusCode = 500;
                next(err);
                return;
            }
            var comment = result.ops[0];
            
            ImageDatabase.findUserByHiddenID(userHiddenID, function(err, result) {
                if (err) {
                    var err = new Error("Comment has been posted but could not be displayed " +
                                            "at this time. Please refresh the page.");
                    err.statusCode = 500;
                    next(err);
                    return;
                }
                res.status(200);
                var user = result[0];
                var commentFormatted = {
                    userID: comment.user_id,
                    imageID: comment.image_id,
                    username: user.username,
                    comment: comment.comment,
                    postedDate: comment.posted_date
                };
                var commentText;
                if (req.query.response === "html") {
                    commentText = commentUtil.generateCommentHTML(commentFormatted, "image")
                } else {
                    commentText = commentFormatted
                }
                res.send({
                    status: "success",
                    message: commentText
                });
            });
        });
    });

    app.post("/register", function(req, res, next) {
        if (req.body.username === undefined) {
            var err = new Error("Can not register user. Missing username.");
            err.statusCode = 500;
            next(err);
            return;
        }
        if (req.body.password === undefined) {
            var err = new Error("Can not register user. Missing password.");
            err.statusCode = 500;
            next(err);
            return;
        }
        if (req.body.passwordConfirm === undefined) {
            var err = new Error("Can not register user. Missing password confirmation.");
            err.statusCode = 500;
            next(err);
            return;
        }
        if (req.body.email === undefined) {
            var err = new Error("Can not register user. Missing email.");
            err.statusCode = 500;
            next(err);
            return;
        }

        if (req.body.password !== req.body.passwordConfirm) {
            var err = new Error("Can not register user. Passwords don't match.");
            err.statusCode = 500;
            next(err);
            return;
        }

        if (!validator.isEmail(req.body.email)) {
            var err = new Error("Can not register user. Invalid email.");
            err.statusCode = 500;
            next(err);
            return;
        }

        var userData = {
            username: req.body.username,
            password: req.body.password,
            email: req.body.email
        };

        ImageDatabase.addUser(userData, function(err, result) {
            if (err) {
                if (err.message !== undefined) {
                    errMsg = err.message;
                } else {
                    if (err.name === "DuplicateField") {
                        if (err.field === "username") {
                            errMsg = "Username already exists.";
                        }
                    }
                }
                var err = new Error(errMsg);
                err.statusCode = 500;
                next(err);
                return;
            }
            req.session.userID = result.insertedId;
            if (req.query.type === "json") {
                res.status(200).send({
                    status: "success",
                    message: "User registered."
                });
            } else {
                res.redirect(util.getRedirectPath(req.body.redirectUrl));
            }
        });
    });

    app.post("/login", function(req, res, next) {
        if (req.body.username === "" || req.body.username === undefined) {
            var err = new Error("Can not login user. Missing username.");
            err.statusCode = 500;
            next(err);
            return;
        }
        if (req.body.password === "" || req.body.password === undefined) {
            var err = new Error("Can not login user. Missing password.");
            err.statusCode = 500;
            next(err);
            return;
        }

        var userData = {
            username: req.body.username,
            password: req.body.password
        };

        ImageDatabase.loginUser(userData, function(err, result) {
            if (err) {
                var err = new Error(err.message);
                err.statusCode = 500;
                next(err);
                return;
            }
            req.session.userID = result.user._id;
            if (req.query.type === "json") {
                res.status(200);
                res.send({
                    status: "success",
                    message: result.message
                });
            } else {
                res.redirect(util.getRedirectPath(req.body.redirectUrl));
            }
        });
    });

    app.post("/logout", function (req, res, next) {
        req.session.destroy();
        res.redirect(util.getRedirectPath(req.body.redirectUrl));
    });

    app.use("/", router);
    app.use(errorHandler);
}