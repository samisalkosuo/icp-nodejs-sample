//------------------------------------------------------------------------------
// node.js sample application 
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var Redis = require('ioredis');
var os = require("os");
const hostname = os.hostname();

//read env variables
var appName = process.env.APP_NAME || "nodejs-sample";
var serverPort = 6001;
var DEBUG = process.env.DEBUG || false;
var KEEP_ALIVE = process.env.KEEP_ALIVE || "false";
//Redis env variables
var REDIS_HOST = process.env.REDIS_HOST || fail("REDIS_HOST env variable not set.");
var REDIS_PORT = process.env.REDIS_PORT || fail("REDIS_PORT env variable not set.");
var REDIS_PASSWORD = process.env.REDIS_PASSWORD || fail("REDIS_PASSWORD env variable not set.");
var REDIS_DB = process.env.REDIS_DB || 0

var redis = null;

function debug()
{
    if (DEBUG == "true")
    {
        for (i = 0; i < arguments.length; i++) 
        {
            console.log(arguments[i])
        }
    }
}


function fail(msg,code)
{
    console.log(msg);
    //close redis connection
    if (redis != null)
    {
        redis.quit()
    }
    process.exit(code)

}

// catch SIGINT and SIGTERM and exit
// Using a single function to handle multiple signals
function handleSignal(signal) {
    fail(`Received ${signal}. Exiting...`,1);
  }  
//SIGINT is typically CTRL-C
process.on('SIGINT', handleSignal);
//SIGTERM is sent to terminate process, for example docker stop sends SIGTERM
process.on('SIGTERM', handleSignal);


//Connect to redis
var redisUrl = `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`
redis = new Redis(redisUrl);

// create a new express server
var app = express();

if (KEEP_ALIVE === "false")
{
    //Set connection to close, do not keep-alive connection
    app.use(function(req, res, next) {
        res.setHeader('Connection', 'close');
        next();
    });
}

function increaseNumberOfRootRequests()
{    
    // increment redis key by one
    redis.incr("rootRequests", function (err, result) {
        if (err) {
        console.error(err);
        } else {
            debug(`Redis key 'rootRequests' incremented. New value: ${result}`); 
        }
    });
}

function increaseNumberOfTestRequests()
{
    // increment redis key by one
    redis.incr("testRequests", function (err, result) {
        if (err) {
        console.error(err);
        } else {
            debug(`Redis key 'testRequests' incremented. New value: ${result}`); 
        }
    });

}

//async function that calls redis to get value from a key
//redis get returns promise and await in the code waits for the value
//so this is like synchronous call
//caller of this function needs to be also async and use await
async function getNumberOfRequests(path)
{
    var value = 0
    if (path === "root")
    {
        value = await redis.get("rootRequests")
    }

    if (path === "test")
    {
        value = await redis.get("testRequests")
    }

    return value;
}



String.prototype.format = function () {
    var args = arguments;
    return this.replace(/\{\{|\}\}|\{(\d+)\}/g, function (m, n) {
      if (m == "{{") { return "{"; }
      if (m == "}}") { return "}"; }
      return args[n];
    });
  };


app.get('/', function(req, res) {
    increaseNumberOfRootRequests()
    //var now = (new Date()).getTime();
    var now = new Date().toISOString();
    res.writeHead(200, {"Content-Type": "text/html"});
    res.write("<html><body>");
    res.write("<h2>App name: "+appName+"</h2>");
    res.write('<a href="/test">Test link</a><br/><br/>');
    res.write(`<p>Current time UTC: ${now}<br/>`);
    res.write(`My host name: ${hostname}<br/>`);
    res.write("</p></body></html>");
    res.end(); 

});


app.get('/health', function(req, res) {
    //Kubernetes health probe endpoint
    //any code 200 >= code < 400 is success
    //all other fail

    //do some status check and set status code
    var statusCode=204//no content
    
    res.writeHead(statusCode);
    res.end(); 

});


app.get('/test', function(req, res) {
    increaseNumberOfTestRequests();
    var now = new Date().toISOString();
    res.send('Successful test request was done at ' + now);

});

async function getMetricsData(res)
{
    // metrics label naming
    // https://prometheus.io/docs/practices/naming/

    //generate metrics data 
    //https://prometheus.io/docs/instrumenting/exposition_formats/

    var metric_prefix=appName.replace(/[^a-zA-Z0-9]+/g,"_");
    var timestamp = (new Date()).getTime();
    const testRequests = await getNumberOfRequests("test");
    var metricsData='# HELP {0}_test_requests_total Total number of HTTP requests to /test endpoint.\n\
# TYPE {0}_test_requests_total counter\n\
{0}_test_requests_total {1} {2}\n\n\
'.format(metric_prefix,testRequests,timestamp);

    const rootRequests = await getNumberOfRequests("root");
    metricsData=metricsData+'# HELP {0}_root_requests_total Total number of HTTP requests to / endpoint.\n\
# TYPE {0}_root_requests_total counter\n\
{0}_root_requests_total {1} {2}\n\n\
'.format(metric_prefix,rootRequests,timestamp);

    res.writeHead(200, {"Content-Type": "text/plain; version=0.0.4"});
    res.write(metricsData, "utf-8");
    res.end(); 

}

/*
ICP/Prometheus custom metrics endpoint
*/
app.get('/metrics', function(req, res) {

    getMetricsData(res);

});


const server = app.listen(serverPort, "0.0.0.0", function() {
    let host = server.address().address;
    let port = server.address().port;
    console.log('Server started and listening http://'+host+':'+port)
});

if (DEBUG == "true")
{
    server.on('connection', function(socket) {
        console.log(`new connection, remote address: ${socket.remoteAddress}`);
    });
}
