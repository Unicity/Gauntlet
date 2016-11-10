/**
 * Copyright 2015-2016 Unicity International
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var fs           = require("fs");
var request      = require("request");
var _            = require("underscore");
var q            = require("q");
var colors       = require("colors/safe");
var path         = require("path");
var xmlChildPath = path.join(__dirname, "/xmlChild");
var knox         = require("knox");
var childProcess = require("child_process");

function main(options) {

  var host             = options.host;
  var port             = options.port;
  var verbose          = options.verbose;
  var diffUrl          = options.diffUrl || "";
  var testFile         = options.testFile;
  var basePath         = options.basePath;
  var testFolder       = options.testFolder;
  var shortenerAPIKey  = options.shortenerAPIKey;
  var commandLineTests = options.commandLineTests;

  var testPromises = [];

  var testQueue = [];

  var client;
  var tests;

  testFile = JSON.parse(fs.readFileSync(testFile).toString());
  tests = Object.keys(testFile);

  if (options.AWSSecret) {
    client = knox.createClient({
      key: options.AWSKey,
      secret: options.AWSSecret,
      bucket: options.AWSBucket
    });
  } // FIXME where no secret, 'client' is not initialized

  options.client = client;

  function outputTest(test) {
    var Text = "Test: ";
    var endPoint = test.endpoint;
    var subTest = test.name;
    var testPath = endPoint + "." + subTest;
    if (verbose) {
      console.log("######################");
      console.log("------Headers-------");
      console.log(test.headers);
      console.log("------Response------");
      console.log(test.responseBody);
    }
    if (test.passed) {
      if(test.ignore){
        Text += colors.blue(testPath + " passed but was ignored");
      }
      else if (!test.timedOut && !test.warnOnTime) {
        Text += colors.green(testPath + " passed");
      }
      else if (test.warnOnTime) {
        Text += colors.yellow(testPath + " passed, but exceeded warning threshold (expected time " + test.ms +" ms. Max run time " + test.maxTime.toFixed(0)+" ms )");
      }
      else {
        Text += colors.red(testPath + " passed, but took too long (expected time " + test.ms +" ms. Max run time " + test.maxTime.toFixed(0)+" ms )");
      }
    }
    else {
      if(test.ignore){
          Text += colors.blue(testPath + " failed but was ignored");
      }
      else{
        Text += colors.red(testPath + " failed " + test.reason).trim();
      }
    }
    Text += " in " + (test.end - test.start) + " ms";
    console.log(Text.trim());
  }

  function wait(func) {
    var args = [].splice.call(arguments, 1);
    setTimeout(function() {
      func.apply(null, args)
    }, 100);
  }

  function queueTest(test, queue) {
    queue.push(test);
  }

  function processQueue(queue) {
    var promise = q.defer();
    var tests = queue.slice(); // makes shallow copy
    done();
    function done() {
      var test = queue.shift();
      if (test) {
        runTest(test).then(function() {
          outputTest(test);
          done();
        }, function() {
          outputTest(test);
          done();
        }).catch((e) => {
          console.log("there was an error process queue");
          console.log(e);
        });
      }
      else {
        promise.resolve(tests);
      }
    }
    return promise.promise;
  }

  function runTest(test) {
    var promise = q.defer();
    test.start = Date.now();
    request.post(test.requestOptions, function(err, res, body) {
      test.end = Date.now();

      var comparePromise;
      var expectedOutput;
      var actualOutput;
      var statusCode = test.status || 200;
      if(err){

        failTest(test, promise, err);
        return;
      }
      testResponseTime(test);

      test.headers = res.headers;

      var response = body.toString("utf8");
      test.responseBody = response;
      if (!test.outputs) {
        failTest(test, promise, "Test failed: no output file given");
        return;
      }

      if(res.statusCode !== statusCode){
        failTest(test, promise, `Expected response code '${statusCode}' , but got '${res.statusCode}'`);
        return;
      }

      //I hate exceptions
      try {
          expectedOutput = fs.readFileSync(path.join(testFolder, test.groupKey, test.name, test.outputs), "utf8").toString();
      }
      catch(e) {
        failTest(test, promise, "No output file exists");
        return;
      }

      if (res.headers["content-type"].indexOf("application/json") > -1) {
        comparePromise = testJSON(test, expectedOutput, response, options);
      }
      else if (res.headers["content-type"].indexOf("text/xml") > -1) {
        //For some reason xml parsing is messing stuff up going to run it in a child process
        var extension = test.outputs.split(".");

        extension = extension[extension.length - 1];
        if (extension === "xsd") {
          comparePromise = testXMLSchema(test, expectedOutput, response);
        }
        else {
          comparePromise = testXML(test, expectedOutput, response, options);
        }
      }
      else {
        //standarize line endings
        if (response.trim() === expectedOutput.trim()) {
          let testPromise = q.defer();
          test.passed = true;
          comparePromise = testPromise.promise;
          testPromise.resolve();
        }
        else {
          var index = 0;
          var differ = false;
          while(response[index] || expectedOutput[index]){
            if(response[index] !== expectedOutput[index] && !differ){
              differ = true;
            }
            index++;
          }
          test.passed = false;
          comparePromise = getDifferencesUrl(response, expectedOutput, "txt",  diffUrl, shortenerAPIKey, client).then(function(url) {
            test.reason = "Outputs do not match " + url;
            return;
          })
        }
      }
      comparePromise.then(function() {
        promise.resolve(test);
      }, function() {
        console.log("error");
      }).catch(function(e) {
        console.log(e, e.stack);
      });
    });

    return promise.promise;
  }

  tests.forEach(function(testKey) {
    //If there is a test to run from command line only run that one
    var testSubset;

    if (commandLineTests.length) {
      var found = false;
      commandLineTests.forEach(function(commandLineTest) { // FIXME unnecessarily looping through the entire loop
        if (commandLineTest.test === testKey) {
          testSubset = commandLineTest.subTest;
          found = true;
        }
      });
      if (!found) {
        return;
      }
    }

    var parentTest = testFile[testKey];
    parentTest.tests.forEach(function(subTest) {

      //If we are running a specific set of inputs only run those
      if (testSubset && (testSubset !== subTest.name)) {
        return;
      }

      var test = {
        endpoint: parentTest.endpoint,
        inputs: subTest.files.inputs,
        outputs: subTest.files.output,
        name: subTest.name,
        ignore: subTest.ignore,
        groupKey: testKey,
        description: subTest.description,
        ms: subTest.ms,
        status: subTest.status
      }
      var promise = q.defer();
      testPromises.push(promise.promise);

      var input = test.inputs;
      var qs = "";
      if(subTest.files["input-qs"]){
        qs = fs.readFileSync(path.join(testFolder, testKey, subTest.name, subTest.files["input-qs"])).toString().trim();
      }

      var requestOptions = {
        url: "http://" + host + ":" + port + "/" + basePath + test.endpoint + qs,
        encoding: null
      };
      // FIXME simplify if/else statement
      if (input && (typeof input === "object")) {

        var fieldNames = Object.keys(input);
        var formData = {};
        fieldNames.forEach(function(fieldName) {
          var field = input[fieldName];
          var filename; // FIXME unused variable
          //Ignore description field
          formData[fieldName] = fs.readFileSync(path.join(testFolder, testKey, subTest.name, field));
        });
        requestOptions.formData = formData;
      }
      else {
        if (input) {
          requestOptions.body = fs.readFileSync(path.join(testFolder, testKey, subTest.name, input));
        }
      }
      //Kill the test if it takes too long

      // test.timeout = setTimeout(function() {
      //   if (promise.promise.inspect().state === "pending") {
      //     test.reason = "timed out";
      //     console.log(promise);
      //     promise.reject(test);
      //   }
      // }, 30 * 1000);

      // test.start = Date.now() - 100;
      test.requestOptions = requestOptions;
      queueTest(test, testQueue);
    });
  });

  processQueue(testQueue).then(function(tests) {
    var passed = 0;
    var warnings = 0;
    var ignored = 0;
    var total = tests.length;
    tests.forEach(function(test) {
      if ((test.passed && !test.timedOut && !test.ignore)) {
        passed++;
      }
      if (test.warnOnTime) {
        warnings++;
      }
      if(test.ignore){
        ignored++;
        total--;
      }
    });
    var passingText = passed + "/" + total + " passed";
    if (passed !== total) {
      console.log(colors.red(passingText));
    }
    else {
      console.log(colors.green(passingText));
    }
    if (warnings) {
      console.log(colors.yellow(warnings + " warnings"));
    }
    if(ignored){
      console.log(colors.blue(ignored + " tests ignored"));
    }
    console.log("done testing");
    var exit = process.exit;
    if(passed === total){
      exit(0);
    }
    else {
      exit(1);
    }
  }).catch((e) => {
    console.log(e);
  });
}

function testXMLSchema(test, expected, actual, options) {
  var promise = q.defer();
  var child = childProcess.fork(xmlChildPath);
  child.send({
    xml: actual,
    schema: expected
  });
  child.on("message", function(errors) {
    if (!errors) {
      test.passed = true;
    }
    else {
      test.passed = false;
      test.reason = errors[0];
    }
    promise.resolve();
    child.kill();
  });
  return promise.promise;
}

function testXML(test, expected, actual, options) {
  var promise = q.defer();
  actual = actual.replace(/>\s*/g, '>');
  actual = actual.replace(/\s*</g, '<');
  expected = expected.replace(/>\s*/g, '>');
  expected = expected.replace(/\s*</g, '<');

  if (actual === expected) {
    test.passed = true;
    promise.resolve();
  }
  else {
    test.passed = false;
    expected = expected.replace(/>/g, '>\n');
    actual = actual.replace(/>/g, '>\n');
    getDifferencesUrl(actual, expected, "txt",  options.diffUrl, options.shortenerAPIKey, options.client).then(function(url) {
      test.reason = "Outputs do not match " + url;
      promise.resolve();
    })
  }
  return promise.promise;
}

function testJSON(test, expected, actual, options) {
  var promise = q.defer();
  var expectedOutput = parseJSON(expected);
  var actualOutput = parseJSON(actual);

  if (!expectedOutput) {
    failTest(test, promise, "Couldn't parse expected output file as json");
  }
  else if (!actualOutput) {
    failTest(test, promise, "Couldn't parse output from server");

  }
  else{
    if (deepCompare(expectedOutput, actualOutput)) {
      test.passed = true;
      promise.resolve();
    }
    else {
      test.passed = false;
      test.reason = "Outputs do not match";
      getDifferencesUrl(actualOutput, expectedOutput, "json", options.diffUrl, options.shortenerAPIKey, options.client).then(function(url) {
        test.reason += " " + url;
        promise.resolve();
      });
    }
  }


  return promise.promise;
}

function testResponseTime(test) {
  if (test.ms) {
    var totalTime = test.end - test.start;
    var maxTime = (100 * test.ms) / 85;
    test.maxTime = maxTime;
    if(test.ms < totalTime){
      if(maxTime <= totalTime){
        test.timedOut = true;
      }
      else {
        test.warnOnTime = true;
      }
    }
  }
}

//A nice convenience function for failing a test
function failTest(test, promise, reason) {
  test.reason = reason;
  test.passed = false;
  promise.resolve(test);
}

function getDifferencesUrl(actual, expected, type,  diffUrl, shortenerAPIKey, client) {
  var promise = q.defer();
  var left;
  var right;
  if (!diffUrl || !shortenerAPIKey) {
    promise.resolve("");
  }
  else {
    if (client) {
      return sendToS3(actual, "actual-", type,  client).then(function(url) {
        right = encodeURI(url);
        return sendToS3(expected, "expected-", type,  client);
      }).then(function(url) {
        left = encodeURI(url);
        var finalUrl = diffUrl + "?left=" + left + "&right=" + right;
        return shortenUrl(finalUrl, shortenerAPIKey);
      });
    }
    else {
      left = encodeURI(JSON.stringify(actual));
      right = encodeURI(JSON.stringify(expected));
      var url = diffUrl + "?left=" + left + "&right=" + right;
      return shortenUrl(url, shortenerAPIKey);
    }
  }
  return promise.promise;
}

function sendToS3(obj, name, type, client) {
  var string = obj;
  var promise = q.defer();
  var contentType;

  name = name + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 7);
  name = name + "." + type;

  if (type === "json") {
    contentType = "application/json";
    string = JSON.stringify(obj, null, 2);
  }
  else {
    contentType = "text/plain";
  }
  var req = client.put(name, {
      'Content-Length': Buffer.byteLength(string),
      'Content-Type': contentType
  });
  req.on("err", function(err) {
    console.log("there was an error s3");
    console.log(err);
  });
  req.on('response', function(res) {
    if (200 === res.statusCode) {
      promise.resolve(req.url);
    }
    else {
      promise.resolve("");
    }
  });
  req.end(string);

  return promise.promise;
}

function shortenUrl(url, shortenerAPIKey) {
  var promise = q.defer();
  request.post({
    url: "https://www.googleapis.com/urlshortener/v1/url?key=" + shortenerAPIKey,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      "longUrl": url
    })
  }, function(err, res, body) {
    if (!err) {
      promise.resolve(JSON.parse(body).id);
    }
  });
  return promise.promise;
}

function parseJSON(string) {
  var result;
  try {
    result = JSON.parse(string);
  }
  catch(e) {
    result = null;
  }
  return result;
}

exports.main = main;

function deepCompare(ar1, ar2) {
  var matches = true;
  var type1 = typeof ar1;
  var type2 = typeof ar2;

  if ((ar1 === null) || (ar2 === null)) {
    matches = ar1 === ar2;
    return matches;
  }
  if (type1 !== type2) {
    matches = false;
  }
  else {
    switch(typeof ar1) {
      case "object": {
        var keys1 = Object.keys(ar1);
        var keys2 = Object.keys(ar2);
        if (!Array.isArray(ar1)) {
          keys1.sort();
          keys2.sort();
        }
        if (keys1.length !== keys2.length) {
          matches = false;
        }
        else {
          keys1.every(function(key1, n) {
            if (key1 !== keys2[n]) {
              matches = false;
              return matches;
            }
            else {
              matches = deepCompare(ar1[key1], ar2[key1]);
              return matches;
            }
          });
        }
        break;
      }
      case "string":
      case "boolean":
      case "number": {
        matches = ar1 === ar2;
        break;
      }
      default: {
        console.log("what happened");
        break;
      }
    }
  }
  return matches;
}
