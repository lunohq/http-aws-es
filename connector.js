'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * A Connection handler for Amazon ES.
 *
 * Uses the aws-sdk to make signed requests to an Amazon ES endpoint.
 * Define the Amazon ES config and the connection handler
 * in the client configuration:
 *
 * var es = require('elasticsearch').Client({
 *  hosts: 'https://amazon-es-host.us-east-1.es.amazonaws.com',
 *  connectionClass: require('http-aws-es'),
 *  amazonES: {
 *    region: 'us-east-1',
 *    accessKey: 'AKID',
 *    secretKey: 'secret',
 *    credentials: new AWS.EnvironmentCredentials('AWS') // Optional
 *  }
 * });
 *
 * @param client {Client} - The Client that this class belongs to
 * @param config {Object} - Configuration options
 * @param [config.protocol=http:] {String} - The HTTP protocol that this connection will use, can be set to https:
 * @class HttpConnector
 */

var AWS = require('aws-sdk');
var HttpConnector = require('elasticsearch/src/lib/connectors/http');
var _ = require('elasticsearch/src/lib/utils');
var zlib = require('zlib');

/**
 * Checks to see if this object acts like a Promise, i.e. has a "then"
 * function.
 */
function isThenable(value) {
  return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object' && value !== null && typeof value.then === 'function';
}

var HttpAmazonESConnector = function (_HttpConnector) {
  _inherits(HttpAmazonESConnector, _HttpConnector);

  function HttpAmazonESConnector(host, config) {
    _classCallCheck(this, HttpAmazonESConnector);

    var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(HttpAmazonESConnector).call(this, host, config));

    _this.endpoint = new AWS.Endpoint(host.host);
    _this.amazonES = config.amazonES;
    return _this;
  }

  _createClass(HttpAmazonESConnector, [{
    key: 'resolveCredentials',
    value: function resolveCredentials() {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        var _amazonES = _this2.amazonES;
        var credentials = _amazonES.credentials;
        var accessKey = _amazonES.accessKey;
        var secretKey = _amazonES.secretKey;

        if (credentials) {
          if (isThenable(credentials)) {
            credentials.then(function (res) {
              return resolve(res);
            }).catch(function (err) {
              return reject(err);
            });
          } else {
            resolve(credentials);
          }
        } else {
          resolve(new AWS.Credentials(accessKey, secretKey));
        }
      });
    }
  }, {
    key: 'request',
    value: function request(params, cb) {
      var _this3 = this;

      this.resolveCredentials().then(function (credentials) {
        _this3._request(credentials, params, cb);
      }).catch(function (err) {
        return cb(err);
      });
    }
  }, {
    key: '_request',
    value: function _request(credentials, params, cb) {
      var incoming;
      var timeoutId;
      var request;
      var req;
      var status = 0;
      var headers = {};
      var log = this.log;
      var response;

      var reqParams = this.makeReqParams(params);
      // general clean-up procedure to run after the request
      // completes, has an error, or is aborted.
      var cleanUp = _.bind(function (err) {
        clearTimeout(timeoutId);

        req && req.removeAllListeners();
        incoming && incoming.removeAllListeners();

        if (err instanceof Error === false) {
          err = void 0;
        }

        log.trace(params.method, reqParams, params.body, response, status);
        if (err) {
          cb(err);
        } else {
          cb(err, response, status, headers);
        }
      }, this);

      request = new AWS.HttpRequest(this.endpoint);

      // copy across params
      for (var p in reqParams) {
        request[p] = reqParams[p];
      }
      request.region = this.amazonES.region;
      if (params.body) request.body = params.body;
      if (!request.headers) request.headers = {};
      request.headers['presigned-expires'] = false;
      request.headers['Host'] = this.endpoint.host;

      // Sign the request (Sigv4)
      var signer = new AWS.Signers.V4(request, 'es');
      signer.addAuthorization(credentials, new Date());

      var send = new AWS.NodeHttpClient();
      req = send.handleRequest(request, null, function (_incoming) {
        incoming = _incoming;
        status = incoming.statusCode;
        headers = incoming.headers;
        response = '';

        var encoding = (headers['content-encoding'] || '').toLowerCase();
        if (encoding === 'gzip' || encoding === 'deflate') {
          incoming = incoming.pipe(zlib.createUnzip());
        }

        incoming.setEncoding('utf8');
        incoming.on('data', function (d) {
          response += d;
        });

        incoming.on('error', cleanUp);
        incoming.on('end', cleanUp);
      }, cleanUp);

      req.on('error', cleanUp);

      req.setNoDelay(true);
      req.setSocketKeepAlive(true);

      return function () {
        req.abort();
      };
    }
  }]);

  return HttpAmazonESConnector;
}(HttpConnector);

module.exports = HttpAmazonESConnector;

