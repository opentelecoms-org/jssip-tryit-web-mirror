/*
 * iscomposing v1.0.0-pre
 * JavaScript implementation of "Indication of Message Composition for Instant Messaging" (RFC 3994)
 * Copyright 2015 Iñaki Baz Castillo at eFace2Face, inc. (https://eface2face.com)
 * License MIT
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.iscomposing = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Expose the Composer class.
 */
module.exports = Composer;


var
	/**
	 * Dependencies.
	 */
	debug = require('debug')('iscomposing:Composer'),

	/**
	 * Constants.
	 */
	FORMAT_XML = 0,
	FORMAT_JSON = 1,
	IDLE = 0,
	ACTIVE = 1,
	DEFAULT_REFRESH_INTERVAL = 120,
	DEFAULT_IDLE_TIMEOUT = 15,
	MIN_REFRESH_INTERVAL = 30,
	MIN_IDLE_TIMEOUT = 5,
	DEFAULT_STATUS_CONTENT_TYPE = 'text',
	MIME_CONTENT_TYPE_XML = 'application/im-iscomposing+xml',
	MIME_CONTENT_TYPE_JSON = 'application/im-iscomposing+json';


function Composer(options, activeCb, idleCb) {
	// Timer values.
	switch (options.refreshInterval) {
		case undefined:
			this._refreshInterval = DEFAULT_REFRESH_INTERVAL;
			break;
		case 0:
			this._refreshInterval = null;
			break;
		default:
			if (options.refreshInterval > MIN_REFRESH_INTERVAL) {
				this._refreshInterval = options.refreshInterval;
			} else {
				this._refreshInterval = MIN_REFRESH_INTERVAL;
			}
	}
	switch (options.idleTimeout) {
		case undefined:
			this._idleTimeout = DEFAULT_IDLE_TIMEOUT;
			break;
		case 0:
			this._idleTimeout = null;
			break;
		default:
			if (options.idleTimeout > MIN_IDLE_TIMEOUT) {
				this._idleTimeout = options.idleTimeout;
			} else {
				this._idleTimeout = MIN_IDLE_TIMEOUT;
			}
	}

	this._format = (options.format === 'json') ? FORMAT_JSON : FORMAT_XML;

	debug('new() | processed options [format:%s, refreshInterval:%s, idleTimeout:%s]',
		this._format, this._refreshInterval, this._idleTimeout);

	// Callbacks.
	this._activeCb = activeCb;
	this._idleCb = idleCb;

	// Status.
	this._status = IDLE;

	// Current "status" content type.
	this._statusContentType = undefined;

	// Timers.
	this._activePeriodicTimer = undefined;
	this._idleTimer = undefined;
}


Composer.prototype.composing = function (statusContentType) {
	if (statusContentType && typeof statusContentType === 'string') {
		this._statusContentType = statusContentType.toLowerCase().trim();
	} else {
		this._statusContentType = DEFAULT_STATUS_CONTENT_TYPE;
	}

	setStatus.call(this, ACTIVE);
};


Composer.prototype.sent = function () {
	setStatus.call(this, IDLE, true);
};


Composer.prototype.idle = function () {
	setStatus.call(this, IDLE);
};


Composer.prototype.close = function () {
	setStatus.call(this, IDLE, true);
};


/**
 * Private API.
 */


function setStatus(newStatus, doNotNotifyIdle) {
	var oldStatus = this._status;

	this._status = newStatus;

	switch (oldStatus) {
		case IDLE:
			switch (newStatus) {
				// From IDLE to ACTIVE.
				case ACTIVE: {
					debug('setStatus() | from IDLE to ACTIVE');

					runActivePeriodicTimer.call(this);
					runIdleTimer.call(this);
					callActiveCb.call(this);
					break;
				}

				// From IDLE to IDLE (ignore).
				case IDLE: {
					debug('setStatus() | from IDLE to IDLE');

					break;
				}
			}
			break;

		case ACTIVE:
			switch (newStatus) {
				// From ACTIVE to IDLE.
				case IDLE: {
					debug('setStatus() | from ACTIVE to IDLE');

					stopActivePeriodicTimer.call(this);
					stopIdleTimer.call(this);
					if (!doNotNotifyIdle) {
						callIdleCb.call(this);
					}
					break;
				}

				// From ACTIVE to ACTIVE.
				case ACTIVE: {
					debug('setStatus() | from ACTIVE to ACTIVE');

					runIdleTimer.call(this);
					break;
				}
			}
			break;
	}
}


function runActivePeriodicTimer() {
	var self = this;

	if (!this._refreshInterval) {
		return;
	}

	clearInterval(this._activePeriodicTimer);

	this._activePeriodicTimer = setInterval(function () {
		runIdleTimer.call(self);
		callActiveCb.call(self);
	}, this._refreshInterval * 1000);
}


function stopActivePeriodicTimer() {
	clearInterval(this._activePeriodicTimer);
}


function runIdleTimer() {
	var self = this;

	clearTimeout(this._idleTimer);

	this._idleTimer = setTimeout(function () {
		setStatus.call(self, IDLE);
	}, this._idleTimeout * 1000);
}


function stopIdleTimer() {
	clearTimeout(this._idleTimer);
}


function callActiveCb() {
	switch (this._format) {
		case FORMAT_XML:
			this._activeCb(createActiveXML.call(this), MIME_CONTENT_TYPE_XML);
			break;
		case FORMAT_JSON:
			this._activeCb(createActiveJSON.call(this), MIME_CONTENT_TYPE_JSON);
			break;
	}
}


function callIdleCb() {
	switch (this._format) {
		case FORMAT_XML:
			this._idleCb(createIdleXML.call(this), MIME_CONTENT_TYPE_XML);
			break;
		case FORMAT_JSON:
			this._idleCb(createIdleJSON.call(this), MIME_CONTENT_TYPE_JSON);
			break;
	}
}


function createActiveXML() {
	var xml =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<isComposing xmlns="urn:ietf:params:xml:ns:im-iscomposing">\n' +
		'  <state>active</state>\n' +
		'  <contenttype>' + this._statusContentType + '</contenttype>\n';
	if (this._refreshInterval) {
		xml +=
		'  <refresh>' + this._refreshInterval + '</refresh>\n';
	}
	xml +=
		'</isComposing>\n';

	return xml;
}


function createIdleXML() {
	var xml =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<isComposing xmlns="urn:ietf:params:xml:ns:im-iscomposing">\n' +
		'  <state>idle</state>\n' +
		'  <contenttype>' + this._statusContentType + '</contenttype>\n' +
		'</isComposing>\n';

	return xml;
}


function createActiveJSON() {
	var object = {
		state: 'active',
		contentType: this._statusContentType
	};

	if (this._refreshInterval) {
		object.refresh = this._refreshInterval;
	}

	return JSON.stringify(object, null, '\t');
}


function createIdleJSON() {
	var object = {
		state: 'idle',
		contentType: this._statusContentType
	};

	return JSON.stringify(object, null, '\t');
}

},{"debug":6}],2:[function(require,module,exports){
/**
 * Expose the CompositionIndicator class.
 */
module.exports = CompositionIndicator;


var
	/**
	 * Dependencies.
	 */
	debug = require('debug')('iscomposing:CompositionIndicator'),
	debugerror = require('debug')('iscomposing:ERROR:CompositionIndicator'),
	EventEmitter = require('events').EventEmitter,
	Composer = require('./Composer'),
	Receiver = require('./Receiver');

debugerror.log = console.warn.bind(console);


function CompositionIndicator(options) {
	debug('new() | [options:%o]', options);

	var self = this;

	// Inherit from EventEmitter.
	EventEmitter.call(this);

	options = options || {};

	// Validate some options.
	if (options.format && ['xml', 'json'].indexOf(options.format) === -1) {
		throw new Error('options.format must be "xml" or "json"');
	}

	// Composer instance.
	this._composer = new Composer(
		// options
		options,
		// activeCb
		function (msg, mimeContentType) {
			emit.call(self, 'local:active', msg, mimeContentType);
		},
		// idleCb
		function (msg, mimeContentType) {
			emit.call(self, 'local:idle', msg, mimeContentType);
		}
	);

	// Receiver instance.
	this._receiver = new Receiver(
		// options
		options,
		// activeCb
		function (statusContentType) {
			emit.call(self, 'remote:active', statusContentType);
		},
		// idleCb
		function (statusContentType) {
			emit.call(self, 'remote:idle', statusContentType);
		}
	);
}


// Inherit from EventEmitter.
CompositionIndicator.prototype = Object.create(EventEmitter.prototype, {
	constructor: {
		value: CompositionIndicator,
		enumerable: false,
		writable: true,
		configurable: true
	}
});


/**
 * Tell the library that a message is being composed.
 * @param  {String} statusContentType  "text", "video", "audio", etc.
 */
CompositionIndicator.prototype.composing = function (statusContentType) {
	debug('composing() [statusContentType:"%s"]', statusContentType);

	this._composer.composing(statusContentType);
};


/**
 * Tell the library that the composed message was sent.
 */
CompositionIndicator.prototype.sent = function () {
	debug('sent()');

	this._composer.sent();
};


/**
 * Tell the library that the chat lost focus.
 */
CompositionIndicator.prototype.idle = function () {
	debug('idle()');

	this._composer.idle();
};


/**
 * Tell the library that a message has been received.
 * @param  {String} msg             Raw message body.
 * @param  {String} mimeContentType Content-Type of the message.
 * @return {Boolean}                True means that the message is a "status" message to
 *                                  be handled by this library. False otherwise.
 */
CompositionIndicator.prototype.received = function (msg, mimeContentType) {
	debug('received() [mimeContentType:"%s"]', mimeContentType);

	return this._receiver.received(msg, mimeContentType);
};


/**
 * Tell the library that the chat is closed.
 * No more events will be fired unless the app reactivates it by calling
 * API methods again.
 */
CompositionIndicator.prototype.close = function () {
	debug('close()');

	this._composer.close();
	this._receiver.close();
};


/**
 * Private API.
 */


function emit() {
	if (arguments.length === 1) {
		debug('emit "%s"', arguments[0]);
	} else {
		debug('emit "%s" [arg:%o]', arguments[0], arguments[1]);
	}

	try {
		this.emit.apply(this, arguments);
	}
	catch (error) {
		debugerror('emit() | error running an event handler for "%s" event: %o', arguments[0], error);
	}
}

},{"./Composer":1,"./Receiver":3,"debug":6,"events":5}],3:[function(require,module,exports){
/**
 * Expose the Receiver class.
 */
module.exports = Receiver;


var
	/**
	 * Dependencies.
	 */
	debug = require('debug')('iscomposing:Receiver'),
	debugerror = require('debug')('iscomposing:ERROR:Receiver'),

	/**
	 * Constants.
	 */
	FORMAT_XML = 0,
	FORMAT_JSON = 1,
	IDLE = 0,
	ACTIVE = 1,
	DEFAULT_REFRESH_TIMEOUT = 120,
	DEFAULT_REFRESH_TIMEOUT = 12,
	MIN_REFRESH_TIMEOUT = 30,
	DEFAULT_STATUS_CONTENT_TYPE = 'text',
	REGEXP_MIME_CONTENT_TYPE_XML = /^[ ]*application\/im-iscomposing\+xml/i,
	REGEXP_MIME_CONTENT_TYPE_JSON = /^[ ]*application\/im-iscomposing\+json/i,
	REGEXP_XML_STATE = /<([^: ]+:)?state([ ]+[^>]*)?>[\r\n ]*([a-zA-Z0-9]+)[\r\n ]*<\/state>/im,
	REGEXP_XML_REFRESH = /<([^: ]+:)?refresh([ ]+[^>]*)?>[\r\n ]*([0-9]+)[\r\n ]*<\/refresh>/im,
	REGEXP_XML_CONTENT_TYPE = /<([^: ]+:)?contenttype([ ]+[^>]*)?>[\r\n ]*(.+)[\r\n ]*<\/contenttype>/im;

debugerror.log = console.warn.bind(console);


function Receiver(options, activeCb, idleCb) {
	this._format = (options.format === 'json') ? FORMAT_JSON : FORMAT_XML;

	debug('new() | processed options [format:%s]', this._format);

	// Callbacks.
	this._activeCb = activeCb;
	this._idleCb = idleCb;

	// Status.
	this._status = IDLE;

	// Current "status" content type.
	this._statusContentType = undefined;

	// Timer value.
	this._refreshTimeout = undefined;

	// Timer.
	this._activeTimer = undefined;
}


Receiver.prototype.received = function (msg, mimeContentType) {
	if (!msg || !mimeContentType || typeof msg !== 'string' || typeof mimeContentType !== 'string') {
		debug('received() | no msg or mimeContentType => false');

		return false;
	}

	switch (this._format) {
		case FORMAT_XML: {
			// No a "status" message, so set IDLE state.
			if (!REGEXP_MIME_CONTENT_TYPE_XML.test(mimeContentType)) {
				debug('received() | unknown mimeContentType => false');

				setStatus.call(this, IDLE);
				return false;
			} else {
				debug('received() | "status" message => true');

				handleStatusXML.call(this, msg);
				return true;
			}
			break;
		}

		case FORMAT_JSON: {
			// No a "status" message, so set IDLE state.
			if (!REGEXP_MIME_CONTENT_TYPE_JSON.test(mimeContentType)) {
				debug('received() | unknown mimeContentType => false');

				setStatus.call(this, IDLE);
				return false;
			} else {
				debug('received() | "status" message => true');

				handleStatusJSON.call(this, msg);
				return true;
			}
			break;
		}

		// Should not happen.
		default:
			return true;
	}

	function handleStatusXML(msg) {
		var
			match,
			state, refresh, contentType;

		// Get 'state'.
		match = msg.match(REGEXP_XML_STATE);
		if (match) {
			state = match[3];
		}

		// Get 'refresh'.
		match = msg.match(REGEXP_XML_REFRESH);
		if (match) {
			refresh = parseInt(match[3]);
		}

		// Get 'contenttype'.
		match = msg.match(REGEXP_XML_CONTENT_TYPE);
		if (match) {
			contentType = match[3];
		}

		handleStatus.call(this, {
			state: state,
			refresh: refresh,
			contentType: contentType
		});
	}

	function handleStatusJSON(msg) {
		var object;

		try {
			object = JSON.parse(msg);
		} catch (error) {
			debugerror('receive() | invalid JSON message: %s', error.toString());
			return;
		}

		handleStatus.call(this, object);
	}

	function handleStatus(data) {
		// Validate.
		if (['active', 'idle'].indexOf(data.state.toLowerCase()) === -1) {
			debugerror('receive() | "state" must be "active" or "idle", ignoring status message');

			return;
		}

		if (data.contentType && typeof data.contentType === 'string') {
			this._statusContentType = data.contentType.toLowerCase().trim();
		} else {
			this._statusContentType = DEFAULT_STATUS_CONTENT_TYPE;
		}

		switch (data.refresh) {
			case undefined:
			case null:
			case NaN:
			case false:
				this._refreshTimeout = DEFAULT_REFRESH_TIMEOUT;
				break;
			default:
				if (data.refresh > MIN_REFRESH_TIMEOUT) {
					this._refreshTimeout = data.refresh;
				} else {
					this._refreshTimeout = MIN_REFRESH_TIMEOUT;
				}
		}

		switch (data.state) {
			case 'active':
				setStatus.call(this, ACTIVE);
				break;

			case 'idle':
				setStatus.call(this, IDLE);
				break;
		}
	}
};


Receiver.prototype.close = function () {
	setStatus.call(this, IDLE);
};


/**
 * Private API.
 */


function setStatus(newStatus, doNotNotifyIdle) {
	var oldStatus = this._status;

	this._status = newStatus;

	switch (oldStatus) {
		case IDLE:
			switch (newStatus) {
				// From IDLE to ACTIVE.
				case ACTIVE: {
					debug('setStatus() | from IDLE to ACTIVE');

					runActiveTimer.call(this);
					callActiveCb.call(this);
					break;
				}

				// From IDLE to IDLE (ignore).
				case IDLE: {
					debug('setStatus() | from IDLE to IDLE');

					break;
				}
			}
			break;

		case ACTIVE:
			switch (newStatus) {
				// From ACTIVE to IDLE.
				case IDLE: {
					debug('setStatus() | from ACTIVE to IDLE');

					stopActiveTimer.call(this);
					if (!doNotNotifyIdle) {
						callIdleCb.call(this);
					}
					break;
				}

				// From ACTIVE to ACTIVE.
				case ACTIVE: {
					debug('setStatus() | from ACTIVE to ACTIVE');

					runActiveTimer.call(this);
					break;
				}
			}
			break;
	}
}


function runActiveTimer() {
	var self = this;

	clearTimeout(this._activeTimer);

	this._activeTimer = setTimeout(function () {
		setStatus.call(self, IDLE);
	}, this._refreshTimeout * 1000);
}


function stopActiveTimer() {
	clearTimeout(this._activeTimer);
}


function callActiveCb() {
	this._activeCb(this._statusContentType);
}


function callIdleCb() {
	this._idleCb(this._statusContentType);
}

},{"debug":6}],4:[function(require,module,exports){
var
	/**
	 * Dependencies.
	 */
	CompositionIndicator = require('./CompositionIndicator');


/**
 * Expose a function that returns an instance of CompositionIndicator.
 */
module.exports = function (data) {
	return new CompositionIndicator(data);
};


},{"./CompositionIndicator":2}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],6:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":7}],7:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":8}],8:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = '' + str;
  if (str.length > 10000) return;
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}]},{},[4])(4)
});