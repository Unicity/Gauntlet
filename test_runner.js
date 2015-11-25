"use strict";

var fs = require("fs");
var request = require("request");
var _ = require("underscore");
var q = require("q");
var colors = require("colors/safe");
var path = require("path");
var xmlChildPath = __dirname+"/xmlChild";
var childProcess = require("child_process")

function main(host, port, testFile, testFolder, basePath, commandLineTests, verbose){
  //Get the testfile

  var testFile = JSON.parse(fs.readFileSync(testFile).toString());

  var tests = Object.keys(testFile);

  var testPromises = [];

function wait(func){
    var args = [].splice.call(arguments,1);
    setTimeout(function(){
      func.apply(null, args)
    },200)
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
    var subTestKeys = Object.keys(parentTest.inputs);
    subTestKeys.forEach(function(subTestKey){

      //If we are running a specific set of inputs only run those
      if (testSubset && testSubset !== subTestKey) {
        return;
      }

      var test = {
        endpoint: parentTest.endpoint,
        inputs: parentTest.inputs[subTestKey],
        outputs: parentTest.outputs[subTestKey],
        subTest: subTestKey
      }
      var promise = q.defer();
      testPromises.push(promise.promise);

      var input = test.inputs;

      var requestOptions = {
        url: "http://"+host+":"+port+"/"+basePath+ test.endpoint,
        encoding:null
      };

      if (typeof input === "object") {
        var fieldNames = Object.keys(input);
        var formData = {};
        fieldNames.forEach(function(fieldName){
          var field = input[fieldName];
          formData[fieldName] = fs.readFileSync(path.join(testFolder,testKey,subTestKey,field)).toString();
        });
        requestOptions.formData = formData;
      }
      else{
        requestOptions.body = fs.readFileSync(path.join(testFolder, testKey, subTestKey, input));
        
      }

      //Kill the test if it takes too long

      test.timeout = setTimeout(function(){
        if(promise.promise.inspect().state === "pending"){
          test.reason = "timed out";
          console.log(promise);
          promise.reject(test);
        }
      }, 30 * 1000);
      
      wait(request.post, requestOptions, function(err, res, body){
         
        
        var comparePromise;
        var expectedOutput;
        var actualOutput;
        if(err){
          failTest(test, promise, err);
          return;
        }
        test.headers = res.headers;
       
        var response = body.toString();
        test.responseBody = response;
        if(!test.outputs){
          failTest(test, promise, "Test failed: no output file given");
          return;
        }

        if(res.statusCode !== 200){
          failTest(test, promise, "non 200 response code " + res.statusCode);
          return;
        }

        


        //I hate exceptions
        try{
            expectedOutput = fs.readFileSync(path.join(testFolder, testKey, subTestKey, test.outputs), "utf8").toString();
        }
        catch(e){
          failTest(test, promise, "No output file exists");
          return;
        }  
        

        comparePromise = q.defer();
        if(res.headers["content-type"].indexOf("application/json") > -1){

          try{
            expectedOutput = JSON.parse(expectedOutput);
          }
          catch(e){
            failTest(test, promise, "Couldn't parse expected output file as json");
            return;
          }

          try{
            actualOutput = JSON.parse(response);
            //console.log(JSON.stringify(actualOutput, null, 2))
          }
          catch(e){
            failTest(test, promise, "Couldn't parse output from server");
            return;
          }

          if(deepCompare(expectedOutput, actualOutput)){
            test.passed = true;
          }
          else{
            test.passed = false;
            test.reason = "Outputs do not match";
          }

          comparePromise.resolve();
        }
        else if(res.headers["content-type"].indexOf("text/xml") > -1){
          //For some reason xml parsing is messing stuff up going to run it in a child process
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
            //console.log(errors);
            comparePromise.resolve();
            child.kill();
          })
         
        }
        //console.log(JSON.stringify(JSON.parse(body), null, 2));
        //console.log(body);
        comparePromise.promise.then(function(){
           
          if(test.passed){
            promise.resolve(test);
          }
          else{
              
            promise.reject(test);
            // if(test.name.indexOf("CreateEnrollment") > -1){
            //   //console.log(test);
            // console.log(promise);
            // }
          }
        }, function(){
          console.log("erroor");
        }).catch(function(e){
          console.log(e);
        });
        
      });
    });
  });
  // setInterval(function(){
  //   testPromises.forEach(function(p){
  //     var promise = p.inspect();
  //     console.log(promise.state);
  //   })
  // }, 1000)
  q.allSettled(testPromises).then(function(tests){
    var passed = 0;
    var total = 0;
    tests.forEach(function(test){
      var Text = "Test: ";
      var testContent = test.reason ? test.reason : test.value;
      var endPoint = testContent.endpoint;
      var subTest = testContent.subTest;
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
  promise.reject(test);
}  

exports.main = main;

//A more compact deep compare using underscore. also from stack overflow. http://stackoverflow.com/a/13142970/825240
//I could write a deep compare easily, I just don't want to. I'm not even sure why. I've done it like a least twice 
//in the JSONSchema.
function deepCompare(ar1, ar2) {
    var still_matches, _fail,
      _this = this;
    if (!((_.isArray(ar1) && _.isArray(ar2)) || (_.isObject(ar1) && _.isObject(ar2)))) {
      return false;
    }
    if (ar1.length !== ar2.length) {
      return false;
    }
    still_matches = true;
    _fail = function() {
      still_matches = false;
    };
    _.each(ar1, function(prop1, n) {
      var prop2;
      prop2 = ar2[n];
      if (prop1 !== prop2 && !deepCompare(prop1, prop2)) {
        _fail();
      }
    });
    return still_matches;
  }