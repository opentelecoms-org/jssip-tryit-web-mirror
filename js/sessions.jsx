/**@jsx React.DOM*/

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var SessionsList = React.createClass({
  render: function() {
    return (
      <div>
        <ReactCSSTransitionGroup transitionName="session">
        {this.props.data.map(function (session) {
          return (<Session key={session.uri} data={session} />);
        })}
        </ReactCSSTransitionGroup>
      </div>
    );
  }
});


var Session = React.createClass({
  getInitialState: function() {
    return {
      call: this.props.data.call,
      callStatus: '',
      callStatusText: '',
      displayName: this.props.data.displayName,
      uri: this.props.data.uri,
      isTransferring: false,
      showDtmfBox: false
    }
  },

  componentDidMount: function() {
    //console.log('Tryit: Session::componentMount()');

    // Call session
    if (this.state.call) {
      this.registerCallSession();

    // Chat session
    } else {
      this.setState({ callStatus: 'inactive' });
    }
  },

  componentDidUpdate: function(prevProps, prevState) {
    //console.log('Tryit: Session::componentDidUpdate()');

    var self=this;

    // a call is added to the session (living chat session)
    // this.state differs from this.props here
    if (!this.state.call && this.props.data.call) {
      this.registerCallSession();

    // a call is removed from the session (living chat session)
    } else if (!this.props.data.call && this.state.callStatus !== 'inactive') {
      // wait a bit to set the 'inactive' callStatus
      window.setTimeout(function(){
        self.setState({ call: null, callStatus: 'inactive', callStatusText: '' });
      },1000);
    }
  },

  handleMouseOver: function() {
    if (this.state.callStatus === 'inactive') {
      this.setState({ showClose: true});
    }
  },

  handleMouseOut: function() {
    this.setState({ showClose: false});
  },

  handleClick: function() {
    GUI.sessionClick(this.state.call);
  },

  registerCallSession: function() {
    //console.log('Tryit: Session::registerCallSession()');

    var callStatus, remoteIdentity,
      self = this,
      call = this.props.data.call;

    callStatus = call.direction === 'incoming'?'incoming':'trying';
    remoteIdentity = call.remote_identity;


    // Set session state attributes
    this.setCallStatus(callStatus);
    this.setState({
      call: this.props.data.call,
      displayName: remoteIdentity.display_name || remoteIdentity.uri.user
    });

    // Set call event handlers
    call.on('progress', function(e) {
      if (e.originator === 'remote') {
        self.setCallStatus('in-progress');
      }
    });

    call.on('accepted', function() {
      self.setCallStatus('answered');
    });

    call.on('failed', function(e) {
      var cause = e.cause;

      if (e.originator === 'remote' && cause.match("SIP;cause=200", "i")) {
        cause = 'answered_elsewhere';
      }

      if (self.state.showDtmfBox) {
        self.setState({ showDtmfBox: false });
      }

      self.setCallStatus('terminated', cause);
    });

    call.on('ended', function(e) {
      if (self.state.showDtmfBox) {
        self.setState({ showDtmfBox: false });
      }

      self.setCallStatus('terminated', e.cause);
    });

    call.on('hold', function() {
      if (this.isOnHold().local) {
        self.setCallStatus('on-hold');
      } else {
        self.setCallStatus('answered');
      }
    });

    call.on('unhold', function() {
      self.setCallStatus('answered');
    });
  },

  setCallStatus: function(status, status_text) {
    //console.log('Tryit: Session::setCallStatus()');

    var status_text = status_text || status, local_hold, remote_hold,
        call = this.props.data.call;

    if (call) {
      local_hold = call.isOnHold().local;
      remote_hold = call.isOnHold().remote;

      if (local_hold || remote_hold) {
        status_text = "hold by";
        status_text += local_hold?" local ":"";

        if (remote_hold) {
          if (local_hold)
            status_text += "/";
          status_text += " remote";
        }
      }
    }

    this.setState({
      callStatus: status,
      callStatusText: status_text
    });
  },

  // Button handlers
  clickClose: function() {
    //console.log('Tryit: Session::clickClose()');
    GUI.buttonCloseClick(this.state.uri);
  },

  clickDial: function() {
    //console.log('Tryit: Session::clickDial()');

    if (this.state.callStatus === 'incoming') {
      GUI.buttonAnswerClick(this.state.call);
    } else {
      GUI.buttonDialClick(this.state.uri);
    }
  },

  clickHold: function() {
    //console.log('Tryit: Session::clickHold()');
    GUI.buttonHoldClick(this.state.call);
  },

  clickResume: function() {
    //console.log('Tryit: Session::clickResume()');
    GUI.buttonResumeClick(this.state.call);
  },

  clickTransfer: function() {
    //console.log('Tryit: Session::clickTransfer()');

    var isTransferring= !this.state.isTransferring;

    this.setState({ isTransferring : isTransferring });

    if (!isTransferring) {
      GUI.buttonTransferClick(this.state.call);
    }
  },

  clickHangup: function() {
    //console.log('Tryit: Session::clickHangup()');
    GUI.buttonHangupClick(this.state.call);
  },

  toggleDtmf: function() {
    //console.log('Tryit: Session::toggleDtmf()');

    this.setState({ showDtmfBox: !this.state.showDtmfBox });
  },

  renderClose: function() {
    var display = this.state.showClose?'block':'none';

    return (
      <div className="close" style={{ display: display }} onClick={this.clickClose}></div>
    );
  },

  renderTransferButton: function() {
    var image;

    if (this.state.isTransferring === true) {
      image = '../images/icon-transfer-active.png';
    } else {
      image = '../images/icon-transfer-inactive.png';
    }

    return (
      <div className="button transfer"
        style={{ backgroundImage: 'url(' + image + ')' }}
        onClick={this.clickTransfer}>
      </div>
    );
  },

  render: function() {
    return (
      <div className="session"
        onMouseOver={this.handleMouseOver}
        onMouseOut={this.handleMouseOut}>
        {this.renderClose()}
        <div className="container"
          onClick={this.handleClick}>
          <div className="peer">
            <span className="display-name">{this.state.displayName}</span>
            <span>&lt;</span><span className="uri">{this.state.uri}</span><span>&gt;</span>
          </div>
          <div className= { 'call ' + this.state.callStatus }>
            <div className="button dial"    onClick={this.clickDial}></div>
            <div className="button hangup"  onClick={this.clickHangup}></div>
            <div className="button dtmf"    onClick={this.toggleDtmf}></div>
            <div className="button hold"    onClick={this.clickHold}></div>
            <div className="button resume"  onClick={this.clickResume}></div>
            {this.renderTransferButton()}
            { this.state.showDtmfBox? <DtmfBox call={this.state.call}/> : null }
            <div className="call-status">{this.state.callStatusText}</div>
          </div>
          <ChatBox data={this.props.data}
          />
        </div>
      </div>
    );
  }
});

var DtmfBox = React.createClass({
  componentDidMount: function() {
    var
      self = this,
      dtmf_button = $(React.findDOMNode(this)).find(".dtmf-button");

    dtmf_button.click(function() {
      GUI.buttonDtmfClick(self.props.call, $(this).text());
    });
  },

  render: function() {
    return (
      <div className="dtmf-box">
        <div className="dtmf-row">
          <div className="dtmf-button digit-1">1</div>
          <div className="dtmf-button digit-2">2</div>
          <div className="dtmf-button digit-3">3</div>
        </div>
        <div className="dtmf-row">
          <div className="dtmf-button digit-4">4</div>
          <div className="dtmf-button digit-5">5</div>
          <div className="dtmf-button digit-6">6</div>
        </div>
        <div className="dtmf-row">
          <div className="dtmf-button digit-7">7</div>
          <div className="dtmf-button digit-8">8</div>
          <div className="dtmf-button digit-9">9</div>
        </div>
        <div className="dtmf-row">
          <div className="dtmf-button digit-asterisk">*</div>
          <div className="dtmf-button digit-0">0</div>
          <div className="dtmf-button digit-pound">#</div>
        </div>
      </div>
    );
  }
});

var ChatBox = React.createClass({
  getInitialState: function() {
    return {
      text: '',
      numMessages: 0
    };
  },

  componentDidMount: function() {
    //console.log('Tryit: ChatBox::componentDidMount()');
    $(React.findDOMNode(this)).find("input").focus();
  },

  componentDidUpdate: function(prevProps, prevState) {
    //console.log('Tryit: ChatBox::componentDidUpdate()');

    var node;

    // new chat message added
    if (this.props.data.chat.length > this.state.numMessages) {
      node = $(React.findDOMNode(this));

      // scroll the messages list
      node.find(".chatting").scrollTop(1e4);
      // focus the input
      node.find("input").focus();

      this.setState({ numMessages: this.props.data.chat.length });
    }
  },

  handleBlur: function() {
    //console.log('Tryit: ChatBox::handleBlur()');

    GUI.chatInputBlur(this.props.data.uri);
  },

  handleFocus: function() {
    //console.log('Tryit: ChatBox::handleFocus()');
  },

  // fires everytime the input changes (not when pressing enter)
  handleChange: function(e) {
    //console.log('Tryit: ChatBox::handleChange()');

    var text = e.target.value;

    this.setState({ text: text });

    GUI.chatInputChange(this.props.data.uri, text);
  },

  // fires everytime a key is pressed (including enter)
  handleKeyDown: function(e) {
    //console.log('Tryit: ChatBox::handleKeyDown()');

    var text = this.state.text;

    // Enter pressed? clear text
    if (e.which == 13) {
      this.setState({ text: ''});
      GUI.chatInputChange(this.props.data.uri, text, true /*enter*/);
    }
  },

  render: function() {
    var
      self = this,
      displayName = this.props.data.displayName,

      correctMessage = function(message) {
        return (
          <b>{(message.who==='peer'?displayName:'me')}</b>
        );
      },

      errorMessage = function() {
        return (
          <p className='error'/>,<i>message failed</i>
        );
      },

      chatMessages = this.props.data.chat.map(function(message,i) {
        return (
          <p className={message.who} key={i}>
            {message.who==='error'?errorMessage():correctMessage(message)}
              : {message.text}
          </p>
        );
      });

    return (
      <div className="chat">
        { this.props.data.chat.length !== 0 &&
          <div className='chatting'>{chatMessages}</div>
        }
        <input className={this.state.text===''?'inactive':''} type="text" name="chat-input" placeholder="type to chat..."
          onChange={this.handleChange}
          onKeyDown={this.handleKeyDown}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
          value={this.state.text}
        />
        { (this.props.data.isComposing? <div className="iscomposing"></div> : null) }
      </div>
    );
  }
});
