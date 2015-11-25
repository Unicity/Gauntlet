var xmlparser = require("xmllint");
process.on("message", function(data){
  var errors = xmlparser.validateXML({
    xml: data.xml,
    schema: data.schema
  }).errors;
  process.send(errors);
});