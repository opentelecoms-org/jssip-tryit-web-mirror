$(document).ready(function(){

  var selfView = document.getElementById('selfView');
  var remoteView = document.getElementById('remoteView');
  var localStream, remoteStream;
  // Flags indicating whether local peer can renegotiate RTC (or PC reset is required).
  var localCanRenegotiateRTC = function() {
    return JsSIP.rtcninja.canRenegotiate;
  };

  window.GUI = {

    phoneCallButtonPressed : function() {
      var target = phone_dialed_number_screen.val();

      if (target) {
        phone_dialed_number_screen.val("");
        GUI.jssipCall(target);
      }
    },


    phoneChatButtonPressed : function() {
      var user, session, uri,
        target = phone_dialed_number_screen.val();

      if (target) {
        uri = ua.normalizeTarget(target);
        if (! uri) {
          throw new Error("wrong target: '%s'", target)
        }

        phone_dialed_number_screen.val("");
        session = GUI.getSession(uri.toString());

        // If this is a new session create it without call.
        if (!session) {
          session = GUI.createSession(uri.user, uri.toString());
          GUI.setCallSessionStatus(session, "inactive");
        }

        $(session).find(".chat input").focus();
      }
    },


    /*
     * JsSIP.UA new_session event listener
     */
    new_session : function(e) {

      var display_name, status,
          request = e.request,
          call = e.session,
          uri = call.remote_identity.uri.toString(),
          session = GUI.getSession(uri);

      display_name = call.remote_identity.display_name || call.remote_identity.uri.user;

      if (call.direction === 'incoming') {
        status = "incoming";
        if (request.getHeader('X-Can-Renegotiate') === 'false') {
          call.data.remoteCanRenegotiateRTC = false;
        }
        else {
          call.data.remoteCanRenegotiateRTC = true;
        }
      } else {
        status = "trying";
      }

      // If the session exists with active call reject it.
      if (session && !$(session).find(".call").hasClass("inactive")) {
        call.terminate();
        return false;
      }

      // If this is a new session create it
      if (!session) {
        session = GUI.createSession(display_name, uri);
      }

      // Associate the JsSIP Session to the HTML div session
      session.call = call;
      GUI.setCallSessionStatus(session, status);
      $(session).find(".chat input").focus();

      // EVENT CALLBACK DEFINITION

      // Progress
      call.on('progress',function(e){
        if (e.originator === 'remote') {
          GUI.setCallSessionStatus(session, 'in-progress');
        }
      });

      // Started
      call.on('accepted',function(e){
        //Attach the streams to the views if it exists.
        if (call.connection.getLocalStreams().length > 0) {
          localStream = call.connection.getLocalStreams()[0];
          selfView = JsSIP.rtcninja.attachMediaStream(selfView, localStream);
          selfView.volume = 0;
        }

        if (e.originator === 'remote') {
          if (e.response.getHeader('X-Can-Renegotiate') === 'false') {
            call.data.remoteCanRenegotiateRTC = false;
          }
          else {
            call.data.remoteCanRenegotiateRTC = true;
          }
        }

        GUI.setCallSessionStatus(session, 'answered');
      });

      call.on('addstream', function(e) {
        console.log('Tryit: addstream()');
        remoteStream = e.stream;
        remoteView = JsSIP.rtcninja.attachMediaStream(remoteView, remoteStream);
      });

      // Failed
      call.on('failed',function(e) {
        var
          cause = e.cause,
          response = e.response;

        if (e.originator === 'remote' && cause.match("SIP;cause=200", "i")) {
          cause = 'answered_elsewhere';
        }

        GUI.setCallSessionStatus(session, 'terminated', cause);
        soundPlayer.setAttribute("src", "sounds/outgoing-call-rejected.wav");
        soundPlayer.play();
        GUI.removeSession(session, 1500);
        selfView.src = '';
        remoteView.src = '';

        _Session = null;
      });

      // NewDTMF
      call.on('newDTMF',function(e) {
        if (e.originator === 'remote') {
          sound_file = e.dtmf.tone;
          soundPlayer.setAttribute("src", "sounds/dialpad/" + sound_file + ".ogg");
          soundPlayer.play();
        }
      });

      call.on('hold',function(e) {
        soundPlayer.setAttribute("src", "sounds/dialpad/pound.ogg");
        soundPlayer.play();

        GUI.setCallSessionStatus(session, 'hold', e.originator);
      });

      call.on('unhold',function(e) {
        soundPlayer.setAttribute("src", "sounds/dialpad/pound.ogg");
        soundPlayer.play();

        GUI.setCallSessionStatus(session, 'unhold', e.originator);
      });

      // Ended
      call.on('ended', function(e) {
        var cause = e.cause;

        GUI.setCallSessionStatus(session, "terminated", cause);
        GUI.removeSession(session, 1500);
        selfView.src = '';
        remoteView.src = '';

        _Session = null;
        JsSIP.rtcninja.closeMediaStream(localStream);
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

        if (! request.body) { return; }

        if (! localCanRenegotiateRTC() || ! call.data.remoteCanRenegotiateRTC) {
          console.warn('Tryit: reINVITE received, resetting PeerConnection');
          call.connection.reset();
          call.connection.addStream(localStream);
        }
      });
    },


    /*
     * JsSIP.UA new_message event listener
     */
    new_message : function(e) {
      var display_name, text,
        request = e.request,
        message = e.message,
        uri = message.remote_identity.uri.toString(),
        session = GUI.getSession(uri);

      if (message.direction === 'incoming') {
        display_name = message.remote_identity.display_name || message.remote_identity.uri.user;
        text = request.body;

        // If this is a new session create it with call status "inactive", and add the message.
        if (!session) {
          session = GUI.createSession(display_name, uri);
          GUI.setCallSessionStatus(session, "inactive");
        }

        $(session).find(".peer > .display-name").text(display_name);
        GUI.addChatMessage(session, "peer", text);
        $(session).find(".chat input").focus();
      } else {
        message.on('failed', function(e){
          var response = e.response;
          if (response)
            GUI.addChatMessage(session, "error", response.status_code.toString() + " " + response.reason_phrase);
          else
            GUI.addChatMessage(session, "error", e.cause.toString());
        });
      }
    },


    /*
     * Esta función debe ser llamada por jssip al recibir un MESSAGE
     * de tipo application/im-iscomposing+xml,
     * y debe pasar como parámetro el From URI (sip:user@domain) y otro
     * parámetro active que es:
     * - true: es un evento "iscomposing active"
     * - false: es un evento "iscomposing idle"
     */
    phoneIsComposingReceived : function(uri, active) {
      var session = GUI.getSession(uri);

      // If a session does not exist just ignore it.
      if (!session)
        return false;

      var chatting = $(session).find(".chat > .chatting");

      // If the session has no chat ignore it.
      if ($(chatting).hasClass("inactive"))
        return false;

      if (active)
        $(session).find(".chat .iscomposing").show();
      else
        $(session).find(".chat .iscomposing").hide();
    },


    /*
     * Busca en las sessions existentes si existe alguna con mismo peer URI. En ese
     * caso devuelve el objeto jQuery de dicha session. Si no, devuelve false.
     */
    getSession : function(uri) {
      var session_found = null;

      $("#sessions > .session").each(function(i, session) {
        if (uri === $(this).find(".peer > .uri").text()) {
          session_found = session;
          return false;
        }
      });

      if (session_found)
        return session_found;
      else
        return false;
    },


    createSession : function(display_name, uri) {
      var session_div = $('\
      <div class="session"> \
        <div class="close"></div> \
        <div class="container"> \
          <div class="peer"> \
            <span class="display-name">' + display_name + '</span> \
            <span>&lt;</span><span class="uri">' + uri + '</span><span>&gt;</span> \
          </div> \
          <div class="call inactive"> \
            <div class="button dial"></div> \
            <div class="button hangup"></div> \
            <div class="button dtmf"></div> \
            <div class="button hold"></div> \
            <div class="button resume"></div> \
            <div class="dtmf-box"> \
              <div class="dtmf-row"> \
                <div class="dtmf-button digit-1">1</div> \
                <div class="dtmf-button digit-2">2</div> \
                <div class="dtmf-button digit-3">3</div> \
              </div> \
              <div class="dtmf-row"> \
                <div class="dtmf-button digit-4">4</div> \
                <div class="dtmf-button digit-5">5</div> \
                <div class="dtmf-button digit-6">6</div> \
              </div> \
              <div class="dtmf-row"> \
                <div class="dtmf-button digit-7">7</div> \
                <div class="dtmf-button digit-8">8</div> \
                <div class="dtmf-button digit-9">9</div> \
              </div> \
              <div class="dtmf-row"> \
                <div class="dtmf-button digit-asterisk">*</div> \
                <div class="dtmf-button digit-0">0</div> \
                <div class="dtmf-button digit-pound">#</div> \
              </div> \
            </div> \
            <div class="call-status"></div> \
          </div> \
          <div class="chat"> \
            <div class="chatting inactive"></div> \
            <input class="inactive" type="text" name="chat-input" value="type to chat..."/> \
            <div class="iscomposing"></div> \
          </div> \
        </div> \
      </div> \
      ');

      $("#sessions").append(session_div);

      var session = $("#sessions .session").filter(":last");
      var call_status = $(session).find(".call");
      var close = $(session).find("> .close");
      var chat_input = $(session).find(".chat > input[type='text']");

      $(session).hover(function() {
        if ($(call_status).hasClass("inactive"))
          $(close).show();
      },
      function() {
        $(close).hide();
      });

      close.click(function() {
        GUI.removeSession(session, null, true);
      });

      chat_input.focus(function(e) {
        if ($(this).hasClass("inactive")) {
        $(this).val("");
        $(this).removeClass("inactive");
        }
      });

      chat_input.blur(function(e) {
        if ($(this).val() == "") {
          $(this).addClass("inactive");
          $(this).val("type to chat...");
        }
      });

      chat_input.keydown(function(e) {
        // Ignore TAB and ESC.
        if (e.which == 9 || e.which == 27) {
          return false;
        }
        // Enter pressed? so send chat.
        else if (e.which == 13 && $(this).val() != "") {
          var text = chat_input.val();
          GUI.addChatMessage(session, "me", text);
          chat_input.val("");
          GUI.jssipMessage(uri, text);
        }
        // Ignore Enter when empty input.
        else if (e.which == 13 && $(this).val() == "") {
          return false;
        }
        // NOTE is-composing stuff.
        // Ignore "windows" and ALT keys, DEL, mayusculas and 0 (que no sé qué es).
        else if (e.which == 18 || e.which == 91 || e.which == 46 || e.which == 16 || e.which == 0)
          return false;
        // If this is the first char in the input and the chatting session
        // is active, then send a iscomposing notification.
        else if (e.which != 8 && $(this).val() == "") {
          GUI.jssipIsComposing(uri, true);
        }
        // If this is a DELETE key and the input has been totally clean, then send "idle" isomposing.
        else if (e.which == 8 && $(this).val().match("^.$"))
          GUI.jssipIsComposing(uri, false);
      });

      $(session).fadeIn(100);

      // Return the jQuery object for the created session div.
      return session;
    },


    setCallSessionStatus : function(session, status, description, realHack) {
      var session = session;
      var uri = $(session).find(".peer > .uri").text();
      var call = $(session).find(".call");
      var status_text = $(session).find(".call-status");
      var button_dial = $(session).find(".button.dial");
      var button_hangup = $(session).find(".button.hangup");
      var button_hold = $(session).find(".button.hold");
      var button_resume = $(session).find(".button.resume");
      var button_dtmf = $(session).find(".button.dtmf");
      var dtmf_box = $(session).find(".dtmf-box");

      // If the call is not inactive or terminated, then hide the
      // close button (without waiting for blur() in the session div).
      if (status != "inactive" && status != "terminated") {
        $(session).unbind("hover");
        $(session).find("> .close").hide();
      }

      // Unset all the functions assigned to buttons.
      button_dial.unbind("click");
      button_hangup.unbind("click");
      button_hold.unbind("click");
      button_resume.unbind("click");
      button_dtmf.unbind("click");

      if (session.call && session.call.status !== JsSIP.C.SESSION_TERMINATED) {
        button_hangup.click(function() {
          GUI.setCallSessionStatus(session, "terminated", "terminated");
          session.call.terminate();
          GUI.removeSession(session, 500);
        });
      }
      else {
        button_dtmf.unbind("click");
      }

      switch(status) {
        case "inactive":
          call.removeClass();
          call.addClass("call inactive");
          status_text.text("");

          button_dial.click(function() {
            GUI.jssipCall(uri);
          });

          // Hide DTMF box.
          dtmf_box.hide();
          break;

        case "trying":
          call.removeClass();
          call.addClass("call trying");
          status_text.text(description || "trying...");

          // unhide HTML Video Elements
          //$('#remoteView').attr('hidden', false);
          //$('#selfView').attr('hidden', false);

          // Set background image
          //$('#remoteView').attr('poster', "images/logo.png");

          // Hide DTMF box.
          dtmf_box.hide();
          break;

        case "in-progress":
          call.removeClass();
          call.addClass("call in-progress");
          status_text.text(description || "in progress...");

          // ring-back.
          soundPlayer.setAttribute("src", "sounds/outgoing-call2.ogg");
          soundPlayer.play();

          // Hide DTMF box.
          dtmf_box.hide();
          break;

        case "answered":
          call.removeClass();
          call.addClass("call answered");
          status_text.text(description || "answered");

          button_hold.click(function(){
            if (! session.call.isReadyToReOffer()) {
              console.warn('Tryit: not ready to reoffer');
              return;
            }
            if (! localCanRenegotiateRTC() || ! session.call.data.remoteCanRenegotiateRTC) {
              console.warn('Tryit: resetting PeerConnection before hold');
              session.call.connection.reset();
              session.call.connection.addStream(localStream);
            }
            session.call.hold({useUpdate: false});
          });

          button_dtmf.click(function() {
            dtmf_box.toggle();
          });

          if (realHack) { return; }

          var dtmf_button = $(dtmf_box).find(".dtmf-button");
          window.dtmf_button = dtmf_button;
          var sound_file;
          dtmf_button.click(function() {
            if ($(this).hasClass("digit-asterisk"))
              sound_file = "asterisk";
            else if ($(this).hasClass("digit-pound"))
              sound_file = "pound";
            else
              sound_file = $(this).text();
            soundPlayer.setAttribute("src", "sounds/dialpad/" + sound_file + ".ogg");
            soundPlayer.play();

            session.call.sendDTMF($(this).text());
          });

          break;

        case "hold":
        case "unhold":
          if (session.call.isOnHold().local) {
            call.removeClass();
            call.addClass("call on-hold");
            button_resume.click(function(){
              if (! session.call.isReadyToReOffer()) {
                console.warn('Tryit: not ready to reoffer');
                return;
              }
              if (! localCanRenegotiateRTC() || ! session.call.data.remoteCanRenegotiateRTC) {
                console.warn('Tryit: resetting PeerConnection before unhold');
                session.call.connection.reset();
                session.call.connection.addStream(localStream);
              }
              session.call.unhold();
            });
          } else {
            GUI.setCallSessionStatus(session, 'answered', null, true);
          }

          var local_hold = session.call.isOnHold().local;
          var remote_hold = session.call.isOnHold().remote;

          var status = "hold by";
          status += local_hold?" local ":"";

          if (remote_hold) {
            if (local_hold)
              status += "/";

            status += " remote";
          }

          if (local_hold||remote_hold) {
            status_text.text(status);
          }

          break;

        case "terminated":
          call.removeClass();
          call.addClass("call terminated");
          status_text.text(description || "terminated");
          button_hangup.unbind("click");

          // Hide DTMF box.
          dtmf_box.hide();
          break;

        case "incoming":
          call.removeClass();
          call.addClass("call incoming");
          status_text.text("incoming call...");
          soundPlayer.setAttribute("src", "sounds/incoming-call2.ogg");
          soundPlayer.play();

          button_dial.click(function() {
            session.call.answer({
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
          });

          // unhide HTML Video Elements
          //$('#remoteView').attr('hidden', false);
          //$('#selfView').attr('hidden', false);

          // Set background image
          //$('#remoteView').attr('poster', "images/logo.png");

          // Hide DTMF box.
          dtmf_box.hide();
          break;

        default:
          alert("ERROR: setCallSessionStatus() called with unknown status '" + status + "'");
          break;
      }
    },


    removeSession : function(session, time, force) {
      var default_time = 500;
      var uri = $(session).find(".peer > .uri").text();
      var chat_input = $(session).find(".chat > input[type='text']");

      if (force || ($(session).find(".chat .chatting").hasClass("inactive") && (chat_input.hasClass("inactive") || chat_input.val() == ""))) {
        time = ( time ? time : default_time );
        $(session).fadeTo(time, 0.7, function() {
          $(session).slideUp(100, function() {
            $(session).remove();
          });
        });
        // Enviar "iscomposing idle" si estábamos escribiendo.
        if (! chat_input.hasClass("inactive") && chat_input.val() != "")
          GUI.jssipIsComposing(uri, false);
      }
      else {
        // Como existe una sesión de chat, no cerramos el div de sesión,
        // en su lugar esperamos un poco antes de ponerlo como "inactive".
        setTimeout('GUI.setDelayedCallSessionStatus("'+uri+'", "inactive")', 1000);
      }

      // hide HTML Video Elements
      //$('#remoteView').attr('hidden', true);
      //$('#selfView').attr('hidden', true);
    },


    setDelayedCallSessionStatus : function(uri, status, description, force) {
      var session = GUI.getSession(uri.toString());
      if (session)
        GUI.setCallSessionStatus(session, status, description, force);
    },


    /*
     * Añade un mensaje en el chat de la sesión.
     * - session: el objeto jQuery de la sesión.
     * - who: "me" o "peer".
     * - text: el texto del mensaje.
     */
    addChatMessage : function(session, who, text) {
      var chatting = $(session).find(".chat > .chatting");
      $(chatting).removeClass("inactive");

      if (who != "error") {
        var who_text = ( who == "me" ? "me" : $(session).find(".peer > .display-name").text() );
        var message_div = $('<p class="' + who + '"><b>' + who_text + '</b>: ' + text + '</p>');
      }
      // ERROR sending the MESSAGE.
      else {
        var message_div = $('<p class="error"><i>message failed: ' + text + '</i>');
      }
      $(chatting).append(message_div);
      $(chatting).scrollTop(1e4);

      if (who == "peer") {
        soundPlayer.setAttribute("src", "sounds/incoming-chat.ogg");
        soundPlayer.play();
      }

      // Si se había recibido un iscomposing quitarlo (sólo si es message entrante!!!).
      if (who == "peer")
        $(session).find(".chat .iscomposing").hide();
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
    },


    jssipMessage : function(uri, text) {
      ua.sendMessage(uri,text);
    },


    jssipIsComposing : function(uri, active) {
      //JsSIP.API.is_composing(uri, active);
      //console.info('is compossing..')
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

    if (! $(this).is(':checked')) {
      mediaConstraints.video = false;
    }

    JsSIP.rtcninja.getUserMedia(mediaConstraints,
      useNewLocalStream,
      function(error) {
        throw error;
      }
    );

    function useNewLocalStream(stream) {
      if (! _Session) { return; }

      var oldStream = localStream;

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

      _Session.renegotiate({
        useUpdate: true,
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: true }
      });

      localStream = stream;
      selfView = JsSIP.rtcninja.attachMediaStream(selfView, stream);
    }
  });

});
