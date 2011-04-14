jarnxmpp.Messages = {
    messageReceived: function (message) {
        var body = $(message).children('body').text();
        if (body==="") {
            return true; // This is a typing notification, we do not handle it here...
        }
        var xhtml_body = $(message).find('html > body').contents();
        event = jQuery.Event('jarnxmpp.message');
        if (xhtml_body.length>0) {
            event.mtype = 'xhtml';
            event.body = xhtml_body.html();
        } else {
            event.body = body;
            event.mtype = 'text';
        }
        event.from = $(message).attr('from');
        $(document).trigger(event);
        return true;
    },

    invitationReceived: function(message) {
        room = $(message).attr('from');
        from = $(message).find('invite').attr('from');
        event = jQuery.Event('jarnxmpp.roomInvitation');
        event.room = room;
        event.from = from;
        $(document).trigger(event);
        return true;
    }
};

jarnxmpp.Roster = {
    rosterSet: function(iq) {
        // XXX: Fill me in
        return true;
    },
    rosterResult: function(iq) {
        // XXX: Fill me in
        return true;
    },

    rosterSuggestedItem: function(msg) {
        $(msg).find('item').each(function () {
            var jid = $(this).attr('jid');
            var action = $(this).attr('action');
            if (action === 'add') {
                jarnxmpp.connection.send($pres({
                    to: jid,
                    "type": "subscribe"}));
            }
        });
        return true;
    }
};

jarnxmpp.Presence = {
    online: {},

    presenceReceived: function (presence) {
        var ptype = $(presence).attr('type');
        var from = $(presence).attr('from');
        var status = '';
        //
        // User wants to subscribe to us. Always approve and
        // ask to subscribe to him
        //
        if (ptype === 'subscribe' ) {
            jarnxmpp.connection.send($pres({
                to: from,
                "type": "subscribed"}));
            jarnxmpp.connection.send($pres({
                to: from,
                "type": "subscribe"}));
        }
        //
        // Presence has changed
        //
        else if (ptype !== 'error') {
            if (ptype === 'unavailable') {
                status = 'offline';
            } else {
                var show = $(presence).find('show').text(); 
                if (show === '') {
                    status = 'online';
                } else {
                    status = 'away';
                }
            }
            var jid = Strophe.getNodeFromJid(from);
            if (status !== 'offline') {
                if (jarnxmpp.Presence.online.hasOwnProperty(jid))
                    jarnxmpp.Presence.online[jid].push(from);
                else
                    jarnxmpp.Presence.online[jid] = [from];
            } else {
                if (jarnxmpp.Presence.online.hasOwnProperty(jid)) {
                    var pos = jarnxmpp.Presence.online[jid].indexOf(from);
                    if (pos >= 0) {
                        jarnxmpp.Presence.online[jid].splice(pos, 1);
                    }
                    if (jarnxmpp.Presence.online[jid].length === 0)
                        delete jarnxmpp.Presence.online[jid];
                }
            }
            $(document).trigger('jarnxmpp.presence', [from, status, presence]);
        }
        return true;
    }
};

jarnxmpp.PubSub = {
    eventReceived: function(msg) {
        var items = $(msg).find('item');
        if (items.length>0) {
            for (var i = 0; i < items.length; i++) {
                var entry = $(items[i]).children('entry');
                var event = jQuery.Event('jarnxmpp.nodePublished');
                event.author = $(entry).children('author').text();
                event.published = $(entry).children('published').text();
                event.content = $(entry).children('content').text();
                $(document).trigger(event);
            }
        }
        return true;
    }
};

jarnxmpp.onConnect = function (status) {
    if ((status === Strophe.Status.ATTACHED) ||
        (status === Strophe.Status.CONNECTED)) {
        $(window).bind('beforeunload', function() {
            jarnxmpp.connection.flush();
            jarnxmpp.connection.disconnect();
        });
        $(document).trigger('jarnxmpp.connected');
    } else if (status === Strophe.Status.DISCONNECTED) {
        $(document).trigger('jarnxmpp.disconnected');
    }
};

$(document).ready(function () {
    jarnxmpp.connection = new Strophe.Connection(jarnxmpp.BOSH_SERVICE);
    if (('rid' in jarnxmpp) && ('sid' in jarnxmpp))
        jarnxmpp.connection.attach(jarnxmpp.jid, jarnxmpp.sid, jarnxmpp.rid, jarnxmpp.onConnect);
    else
        jarnxmpp.connection.connect(jarnxmpp.jid, jarnxmpp.password, jarnxmpp.onConnect);
});

$(document).bind('jarnxmpp.connected', function () {
    // Logging
    jarnxmpp.connection.rawInput = jarnxmpp.rawInput;
    jarnxmpp.connection.rawOutput = jarnxmpp.rawOutput;
    // Messages
    jarnxmpp.connection.addHandler(jarnxmpp.Messages.messageReceived, null, 'message', 'chat');
    jarnxmpp.connection.addHandler(jarnxmpp.Messages.invitationReceived, 'http://jabber.org/protocol/muc#user', 'message', null);
    //Roster
    jarnxmpp.connection.addHandler(jarnxmpp.Roster.rosterSet, Strophe.NS.ROSTER, 'iq', 'set');
    jarnxmpp.connection.addHandler(jarnxmpp.Roster.rosterResult, Strophe.NS.ROSTER, 'iq', 'result');
    // Presence
    jarnxmpp.connection.addHandler(jarnxmpp.Presence.presenceReceived, null, 'presence', null);
    // PubSub
    jarnxmpp.connection.addHandler(jarnxmpp.PubSub.eventReceived, null, 'message', null, null, jarnxmpp.pubsub_jid);
    jarnxmpp.connection.addHandler(jarnxmpp.Roster.rosterSuggestedItem, 'http://jabber.org/protocol/rosterx', 'message', null);
    jarnxmpp.connection.send($pres());
});