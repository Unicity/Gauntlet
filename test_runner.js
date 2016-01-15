"use strict";

var fs = require("fs");
var request = require("request");
var _ = require("underscore");
var q = require("q");
var colors = require("colors/safe");
var path = require("path");
var xmlChildPath = __dirname+"/xmlChild";
var knox = require("knox");
var childProcess = require("child_process");
var xmlParser = require("./xmlparser.js");

function main(options){

  var host             = options.host; 
  var port             = options.port; 
  var verbose          = options.verbose;
  var diffUrl          = options.diffUrl; 
  var testFile         = options.testFile;
  var basePath         = options.basePath;
  var testFolder       = options.testFolder; 
  var shortenerAPIKey  = options.shortenerAPIKey;
  var commandLineTests = options.commandLineTests;

  var testFile = JSON.parse(fs.readFileSync(testFile).toString());

  var testPromises = [];

  var testQueue = [];

  var tests = Object.keys(testFile);
  var client;


  if(options.AWSSecret){
    client = knox.createClient({
      key: options.AWSKey,
      secret: options.AWSSecret,
      bucket: options.AWSBucket
    })
  }
  function outputTest(test){
    var Text = "Test: ";
    var endPoint = test.endpoint;
    var subTest = test.name;
    var testPath = endPoint + "." + subTest;
    if(verbose){
      console.log("######################");
      console.log("------Headers-------");
      console.log(test.headers);
      console.log("------Response------");
      console.log(test.responseBody);
    }
    if(test.passed){
      Text += colors.green(testPath + " passed");
    }
    else{
      Text += colors.red(testPath + " failed " + test.reason).trim();
    }
    Text += " in "+ (test.end - test.start) + " ms";
    console.log(Text.trim());
  }
function wait(func){
    var args = [].splice.call(arguments,1);
    setTimeout(function(){
      func.apply(null, args)
    },100)
  }

  function queueTest(test, queue){
    queue.push(test);
  }
  function processQueue(queue){
    var promise = q.defer();
    var tests = queue.slice();
    done();
    function done(){
      var test = queue.shift();
      if(test){
        runTest(test).then(function(){
          outputTest(test);
          done();
        }, function(){
          outputTest(test);
          done();
        }).catch((e)=>{
          console.log("there was an error process queue");
          console.log(e);
        });
      }
      else{
        promise.resolve(tests);
      }
    }
    return promise.promise;
  }
  function runTest(test){
    var promise = q.defer();
    test.start = Date.now();
    request.post(test.requestOptions, function(err, res, body){
      test.end = Date.now();
      var comparePromise;
      var expectedOutput;
      var actualOutput;
      if(err){
        failTest(test, promise, err);
        return;
      }
      test.headers = res.headers;
     
      var response = body.toString("utf8");
      test.responseBody = response;
      if(!test.outputs){
        failTest(test, promise, "Test failed: no output file given");
        return;
      }

      if(res.statusCode !== 200){
        failTest(test, promise, "Expected response code '200', but got '" + res.statusCode+"'");
        return;
      }

      


      //I hate exceptions
      try{
          expectedOutput = fs.readFileSync(path.join(testFolder, test.groupKey, test.name, test.outputs), "utf8").toString();
      }
      catch(e){
        failTest(test, promise, "No output file exists");
        return;
      }  

      comparePromise = q.defer();
      if(res.headers["content-type"].indexOf("application/json") > -1){
         
        expectedOutput = parseJSON(expectedOutput);
        actualOutput = parseJSON(response);
        if(!expectedOutput){
          failTest(test, promise, "Couldn't parse expected output file as json");
          return;
        }
        if(!actualOutput){
          failTest(test, promise, "Couldn't parse output from server");
          return;
        }

        if(deepCompare(expectedOutput, actualOutput)){
          test.passed = true;
          comparePromise.resolve();
        }
        else{
          test.passed = false;
          test.reason = "Outputs do not match";
          getDifferencesUrl(actualOutput, expectedOutput, "json", diffUrl, shortenerAPIKey, client)
          .then(function(url){
            test.reason += " "+url;
            comparePromise.resolve();
          });
        }
        
      }
      else if(res.headers["content-type"].indexOf("text/xml") > -1){
        //For some reason xml parsing is messing stuff up going to run it in a child process
        var extension = test.outputs.split(".");

        extension = extension[extension.length - 1];
        if(extension === "xsd"){
          var child = childProcess.fork(xmlChildPath);
          child.send({
            xml: response,
            schema: expectedOutput
          })
          child.on("message", function(errors){
             if(!errors){
              test.passed = true
              }
              else{
                test.passed = false;
                test.reason = errors[0];
                
              }
            comparePromise.resolve();
            child.kill();
          })
        }
        else{
          var actual = JSON.parse(xmlParser.parse(response));
          var expected = JSON.parse(xmlParser.parse(expectedOutput));
          response = response.replace(/>\s*/g, '>'); 
          response = response.replace(/\s*</g, '<'); 
          expectedOutput = expectedOutput.replace(/>\s*/g, '>'); 
          expectedOutput = expectedOutput.replace(/\s*</g, '<'); 

          if(response === expectedOutput){
            test.passed = true;
            comparePromise.resolve();
          }
          else{
            test.passed = false;
            expectedOutput = expectedOutput.replace(/>/g, '>\n'); 
            response = response.replace(/>/g, '>\n'); 
            getDifferencesUrl(response, expectedOutput, "txt",  diffUrl, shortenerAPIKey, client).then(function(url){
              test.reason = "Outputs do not match " + url
              comparePromise.resolve();
            })
          }
        }
       
      }
      else{
        //standarize line endings
        var actual = response.replace(/\r\n|\n\r|\n|\r/g, "\n");
        var expected = expectedOutput.replace(/\r\n|\n\r|\n|\r/g, "\n");
        if(actual.trim() === expected.trim()){
          test.passed = true;
          comparePromise.resolve();

        }
        else{
          test.passed = false
          getDifferencesUrl(response, expectedOutput, "txt",  diffUrl, shortenerAPIKey, client).then(function(url){
            test.reason = "Outputs do not match " + url
            comparePromise.resolve();
          })
        }
      }
      comparePromise.promise.then(function(){
        promise.resolve(test);
      }, function(){
        console.log("erroor");
      }).catch(function(e){
        console.log(e);
      });
        
    });
    return promise.promise;
  }


  tests.forEach(function(testKey){
    //If there is a test to run from command line only run that one
    var testSubset;

    if(commandLineTests.length){
      var found = false;
      commandLineTests.forEach(function(commandLineTest){
        if(commandLineTest.test === testKey){
          found = true;
          testSubset = commandLineTest.subTest;
        }
      })
      if(!found){
        return;
      }
    }
    var parentTest = testFile[testKey];
    parentTest.tests.forEach(function(subTest){

      //If we are running a specific set of inputs only run those
      if (testSubset && testSubset !== subTest.name) {
        return;
      }

      var test = {
        endpoint: parentTest.endpoint,
        inputs: subTest.files.inputs,
        outputs: subTest.files.output,
        name: subTest.name,
        groupKey: testKey,
        description: subTest.description
      }
      var promise = q.defer();
      testPromises.push(promise.promise);

      var input = test.inputs;

      var requestOptions = {
        url: "http://"+host+":"+port+"/"+basePath+ test.endpoint,
        encoding:null
      };
      
      if (input && typeof input === "object") {
        var fieldNames = Object.keys(input);
        var formData = {};
        fieldNames.forEach(function(fieldName){
          var field = input[fieldName];
          var filename;
          //Ignore description field
          formData[fieldName] = fs.readFileSync(path.join(testFolder,testKey,subTest.name, field));
        });
        requestOptions.formData = formData;
      }
      else{
        if(input){
          requestOptions.body = fs.readFileSync(path.join(testFolder, testKey, subTest.name, input));
        }
      }
      //Kill the test if it takes too long

      // test.timeout = setTimeout(function(){
      //   if(promise.promise.inspect().state === "pending"){
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

  processQueue(testQueue).then(function(tests){
    console.log("done testing");
    var passed = 0;
    var total = tests.length;
    tests.forEach(function(test){
      if(test.passed){
        passed++;
      }
      
    });
    console.log(passed+"/"+total+" passed")
    if(passed === total){
      process.exit(0);
    }
    else{
      process.exit(1);
    }
  });

  q.allSettled(testPromises).then(function(tests){
    var passed = 0;
    var total = 0;
    tests.forEach(function(test){
      var Text = "Test: ";
      var testContent = test.reason ? test.reason : test.value;
      var endPoint = testContent.endpoint;
      var subTest = testContent.name;
      var testPath = endPoint + "." + subTest;
      total++;
      if(verbose){
        console.log("######################");
        console.log("------Headers-------");
        console.log(testContent.headers);
        console.log("------Response------");
        console.log(testContent.responseBody);
      }
      if(test.state === "fulfilled"){
        Text += colors.green(testPath + " passed");
        passed++;
      }
      else{
        Text += colors.red(testPath + " failed " + test.reason.reason);
      }
      Text += " in "+ (testContent.end - testContent.start) + " ms";
      console.log(Text);
      
    });
    console.log(passed+"/"+total+" passed")
    if(passed === total){
      process.exit(0);
    }
    else{
      process.exit(1);
    }
  }, function(){
    console.log("tests failed");
  });



}


//A nice convience function for failign a test
function failTest(test, promise, reason){
  test.reason = reason;
  test.passed = false;
  promise.resolve(test);
}  

function getDifferencesUrl(actual, expected, type,  diffUrl, shortenerAPIKey, client){
  var promise = q.defer();
  if(!diffUrl || !shortenerAPIKey){
    promise.resolve("");
  }
  else{
    if(client){
      var left;
      var right;
      return sendToS3(actual, "actual-", type,  client).then(function(url){
        right = encodeURI(url);
        return sendToS3(expected, "expected-", type,  client);
      }).then(function(url){
        left = encodeURI(url);
        var finalUrl = diffUrl + "?left="+left+"&right="+right;
        return shortenUrl(finalUrl, shortenerAPIKey);
      });

     
    }
    else{
      var left = encodeURI(JSON.stringify(actual));
      var right = encodeURI(JSON.stringify(expected));
      var url = diffUrl + "?left="+left+"&right="+right;
      return shortenUrl(url, shortenerAPIKey);
    }
    
  }
  return promise.promise;
}

function sendToS3(obj, name, type, client){
  name = name + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 7);
  var string = obj;
  var promise = q.defer();
  var contentType;
  name = name + "."+type;

  if(type === "json"){
    contentType = "application/json"
    string = JSON.stringify(obj, null, 2);
  }
  else{
    contentType = "text/plain"
  }
  var req = client.put(name, {
      'Content-Length': Buffer.byteLength(string)
    , 'Content-Type': contentType
  });
  req.on("err", function(err){
    console.log("there was an error s3");
    console.log(err);
  });
  req.on('response', function(res){

    if (200 == res.statusCode) {
      promise.resolve(req.url);
    }
    else{
      promise.resolve("");
    }
  });
  req.end(string);

  return promise.promise;
}


function shortenUrl(url, shortenerAPIKey){
  var promise = q.defer();
  request.post({
    url: "https://www.googleapis.com/urlshortener/v1/url?key="+shortenerAPIKey,
    headers: {
            "content-type": "application/json",
        },
    body: JSON.stringify({
      "longUrl": url
    })
  }, function(err, res, body){
    promise.resolve(JSON.parse(body).id);
  });
  return promise.promise;
}

function parseJSON(string){
  var result;
  try{
    result = JSON.parse(string);
  }
  catch(e){
    result = null;
  }
  return result;
}


exports.main = main;

function deepCompare(ar1, ar2) {
    var matches = true;
    var type1 = typeof ar1;
    var type2 = typeof ar2;

    if(ar1 === null || ar2 === null){
      matches = ar1 === ar2;
      return matches;
    }


    if(type1 !== type2){
      matches = false;
    }
    else{
      switch(typeof ar1){
        case "object":{
          var keys1 = Object.keys(ar1);
          var keys2 = Object.keys(ar1);
         
          if(keys1.length !== keys2.length){
            matches = false;  
          }
          keys1.every(function(key1, n){
            if(key1 !== keys2[n]){
              matches = false; 
              return matches;
            }
            else{
              matches = deepCompare(ar1[key1], ar2[key1]);
              return matches;
            }
          });
        }break;
        case "string":
        case "boolean":
        case "number":{
          matches = ar1 === ar2;
        }break;
      }
    }
    return matches;
  }
