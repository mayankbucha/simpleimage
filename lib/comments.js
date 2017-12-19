var util = require("./util");

module.exports.generateCommentHTML = function(comment, type) {
    if (comment === undefined || type === undefined) {
        return "<div id='comment'>Comment data could not be loaded.</div>";
    }

    if (comment.comment == null) {
        comment.comment = "NULL";
    }

    var escapedUsername = util.escapeOutput(comment.username);
    var escapedComment = util.escapeOutput(comment.comment);

    switch (type) {
        case "image":
            return "<div id='comment'>" +
                "<a href='/users/" + escapedUsername + "'>" + escapedUsername + " (<span class='time'>" + comment.postedDate.toUTCString() + "</span>)" + "</a>: " + escapedComment +
                "</div>";
        case "user":
            return "<div id='comment'>" +
                "<a href='/images/" + comment.imageID + "'>Comment on " + comment.imageID + " (<span class='time'>" + comment.postedDate.toUTCString() + "</span>)" + "</a>: " + escapedComment +
                "</div>";
    }
};