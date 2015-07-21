$(document).ready(function(){

  var selfView = document.getElementById('selfView');
  var remoteView = document.getElementById('remoteView');
  var localStream, remoteStream;
  // Flags indicating whether local peer can renegotiate RTC (or PC reset is required).
  var localCanRenegotiateRTC = function() {
    return JsSIP.rtcninja.canRenegotiate;
  };

  window.GUI = {

    playSound: function(sound_file) {
      soundPlayer.setAttribute("src", sound_file);
      soundPlayer.play();
    },

    // Active session collection
    Sessions: [],

    // Add a session object to the session collection
    createSession: function(display_name, uri) {
      console.log('Tryit: createSession');

      var session, compositionIndicator;

      session = GUI.getSession(uri);

      if (session === null) {
        // iscomposing stuff.
        compositionIndicator = GUI.createCompositionIndicator(uri);
        compositionIndicator.idle();


        session = {
          uri: uri,
          displayName: display_name,
          call: null,
          compositionIndicator: compositionIndicator,
          isComposing: false,
          chat: []
        };

        GUI.Sessions.push(session);
      }

      return session;
    },

    // remove a session object from the session collection
    removeSession: function(uri, force) {
      console.log('Tryit: removeSession');
      var idx, session;

      for(idx in GUI.Sessions) {
        session = GUI.Sessions[idx];
        if (session.uri === uri) {

          // living chat session
          if (!force && session.chat.length) {
            session.call = null;
          } else {
            session.compositionIndicator.close();
            GUI.Sessions.splice(idx,1);
          }
        }
      }

      GUI.renderSessions();
    },

    getSession: function(uri) {
      console.log('Tryit: getSession');

      var idx,
        session = null;

      for(idx in GUI.Sessions) {
        if (GUI.Sessions[idx].uri === uri) {
          session = GUI.Sessions[idx];
          break;
        }
      }

      return session;
    },

    renderSessions: function() {
      console.log('Tryit: renderSessions');
      React.render(
        React.createElement(SessionsList, {
            data: GUI.Sessions
          }), document.getElementById('sessions')
      );
    },

    createCompositionIndicator: function(uri) {
      console.log('Tryit: createCompositionIndicator');

      var compositionIndicator = iscomposing({format: 'xml'});

      compositionIndicator.on('local:active', function (msg, mimeContentType) {
        ua.sendMessage(uri, msg, {
          contentType: mimeContentType
        });
      });

      compositionIndicator.on('local:idle', function (msg, mimeContentType) {
        ua.sendMessage(uri, msg, {
          contentType: mimeContentType
        });
      });

      compositionIndicator.on('remote:active', function (statusContentType) {
        GUI.phoneIsComposingReceived(uri, true);
      });

      compositionIndicator.on('remote:idle', function (statusContentType) {
        GUI.phoneIsComposingReceived(uri, false);
      });

      return compositionIndicator;
    },

    phoneCallButtonPressed : function() {
      var target = phone_dialed_number_screen.val();

      if (target) {
        phone_dialed_number_screen.val("");
        GUI.jssipCall(target);
      }
    },

    phoneChatButtonPressed: function() {
      var uri,
        target = phone_dialed_number_screen.val();

      if (target) {
        uri = ua.normalizeTarget(target);
        if (! uri) {
          throw new Error("wrong target: '%s'", target)
        }

        phone_dialed_number_screen.val("");

        // create session
        GUI.createSession(uri.user, uri.toString());

        // render it
        GUI.renderSessions();
      }
    },

    // JsSIP.UA newRTCSession event listener
    new_call: function(e) {
      var session,
        call = e.session,
        uri = call.remote_identity.uri,
        display_name = call.remote_identity.display_name || uri.user;

      session = GUI.getSession(uri.toString());

      // We already have a session with this peer
      if (session) {
        if (session.call && !session.call.isEnded()) {
          call.terminate();
          return;
        } else {
          session.call = call;
        }

      // new session
      } else {
        session = GUI.createSession(display_name, uri.toString());
        session.call = call;
      }

      GUI.renderSessions();
      GUI.setCallEventHandlers(e);
    },

    // RTCSession event callback definition
    setCallEventHandlers: function(e) {
      var
        request = e.request,
        call = e.session;

      // check custom X-Can-Renegotiate header field
      if (call.direction === 'incoming') {
        if (call.request.getHeader('X-Can-Renegotiate') === 'false') {
          call.data.remoteCanRenegotiateRTC = false;
        }
        else {
          call.data.remoteCanRenegotiateRTC = true;
        }

        GUI.playSound("sounds/incoming-call2.ogg");
      }

      call.on('connecting', function() {
        // TMP
        if (call.connection.getLocalStreams().length > 0) {
          window.localStream = call.connection.getLocalStreams()[0];
        }
      });

      // Progress
      call.on('progress',function(e){
        if (e.originator === 'remote') {
        }
      });

      // Started
      call.on('accepted',function(e){
        //Attach the streams to the views if it exists.
        if (call.connection.getLocalStreams().length > 0) {
          localStream = call.connection.getLocalStreams()[0];
          selfView = JsSIP.rtcninja.attachMediaStream(selfView, localStream);
          selfView.volume = 0;

          // TMP
          window.localStream = localStream;
        }

        if (e.originator === 'remote') {
          if (e.response.getHeader('X-Can-Renegotiate') === 'false') {
            call.data.remoteCanRenegotiateRTC = false;
          }
          else {
            call.data.remoteCanRenegotiateRTC = true;
          }
        }
      });

      call.on('addstream', function(e) {
        console.log('Tryit: addstream()');
        remoteStream = e.stream;
        remoteView = JsSIP.rtcninja.attachMediaStream(remoteView, remoteStream);
      });

      // Failed
      call.on('failed',function(e) {
        GUI.playSound("sounds/outgoing-call-rejected.wav");
        selfView.src = '';
        remoteView.src = '';

        _Session = null;

        GUI.removeSession(call.remote_identity.uri.toString());
      });

      // NewDTMF
      call.on('newDTMF',function(e) {
        GUI.playSound("sounds/dialpad/" + e.dtmf.tone + ".ogg");
      });

      call.on('hold',function(e) {
        GUI.playSound("sounds/dialpad/pound.ogg");
      });

      call.on('unhold',function(e) {
        GUI.playSound("sounds/dialpad/pound.ogg");
      });

      // Ended
      call.on('ended', function(e) {
        selfView.src = '';
        remoteView.src = '';

        _Session = null;
        JsSIP.rtcninja.closeMediaStream(localStream);

        GUI.removeSession(call.remote_identity.uri.toString());
      });

      // received UPDATE
      call.on('update', function(e) {
        var request = e.request;

        if (! request.body) { return; }

        if (! localCanRenegotiateRTC() || ! call.data.remoteCanRenegotiateRTC) {
          console.warn('Tryit: UPDATE received, resetting PeerConnection');
          call.connection.reset();
          call.connection.addStream(localStream);
        }
      });

      // received reINVITE
      call.on('reinvite', function(e) {
        var request = e.request;

        if (! e.request.body) { return; }

        if (! localCanRenegotiateRTC() || ! call.data.remoteCanRenegotiateRTC) {
          console.warn('Tryit: reINVITE received, resetting PeerConnection');
          call.connection.reset();
          call.connection.addStream(localStream);
        }
      });
    },

    // JsSIP.UA new_message event listener
    new_message: function(e) {
      var session, text,
        uri = e.message.remote_identity.uri;
        display_name = e.message.remote_identity.display_name || uri.user;

      text = e.request.body;
      session = GUI.getSession(uri.toString());

      if (!session) {
        session = GUI.createSession(display_name, uri.toString());
      }

      if (e.originator === 'remote') {
        // compossing stuff
        if (session.compositionIndicator.received(text, e.request.getHeader('Content-Type'))) {
          return;
        }

        // reset isComposing since we are receiving a text message from the peer
        session.isComposing = false;

        GUI.playSound("sounds/incoming-chat.ogg");
      } else if (e.originator === 'local') {

        if (e.request.getHeader('content-type').match(/iscomposing/)) {
          return;
        }

        e.message.on('failed', function(e){
          var cause;

          if (e.response)
            cause = e.response.status_code.toString() + " " + e.response.reason_phrase;
          else
            cause = e.cause.toString();

          session.chat.push({
            who: 'error',
            text: cause
          });

          GUI.renderSessions();
        });
      }

      // set the display name
      session.displayName = display_name;

      // add text to chat collection
      session.chat.push({
        who: e.originator==='local'?'me':'peer',
        text: text
      });

      GUI.renderSessions();
    },


    /*
     * This callback method is called by 'iscomposing.js' when a MESSAGE is received
     * with content type application/im-iscomposing+xml.
     * The first parameter is the From URI (sip:user@domain) and
     * a second parameter indicates 'active':
     * - true: if the event is "iscomposing active"
     * - false: if the event is "iscomposing idle"
     */
    phoneIsComposingReceived : function(uri, active) {
      console.log('Tryit: phoneIsCompsingReceived_react()');

      var session = GUI.getSession(uri);

      // If a session does not exist just ignore it.
      if (!session)
        return false;

      session.isComposing=active;
      GUI.renderSessions();
    },

    // Button Click handlers
    buttonCloseClick: function(uri) {
      console.log('Tryit: buttonCloselClick');
      GUI.removeSession(uri, true /*force*/);
    },

    buttonDialClick: function(target) {
      console.log('Tryit: buttonDialClick');

      GUI.jssipCall(target);
    },

    buttonAnswerClick: function(call) {
      console.log('Tryit: buttonAnswerClick');

       call.answer({
         pcConfig: peerconnection_config,
         // TMP:
         mediaConstraints: {audio: true, video: true},
         extraHeaders: [
           'X-Can-Renegotiate: ' + String(localCanRenegotiateRTC())
         ],
         rtcOfferConstraints: {
           offerToReceiveAudio: 1,
           offerToReceiveVideo: 1
         },
       });
    },

    buttonHoldClick: function(call) {
      console.log('Tryit: buttonHoldClick');

      if (! call.isReadyToReOffer()) {
        console.warn('Tryit: not ready to reoffer');
        return;
      }
      if (! localCanRenegotiateRTC() || ! call.data.remoteCanRenegotiateRTC) {
        console.warn('Tryit: resetting PeerConnection before hold');
        call.connection.reset();
        call.connection.addStream(localStream);
      }
      call.hold({useUpdate: false});
    },

    buttonResumeClick: function(call) {
      console.log('Tryit: buttonResumeClick');

      if (! call.isReadyToReOffer()) {
        console.warn('Tryit: not ready to reoffer');
        return;
      }
      if (! localCanRenegotiateRTC() || ! call.data.remoteCanRenegotiateRTC) {
        console.warn('Tryit: resetting PeerConnection before unhold');
        call.connection.reset();
        call.connection.addStream(localStream);
      }
      call.unhold();
    },

    buttonHangupClick: function(call) {
      console.log('Tryit: buttonHangupClick');

      call.terminate();
    },

    buttonDtmfClick: function(call,digit) {
      console.log('Tryit: buttonDtmfClick');

      call.sendDTMF(digit);
    },

    // iscomposing stuff.
    chatInputBlur: function (uri, text, enter) {
      console.log('Tryit: chatInputChange');

      var session, compositionIndicator;

      session = GUI.getSession(uri);

      if (!session) {
        return;
      }

      compositionIndicator = session.compositionIndicator;

      if (enter && text.length) {
        ua.sendMessage(uri, text);
        compositionIndicator.sent();
      } else if (text.length) {
        compositionIndicator.composing();
      } else {
        compositionIndicator.idle();
      }
    },

    // iscomposing stuff.
    chatInputBlur: function (uri) {
      console.log('Tryit: chatInputBlur');

      var session = GUI.getSession(uri);

      if (!session) {
        return;
      }

      session.compositionIndicator.idle();
    },


    /*
     * Cambia el indicador de "Status". Debe llamarse con uno de estos valores:
     * - "connected"
     * - "registered"
     * - "disconnected"
     */
    setStatus : function(status) {
      $("#conn-status").removeClass();
      $("#conn-status").addClass(status);
      $("#conn-status > .value").text(status);

      register_checkbox.attr("disabled", false);
      if(status == "registered")
        register_checkbox.attr("checked", true);
      else
        register_checkbox.attr("checked", false);
    },


    jssipCall : function(target) {
        ua.call(target, {
            pcConfig: peerconnection_config,
            mediaConstraints: { audio: true, video:$('#enableVideo').is(':checked') },
            extraHeaders: [
              'X-Can-Renegotiate: ' + String(localCanRenegotiateRTC())
            ],
            rtcOfferConstraints: {
              offerToReceiveAudio: 1,
              offerToReceiveVideo: 1
            }
        });
    }

  };


  // Add/remove video during a call.
  $('#enableVideo').change(function() {
    if (! _Session) { return; }

    if (! _Session.isReadyToReOffer()) {
      console.warn('Tryit: not ready to reoffer');
      return;
    }

    var mediaConstraints = { audio: true, video: true };

    // Video addition/removal form the current MediaStream.
    if (localCanRenegotiateRTC()) {
      if (!$(this).is(':checked')) {
        // Remove local video.
        var videoTrack = _Session.connection.getLocalStreams()[0].getVideoTracks()[0];

        if (!videoTrack) {
          return;
        }
        _Session.connection.getLocalStreams()[0].removeTrack(videoTrack);

        doRenegotiate();

        selfView = JsSIP.rtcninja.attachMediaStream(selfView, localStream);
      }
      // Add local video.
      else {
        var videoTrack = _Session.connection.getLocalStreams()[0].getVideoTracks()[0];

        if (videoTrack) {
          return;
        }

        JsSIP.rtcninja.getUserMedia({video: true, audio: false},
          addVideoTrack,
          function(error) {
            throw error;
          }
        );

        function addVideoTrack(stream) {
          var videoTrack = stream.getVideoTracks()[0];

          _Session.connection.getLocalStreams()[0].addTrack(videoTrack);

          doRenegotiate();

          selfView = JsSIP.rtcninja.attachMediaStream(selfView, localStream);
        }
      }
    }

    // New MediaStream.
    else {
      var mediaConstraints = {
        audio: true,
        video: $(this).is(':checked')
      };

      JsSIP.rtcninja.getUserMedia(mediaConstraints,
        useNewLocalStream,
        function(error) {
          throw error;
        }
      );
    }

    function useNewLocalStream(stream) {
      if (! _Session) { return; }

      if (localCanRenegotiateRTC() && _Session.data.remoteCanRenegotiateRTC) {
        _Session.connection.removeStream(localStream);
        _Session.connection.addStream(stream);
      }
      else {
        console.warn('Tryit: resetting PeerConnection before renegotiating the session');
        _Session.connection.reset();
        _Session.connection.addStream(stream);
      }

      JsSIP.rtcninja.closeMediaStream(localStream);

      doRenegotiate();

      localStream = stream;
      selfView = JsSIP.rtcninja.attachMediaStream(selfView, stream);
    }

    function doRenegotiate() {
      _Session.renegotiate({
        useUpdate: true,
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: true }
      });
    }
  });

});
