/*global $:false, document:false, window:false, portal_url:false,
jarnxmpp:false, $msg:false, Strophe:false */

jarnxmpp.UI = {
    msg_counter: 0,
    geocoder: null,

    focus: function() {
        window.blur();
        window.focus();
    },

    updateMsgCounter: function() {
        if (jarnxmpp.UI.msg_counter > 0) {
            if (document.title.search(/^\(\d\) /) === -1) {
                document.title = "(" + jarnxmpp.UI.msg_counter + ") " + document.title;
            }
            else {
                document.title = document.title.replace(/^\(\d\) /, "(" + jarnxmpp.UI.msg_counter + ") ");
            }
            setTimeout(jarnxmpp.UI.focus, 0);
        } else if (document.title.search(/^\(\d\) /) !== -1) {
            document.title = document.title.replace(/^\(\d\) /, "");
        }
    },

    _loadGoogleMapsAPI: function (callback) {
        _initGoogleMaps = function() {
            jarnxmpp.UI.geocoder = new google.maps.Geocoder();
            callback();
        };
        var $script = $("<script>")
            .attr('id', 'google-maps-js')
            .attr('type', 'text/javascript')
            .attr('src', 'http://maps.googleapis.com/maps/api/js?sensor=false&callback=_initGoogleMaps');
        $('body').append($script);
    },

    showGoogleMap: function(id, lat, lng) {
        _showMap = function () {
            var latlng = new google.maps.LatLng(lat, lng),
                options = {
              zoom: 15,
              center: latlng,
              navigationControlOptions: {style: google.maps.NavigationControlStyle.SMALL},
              mapTypeId: google.maps.MapTypeId.ROADMAP
            };
            $('#'+id).css({'width':'280px', 'height':'200px'});
            var map = new google.maps.Map(document.getElementById(id), options);
            $('#' +id).hide();
            $('#' +id).slideDown("slow");
        };
        lat = parseFloat(lat);
        lng = parseFloat(lng);
        if ($('#google-maps-js').length === 0) jarnxmpp.UI._loadGoogleMapsAPI(_showMap);
        else _showMap();
    },

    reverseGeocode: function(lat, lng, callback) {
        lat = parseFloat(lat);
        lng = parseFloat(lng);
        var latlng = new google.maps.LatLng(lat, lng);
        jarnxmpp.UI.geocoder.geocode({'latLng': latlng}, function(results, status) {
            if (status == google.maps.GeocoderStatus.OK) {
                var components = {},
                    result = '';
                for (var i=0; i<results[0].address_components.length; i++)
                    components[results[0].address_components[i].types[0]] = results[0].address_components[i].long_name;
                if (components.administrative_area_level_3)
                    result += components.administrative_area_level_3 + ', ';
                if (components.administrative_area_level_2)
                    result += components.administrative_area_level_2 + ', ';
                if (components.administrative_area_level_1)
                    result += components.administrative_area_level_1 + ', ';
                result += components.country;
                callback(result);
            }
        });
    }
};

// Presence handler

$(document).bind('jarnxmpp.presence', function (event, jid, status, presence) {
    var user_id = Strophe.getNodeFromJid(jid),
        barejid = Strophe.getBareJidFromJid(jid),
        existing_user_element = $('#online-users-' + user_id);
    if (existing_user_element.length) {
        if (status === 'offline' && jarnxmpp.Presence.online.hasOwnProperty(user_id)) {
            return;
        }
        existing_user_element.attr('class', status);
    } else {
        $.get(portal_url + '/xmpp-userDetails?jid=' + barejid, function (user_details) {
            if ($('#online-users-' + user_id).length > 0) {
                return;
            }
            user_details = $(user_details);
            // Put users in alphabetical order. This is stupidly done but works.
            var name = $('a.user-details-toggle', user_details).text().trim(),
                existing_users = $('#online-users > li'),
                added = false;
            $.each(existing_users, function (index, li) {
                var existing_name = $('a.user-details-toggle', li).text().trim();
                if (existing_name > name) {
                    user_details.insertBefore($(li));
                    added = true;
                    return false;
                }
            });
            if (!added) {
                $('#online-users').append(user_details);
            }
        });
        // Pre-fetch user info if we have a session storage.
        if (jarnxmpp.Storage.storage !== null)
            jarnxmpp.Presence.getUserInfo(user_id, function (data) {});
    }
    $('#online-count').text(jarnxmpp.Presence.onlineCount());
});

$(document).bind('jarnxmpp.message', function (event) {
    var user_id = Strophe.getNodeFromJid(event.from),
        jid = Strophe.getBareJidFromJid(event.from),
        $text_p = $('<p>').html(event.body),
        $form = $('#online-users li#online-users-' + user_id + ' .replyForm').clone(),
        $reply_p = $('<p>').append($form),
        text = $('<div>').append($text_p).append($reply_p).remove().html();
    $('input[type="submit"]', $form).attr('value', 'Reply');

    jarnxmpp.Presence.getUserInfo(user_id, function (data) {
        var gritter_id = $.gritter.add({
            title: data.fullname,
            text: text,
            image: data.portrait_url,
            sticky: true,
            after_close: function () {
                if (jarnxmpp.UI.msg_counter > 1)
                    jarnxmpp.UI.msg_counter -= 1;
                else
                    jarnxmpp.UI.msg_counter = 0;
                jarnxmpp.UI.updateMsgCounter();
            }
        });
        // Let the form know the gritter id so that we can easily close it later.
        $('#gritter-item-' + gritter_id + ' form').attr('data-gritter-id', gritter_id);
        
        jarnxmpp.UI.msg_counter += 1;
        jarnxmpp.UI.updateMsgCounter();
    });
});

// Pub-Sub
$(document).bind('jarnxmpp.pubsubEntryPublished', function (event) {
    var i, isLeaf, $li;
    $('#site-stream-link').addClass('newStreamMessage');
    // If we are showing a feed already, and the item should be in it,
    // inject it.
    if ($('.pubsubNode[data-node="people"]').length > 0 ||
        $('.pubsubNode[data-node=event.node]').length > 0) {
        isLeaf = ($('.pubsubNode[data-node="people"]').length > 0) ? false : true;
        $.get(portal_url + '/@@pubsub-item?',
              {node: event.node,
               id: event.id,
               content: event.content,
               author: event.author,
               published: event.published,
               updated: event.updated,
               geolocation: event.geolocation,
               isLeaf: isLeaf}, function (data) {
            $li = $('<li>').addClass('pubsubItem').css('display', 'none').html(data);
            $('.pubsubNode').prepend($li);
            $('.pubsubNode li:first').slideDown("slow");
            $('.pubsubNode li:first').magicLinks();
        });
    }
});

// Logging

$(document).bind('jarnxmpp.dataReceived', function (ev) {
    $('#xmpp-log').append($('<div>').addClass('xmpp-dataRcvd').text(ev.text));
});

$(document).bind('jarnxmpp.dataSent', function (ev) {
    $('#xmpp-log').append($('<div>').addClass('xmpp-dataSent').text(ev.text));
});

$.fn.magicLinks = function () {
    $('a.magic-link', this).each(function () {
        var $link = $(this);
        $link.hide();
        $link.children('.magic-favicon').hide();
        var setLink = function(data) {
            $link.children('.magic-link-title').html(data.title);
            $link.children('.magic-link-descr').html(data.description);
            $link.children('.magic-favicon').attr('src', data.favicon_url);
            $link.children('.magic-favicon').show();
            $link.show();
        };
        if (jarnxmpp.Storage.storage !==null && 'ml' + $link.attr('href') in jarnxmpp.Storage.storage) {
            var data = jarnxmpp.Storage.get('ml' + $link.attr('href'));
            setLink(data);
        } else {
            $.getJSON(portal_url + "/magic-links?url=" + $link.attr('href'), function (data) {
                if (data===null) return;
                if (jarnxmpp.Storage.storage!==null) {
                    jarnxmpp.Storage.set('ml' + $link.attr('href'), data);
                }
                setLink(data);
            });
        }
    });
};

$(document).ready(function () {

    $('.sendXMPPMessage').live('submit', function (e) {
        var $field = $('input[name="message"]', this),
            text = $field.val(),
            recipient = $field.attr('data-recipient'),
            message;
            $(this).parents('.user-details-form')
                   .parent()
                   .children('.user-details-toggle')
                   .removeClass('expanded');
            var gritter_id = $(this).attr('data-gritter-id');
            if (typeof(gritter_id) !== 'undefined')
                $.gritter.remove(gritter_id);
            $("ul#online-users").removeClass('activated');
            $field.val('');
        $.getJSON(portal_url + '/content-transform?', {text: text}, function (data) {
            message = $msg({to: recipient, type: 'chat'}).c('body').t(data.text);
            jarnxmpp.connection.send(message);
        });
        e.preventDefault();
    });

    $('a#toggle-online-users').bind('click', function (e) {
        if ($("ul#online-users").hasClass('activated')) {
            $("ul#online-users").removeClass('activated');
            $('a.user-details-toggle').removeClass('expanded');
        }
        else {
            $("ul#online-users").addClass('activated');
        }
        e.preventDefault();
    });

    $('a.user-details-toggle').live('click', function (e) {
        $('a.user-details-toggle').removeClass('expanded');
        $(this).toggleClass('expanded');
        $(this).next().find('input[name="message"]').focus();
        e.preventDefault();
    });

    $('#pubsub-form').bind('submit', function (e) {
        var $field = $('input[name="message"]', this),
            text = $field.attr('value'),
            node = $field.attr('data-node'),
            share_location = $('input[name="share-location"]', this).attr('checked');
        jarnxmpp.PubSub.publishToPersonalNode(node, text, share_location);
        $field.attr('value', '');
        return false;
    });

    $('.replyForm').find('> a').live('click', function (e) {
        $(this).hide();
        $(this).next('form.sendXMPPMessage').fadeIn('medium');
        $(this).next('form.sendXMPPMessage').find('input[name="message"]').focus();
        e.preventDefault();
    });

    $('.pubsubNode').magicLinks();

    if ($('.geolocation').length>0) {
        jarnxmpp.UI._loadGoogleMapsAPI(function () {
            $('.location').each(function (idx) {
                var $geoelem = $(this);
                var latitude = $geoelem.attr('data-latitude'),
                    longitude = $geoelem.attr('data-longitude');
                jarnxmpp.UI.reverseGeocode(latitude, longitude, function(city) {
                    $geoelem.text(city);
                });
            });
        });
    }

    $('.location').live('click', function (e) {
        var map_id = $(this).parent().find('.map').attr('id');
        if ($('#' + map_id).is(':hidden')) {
            var latitude = $(this).attr('data-latitude'),
                longitude = $(this).attr('data-longitude');
            jarnxmpp.UI.showGoogleMap(map_id, latitude, longitude);
        } else $('#' + map_id).hide();
    });

    if (jarnxmpp.Storage.storage !==null) {
        var count = jarnxmpp.Storage.get('online-count');
        if (count !== null) {
            $('#online-count').text(count);
        }
    }

});
